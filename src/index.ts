import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./docker/config.js";
import { DockerSandbox } from "./docker/sandbox.js";
import { registerHexUtilsTools } from "./tools/hex-utils.js";
import { registerScratchpadTools } from "./tools/scratchpad.js";
import { registerPythonEvalTools } from "./tools/python-eval.js";

const config = loadConfig();
const sandbox = new DockerSandbox(config);

const server = new McpServer({
  name: "re-helper-tools",
  version: "0.2.0",
});

registerHexUtilsTools(server);
registerScratchpadTools(server);
registerPythonEvalTools(server, sandbox);

const transport = new StdioServerTransport();
await server.connect(transport);

const cleanup = async () => {
  await sandbox.destroy().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
