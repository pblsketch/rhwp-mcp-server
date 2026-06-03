import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ensureEngine } from "../rhwp/loader.js";
import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";

export const HwpOpenInput = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Absolute or workspace-relative path to a .hwp or .hwpx file."),
  })
  .strict();

export const HwpOpenOutput = z
  .object({
    ok: z.literal(true),
    format: z.enum(["hwp", "hwpx"]),
    page_count: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Open a Korean HWP (5.0 binary) or HWPX (OWPML XML) document into the " +
  "server's single-document session. Format is detected from the file " +
  "extension. Once open, all subsequent tools (hwp_list_fields, " +
  "hwp_fill_fields, hwp_insert_text, hwp_create_table, hwp_apply_action, " +
  "hwp_save_as) operate on this document.";

/**
 * Detect HWP vs HWPX from the path extension. Throws an INPUT-domain
 * RhwpError when the extension is anything else (the rhwp parser would
 * also throw, but a clearer error here helps LLMs course-correct without
 * paying the WASM call cost).
 */
function formatFromExt(path: string): "hwp" | "hwpx" {
  const ext = extname(path).toLowerCase();
  if (ext === ".hwp") return "hwp";
  if (ext === ".hwpx") return "hwpx";
  throw new RhwpError({
    category: "parse",
    code: "UNSUPPORTED_FORMAT",
    message: `Cannot open ${path}: only .hwp and .hwpx are supported (got '${ext || "(no extension)"}')`,
  });
}

export interface HwpOpenResult {
  // MCP SDK's structuredContent requires Record<string, unknown> shape.
  [k: string]: unknown;
  ok: true;
  format: "hwp" | "hwpx";
  page_count: number;
}

/**
 * Pure handler — independent of the MCP SDK shape so tests can call it
 * directly with a parsed input object.
 */
export async function executeHwpOpen(input: { path: string }): Promise<HwpOpenResult> {
  const sourceFormat = formatFromExt(input.path);

  // Defensive existence check so the error category is "parse" with a
  // clear message instead of a raw ENOENT bubbling out of readFileSync.
  try {
    statSync(input.path);
  } catch (e) {
    throw new RhwpError({
      category: "parse",
      code: "READ_FAILED",
      message: `Cannot stat ${input.path}: ${e instanceof Error ? e.message : String(e)}`,
      cause: e,
    });
  }

  const bytes = (() => {
    try {
      return readFileSync(input.path);
    } catch (e) {
      throw new RhwpError({
        category: "parse",
        code: "READ_FAILED",
        message: `Failed to read ${input.path}: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      });
    }
  })();

  const engine = await ensureEngine();
  const doc = await wrapPanic("parse", () => engine.openFromBytes(new Uint8Array(bytes), sourceFormat));

  // Cross-check the format rhwp inferred from the bytes against the
  // extension. We trust rhwp's view for the final answer but record an
  // stderr breadcrumb on disagreement so the user can investigate later.
  const detected = await wrapPanic("parse", () => doc.getSourceFormat());
  const detectedFormat = detected === "hwp" || detected === "hwpx" ? detected : sourceFormat;
  if (detectedFormat !== sourceFormat) {
    process.stderr.write(
      `hwp_open: extension says ${sourceFormat} but rhwp says ${detected} — using ${detectedFormat}\n`,
    );
  }

  const pageCount = await wrapPanic("parse", () => doc.pageCount());

  sessionStore.set(doc, {
    sourcePath: input.path,
    sourceFormat: detectedFormat,
  });

  return {
    ok: true,
    format: detectedFormat,
    page_count: pageCount,
  };
}

export function registerHwpOpen(server: McpServer): void {
  server.registerTool(
    "hwp_open",
    {
      title: "Open HWP/HWPX document",
      description: DESCRIPTION,
      inputSchema: HwpOpenInput.shape,
      outputSchema: HwpOpenOutput.shape,
    },
    async ({ path }) => {
      const result = await executeHwpOpen({ path });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
