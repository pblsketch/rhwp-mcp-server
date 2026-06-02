import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import { listActions, type ActionCategory } from "../rhwp/actions.js";

const CategoryEnum = z.enum([
  "text",
  "table",
  "paragraph",
  "style",
  "header_footer",
  "page",
  "field",
  "image",
  "math",
  "chart",
  "all",
]);

export const HwpListActionsInput = z
  .object({
    category: CategoryEnum.default("all").describe(
      "Filter the catalog by category. Defaults to 'all'.",
    ),
  })
  .strict();

export const HwpListActionsOutput = z
  .object({
    actions: z.array(
      z
        .object({
          name: z.string(),
          category: z.string(),
          description: z.string(),
          // Embed JSON Schema per action so LLMs can self-validate params before
          // calling hwp_apply_action.
          params_schema: z.unknown(),
        })
        .strict(),
    ),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "List rhwp actions available via hwp_apply_action. Returns each action's " +
  "name, category, description, and a JSON Schema for its parameters. " +
  "Filter by category ('text', 'table', 'paragraph', 'header_footer', " +
  "'page', 'field', 'image', 'math', 'other') or omit to get all.";

export interface HwpListActionsResultEntry {
  name: string;
  category: string;
  description: string;
  params_schema: unknown;
}

export interface HwpListActionsResult {
  [k: string]: unknown;
  actions: HwpListActionsResultEntry[];
  total: number;
}

// Catalog category enum + the MCP-public enum may diverge over time. Keep a
// dedicated mapping so we explicitly note which public categories have no
// actions yet — better than silently returning empty.
const CATEGORY_MAP: Record<z.infer<typeof CategoryEnum>, ActionCategory | "all" | null> = {
  text: "text",
  table: "table",
  paragraph: "paragraph",
  style: "paragraph", // legacy alias — style operations live under paragraph
  header_footer: "header_footer",
  page: "page",
  field: "field",
  image: "image",
  math: "math",
  chart: null, // not in v0.1 catalog
  all: "all",
};

export async function executeHwpListActions(input: {
  category?: z.infer<typeof CategoryEnum>;
}): Promise<HwpListActionsResult> {
  const cat = input.category ?? "all";
  const internal = CATEGORY_MAP[cat];
  const entries = internal === null ? [] : listActions(internal);
  const actions: HwpListActionsResultEntry[] = entries.map((a) => ({
    name: a.name,
    category: a.category,
    description: a.description,
    params_schema: zodToJsonSchema(a.paramsSchema, { target: "jsonSchema7" }),
  }));
  return { actions, total: actions.length };
}

export function registerHwpListActions(server: McpServer): void {
  server.registerTool(
    "hwp_list_actions",
    {
      title: "List available rhwp actions",
      description: DESCRIPTION,
      inputSchema: HwpListActionsInput.shape,
      outputSchema: HwpListActionsOutput.shape,
    },
    async ({ category }) => {
      const result = await executeHwpListActions({ category });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
