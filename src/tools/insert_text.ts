import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

const StyleSchema = z
  .object({
    font_size: z.number().positive().optional().describe("Font size in points."),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Hex color, e.g. #1A1A1A."),
    font_family: z.string().optional(),
  })
  .strict();

export const HwpInsertTextInput = z
  .object({
    text: z.string().describe("UTF-8 text to insert at the current cursor."),
    style: StyleSchema.optional(),
  })
  .strict();

export const HwpInsertTextOutput = z
  .object({
    ok: z.literal(true),
    chars_inserted: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Insert text at the current cursor position. Composes the underlying " +
  "rhwp InsertText + CharShape actions in a single call. Style fields are " +
  "all optional — omit any to inherit from the current paragraph style.";

export function registerHwpInsertText(server: McpServer): void {
  server.registerTool(
    "hwp_insert_text",
    {
      title: "Insert text with optional style",
      description: DESCRIPTION,
      inputSchema: HwpInsertTextInput.shape,
      outputSchema: HwpInsertTextOutput.shape,
    },
    async ({ text }) => {
      throw new RhwpError({
        category: "action",
        code: "NOT_IMPLEMENTED",
        message: `hwp_insert_text(${text.length} chars) not implemented yet — Sprint 2.`,
      });
    },
  );
}
