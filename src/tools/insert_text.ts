import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";
import type { RhwpActionResult } from "../rhwp/types.js";

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
    text: z
      .string()
      .describe(
        "UTF-8 text to insert at the document START (section_idx=0, para_idx=0, " +
          "char_offset=0). For coordinate-aware insertion use hwp_apply_action " +
          "with name='insertText'.",
      ),
    style: StyleSchema.optional().describe(
      "Style fields are accepted but IGNORED in v0.1 — use hwp_set_paragraph_style " +
        "or hwp_apply_action with applyCharFormat for explicit style application.",
    ),
  })
  .strict();

export const HwpInsertTextOutput = z
  .object({
    ok: z.literal(true),
    chars_inserted: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Insert text at the document start (section_idx=0, para_idx=0, char_offset=0). " +
  "Maps to rhwp HwpDocument.insertText(0, 0, 0, text). The `style` parameter " +
  "is accepted for forward compatibility but NOT applied in v0.1 — use " +
  "hwp_set_paragraph_style or hwp_apply_action with applyCharFormat for " +
  "explicit style application. For coordinate-aware text insertion (e.g. into " +
  "an existing paragraph mid-document) use hwp_apply_action with name='insertText'.";

export interface HwpInsertTextResult {
  [k: string]: unknown;
  ok: true;
  chars_inserted: number;
}

export async function executeHwpInsertText(input: {
  text: string;
  style?: z.infer<typeof StyleSchema>;
}): Promise<HwpInsertTextResult> {
  const doc = sessionStore.get();
  const raw = await wrapPanic("action", () => doc.insertText(0, 0, 0, input.text));

  // rhwp's insertText returns a JSON string. Parse defensively; on a non-JSON
  // return we still surface success (some early rhwp versions returned the
  // empty string on success).
  let parsed: RhwpActionResult | null = null;
  if (raw && raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as RhwpActionResult;
    } catch {
      parsed = null;
    }
  }

  if (parsed !== null && parsed.ok === false) {
    throw new RhwpError({
      category: "action",
      code: "INSERT_FAILED",
      message: `Failed to insert text${parsed.message ? `: ${parsed.message}` : ""}`,
    });
  }

  return { ok: true, chars_inserted: input.text.length };
}

export function registerHwpInsertText(server: McpServer): void {
  server.registerTool(
    "hwp_insert_text",
    {
      title: "Insert text at document start",
      description: DESCRIPTION,
      inputSchema: HwpInsertTextInput.shape,
      outputSchema: HwpInsertTextOutput.shape,
    },
    async ({ text, style }) => {
      const result = await executeHwpInsertText({ text, style });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
