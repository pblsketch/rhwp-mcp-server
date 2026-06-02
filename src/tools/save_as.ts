import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

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
      // `format` is guaranteed by Zod's .default("hwpx") — no fallback needed.
      throw new RhwpError({
        category: "serialize",
        code: "NOT_IMPLEMENTED",
        message: `hwp_save_as(${path}, ${format}) not implemented yet — Sprint 1.`,
      });
    },
  );
}
