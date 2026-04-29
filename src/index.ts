import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./docker/config.js";
import { DockerSandbox } from "./docker/sandbox.js";
import { registerHexUtilsTools } from "./tools/hex-utils.js";
import {
  registerScratchpadTools,
  listNotes,
  getNote,
  onScratchpadChange,
} from "./tools/scratchpad.js";
import { registerPythonEvalTools } from "./tools/python-eval.js";

const config = loadConfig();
const sandbox = new DockerSandbox(config);

const server = new McpServer({
  name: "esquie",
  version: "0.3.0",
});

registerHexUtilsTools(server);
registerScratchpadTools(server);
registerPythonEvalTools(server, sandbox);

server.registerResource(
  "note",
  new ResourceTemplate("note://{key}", {
    list: async () => ({
      resources: Array.from(listNotes().keys()).map((key) => ({
        uri: `note://${encodeURIComponent(key)}`,
        name: key,
        mimeType: "text/plain",
      })),
    }),
  }),
  {
    title: "Scratchpad note",
    description: "A note saved in the in-server scratchpad",
  },
  async (uri, variables) => {
    const rawKey = variables.key;
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const decoded = decodeURIComponent(key);
    const value = getNote(decoded);
    if (value === undefined) {
      throw new Error(`Note "${decoded}" not found`);
    }
    return {
      contents: [
        { uri: uri.href, mimeType: "text/plain", text: value },
      ],
    };
  },
);

onScratchpadChange(() => {
  try {
    server.sendResourceListChanged();
  } catch {
    // Server not connected yet — ignore
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

const cleanup = async () => {
  await sandbox.destroy().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
