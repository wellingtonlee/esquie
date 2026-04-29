import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";

const notes = new Map<string, string>();
const persistFile = process.env.ESQUIE_NOTES_FILE;
let onChangeCallback: (() => void) | null = null;

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function hydrate(): void {
  if (!persistFile || !existsSync(persistFile)) return;
  try {
    const raw = readFileSync(persistFile, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) notes.set(k, v);
    console.error(`[scratchpad] Loaded ${notes.size} note(s) from ${persistFile}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[scratchpad] Failed to load ${persistFile}: ${msg} — using empty in-memory store`);
  }
}

function persist(): void {
  if (!persistFile) return;
  try {
    const tmp = `${persistFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(notes), null, 2));
    renameSync(tmp, persistFile);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[scratchpad] Failed to persist to ${persistFile}: ${msg}`);
  }
}

hydrate();

export function listNotes(): Map<string, string> {
  return notes;
}

export function getNote(key: string): string | undefined {
  return notes.get(key);
}

export function onScratchpadChange(cb: () => void): void {
  onChangeCallback = cb;
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
      persist();
      onChangeCallback?.();
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
      persist();
      onChangeCallback?.();
      return text(`Deleted note "${key}"`);
    },
  );
}
