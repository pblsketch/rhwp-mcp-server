import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";

export const HwpSaveAsBase64Input = z
  .object({
    format: z
      .enum(["hwp", "hwpx"])
      .describe(
        "Output format. Explicit (no default) so the caller cannot " +
          "accidentally receive a different format than expected.",
      ),
  })
  .strict();

export const HwpSaveAsBase64Output = z
  .object({
    ok: z.literal(true),
    format: z.enum(["hwp", "hwpx"]),
    bytes_base64: z.string(),
    bytes_written: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Serialize the currently-open document and return the bytes as a base64 " +
  "string. Companion of hwp_open_base64 for environments where the MCP " +
  "client cannot write to the rhwp-mcp host's filesystem. `bytes_written` " +
  "is the BINARY byte count (before base64 encoding); the encoded string " +
  "is ~33% larger.";

export interface HwpSaveAsBase64Result {
  [k: string]: unknown;
  ok: true;
  format: "hwp" | "hwpx";
  bytes_base64: string;
  bytes_written: number;
}

export async function executeHwpSaveAsBase64(input: {
  format: "hwp" | "hwpx";
}): Promise<HwpSaveAsBase64Result> {
  const doc = sessionStore.get();
  const bytes = await wrapPanic("serialize", () =>
    input.format === "hwp" ? doc.exportHwp() : doc.exportHwpx(),
  );

  // Buffer.from accepts a Uint8Array directly; .toString("base64") produces
  // standard padded base64 (the encoding hwp_open_base64 expects).
  const bytes_base64 = Buffer.from(bytes).toString("base64");

  return {
    ok: true,
    format: input.format,
    bytes_base64,
    bytes_written: bytes.length,
  };
}

export function registerHwpSaveAsBase64(server: McpServer): void {
  server.registerTool(
    "hwp_save_as_base64",
    {
      title: "Save current document as base64 bytes",
      description: DESCRIPTION,
      inputSchema: HwpSaveAsBase64Input.shape,
      outputSchema: HwpSaveAsBase64Output.shape,
    },
    async ({ format }) => {
      const result = await executeHwpSaveAsBase64({ format });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
