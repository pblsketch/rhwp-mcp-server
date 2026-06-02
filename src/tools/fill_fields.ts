import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { getFieldEntries } from "../rhwp/fields.js";
import type { RhwpSetFieldResult } from "../rhwp/types.js";
import { sessionStore } from "../session/store.js";

export const HwpFillFieldsInput = z
  .object({
    map: z
      .record(z.string(), z.string())
      .describe(
        "Object mapping field name → value. Unknown field names are skipped " +
          "(returned in `skipped`); malformed values throw.",
      ),
  })
  .strict();

export const HwpFillFieldsOutput = z
  .object({
    ok: z.literal(true),
    filled: z.array(z.string()),
    skipped: z.array(z.string()),
  })
  .strict();

export const DESCRIPTION =
  "Fill multiple form fields in one call. The primary tool for Korean " +
  "양식(form) automation — pass an object of { field_name: value } pairs " +
  "and the server applies them in order. Field names not present in the " +
  "document are recorded in `skipped` (no throw). Type-mismatched values " +
  "throw an error with the offending field name.";

export interface HwpFillFieldsResult {
  // MCP SDK's structuredContent requires Record<string, unknown> shape.
  [k: string]: unknown;
  ok: true;
  filled: string[];
  skipped: string[];
}

/**
 * Pure handler. Pre-fetches the set of known field names (one rhwp call)
 * so unknown names short-circuit to `skipped` without a per-name WASM hop.
 */
export async function executeHwpFillFields(input: { map: Record<string, string> }): Promise<HwpFillFieldsResult> {
  const doc = sessionStore.get();

  const rhwpEntries = await getFieldEntries(doc);
  const known = new Set<string>();
  for (const raw of rhwpEntries) {
    if (typeof raw?.name === "string" && raw.name.length > 0) {
      known.add(raw.name);
    }
  }

  const filled: string[] = [];
  const skipped: string[] = [];

  for (const [name, value] of Object.entries(input.map)) {
    if (!known.has(name)) {
      skipped.push(name);
      continue;
    }
    const rawSet = await wrapPanic("field", () => doc.setFieldValueByName(name, value));
    let result: RhwpSetFieldResult;
    try {
      result = JSON.parse(rawSet) as RhwpSetFieldResult;
    } catch (e) {
      throw new RhwpError({
        category: "field",
        code: "BAD_SET_JSON",
        message: `rhwp setFieldValueByName(${name}) returned non-JSON: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      });
    }
    if (result?.ok !== true) {
      throw new RhwpError({
        category: "field",
        code: "FILL_FAILED",
        message:
          `Failed to set field ${name}` +
          (result?.message ? `: ${result.message}` : "") +
          ` (rhwp returned ${JSON.stringify(result)})`,
      });
    }
    filled.push(name);
  }

  return { ok: true, filled, skipped };
}

export function registerHwpFillFields(server: McpServer): void {
  server.registerTool(
    "hwp_fill_fields",
    {
      title: "Fill form fields (bulk)",
      description: DESCRIPTION,
      inputSchema: HwpFillFieldsInput.shape,
      outputSchema: HwpFillFieldsOutput.shape,
    },
    async ({ map }) => {
      const result = await executeHwpFillFields({ map });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
