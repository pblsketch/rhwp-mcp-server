import { writeFileSync, statSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";

export const HwpSaveAsInput = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Output file path. Parent directory must exist."),
    format: z
      .enum(["hwpx", "hwp"])
      .default("hwpx")
      .describe(
        "Output format. Defaults to 'hwpx' (recommended — most stable). " +
          "'hwp' is best-effort in v0.1 due to rhwp v0.7.x binary-save maturity.",
      ),
  })
  .strict();

export const HwpSaveAsOutput = z
  .object({
    ok: z.literal(true),
    path: z.string(),
    format: z.enum(["hwpx", "hwp"]),
    bytes_written: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Save the currently-open document to disk. HWPX is the recommended " +
  "output format (most stable round-trip); HWP binary is best-effort in " +
  "v0.1 — see CHANGELOG for known limitations.";

export interface HwpSaveAsResult {
  // MCP SDK's structuredContent requires Record<string, unknown> shape.
  [k: string]: unknown;
  ok: true;
  path: string;
  format: "hwpx" | "hwp";
  bytes_written: number;
}

/**
 * Pure handler. Performs an atomic write: serializes to a temp file in the
 * same directory as the target, then renames into place. If anything
 * before the rename fails, the temp file is unlinked so we don't leak it.
 */
export async function executeHwpSaveAs(input: {
  path: string;
  format?: "hwpx" | "hwp";
}): Promise<HwpSaveAsResult> {
  const format = input.format ?? "hwpx";
  const finalPath = resolve(input.path);
  const parent = dirname(finalPath);

  try {
    const parentStat = statSync(parent);
    if (!parentStat.isDirectory()) {
      throw new RhwpError({
        category: "serialize",
        code: "BAD_OUTPUT_DIR",
        message: `Output parent ${parent} exists but is not a directory.`,
      });
    }
  } catch (e) {
    if (e instanceof RhwpError) throw e;
    throw new RhwpError({
      category: "serialize",
      code: "BAD_OUTPUT_DIR",
      message: `Output parent ${parent} does not exist or is not accessible: ${e instanceof Error ? e.message : String(e)}`,
      cause: e,
    });
  }

  const doc = sessionStore.get();
  const bytes = await wrapPanic("serialize", () => (format === "hwp" ? doc.exportHwp() : doc.exportHwpx()));

  const tempPath = `${finalPath}.tmp.${process.pid}.${randomBytes(4).toString("hex")}`;
  try {
    writeFileSync(tempPath, bytes);
    renameSync(tempPath, finalPath);
  } catch (e) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best effort — fall through with the original error
    }
    throw new RhwpError({
      category: "serialize",
      code: "WRITE_FAILED",
      message: `Failed to write ${finalPath}: ${e instanceof Error ? e.message : String(e)}`,
      cause: e,
    });
  }

  return {
    ok: true,
    path: finalPath,
    format,
    bytes_written: bytes.length,
  };
}

export function registerHwpSaveAs(server: McpServer): void {
  server.registerTool(
    "hwp_save_as",
    {
      title: "Save current document as",
      description: DESCRIPTION,
      inputSchema: HwpSaveAsInput.shape,
      outputSchema: HwpSaveAsOutput.shape,
    },
    async ({ path, format }) => {
      const result = await executeHwpSaveAs({ path, format });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
