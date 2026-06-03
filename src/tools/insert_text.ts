import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";
import type { HwpDocumentLike, RhwpActionResult } from "../rhwp/types.js";

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
      "Optional char-level style applied to the inserted range. font_size is " +
        "in points (converted to rhwp fontSize HWPUNIT as pt × 100). color is " +
        "a six-digit hex string passed through to rhwp textColor. Fields the " +
        "caller leaves undefined are omitted from the rhwp props_json and " +
        "inherit the underlying paragraph's char shape; explicit `false` on " +
        "bold/italic/underline is forwarded to rhwp to *override* an inherited " +
        "true. See ADR-0005.",
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
  "Maps to rhwp HwpDocument.insertText(0, 0, 0, text). When `style` is " +
  "provided, applyCharFormat is chained over the inserted range with the " +
  "mapping: font_size pt → fontSize (pt × 100 HWPUNIT), bold/italic/underline " +
  "→ same, color #hex → textColor, font_family → fontFamily. For coordinate-" +
  "aware text insertion (e.g. into an existing paragraph mid-document) use " +
  "hwp_apply_action with name='insertText' (and apply char format separately).";

export interface HwpInsertTextResult {
  [k: string]: unknown;
  ok: true;
  chars_inserted: number;
}

type StyleInput = z.infer<typeof StyleSchema>;

/**
 * Translate the user-facing StyleSchema into the rhwp char-format props JSON
 * shape confirmed by scripts/probe-char-format.ts (see ADR-0005).
 *
 * Returns null when no style fields are provided so callers can skip the
 * rhwp call entirely — that keeps the v0.1.0 "style omitted" path
 * byte-identical to its pre-2.7 behavior.
 */
function mapStyleToRhwpProps(style: StyleInput): Record<string, unknown> | null {
  const props: Record<string, unknown> = {};
  if (style.font_size !== undefined) {
    // pt → HWPUNIT (1/100 pt). Round defensively in case the caller passed
    // a fractional point size.
    props.fontSize = Math.round(style.font_size * 100);
  }
  if (style.bold !== undefined) props.bold = style.bold;
  if (style.italic !== undefined) props.italic = style.italic;
  if (style.underline !== undefined) props.underline = style.underline;
  if (style.color !== undefined) props.textColor = style.color;
  if (style.font_family !== undefined) props.fontFamily = style.font_family;
  return Object.keys(props).length === 0 ? null : props;
}

async function applyInsertedRangeCharFormat(
  doc: HwpDocumentLike,
  endOffset: number,
  props: Record<string, unknown>,
): Promise<void> {
  const propsJson = JSON.stringify(props);
  const raw = await wrapPanic("action", () =>
    (
      doc as unknown as {
        applyCharFormat(
          s: number,
          pa: number,
          so: number,
          eo: number,
          j: string,
        ): string;
      }
    ).applyCharFormat(0, 0, 0, endOffset, propsJson),
  );

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
      code: "APPLY_CHAR_FORMAT_FAILED",
      message: `Failed to apply char format${parsed.message ? `: ${parsed.message}` : ""}`,
    });
  }
}

export async function executeHwpInsertText(input: {
  text: string;
  style?: StyleInput;
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

  if (input.style !== undefined && input.text.length > 0) {
    const props = mapStyleToRhwpProps(input.style);
    if (props !== null) {
      await applyInsertedRangeCharFormat(doc, input.text.length, props);
    }
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
