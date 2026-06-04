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
 * Where an inferred label came from, in `inferCellLabel`'s priority order.
 *
 * This MIRRORS the five-step heuristic inside `inferCellLabel` (which is
 * frozen byte-for-byte by the golden snapshot and must NOT change). It is a
 * separate, side-channel signal so `classifyCell` and `locate_blanks` can
 * weigh *how strong* the label evidence is:
 *
 *   - `left`     — immediate left neighbor (row, col-1). Strong evidence:
 *                  the canonical 라벨→빈칸 pair in Korean forms.
 *   - `upper`    — immediate upper neighbor (row-1, col). Strong evidence:
 *                  stacked 라벨 above 빈칸.
 *   - `header`   — header row 0 (row 0, same col), reached only when the
 *                  immediate left was empty. Weaker: row 0 may be far above.
 *   - `multirow` — joined multi-row header walk. Weakest / most speculative:
 *                  a distant stacked header several rows up.
 *   - `none`     — no label could be inferred.
 */
export type LabelSource = "left" | "header" | "upper" | "multirow" | "none";

/**
 * Side-channel mirror of `inferCellLabel` that ALSO reports which heuristic
 * produced the label. The label *value* returned here is identical to
 * `inferCellLabel` for every cell (same probe order, same early returns) —
 * this function exists only to expose the provenance without touching the
 * frozen `inferCellLabel`.
 *
 * IMPORTANT: keep the probe order and the early-return semantics in lockstep
 * with `inferCellLabel`. The golden snapshot pins `inferCellLabel`; a unit
 * test pins the `label` half of this function equal to `inferCellLabel`.
 */
export async function inferCellLabelWithSource(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<{ label: string | null; source: LabelSource }> {
  if (col > 0) {
    const left = (await getCellText(doc, table, row, col - 1)).trim();
    if (left.length > 0) return { label: collapseWhitespace(left), source: "left" };
  }
  if (row > 0) {
    const header = (await getCellText(doc, table, 0, col)).trim();
    if (header.length > 0)
      return { label: collapseWhitespace(header), source: "header" };
  }

  if (row > 1) {
    const upper = (await getCellText(doc, table, row - 1, col)).trim();
    if (upper.length > 0)
      return { label: collapseWhitespace(upper), source: "upper" };
  }

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
    if (parts.length > 0) return { label: parts.join(" "), source: "multirow" };
  }

  return { label: null, source: "none" };
}

/**
 * Maximum collapsed length for a neighbor to read as a *label* rather than
 * *content*. Korean form labels are short ("이름", "주민등록번호",
 * "비상연락처(휴대폰)"); a long run of text in the neighbor cell is almost
 * always prose/content, which means the blank beside it is structural
 * spacing inside a content block, not a labelled input slot.
 *
 * 25 is a heuristic chosen to comfortably admit real labels (the longest
 * common Korean form labels sit well under 20 collapsed chars) while
 * rejecting sentence/paragraph neighbors. It is intentionally lenient — the
 * goal is to drop obvious prose, not to second-guess borderline labels.
 */
export const LABEL_LIKE_MAX_LEN = 25;

/**
 * Is `text` short enough (after whitespace collapse) to read as a label and
 * not a content paragraph? Empty text is not label-like.
 */
export function isLabelLike(text: string): boolean {
  const t = collapseWhitespace(text).trim();
  if (t.length === 0) return false;
  return t.length <= LABEL_LIKE_MAX_LEN;
}

/**
 * Does the cell at (row, col) have an IMMEDIATE label-like neighbor — i.e. a
 * non-empty, label-like cell directly to its left (col-1) or directly above
 * it (row-1)? This is the strong-evidence signal for a real input slot: a
 * blank that sits right next to a short label is the value half of a
 * 라벨→빈칸 pair. Distant headers do NOT count here.
 */
export async function hasImmediateLabel(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<boolean> {
  if (col > 0) {
    const left = await getCellText(doc, table, row, col - 1);
    if (left.trim().length > 0 && isLabelLike(left)) return true;
  }
  if (row > 0) {
    const upper = await getCellText(doc, table, row - 1, col);
    if (upper.trim().length > 0 && isLabelLike(upper)) return true;
  }
  return false;
}

/**
 * Is the blank at (row, col) isolated — every in-range immediate neighbor
 * (left, right, up, down) empty? An isolated blank is a spacer cell in a
 * whitespace/decorative grid, never an input slot. Out-of-range directions
 * (table edges) are skipped; a cell only needs ONE non-empty immediate
 * neighbor to be considered non-isolated.
 */
export async function isIsolatedBlank(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<boolean> {
  const neighbors: Array<[number, number]> = [
    [row, col - 1],
    [row, col + 1],
    [row - 1, col],
    [row + 1, col],
  ];
  for (const [r, c] of neighbors) {
    if (r < 0 || c < 0) continue;
    if (r >= table.row_count || c >= table.col_count) continue;
    if (cellIndex(table, r, c) >= table.cell_count) continue;
    const text = await getCellText(doc, table, r, c);
    if (text.trim().length > 0) return false;
  }
  return true;
}

/**
 * Classification of a table cell for form-filling purposes.
 *
 * - `fillable`   — an empty cell with STRONG evidence that a human fills it:
 *                  it sits beside an immediate, label-like neighbor (the
 *                  value half of a 라벨→빈칸 pair). These are the cells an
 *                  AI should actually write into.
 * - `structural` — everything else: a cell that carries text (label / header
 *                  / pre-filled), an isolated spacer blank, or a blank whose
 *                  only label evidence is a weak/distant fallback (header row
 *                  far above, multi-row stacked header). Treating these as
 *                  fill targets is the over-detection failure mode this
 *                  precision pass removes.
 */
export type CellClassification = "fillable" | "structural";

/**
 * Classify a single cell as `fillable` (a labelled blank awaiting input)
 * or `structural` (label/header/decorative scaffolding).
 *
 * Precision-first: a blank is `fillable` only with STRONG evidence — never
 * merely because *some* label could be inferred (the old rule, which fired
 * on almost every blank because `inferCellLabel` nearly always returns
 * something via its distant fallbacks).
 *
 * Pure heuristic over the read-only cell helpers — never mutates the doc.
 *
 * Rules (evaluated in order):
 *   1. Self carries text → `structural` (label / header / pre-filled). [kept]
 *   2. Isolated blank (every immediate neighbor empty) → `structural`
 *      (decorative spacer grid).
 *   3. Immediate label-like neighbor (short, non-empty cell to the left or
 *      directly above) → `fillable`. This is the strong 라벨→빈칸 signal and
 *      is the ONLY positive path, so the obvious label|value case is always
 *      retained.
 *   4. Otherwise → `structural`. This covers blanks whose only "label" comes
 *      from a weak/distant fallback (header row far above, multi-row header)
 *      or from a long-text (content, not label) neighbor — weak evidence,
 *      excluded to keep precision high.
 */
export async function classifyCell(
  doc: HwpDocumentLike,
  table: TableHandle,
  row: number,
  col: number,
): Promise<CellClassification> {
  const selfText = (await getCellText(doc, table, row, col)).trim();
  if (selfText.length > 0) {
    // Rule 1: carries text → label / header / pre-filled content cell.
    return "structural";
  }

  // Rule 2: isolated blank → decorative/spacer grid.
  if (await isIsolatedBlank(doc, table, row, col)) {
    return "structural";
  }

  // Rule 3: strong immediate label-like neighbor → real input slot.
  if (await hasImmediateLabel(doc, table, row, col)) {
    return "fillable";
  }

  // Rule 4: weak/distant or non-label evidence only → structural.
  return "structural";
}
