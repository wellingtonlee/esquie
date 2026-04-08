import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DockerSandbox } from "../docker/sandbox.js";

export function registerPythonEvalTool(
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
          .describe("Timeout in milliseconds (default 30000)"),
      },
    },
    async ({ code, timeout }) => {
      try {
        const result = await sandbox.exec(code, timeout ?? 30000);
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
}
