import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

export const HwpListActionsInput = z
  .object({
    category: z
      .enum([
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
      ])
      .default("all")
      .describe("Filter the catalog by category. Defaults to 'all'."),
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
  "Filter by category to narrow results.";

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
      throw new RhwpError({
        category: "other",
        code: "NOT_IMPLEMENTED",
        message: `hwp_list_actions(category=${category ?? "all"}) not implemented yet — Sprint 2.`,
      });
    },
  );
}
