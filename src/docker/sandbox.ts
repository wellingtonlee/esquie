import Docker from "dockerode";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { SandboxConfig } from "./config.js";

const IMAGE_TAG = "re-helper-sandbox:latest";
const CONTAINER_NAME = "re-helper-sandbox";
const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB
const IDLE_CHECK_INTERVAL_MS = 30_000; // Check every 30s

function getProjectRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), "..", "..");
}

export class DockerSandbox {
  private docker: Docker;
  private container: Docker.Container | null = null;
  private config: SandboxConfig;
  private lastExecTime: number = 0;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SandboxConfig) {
    this.docker = new Docker();
    this.config = config;
  }

  private startIdleTimer(): void {
    if (this.idleTimer) return;
    this.lastExecTime = Date.now();
    this.idleTimer = setInterval(async () => {
      if (this.container && Date.now() - this.lastExecTime > this.config.idleTimeoutMs) {
        console.error("[sandbox] Idle timeout reached, destroying container");
        await this.destroy().catch(() => {});
      }
    }, IDLE_CHECK_INTERVAL_MS);
    this.idleTimer.unref(); // Don't prevent Node from exiting
  }

  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  async ensureImage(): Promise<void> {
    const images = await this.docker.listImages({
      filters: { reference: [IMAGE_TAG] },
    });
    if (images.length > 0) return;

    console.error(`[sandbox] Building image ${IMAGE_TAG}...`);
    const projectRoot = getProjectRoot();
    const stream = await this.docker.buildImage(
      { context: projectRoot, src: ["Dockerfile", "src/docker/runner.py"] },
      { t: IMAGE_TAG },
    );

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (event: { stream?: string }) => {
          if (event.stream) process.stderr.write(event.stream);
        },
      );
    });
    console.error(`[sandbox] Image ${IMAGE_TAG} built successfully`);
  }

  async ensureContainer(): Promise<void> {
    if (this.container) {
      try {
        const info = await this.container.inspect();
        if (info.State.Running) return;
        await this.container.remove({ force: true }).catch(() => {});
      } catch {
        // Container gone
      }
      this.container = null;
    }

    try {
      const existing = this.docker.getContainer(CONTAINER_NAME);
      const info = await existing.inspect();
      if (info.State.Running) {
        this.container = existing;
        this.startIdleTimer();
        return;
      }
      await existing.remove({ force: true }).catch(() => {});
    } catch {
      // No existing container
    }

    await this.ensureImage();

    console.error("[sandbox] Creating container...");
    this.container = await this.docker.createContainer({
      name: CONTAINER_NAME,
      Image: IMAGE_TAG,
      Cmd: ["sleep", "infinity"],
      User: "sandbox",
      HostConfig: {
        NetworkMode: "none",
        Memory: this.config.memoryMb * 1024 * 1024,
        NanoCpus: this.config.cpus * 1_000_000_000,
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,nosuid,size=100m" },
        SecurityOpt: ["no-new-privileges"],
        PidsLimit: this.config.pidsLimit,
        CapDrop: ["ALL"],
        ShmSize: 1024 * 1024, // 1MB
      },
    });

    await this.container.start();
    this.startIdleTimer();
    console.error("[sandbox] Container started");
  }

  async exec(
    code: string,
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    await this.ensureContainer();
    this.lastExecTime = Date.now();

    const effectiveTimeout = timeoutMs ?? this.config.defaultTimeoutMs;

    const exec = await this.container!.exec({
      Cmd: ["python3", "/opt/runner.py"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      exec.start({ hijack: true, stdin: true }, (err, stream) => {
        if (err || !stream) {
          clearTimeout(timer);
          reject(err ?? new Error("No stream returned"));
          return;
        }

        const stdoutBuf = new PassThrough();
        const stderrBuf = new PassThrough();
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        stdoutBuf.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
        stderrBuf.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

        this.docker.modem.demuxStream(stream, stdoutBuf, stderrBuf);

        stream.write(code);
        stream.end();

        stream.on("end", async () => {
          clearTimeout(timer);
          try {
            const inspectResult = await exec.inspect();
            const exitCode = inspectResult.ExitCode ?? 0;
            let stdout = Buffer.concat(stdoutChunks).toString("utf8");
            let stderr = Buffer.concat(stderrChunks).toString("utf8");

            if (stdout.length > MAX_OUTPUT_BYTES) {
              stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
            }
            if (stderr.length > MAX_OUTPUT_BYTES) {
              stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
            }

            resolve({ stdout, stderr, exitCode });
          } catch {
            resolve({
              stdout: Buffer.concat(stdoutChunks).toString("utf8"),
              stderr: Buffer.concat(stderrChunks).toString("utf8"),
              exitCode: 1,
            });
          }
        });
      });
    });
  }

  async writeFile(filename: string, contentBase64: string): Promise<string> {
    // Validate filename: no path traversal
    const safe = basename(filename);
    if (safe !== filename || filename.includes("\0")) {
      throw new Error("Invalid filename — must be a plain basename with no path separators");
    }

    await this.ensureContainer();
    this.lastExecTime = Date.now();

    const destPath = `/tmp/${safe}`;

    const exec = await this.container!.exec({
      Cmd: ["sh", "-c", `base64 -d > ${destPath}`],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: true }, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error("No stream returned"));
          return;
        }

        const stderrBuf = new PassThrough();
        const stderrChunks: Buffer[] = [];
        stderrBuf.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

        this.docker.modem.demuxStream(stream, new PassThrough(), stderrBuf);

        stream.write(contentBase64);
        stream.end();

        stream.on("end", async () => {
          try {
            const inspectResult = await exec.inspect();
            if (inspectResult.ExitCode !== 0) {
              const stderr = Buffer.concat(stderrChunks).toString("utf8");
              reject(new Error(`Write failed (exit ${inspectResult.ExitCode}): ${stderr}`));
            } else {
              resolve(destPath);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  }

  async destroy(): Promise<void> {
    this.stopIdleTimer();
    if (!this.container) return;
    try {
      await this.container.stop({ t: 2 });
    } catch {
      // Already stopped
    }
    try {
      await this.container.remove({ force: true });
    } catch {
      // Already removed
    }
    this.container = null;
    console.error("[sandbox] Container destroyed");
  }
}
