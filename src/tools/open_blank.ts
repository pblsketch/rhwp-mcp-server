import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getRhwp, warmRhwp } from "../rhwp/loader.js";
import { wrapPanic } from "../rhwp/errors.js";
import type { RhwpModuleLike } from "../rhwp/types.js";
import { sessionStore } from "../session/store.js";

export const HwpOpenBlankInput = z.object({}).strict();

export const HwpOpenBlankOutput = z
  .object({
    ok: z.literal(true),
    format: z.literal("hwpx"),
    page_count: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Bootstrap a blank document into the server's single-document session " +
  "WITHOUT a filesystem path. Uses rhwp's bundled blank template (the same " +
  "one Sprint 1.5's binary-identity gate exercises). Use this when the MCP " +
  "client and the rhwp-mcp host do not share a filesystem (Claude Web/Mobile, " +
  "MCP-over-HTTP brokers, sandboxed agents). For local clients with shared " +
  "disk, prefer hwp_open(path).";

export interface HwpOpenBlankResult {
  // MCP SDK's structuredContent requires Record<string, unknown> shape.
  [k: string]: unknown;
  ok: true;
  format: "hwpx";
  page_count: number;
}

export async function executeHwpOpenBlank(): Promise<HwpOpenBlankResult> {
  // The catalog scenarios already call warmRhwp at server startup, but this
  // handler can be invoked from tests without going through the server, so
  // re-warming defensively is cheap (the loader is idempotent).
  await warmRhwp();
  const rhwp = getRhwp() as RhwpModuleLike;

  const doc = await wrapPanic("parse", () => rhwp.HwpDocument.createEmpty());
  await wrapPanic("parse", () =>
    (doc as unknown as { createBlankDocument(): string }).createBlankDocument(),
  );

  const pageCount = await wrapPanic("parse", () => doc.pageCount());

  sessionStore.set(doc, {
    sourcePath: "<blank>",
    sourceFormat: "hwpx",
  });

  return { ok: true, format: "hwpx", page_count: pageCount };
}

export function registerHwpOpenBlank(server: McpServer): void {
  server.registerTool(
    "hwp_open_blank",
    {
      title: "Open blank document (no path)",
      description: DESCRIPTION,
      inputSchema: HwpOpenBlankInput.shape,
      outputSchema: HwpOpenBlankOutput.shape,
    },
    async () => {
      const result = await executeHwpOpenBlank();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
