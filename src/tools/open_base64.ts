import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ensureEngine } from "../rhwp/loader.js";
import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";

export const HwpOpenBase64Input = z
  .object({
    bytes_base64: z
      .string()
      .min(1)
      .describe(
        "The document bytes, base64-encoded. Standard or URL-safe variants " +
          "are both accepted; padding is required.",
      ),
    format: z
      .enum(["hwp", "hwpx"])
      .optional()
      .describe(
        "Optional format hint. If omitted, the server asks rhwp's source-" +
          "format detector after parsing.",
      ),
  })
  .strict();

export const HwpOpenBase64Output = z
  .object({
    ok: z.literal(true),
    format: z.enum(["hwp", "hwpx"]),
    page_count: z.number().int().nonnegative(),
    bytes_in: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Open a document from base64-encoded bytes. Companion of hwp_save_as_base64 " +
  "for environments where the MCP client and the rhwp-mcp host do not share a " +
  "filesystem (Claude Web/Mobile, MCP-over-HTTP brokers). Wire size is ~33% " +
  "larger than the binary — for local clients with shared disk, prefer hwp_open.";

export interface HwpOpenBase64Result {
  [k: string]: unknown;
  ok: true;
  format: "hwp" | "hwpx";
  page_count: number;
  bytes_in: number;
}

/**
 * Strict base64 → Uint8Array. Node's Buffer.from(s, "base64") silently
 * ignores invalid characters; we round-trip back to base64 and compare
 * to detect malformed input early (BAD_BASE64 is more useful than a
 * downstream parse panic).
 */
export function decodeBase64Strict(s: string): Uint8Array {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const buf = Buffer.from(normalized, "base64");
  // Strict round-trip check: Buffer.from drops invalid characters silently,
  // so we re-encode and compare. Any deviation outside trailing '=' padding
  // indicates non-base64 input.
  const reencoded = buf.toString("base64");
  if (reencoded.replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new RhwpError({
      category: "parse",
      code: "BAD_BASE64",
      message:
        "Input contains characters outside the base64 alphabet. Check the " +
        "payload was not double-encoded or accidentally URL-decoded twice.",
    });
  }
  // Zero-byte decode (e.g. padding-only input like '=') passes the round-
  // trip check but yields nothing for rhwp to parse. Surface explicitly so
  // the LLM gets a usable error instead of a WASM panic.
  if (buf.length === 0) {
    throw new RhwpError({
      category: "parse",
      code: "BAD_BASE64",
      message: "Input decoded to zero bytes — nothing to open.",
    });
  }
  return new Uint8Array(buf);
}

export async function executeHwpOpenBase64(input: {
  bytes_base64: string;
  format?: "hwp" | "hwpx";
}): Promise<HwpOpenBase64Result> {
  const engine = await ensureEngine();

  const bytes = decodeBase64Strict(input.bytes_base64);
  const doc = await wrapPanic("parse", () => engine.openFromBytes(bytes, input.format));
  const detected = await wrapPanic("parse", () => doc.getSourceFormat());
  const format: "hwp" | "hwpx" =
    detected === "hwp" || detected === "hwpx" ? detected : (input.format ?? "hwpx");

  if (input.format !== undefined && input.format !== format) {
    process.stderr.write(
      `hwp_open_base64: client hinted ${input.format} but rhwp detected ${format} — using ${format}\n`,
    );
  }

  const pageCount = await wrapPanic("parse", () => doc.pageCount());

  sessionStore.set(doc, {
    sourcePath: "<base64>",
    sourceFormat: format,
  });

  return { ok: true, format, page_count: pageCount, bytes_in: bytes.length };
}

export function registerHwpOpenBase64(server: McpServer): void {
  server.registerTool(
    "hwp_open_base64",
    {
      title: "Open document from base64 bytes",
      description: DESCRIPTION,
      inputSchema: HwpOpenBase64Input.shape,
      outputSchema: HwpOpenBase64Output.shape,
    },
    async ({ bytes_base64, format }) => {
      const result = await executeHwpOpenBase64({ bytes_base64, format });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
