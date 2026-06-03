import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  cellIndex,
  findAllTables,
  getCellText,
  inferCellLabel,
} from "../rhwp/tables.js";
import { sessionStore } from "../session/store.js";

// Real-world Korean forms heavily use merged cells, which collapse multiple
// logical (row, col) tuples into one canonical cell_idx. Iterating the full
// row_count × col_count grid would over-shoot the table's real cell_count
// and report ghost blanks. We bound the cell_idx the same way fill_cells
// does (ADR-0004 §"Known limits" #2).

export const HwpLocateBlanksInput = z
  .object({
    include_filled: z
      .boolean()
      .default(false)
      .describe(
        "When true, returns every cell across every table (filled + blank). " +
          "Default is false — only cells whose text is empty after trim.",
      ),
  })
  .strict();

export const HwpLocateBlanksOutput = z
  .object({
    blanks: z.array(
      z
        .object({
          table_idx: z.number().int().nonnegative(),
          row: z.number().int().nonnegative(),
          col: z.number().int().nonnegative(),
          suggested_label: z.string().nullable(),
          current_text: z.string(),
          coords: z
            .object({
              section_idx: z.number().int().nonnegative(),
              parent_para_idx: z.number().int().nonnegative(),
              control_idx: z.number().int().nonnegative(),
              cell_idx: z.number().int().nonnegative(),
            })
            .strict(),
        })
        .strict(),
    ),
    total: z.number().int().nonnegative(),
    table_count: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Discover form-fillable table cells. Walks every table in the current " +
  "document, reads each cell's text, and reports the cells whose text is " +
  "empty along with an inferred label (left neighbor first, then header " +
  "row). Use BEFORE hwp_fill_cells when you don't know the cell layout. " +
  "This is the table-cell complement of hwp_list_fields (which only sees " +
  "누름틀 form-field controls).";

interface BlankEntry {
  table_idx: number;
  row: number;
  col: number;
  suggested_label: string | null;
  current_text: string;
  coords: {
    section_idx: number;
    parent_para_idx: number;
    control_idx: number;
    cell_idx: number;
  };
}

export interface HwpLocateBlanksResult {
  [k: string]: unknown;
  blanks: BlankEntry[];
  total: number;
  table_count: number;
}

export async function executeHwpLocateBlanks(input: {
  include_filled?: boolean;
}): Promise<HwpLocateBlanksResult> {
  const includeFilled = input.include_filled ?? false;
  const doc = sessionStore.get();
  const tables = await findAllTables(doc);

  const blanks: BlankEntry[] = [];
  for (const table of tables) {
    for (let row = 0; row < table.row_count; row += 1) {
      for (let col = 0; col < table.col_count; col += 1) {
        if (cellIndex(table, row, col) >= table.cell_count) continue;
        const text = await getCellText(doc, table, row, col);
        const isBlank = text.trim().length === 0;
        if (!includeFilled && !isBlank) continue;
        const label = isBlank
          ? await inferCellLabel(doc, table, row, col)
          : null;
        blanks.push({
          table_idx: table.table_idx,
          row,
          col,
          suggested_label: label,
          current_text: text,
          coords: {
            section_idx: table.section_idx,
            parent_para_idx: table.parent_para_idx,
            control_idx: table.control_idx,
            cell_idx: cellIndex(table, row, col),
          },
        });
      }
    }
  }

  return { blanks, total: blanks.length, table_count: tables.length };
}

export function registerHwpLocateBlanks(server: McpServer): void {
  server.registerTool(
    "hwp_locate_blanks",
    {
      title: "Locate blank form cells",
      description: DESCRIPTION,
      inputSchema: HwpLocateBlanksInput.shape,
      outputSchema: HwpLocateBlanksOutput.shape,
    },
    async ({ include_filled }) => {
      const result = await executeHwpLocateBlanks({ include_filled });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
