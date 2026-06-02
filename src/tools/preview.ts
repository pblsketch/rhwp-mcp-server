import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

export const HwpPreviewInput = z
  .object({
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("1-based page number. Defaults to the first page."),
  })
  .strict();

export const DESCRIPTION =
  "Render a page of the currently-open document as a PNG image (≤ 1024 px " +
  "longest edge) and return it as a base64-inline image content item. The " +
  "LLM can VIEW the image directly to confirm form-filling or authoring " +
  "results visually. No caching — every call re-renders.";

export function registerHwpPreview(server: McpServer): void {
  server.registerTool(
    "hwp_preview",
    {
      title: "Render current page to PNG (base64 inline)",
      description: DESCRIPTION,
      inputSchema: HwpPreviewInput.shape,
      // NOTE: hwp_preview uses MCP image content rather than a structured
      // outputSchema. Its return shape is { content: [{ type: 'image', ... }] }.
    },
    async ({ page }) => {
      throw new RhwpError({
        category: "render",
        code: "NOT_IMPLEMENTED",
        message: `hwp_preview(page=${page ?? 1}) not implemented yet — Sprint 3.`,
      });
    },
  );
}
