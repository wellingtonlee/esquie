import Docker from "dockerode";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const IMAGE_TAG = "re-helper-sandbox:latest";
const CONTAINER_NAME = "re-helper-sandbox";
const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB

function getProjectRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  // src/docker/sandbox.ts -> project root (2 levels up from src/)
  return join(dirname(currentFile), "..", "..");
}

export class DockerSandbox {
  private docker: Docker;
  private container: Docker.Container | null = null;

  constructor() {
    this.docker = new Docker();
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

    // Wait for build to complete
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
    // If we have a reference, check if it's still running
    if (this.container) {
      try {
        const info = await this.container.inspect();
        if (info.State.Running) return;
        // Not running — remove and recreate
        await this.container.remove({ force: true }).catch(() => {});
      } catch {
        // Container gone, will recreate
      }
      this.container = null;
    }

    // Check for an existing container by name
    try {
      const existing = this.docker.getContainer(CONTAINER_NAME);
      const info = await existing.inspect();
      if (info.State.Running) {
        this.container = existing;
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
        Memory: 512 * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,nosuid,size=100m" },
        SecurityOpt: ["no-new-privileges"],
      },
    });

    await this.container.start();
    console.error("[sandbox] Container started");
  }

  async exec(
    code: string,
    timeoutMs: number = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    await this.ensureContainer();

    const exec = await this.container!.exec({
      Cmd: ["python3", "/opt/runner.py"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

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

        // Write code to stdin and close
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
          } catch (inspectErr) {
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

  async destroy(): Promise<void> {
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
