import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DockerSandbox } from "../docker/sandbox.js";

export function registerPythonEvalTools(
  server: McpServer,
  sandbox: DockerSandbox,
): void {
  server.registerTool(
    "python_eval",
    {
      description:
        "Execute Python code in a sandboxed Docker container. " +
        "Pre-installed packages: pwntools, capstone, keystone, unicorn, lief, yara, pycryptodome. " +
        "Session state (variables, imports) persists across calls.",
      inputSchema: {
        code: z.string().describe("Python code to execute"),
        timeout: z
          .number()
          .optional()
          .describe("Timeout in milliseconds (default from RE_SANDBOX_TIMEOUT or 30000)"),
      },
    },
    async ({ code, timeout }) => {
      try {
        const result = await sandbox.exec(code, timeout);
        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push("--- stderr ---\n" + result.stderr);
        const output = parts.join("\n") || "(no output)";
        return {
          content: [{ type: "text" as const, text: output }],
          isError: result.exitCode !== 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "reset_sandbox",
    {
      description:
        "Destroy the Python sandbox container and clear all session state. " +
        "The next python_eval call will create a fresh container.",
    },
    async () => {
      await sandbox.destroy();
      return {
        content: [{ type: "text" as const, text: "Sandbox destroyed. Next python_eval call will start a fresh container." }],
      };
    },
  );

  server.registerTool(
    "upload_to_sandbox",
    {
      description:
        "Upload a file into the sandbox container's /tmp directory. " +
        "Useful for dropping binaries or samples for Python analysis.",
      inputSchema: {
        filename: z.string().describe("Filename (no path separators) — file will be placed at /tmp/<filename>"),
        content_base64: z.string().describe("File content encoded as base64"),
      },
    },
    async ({ filename, content_base64 }) => {
      try {
        const destPath = await sandbox.writeFile(filename, content_base64);
        return {
          content: [{ type: "text" as const, text: `File written to ${destPath}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
