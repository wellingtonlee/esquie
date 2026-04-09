import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHash } from "node:crypto";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function text(s: string): ToolResult {
  return { content: [{ type: "text", text: s }] };
}

function errorResult(e: unknown): ToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

function safeTool<T>(fn: (args: T) => ToolResult | Promise<ToolResult>): (args: T) => Promise<ToolResult> {
  return async (args: T) => {
    try {
      return await fn(args);
    } catch (e) {
      return errorResult(e);
    }
  };
}

function stripPrefix(hex: string): string {
  return hex.replace(/^0x/i, "").replace(/\s+/g, "");
}

export function registerHexUtilsTools(server: McpServer): void {
  server.registerTool(
    "hex_to_dec",
    {
      description: "Convert a hex string to decimal",
      inputSchema: { hex: z.string().describe("Hex value (with or without 0x prefix)") },
    },
    safeTool(({ hex }) => {
      const clean = stripPrefix(hex);
      return text(BigInt("0x" + clean).toString(10));
    }),
  );

  server.registerTool(
    "dec_to_hex",
    {
      description: "Convert a decimal number to hex",
      inputSchema: { dec: z.string().describe("Decimal value") },
    },
    safeTool(({ dec }) => {
      return text(BigInt(dec).toString(16));
    }),
  );

  server.registerTool(
    "hex_to_ascii",
    {
      description: "Decode a hex string to ASCII text",
      inputSchema: { hex: z.string().describe("Hex-encoded bytes") },
    },
    safeTool(({ hex }) => {
      const buf = Buffer.from(stripPrefix(hex), "hex");
      return text(buf.toString("utf8"));
    }),
  );

  server.registerTool(
    "ascii_to_hex",
    {
      description: "Encode ASCII text as hex bytes",
      inputSchema: { text: z.string().describe("Text to encode") },
    },
    safeTool(({ text: input }) => {
      return text(Buffer.from(input, "utf8").toString("hex"));
    }),
  );

  server.registerTool(
    "xor_buffers",
    {
      description: "XOR two hex buffers. Shorter buffer is repeated to match the longer one.",
      inputSchema: {
        hex_a: z.string().describe("First hex buffer"),
        hex_b: z.string().describe("Second hex buffer"),
      },
    },
    safeTool(({ hex_a, hex_b }) => {
      const a = Buffer.from(stripPrefix(hex_a), "hex");
      const b = Buffer.from(stripPrefix(hex_b), "hex");
      const len = Math.max(a.length, b.length);
      const result = Buffer.alloc(len);
      for (let i = 0; i < len; i++) {
        result[i] = (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
      }
      return text(result.toString("hex"));
    }),
  );

  server.registerTool(
    "hash",
    {
      description: "Compute a hash digest of the input data",
      inputSchema: {
        data: z.string().describe("Data to hash"),
        algorithm: z.enum(["md5", "sha1", "sha256"]).describe("Hash algorithm"),
        encoding: z.enum(["utf8", "hex"]).default("utf8").describe("Input encoding: utf8 (default) or hex"),
      },
    },
    safeTool(({ data, algorithm, encoding }) => {
      const buf =
        encoding === "hex"
          ? Buffer.from(stripPrefix(data), "hex")
          : Buffer.from(data, "utf8");
      const digest = createHash(algorithm).update(buf).digest("hex");
      return text(digest);
    }),
  );

  server.registerTool(
    "byte_pattern_search",
    {
      description: "Find all offsets of a byte pattern in hex data. Supports ?? as wildcard bytes.",
      inputSchema: {
        hex_data: z.string().describe("Hex string to search in"),
        pattern: z.string().describe("Hex pattern to find, e.g. '4d5a??90'"),
      },
    },
    safeTool(({ hex_data, pattern }) => {
      const data = Buffer.from(stripPrefix(hex_data), "hex");
      const patClean = stripPrefix(pattern);
      const patBytes: Array<number | null> = [];
      for (let i = 0; i < patClean.length; i += 2) {
        const byte = patClean.slice(i, i + 2);
        patBytes.push(byte === "??" ? null : parseInt(byte, 16));
      }

      const offsets: number[] = [];
      for (let i = 0; i <= data.length - patBytes.length; i++) {
        let match = true;
        for (let j = 0; j < patBytes.length; j++) {
          if (patBytes[j] !== null && data[i + j] !== patBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) offsets.push(i);
      }
      return text(JSON.stringify({ offsets, count: offsets.length }));
    }),
  );

  server.registerTool(
    "base64_encode",
    {
      description: "Base64-encode data",
      inputSchema: {
        data: z.string().describe("Data to encode"),
        encoding: z.enum(["utf8", "hex"]).default("utf8").describe("Input encoding: utf8 (default) or hex"),
      },
    },
    safeTool(({ data, encoding }) => {
      const buf =
        encoding === "hex"
          ? Buffer.from(stripPrefix(data), "hex")
          : Buffer.from(data, "utf8");
      return text(buf.toString("base64"));
    }),
  );

  server.registerTool(
    "base64_decode",
    {
      description: "Decode a base64 string",
      inputSchema: {
        data: z.string().describe("Base64-encoded string"),
        output_encoding: z.enum(["utf8", "hex"]).default("utf8").describe("Output encoding: utf8 (default) or hex"),
      },
    },
    safeTool(({ data, output_encoding }) => {
      const buf = Buffer.from(data, "base64");
      return text(
        output_encoding === "hex" ? buf.toString("hex") : buf.toString("utf8"),
      );
    }),
  );
}
