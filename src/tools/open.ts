import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

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
  "hwp_preview, hwp_save_as) operate on this document.";

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
      throw new RhwpError({
        category: "parse",
        code: "NOT_IMPLEMENTED",
        message: `hwp_open(${path}) not implemented yet — Sprint 1.`,
      });
    },
  );
}
