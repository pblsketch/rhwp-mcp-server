import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";
import type { RhwpActionResult } from "../rhwp/types.js";

const StyleObject = z
  .object({
    alignment: z.enum(["left", "center", "right", "justify"]).optional(),
    indent_first: z.number().optional().describe("First-line indent (mm)."),
    indent_left: z.number().optional(),
    indent_right: z.number().optional(),
    line_spacing: z
      .number()
      .positive()
      .optional()
      .describe("Line height multiplier, e.g. 1.5."),
    space_before: z.number().optional(),
    space_after: z.number().optional(),
  })
  .strict();

export const HwpSetParagraphStyleInput = z
  .object({
    style: StyleObject,
  })
  .strict();

export const HwpSetParagraphStyleOutput = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export const DESCRIPTION =
  "Apply paragraph-level style to the paragraph at document start " +
  "(section_idx=0, para_idx=0). Maps to rhwp HwpDocument.applyParaFormat(0, 0, " +
  "JSON.stringify(style)). For coordinate-aware style application use " +
  "hwp_apply_action with name='applyParaFormat'.";

export interface HwpSetParagraphStyleResult {
  [k: string]: unknown;
  ok: true;
}

export async function executeHwpSetParagraphStyle(input: {
  style: z.infer<typeof StyleObject>;
}): Promise<HwpSetParagraphStyleResult> {
  const doc = sessionStore.get();
  const propsJson = JSON.stringify(input.style);
  const raw = await wrapPanic("action", () =>
    doc.applyParaFormat(0, 0, propsJson),
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
      code: "APPLY_FORMAT_FAILED",
      message: `Failed to apply paragraph format${parsed.message ? `: ${parsed.message}` : ""}`,
    });
  }

  return { ok: true };
}

export function registerHwpSetParagraphStyle(server: McpServer): void {
  server.registerTool(
    "hwp_set_paragraph_style",
    {
      title: "Set paragraph style at document start",
      description: DESCRIPTION,
      inputSchema: HwpSetParagraphStyleInput.shape,
      outputSchema: HwpSetParagraphStyleOutput.shape,
    },
    async ({ style }) => {
      const result = await executeHwpSetParagraphStyle({ style });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
