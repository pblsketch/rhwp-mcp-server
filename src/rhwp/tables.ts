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

/** Collapse internal whitespace runs to a single space. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

/**
 * Guess a human-readable label for a cell at (row, col).
 *
 * Heuristic (priority order — earlier wins, later only fire when every
 * earlier probe returned an empty string):
 *   1. Left neighbor (row, col-1) — the dominant pattern in Korean form
 *      tables (라벨 → 빈칸).
 *   2. Header row (row 0, same col) — fallback for column-oriented forms.
 *   --- additive Phase 3 fallbacks (only reached when 1+2 found nothing) ---
 *   3. Upper neighbor (row-1, same col) — for stacked layouts where the
 *      label sits directly above its blank and the top header row (row 0)
 *      is itself empty.
 *   4. Multi-row header — when row 0 was empty, walk the header rows
 *      above this cell (rows 0..row-1, same col) and join the non-empty
 *      ones into a combined label (병합/계층 헤더 양식).
 *   5. null — caller falls back to coordinate-only addressing.
 *
 * Behaviour-preservation guarantee: steps 1 and 2 are byte-for-byte
 * unchanged and each `return`s as soon as it finds text, so any cell that
 * already resolved a label under the original two-step heuristic resolves
 * to the *identical* value here — the additive steps 3+4 are unreachable
 * for those cells. They can only turn a former `null` into a label
 * (None→Label), never rewrite an existing one.
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
    if (left.length > 0) return collapseWhitespace(left);
  }
  if (row > 0) {
    const header = (await getCellText(doc, table, 0, col)).trim();
    if (header.length > 0) return collapseWhitespace(header);
  }

  // --- Phase 3 additive fallbacks ---------------------------------------
  // These run only when the original left+header probes both came back
  // empty (so the original heuristic would have returned null). Each is
  // guarded so it never overrides a label the earlier steps produced.

  // 3. Upper neighbor (row-1, same col). Only meaningful when there is a
  //    row strictly above this one that is NOT row 0 (row 0 was already
  //    probed as the header in step 2). When row === 1 the upper neighbor
  //    IS row 0, which step 2 already covered and found empty, so we skip
  //    to avoid a redundant read.
  if (row > 1) {
    const upper = (await getCellText(doc, table, row - 1, col)).trim();
    if (upper.length > 0) return collapseWhitespace(upper);
  }

  // 4. Multi-row header. The header may span several stacked rows above
  //    the cell (e.g. a merged group header on row 0 with a sub-header on
  //    row 1). Walk rows 0..row-1 in the same column, collect every
  //    non-empty header cell, and join them top-to-bottom. We dedupe
  //    consecutive identical fragments (merged cells repeat their text)
  //    so a 2-row "구분"/"구분" header collapses to a single "구분".
  if (row > 1) {
    const parts: string[] = [];
    for (let r = 0; r < row; r += 1) {
      const part = (await getCellText(doc, table, r, col)).trim();
      if (part.length === 0) continue;
      const norm = collapseWhitespace(part);
      if (parts.length === 0 || parts[parts.length - 1] !== norm) {
        parts.push(norm);
      }
    }
    if (parts.length > 0) return parts.join(" ");
  }

  return null;
}

/**
 * Classification of a table cell for form-filling purposes.
 *
 * - `fillable`   — an empty cell that has an inferred label, i.e. a blank
 *                  the user is expected to fill in.
 * - `structural` — a cell that is part of the form's scaffolding rather
 *                  than an input target: a label/header cell (it carries
 *                  text that serves as a label for a neighbor), or an
 *                  empty cell with no inferable label (decorative/spacer).
 */
export type CellClassification = "fillable" | "structural";

/**
 * Classify a single cell as `fillable` (a labelled blank awaiting input)
 * or `structural` (label/header/decorative scaffolding).
 *
 * Pure heuristic over the read-only cell helpers — never mutates the doc.
 * The decision uses three observations:
 *   - whether the cell itself holds text (`selfText`),
 *   - whether a label can be inferred for it (`label`),
 *   - whether the cell acts as a label for a downstream neighbor
 *     (its right or lower neighbor is empty), which marks it as the
 *     scaffolding side of a 라벨→빈칸 pair.
 *
 * Rules:
 *   1. Non-empty cell → `structural`. A cell that already carries text is
 *      either a label, a header, or pre-filled content; none of these is a
 *      blank the user fills, so it is scaffolding for classification.
 *   2. Empty cell with an inferred label → `fillable`. This is the target
 *      blank (the right/lower side of a 라벨→빈칸 pair, or a column under a
 *      header).
 *   3. Empty cell with no inferable label → `structural`. A spacer or
 *      decorative empty cell with nothing identifying it as an input.
 */
export async function classifyCell(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<CellClassification> {
  const selfText = (await getCellText(doc, table, row, col)).trim();
  if (selfText.length > 0) {
    // Carries text → it is a label / header / pre-filled content cell.
    return "structural";
  }
  const label = await inferCellLabel(doc, table, row, col);
  return label !== null ? "fillable" : "structural";
}
