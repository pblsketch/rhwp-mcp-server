/**
 * Sprint 2.6 — shared helpers for table-cell discovery and label inference.
 *
 * Used by `hwp_locate_blanks` and `hwp_fill_cells`. Lives outside the
 * tool modules so both share one implementation of:
 *   - findAllTables(doc) — enumerate tables by walking every (sec, para)
 *     and probing getTableDimensions(sec, para, 0). Tables created via the
 *     Sprint 2 createTable helper always sit at control_idx=0 in their
 *     own paragraph; that convention is what we rely on. Documents with
 *     hand-authored multi-control paragraphs may underreport — documented
 *     as a known limit in ADR-0004.
 *   - getCellText / inferCellLabel — read-only helpers; never mutate the doc.
 *
 * Pure module — importing has no side effects.
 */

import { wrapPanic } from "./errors.js";
import type { HwpDocumentLike } from "./types.js";

export interface TableHandle {
  table_idx: number;
  section_idx: number;
  parent_para_idx: number;
  control_idx: number;
  row_count: number;
  col_count: number;
  cell_count: number;
}

interface TableDims {
  rowCount: number;
  colCount: number;
  cellCount: number;
}

/**
 * Walk the document and collect every (sec, para) at which control_idx=0
 * answers as a table. Returns the handles in document order. Empty documents
 * (no sections, or sections with no tables) return [].
 */
export async function findAllTables(doc: HwpDocumentLike): Promise<TableHandle[]> {
  const sectionCount = await wrapPanic("field", () => doc.getSectionCount());
  const tables: TableHandle[] = [];
  for (let sec = 0; sec < sectionCount; sec += 1) {
    const paraCount = await wrapPanic("field", () => doc.getParagraphCount(sec));
    for (let para = 0; para < paraCount; para += 1) {
      // getTableDimensions throws (via WASM panic → wrapPanic) when the
      // (sec, para, 0) tuple is not a table. We catch and continue.
      try {
        const raw = await wrapPanic("field", () =>
          doc.getTableDimensions(sec, para, 0),
        );
        const dims = JSON.parse(raw) as Partial<TableDims>;
        if (
          typeof dims.rowCount === "number" &&
          typeof dims.colCount === "number" &&
          typeof dims.cellCount === "number"
        ) {
          tables.push({
            table_idx: tables.length,
            section_idx: sec,
            parent_para_idx: para,
            control_idx: 0,
            row_count: dims.rowCount,
            col_count: dims.colCount,
            cell_count: dims.cellCount,
          });
        }
      } catch {
        // Not a table — skip.
      }
    }
  }
  return tables;
}

/**
 * Convert (row, col) into the linear cell_idx the rhwp API expects.
 * Row-major: cell_idx = row * col_count + col. Matches the Sprint 2
 * createTable cell-filling convention.
 */
export function cellIndex(table: TableHandle, row: number, col: number): number {
  return row * table.col_count + col;
}

/**
 * Read the entire text of a single cell. rhwp's getTextInCell returns JSON
 * `{text}` (verified by Sprint 1.5 probes); we extract the string and
 * return "" on any unexpected shape so empty cells look empty to callers.
 */
export async function getCellText(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<string> {
  const idx = cellIndex(table, row, col);
  // getTextInCell's count=-1 (or a large number) reads the whole text.
  // We use a generous cap that should comfortably exceed any single-cell
  // contents in real forms (10 000 characters).
  //
  // Real-world forms contain merged cells, hidden cells, and other shapes
  // rhwp's getTextInCell may refuse with a per-cell panic. We translate
  // those into an empty string so the locate_blanks walker can finish.
  // The cell is reported as blank with current_text="" and the caller
  // can still address it by coordinate; fill_cells will surface a real
  // error if the actual write fails downstream.
  let raw: string;
  try {
    raw = await wrapPanic("field", () =>
      doc.getTextInCell(
        table.section_idx,
        table.parent_para_idx,
        table.control_idx,
        idx,
        0,
        0,
        10000,
      ),
    );
  } catch {
    return "";
  }
  if (!raw || raw.length === 0) return "";
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    if (typeof parsed.text === "string") return parsed.text;
  } catch {
    // Some rhwp versions return the bare string instead of JSON; fall
    // through and treat it as the text.
    return raw;
  }
  return "";
}

/**
 * Guess a human-readable label for a cell at (row, col).
 *
 * Heuristic:
 *   1. Left neighbor (row, col-1) — the dominant pattern in Korean form
 *      tables (라벨 → 빈칸).
 *   2. Header row (row 0, same col) — fallback for column-oriented forms.
 *   3. null — caller falls back to coordinate-only addressing.
 *
 * Whitespace is collapsed; surrounding punctuation is preserved verbatim
 * because labels frequently include a trailing colon ("이름:") or
 * parenthetical hint ("연락처(휴대폰)").
 */
export async function inferCellLabel(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<string | null> {
  if (col > 0) {
    const left = (await getCellText(doc, table, row, col - 1)).trim();
    if (left.length > 0) return left.replace(/\s+/g, " ");
  }
  if (row > 0) {
    const header = (await getCellText(doc, table, 0, col)).trim();
    if (header.length > 0) return header.replace(/\s+/g, " ");
  }
  return null;
}
