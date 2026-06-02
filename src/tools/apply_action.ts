import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

export const HwpApplyActionInput = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        "Action name from the rhwp catalog. Call hwp_list_actions() first to " +
          "discover available actions and their parameter shapes.",
      ),
    params: z
      .record(z.string(), z.unknown())
      .default({})
      .describe(
        "Action-specific parameters. Validated against the catalog's JSON " +
          "Schema for the named action; throws on mismatch.",
      ),
  })
  .strict();

export const HwpApplyActionOutput = z
  .object({
    ok: z.literal(true),
    name: z.string(),
    result: z.unknown().optional(),
  })
  .strict();

export const DESCRIPTION =
  "Generic catalogue-driven action invoker. Use this for any rhwp action " +
  "not covered by a dedicated tool (머리말/꼬리말, 차트, 수식, 도형, 페이지 " +
  "설정 등). Call hwp_list_actions() first to discover names and parameter " +
  "shapes.";

export function registerHwpApplyAction(server: McpServer): void {
  server.registerTool(
    "hwp_apply_action",
    {
      title: "Apply rhwp catalog action (generic tail)",
      description: DESCRIPTION,
      inputSchema: HwpApplyActionInput.shape,
      outputSchema: HwpApplyActionOutput.shape,
    },
    async ({ name }) => {
      throw new RhwpError({
        category: "action",
        code: "NOT_IMPLEMENTED",
        message: `hwp_apply_action(${name}, ...) not implemented yet — Sprint 2.`,
      });
    },
  );
}
