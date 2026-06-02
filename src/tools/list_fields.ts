import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getFieldEntries } from "../rhwp/fields.js";
import { sessionStore } from "../session/store.js";

export const HwpListFieldsInput = z.object({}).strict();

export const HwpListFieldsOutput = z
  .object({
    fields: z.array(
      z
        .object({
          name: z.string(),
          type: z.string(),
          current_value: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const DESCRIPTION =
  "Enumerate all form fields in the currently-open document. Returns each " +
  "field's name (used by hwp_fill_fields), its declared type, and current " +
  "value if any. Use this BEFORE hwp_fill_fields when you don't already " +
  "know the field names of a template.";

interface FieldEntry {
  name: string;
  type: string;
  current_value: string | null;
}

export interface HwpListFieldsResult {
  // MCP SDK's structuredContent requires Record<string, unknown> shape.
  [k: string]: unknown;
  fields: FieldEntry[];
}

/**
 * Pure handler. Parses rhwp's JSON field list and maps to the
 * spec-locked MCP shape.
 *
 * Mapping:
 *   rhwp `fieldType`  →  MCP `type`
 *   rhwp `value`      →  MCP `current_value` (null if undefined or "")
 *   rhwp entries lacking a `name` are silently dropped (a stderr
 *   breadcrumb counts them so the user can see they existed).
 */
export async function executeHwpListFields(): Promise<HwpListFieldsResult> {
  const doc = sessionStore.get();
  const rhwpEntries = await getFieldEntries(doc);

  const entries: FieldEntry[] = [];
  let dropped = 0;
  for (const raw of rhwpEntries) {
    if (typeof raw?.name !== "string" || raw.name.length === 0) {
      dropped += 1;
      continue;
    }
    entries.push({
      name: raw.name,
      type: typeof raw.fieldType === "string" ? raw.fieldType : "unknown",
      current_value: typeof raw.value === "string" && raw.value.length > 0 ? raw.value : null,
    });
  }

  if (dropped > 0) {
    process.stderr.write(`hwp_list_fields: dropped ${dropped} entries with no name\n`);
  }

  return { fields: entries };
}

export function registerHwpListFields(server: McpServer): void {
  server.registerTool(
    "hwp_list_fields",
    {
      title: "List form fields",
      description: DESCRIPTION,
      inputSchema: HwpListFieldsInput.shape,
      outputSchema: HwpListFieldsOutput.shape,
    },
    async () => {
      const result = await executeHwpListFields();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
