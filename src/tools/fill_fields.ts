import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

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
      const fieldCount = Object.keys(map).length;
      throw new RhwpError({
        category: "field",
        code: "NOT_IMPLEMENTED",
        message: `hwp_fill_fields(${fieldCount} entries) not implemented yet — Sprint 1.`,
      });
    },
  );
}
