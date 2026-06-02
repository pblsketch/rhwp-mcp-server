import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import { sessionStore } from "../session/store.js";
import type { RhwpActionResult } from "../rhwp/types.js";

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
          "`cols` long. Empty strings leave the cell empty.",
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
  "Insert a table at the document start (section_idx=0, para_idx=0, " +
  "char_offset=0). Maps to rhwp HwpDocument.createTable(0, 0, 0, rows, cols). " +
  "If `data` is provided, each non-empty cell is filled via insertTextInCell. " +
  "For coordinate-aware table creation (mid-document, inside another table, etc.) " +
  "use hwp_apply_action with name='createTable'.";

export interface HwpCreateTableResult {
  [k: string]: unknown;
  ok: true;
  rows: number;
  cols: number;
  cells_filled: number;
}

interface CreateTableReturn extends RhwpActionResult {
  // rhwp 0.7.13 returns `{ok, paraIdx, controlIdx}` — the table is created
  // in a NEW paragraph adjacent to the requested insertion point, so we
  // must use the returned paraIdx (not the original 0) for downstream
  // insertTextInCell calls.
  paraIdx?: number;
  controlIdx?: number;
}

function pickTableHandle(
  parsed: CreateTableReturn | null,
): { paraIdx: number; controlIdx: number } | null {
  if (!parsed) return null;
  if (
    typeof parsed.paraIdx !== "number" ||
    typeof parsed.controlIdx !== "number"
  ) {
    return null;
  }
  return { paraIdx: parsed.paraIdx, controlIdx: parsed.controlIdx };
}

export async function executeHwpCreateTable(input: {
  rows: number;
  cols: number;
  data?: string[][];
}): Promise<HwpCreateTableResult> {
  // Validate data shape BEFORE any rhwp call so we never leave a dangling
  // table behind on bad input.
  if (input.data !== undefined) {
    if (input.data.length !== input.rows) {
      throw new RhwpError({
        category: "action",
        code: "BAD_DATA_SHAPE",
        message: `data.length=${input.data.length} does not match rows=${input.rows}`,
      });
    }
    for (let r = 0; r < input.data.length; r += 1) {
      const row = input.data[r];
      if (!Array.isArray(row) || row.length !== input.cols) {
        throw new RhwpError({
          category: "action",
          code: "BAD_DATA_SHAPE",
          message: `data[${r}].length=${row?.length ?? "n/a"} does not match cols=${input.cols}`,
        });
      }
    }
  }

  const doc = sessionStore.get();
  const rawCreate = await wrapPanic("action", () =>
    doc.createTable(0, 0, 0, input.rows, input.cols),
  );

  let parsed: CreateTableReturn | null = null;
  if (rawCreate && rawCreate.length > 0) {
    try {
      parsed = JSON.parse(rawCreate) as CreateTableReturn;
    } catch {
      parsed = null;
    }
  }
  if (parsed !== null && parsed.ok === false) {
    throw new RhwpError({
      category: "action",
      code: "CREATE_TABLE_FAILED",
      message: `Failed to create table${parsed.message ? `: ${parsed.message}` : ""}`,
    });
  }

  let cellsFilled = 0;
  if (input.data !== undefined) {
    const handle = pickTableHandle(parsed);
    if (handle === null) {
      throw new RhwpError({
        category: "action",
        code: "TABLE_HANDLE_MISSING",
        message:
          "rhwp createTable did not return paraIdx/controlIdx — cannot fill cells.",
      });
    }
    // The table sits at (section=0, parent_para=paraIdx, control=controlIdx).
    // Cells are addressed by `cellIdx = r * cols + c` (row-major) with
    // cell_para_idx=0 because the cells are freshly-created and empty —
    // each cell holds exactly one (empty) paragraph at index 0.
    //
    // If a future @rhwp/core release changes either the cell-ordering
    // convention or the initial cell-paragraph count, this loop must be
    // revisited. As of 0.7.13, both assumptions are confirmed by the
    // BAD_HANDLE error path exercised in tests.
    for (let r = 0; r < input.rows; r += 1) {
      for (let c = 0; c < input.cols; c += 1) {
        const text = input.data[r][c];
        if (!text || text.length === 0) continue;
        const cellIdx = r * input.cols + c;
        const rawCell = await wrapPanic("action", () =>
          doc.insertTextInCell(
            0,
            handle.paraIdx,
            handle.controlIdx,
            cellIdx,
            0,
            0,
            text,
          ),
        );
        let cellParsed: RhwpActionResult | null = null;
        if (rawCell && rawCell.length > 0) {
          try {
            cellParsed = JSON.parse(rawCell) as RhwpActionResult;
          } catch {
            cellParsed = null;
          }
        }
        if (cellParsed === null || cellParsed.ok !== false) {
          cellsFilled += 1;
        }
      }
    }
  }

  return {
    ok: true,
    rows: input.rows,
    cols: input.cols,
    cells_filled: cellsFilled,
  };
}

export function registerHwpCreateTable(server: McpServer): void {
  server.registerTool(
    "hwp_create_table",
    {
      title: "Create table at document start",
      description: DESCRIPTION,
      inputSchema: HwpCreateTableInput.shape,
      outputSchema: HwpCreateTableOutput.shape,
    },
    async ({ rows, cols, data }) => {
      const result = await executeHwpCreateTable({ rows, cols, data });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
