import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getActionByName } from "../rhwp/actions.js";
import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";
import type { RhwpActionResult } from "../rhwp/types.js";

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
        "Action-specific parameters. Validated against the catalog's zod " +
          "schema for the named action; throws BAD_PARAMS on mismatch.",
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
  "Generic catalog-driven action invoker. Use this for any rhwp action " +
  "not covered by a dedicated tool, or when you need explicit coordinates " +
  "for an action that the dedicated tool hard-codes to (0,0,0). Call " +
  "hwp_list_actions() first to discover names and parameter shapes.";

export interface HwpApplyActionResult {
  [k: string]: unknown;
  ok: true;
  name: string;
  result?: unknown;
}

export async function executeHwpApplyAction(input: {
  name: string;
  params?: Record<string, unknown>;
}): Promise<HwpApplyActionResult> {
  const def = getActionByName(input.name);
  if (def === undefined) {
    throw new RhwpError({
      category: "action",
      code: "UNKNOWN_ACTION",
      message: `Unknown action '${input.name}'. Call hwp_list_actions to discover available actions.`,
    });
  }

  const parsed = def.paramsSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    throw new RhwpError({
      category: "action",
      code: "BAD_PARAMS",
      message:
        `Invalid params for action '${input.name}': ` +
        JSON.stringify(parsed.error.issues),
    });
  }

  const doc = sessionStore.get();
  const raw = await wrapPanic("action", () => def.invoke(doc, parsed.data));

  // Most rhwp methods return a JSON string; some return primitives or
  // empty strings. Try to parse as JSON; if that fails, surface the raw
  // value untouched. Only treat ok:false as a semantic failure.
  let result: unknown = raw;
  if (typeof raw === "string" && raw.length > 0) {
    let obj: RhwpActionResult | null = null;
    try {
      obj = JSON.parse(raw) as RhwpActionResult;
    } catch {
      // Non-JSON return — keep `result` as the raw string.
    }
    if (obj !== null && typeof obj === "object") {
      if (obj.ok === false) {
        throw new RhwpError({
          category: "action",
          code: "ACTION_FAILED",
          message:
            `rhwp action '${input.name}' returned ok:false` +
            (obj.message ? `: ${obj.message}` : ""),
        });
      }
      result = obj;
    }
  }

  return { ok: true, name: input.name, result };
}

export function registerHwpApplyAction(server: McpServer): void {
  server.registerTool(
    "hwp_apply_action",
    {
      title: "Apply rhwp catalog action (generic dispatcher)",
      description: DESCRIPTION,
      inputSchema: HwpApplyActionInput.shape,
      outputSchema: HwpApplyActionOutput.shape,
    },
    async ({ name, params }) => {
      const result = await executeHwpApplyAction({ name, params });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
