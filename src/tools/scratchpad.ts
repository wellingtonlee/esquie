import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const notes = new Map<string, string>();

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

export function registerScratchpadTools(server: McpServer): void {
  server.registerTool(
    "set_note",
    {
      description: "Store a note in the scratchpad",
      inputSchema: {
        key: z.string().describe("Note key/name"),
        value: z.string().describe("Note content"),
      },
    },
    async ({ key, value }) => {
      notes.set(key, value);
      return text(`Saved note "${key}"`);
    },
  );

  server.registerTool(
    "get_note",
    {
      description: "Retrieve a note from the scratchpad",
      inputSchema: { key: z.string().describe("Note key/name") },
    },
    async ({ key }) => {
      const value = notes.get(key);
      if (value === undefined) {
        return { content: [{ type: "text" as const, text: `Note "${key}" not found` }], isError: true };
      }
      return text(value);
    },
  );

  server.registerTool(
    "list_notes",
    {
      description: "List all notes in the scratchpad",
    },
    async () => {
      if (notes.size === 0) return text("(scratchpad is empty)");
      const entries = Object.fromEntries(notes);
      return text(JSON.stringify(entries, null, 2));
    },
  );

  server.registerTool(
    "delete_note",
    {
      description: "Delete a note from the scratchpad",
      inputSchema: { key: z.string().describe("Note key/name") },
    },
    async ({ key }) => {
      if (!notes.delete(key)) {
        return { content: [{ type: "text" as const, text: `Note "${key}" not found` }], isError: true };
      }
      return text(`Deleted note "${key}"`);
    },
  );
}
