import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

export const HwpSetParagraphStyleInput = z
  .object({
    style: z
      .object({
        alignment: z.enum(["left", "center", "right", "justify"]).optional(),
        indent_first: z.number().optional().describe("First-line indent (mm)."),
        indent_left: z.number().optional(),
        indent_right: z.number().optional(),
        line_spacing: z.number().positive().optional().describe("Line height multiplier, e.g. 1.5."),
        space_before: z.number().optional(),
        space_after: z.number().optional(),
      })
      .strict(),
  })
  .strict();

export const HwpSetParagraphStyleOutput = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export const DESCRIPTION =
  "Apply paragraph-level style to the current paragraph (alignment, " +
  "indentation, line spacing). Maps to the rhwp ParagraphShape action.";

export function registerHwpSetParagraphStyle(server: McpServer): void {
  server.registerTool(
    "hwp_set_paragraph_style",
    {
      title: "Set current-paragraph style",
      description: DESCRIPTION,
      inputSchema: HwpSetParagraphStyleInput.shape,
      outputSchema: HwpSetParagraphStyleOutput.shape,
    },
    async () => {
      throw new RhwpError({
        category: "action",
        code: "NOT_IMPLEMENTED",
        message: "hwp_set_paragraph_style not implemented yet — Sprint 2.",
      });
    },
  );
}
