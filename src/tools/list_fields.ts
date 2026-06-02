import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

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
      throw new RhwpError({
        category: "field",
        code: "NOT_IMPLEMENTED",
        message: "hwp_list_fields not implemented yet — Sprint 1.",
      });
    },
  );
}
