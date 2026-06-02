import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RhwpError } from "../rhwp/errors.js";

export const HwpCreateTableInput = z
  .object({
    rows: z.number().int().min(1).max(200).describe("Row count (1..200)."),
    cols: z.number().int().min(1).max(50).describe("Column count (1..50)."),
    data: z
      .array(z.array(z.string()))
      .optional()
      .describe(
        "Optional initial cell text as a row-major 2-D array. If provided, " +
          "must be exactly `rows` long and each inner array must be exactly " +
          "`cols` long. Missing entries leave the cell empty.",
      ),
  })
  .strict();

export const HwpCreateTableOutput = z
  .object({
    ok: z.literal(true),
    rows: z.number().int(),
    cols: z.number().int(),
    cells_filled: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Insert a table at the current cursor and optionally fill its cells. " +
  "Composes the underlying rhwp TableCreate + per-cell InsertText actions. " +
  "Common pattern: { rows: 4, cols: 3, data: [['이름','부서','연락처'], ...] }.";

export function registerHwpCreateTable(server: McpServer): void {
  server.registerTool(
    "hwp_create_table",
    {
      title: "Create table (optional cell data)",
      description: DESCRIPTION,
      inputSchema: HwpCreateTableInput.shape,
      outputSchema: HwpCreateTableOutput.shape,
    },
    async ({ rows, cols }) => {
      throw new RhwpError({
        category: "action",
        code: "NOT_IMPLEMENTED",
        message: `hwp_create_table(${rows}x${cols}) not implemented yet — Sprint 2.`,
      });
    },
  );
}
