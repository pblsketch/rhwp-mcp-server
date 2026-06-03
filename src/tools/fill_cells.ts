import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { wrapPanic } from "../rhwp/errors.js";
import {
  cellIndex,
  findAllTables,
  inferCellLabel,
  type TableHandle,
} from "../rhwp/tables.js";
import { sessionStore } from "../session/store.js";

export const HwpFillCellsInput = z
  .object({
    map: z
      .record(z.string(), z.string())
      .describe(
        "Cell → value map. Keys can be either 'row,col' coordinates " +
          "(e.g. '1,1') or labels (e.g. '이름'). Label matching is " +
          "case-insensitive and whitespace-normalized; trailing punctuation " +
          "like ':' is treated as part of the label.",
      ),
    table_idx: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe("Index of the target table (default 0 — first table)."),
  })
  .strict();

const SkipReason = z.enum(["unknown_label", "out_of_range", "coord_format", "no_table"]);

export const HwpFillCellsOutput = z
  .object({
    ok: z.literal(true),
    filled: z.array(z.string()),
    skipped: z.array(
      z.object({ key: z.string(), reason: SkipReason }).strict(),
    ),
  })
  .strict();

export const DESCRIPTION =
  "Fill table cells by coordinate or by label. The cell-based companion " +
  "of hwp_fill_fields — use this for forms where the blanks are table " +
  "cells (the dominant pattern in Korean 학교/관공서 양식) rather than " +
  "누름틀 form fields. Call hwp_locate_blanks first to discover the " +
  "layout. Coordinate keys are 'row,col' (zero-indexed); label keys are " +
  "matched against inferCellLabel output. Unresolvable keys land in " +
  "`skipped` with a typed reason and do NOT abort the rest of the call.";

export interface HwpFillCellsResult {
  [k: string]: unknown;
  ok: true;
  filled: string[];
  skipped: { key: string; reason: z.infer<typeof SkipReason> }[];
}

const COORD_RE = /^(\d+)\s*,\s*(\d+)$/;

function normalizeLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Build a label → (row, col) lookup for the target table. Iterates every
 * cell once and uses `inferCellLabel` for each one — the dictionary is
 * small (typical forms have < 50 cells) so the up-front cost is cheap and
 * pays back across the per-key fill loop.
 */
async function buildLabelLookup(
  doc: ReturnType<typeof sessionStore.get>,
  table: TableHandle,
): Promise<Map<string, { row: number; col: number }>> {
  const lookup = new Map<string, { row: number; col: number }>();
  for (let row = 0; row < table.row_count; row += 1) {
    for (let col = 0; col < table.col_count; col += 1) {
      const label = await inferCellLabel(doc, table, row, col);
      if (label !== null) {
        const key = normalizeLabel(label);
        // Earlier entry wins — that's the cell with the closer label.
        if (!lookup.has(key)) lookup.set(key, { row, col });
      }
    }
  }
  return lookup;
}

export async function executeHwpFillCells(input: {
  map: Record<string, string>;
  table_idx?: number;
}): Promise<HwpFillCellsResult> {
  const tableIdx = input.table_idx ?? 0;
  const doc = sessionStore.get();
  const tables = await findAllTables(doc);

  if (tables.length === 0 || tables[tableIdx] === undefined) {
    // Every key skipped with 'no_table' — we still return ok:true so the
    // caller's loop can move on (matches the hwp_fill_fields contract).
    return {
      ok: true,
      filled: [],
      skipped: Object.keys(input.map).map((key) => ({ key, reason: "no_table" as const })),
    };
  }

  const table = tables[tableIdx];
  // Lookup is only needed if at least one key isn't a coordinate.
  const needsLookup = Object.keys(input.map).some((k) => !COORD_RE.test(k));
  const labelLookup = needsLookup
    ? await buildLabelLookup(doc, table)
    : new Map<string, { row: number; col: number }>();

  const filled: string[] = [];
  const skipped: { key: string; reason: z.infer<typeof SkipReason> }[] = [];

  for (const [key, value] of Object.entries(input.map)) {
    const coordMatch = COORD_RE.exec(key);
    let row: number;
    let col: number;
    if (coordMatch !== null) {
      row = Number(coordMatch[1]);
      col = Number(coordMatch[2]);
      if (row >= table.row_count || col >= table.col_count) {
        skipped.push({ key, reason: "out_of_range" });
        continue;
      }
    } else {
      const hit = labelLookup.get(normalizeLabel(key));
      if (hit === undefined) {
        skipped.push({ key, reason: "unknown_label" });
        continue;
      }
      row = hit.row;
      col = hit.col;
    }

    const idx = cellIndex(table, row, col);
    await wrapPanic("field", () =>
      doc.insertTextInCell(
        table.section_idx,
        table.parent_para_idx,
        table.control_idx,
        idx,
        0,
        0,
        value,
      ),
    );
    filled.push(key);
  }

  return { ok: true, filled, skipped };
}

export function registerHwpFillCells(server: McpServer): void {
  server.registerTool(
    "hwp_fill_cells",
    {
      title: "Fill table cells (coord or label)",
      description: DESCRIPTION,
      inputSchema: HwpFillCellsInput.shape,
      outputSchema: HwpFillCellsOutput.shape,
    },
    async ({ map, table_idx }) => {
      const result = await executeHwpFillCells({ map, table_idx });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
