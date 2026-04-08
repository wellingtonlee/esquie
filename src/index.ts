import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DockerSandbox } from "./docker/sandbox.js";
import { registerHexUtilsTools } from "./tools/hex-utils.js";
import { registerScratchpadTools } from "./tools/scratchpad.js";
import { registerPythonEvalTool } from "./tools/python-eval.js";

const sandbox = new DockerSandbox();

const server = new McpServer({
  name: "re-helper-tools",
  version: "0.1.0",
});

registerHexUtilsTools(server);
registerScratchpadTools(server);
registerPythonEvalTool(server, sandbox);

const transport = new StdioServerTransport();
await server.connect(transport);

const cleanup = async () => {
  await sandbox.destroy().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
