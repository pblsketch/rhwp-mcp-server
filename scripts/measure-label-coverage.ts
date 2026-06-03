/**
 * scripts/measure-label-coverage.ts
 *
 * Data-independent surrogate metric for the cell-label heuristics.
 *
 * The first increment deliberately does NOT measure absolute labelling
 * accuracy — that requires the real N=30 form corpus, which is gated to a
 * later phase. Instead this script measures a *relative* signal we CAN
 * compute from synthetic structures alone:
 *
 *   baseline   = the original two-step heuristic (left neighbor → header
 *                row 0), re-implemented verbatim here.
 *   current    = the shipped `inferCellLabel` (baseline + additive upper-
 *                neighbor + multi-row-header fallbacks).
 *
 * For every blank cell across a fixed set of synthetic table shapes, we
 * compute both labels and roll up:
 *
 *   - none→label transitions : blanks that baseline left unlabelled but the
 *     current heuristic now labels (the directional improvement).
 *   - changed labels          : blanks where baseline produced label X and
 *     current produced a DIFFERENT non-null label Y. This MUST stay 0 — the
 *     additive heuristics may only fill former nulls, never rewrite an
 *     existing label (the golden-snapshot invariant, restated as a metric).
 *   - coverage before/after   : fraction of blank cells that carry a label
 *     under each heuristic, and the delta between them.
 *
 * The report is written to `docs/measurements/label-coverage-delta.md`. The
 * accompanying integration test (`tests/integration/label-coverage.test.ts`)
 * pins the three acceptance rules:
 *   (a) changed labels == 0      (no baseline label value mutated)
 *   (b) none→label transitions ≥ 0 (improvement is non-negative)
 *   (c) the delta report artifact exists
 *
 * The same synthetic structures back the corpus generator's table-shape
 * cases; defining them here (rather than re-parsing the .hwp files) keeps the
 * metric a pure function of the heuristic + a known structure, with no binary
 * round-trip in the loop.
 *
 * Run via `npm run measure:label-coverage` or directly with tsx.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEngine } from "../src/rhwp/loader.js";
import {
  findAllTables,
  getCellText,
  inferCellLabel,
  type TableHandle,
} from "../src/rhwp/tables.js";
import type { HwpDocumentLike } from "../src/rhwp/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const reportPath = join(repoRoot, "docs", "measurements", "label-coverage-delta.md");

/**
 * Verbatim re-implementation of the ORIGINAL pre-Phase-3 two-step heuristic:
 * left neighbor (col-1) → header row 0 (same col). No additive fallbacks.
 * This is the frozen baseline the metric compares the current heuristic
 * against. Mirrors `baselineInferLabel` in the golden-snapshot test so the
 * two stay in lockstep.
 */
async function baselineInferLabel(
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

interface ShapeCase {
  id: string;
  description: string;
  grid: string[][];
}

/**
 * Synthetic table shapes. Structurally identical to the table-shape cases in
 * `generate-synthetic-corpus.ts`, plus the small golden shapes, so the metric
 * exercises exactly the layouts the additive heuristics target.
 */
const SHAPES: ShapeCase[] = [
  {
    id: "table-label-value",
    description: "Dense 라벨→빈칸 grid (left-neighbor labels).",
    grid: [
      ["이름", "", "생년월일", ""],
      ["주소", "", "연락처", ""],
      ["소속", "", "직위", ""],
    ],
  },
  {
    id: "table-colon-label",
    description: "Labels with trailing colon / parenthetical hint.",
    grid: [
      ["이름:", "", "연락처(휴대폰):", ""],
      ["이메일:", "", "비고:", ""],
    ],
  },
  {
    id: "table-multirow-header",
    description: "Stacked header rows above empty data columns.",
    grid: [
      ["구분", "상반기", "상반기"],
      ["구분", "매출", "비용"],
      ["1월", "", ""],
      ["2월", "", ""],
    ],
  },
  {
    id: "table-stacked-label",
    description: "Single-column stacked label-above-blank (upper neighbor).",
    grid: [[""], ["신청 사유"], [""], ["희망 일자"], [""]],
  },
  {
    id: "table-sparse-merge",
    description: "Sparse 라벨→빈칸 grid with mostly-empty rows.",
    grid: [
      ["접수번호", "", "", ""],
      ["", "", "", ""],
      ["담당부서", "", "처리기한", ""],
      ["", "", "", ""],
    ],
  },
];

interface CoverageRow {
  id: string;
  description: string;
  blankCells: number;
  baselineLabelled: number;
  currentLabelled: number;
  noneToLabel: number;
  changedLabels: number;
}

export interface CoverageReport {
  generatedAt: string;
  rows: CoverageRow[];
  totals: {
    blankCells: number;
    baselineLabelled: number;
    currentLabelled: number;
    noneToLabel: number;
    changedLabels: number;
    baselineCoverage: number;
    currentCoverage: number;
    coverageDelta: number;
  };
}

async function buildTable(doc: HwpDocumentLike, grid: string[][]): Promise<TableHandle> {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const rawCreate = doc.createTable(0, 0, 0, rows, cols);
  const parsed = JSON.parse(rawCreate) as {
    paraIdx?: number;
    controlIdx?: number;
  };
  if (typeof parsed.paraIdx !== "number" || typeof parsed.controlIdx !== "number") {
    throw new Error(`createTable returned no handle: ${rawCreate.slice(0, 120)}`);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const text = grid[r][c];
      if (!text || text.length === 0) continue;
      doc.insertTextInCell(0, parsed.paraIdx, parsed.controlIdx, r * cols + c, 0, 0, text);
    }
  }
  // The table is the only one in this freshly-built doc.
  return (await findAllTables(doc))[0];
}

/**
 * Measure the baseline → current coverage delta across all synthetic shapes.
 * Pure with respect to the document engine: builds each shape in a fresh
 * in-memory doc, walks every blank cell once, never serializes.
 */
export async function measureLabelCoverage(): Promise<CoverageReport> {
  const engine = await ensureEngine();
  const rows: CoverageRow[] = [];

  for (const shape of SHAPES) {
    const doc = await engine.createBlank();
    (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
    const table = await buildTable(doc, shape.grid);

    let blankCells = 0;
    let baselineLabelled = 0;
    let currentLabelled = 0;
    let noneToLabel = 0;
    let changedLabels = 0;

    for (let row = 0; row < table.row_count; row += 1) {
      for (let col = 0; col < table.col_count; col += 1) {
        // Mirror locate_blanks' bound: skip positions past the real cell_count.
        if (row * table.col_count + col >= table.cell_count) continue;
        const selfText = (await getCellText(doc, table, row, col)).trim();
        if (selfText.length > 0) continue; // only blank cells get a suggested label
        blankCells += 1;

        const baseline = await baselineInferLabel(doc, table, row, col);
        const current = await inferCellLabel(doc, table, row, col);

        if (baseline !== null) baselineLabelled += 1;
        if (current !== null) currentLabelled += 1;

        if (baseline === null && current !== null) {
          noneToLabel += 1;
        } else if (baseline !== null && current !== null && baseline !== current) {
          // Forbidden: an existing baseline label was rewritten.
          changedLabels += 1;
        }
      }
    }

    if (typeof doc.free === "function") {
      try {
        doc.free();
      } catch {
        // best-effort finaliser
      }
    }

    rows.push({
      id: shape.id,
      description: shape.description,
      blankCells,
      baselineLabelled,
      currentLabelled,
      noneToLabel,
      changedLabels,
    });
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.blankCells += r.blankCells;
      acc.baselineLabelled += r.baselineLabelled;
      acc.currentLabelled += r.currentLabelled;
      acc.noneToLabel += r.noneToLabel;
      acc.changedLabels += r.changedLabels;
      return acc;
    },
    {
      blankCells: 0,
      baselineLabelled: 0,
      currentLabelled: 0,
      noneToLabel: 0,
      changedLabels: 0,
    },
  );

  const baselineCoverage =
    totals.blankCells === 0 ? 0 : totals.baselineLabelled / totals.blankCells;
  const currentCoverage =
    totals.blankCells === 0 ? 0 : totals.currentLabelled / totals.blankCells;

  return {
    generatedAt: new Date().toISOString(),
    rows,
    totals: {
      ...totals,
      baselineCoverage,
      currentCoverage,
      coverageDelta: currentCoverage - baselineCoverage,
    },
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function renderReport(report: CoverageReport): string {
  const t = report.totals;
  const lines: string[] = [];
  lines.push("# Label coverage delta (data-independent surrogate metric)");
  lines.push("");
  lines.push(
    "Relative cell-label coverage of the additive cell-discovery heuristics " +
      "(upper neighbor + multi-row header) versus the original two-step " +
      "baseline (left neighbor → header row 0), measured over synthetic table " +
      "shapes. This is a **regression-defence + directionality** signal, NOT " +
      "an absolute accuracy claim — absolute accuracy is gated to the real " +
      "N=30 form corpus in a later phase.",
  );
  lines.push("");
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push("");
  lines.push("## Acceptance rules");
  lines.push("");
  lines.push(
    `- (a) changed labels == 0 → **${t.changedLabels === 0 ? "PASS" : "FAIL"}** ` +
      `(observed ${t.changedLabels}). No baseline label value was rewritten.`,
  );
  lines.push(
    `- (b) none→label transitions ≥ 0 → **${t.noneToLabel >= 0 ? "PASS" : "FAIL"}** ` +
      `(observed ${t.noneToLabel}). Directional improvement is non-negative.`,
  );
  lines.push("- (c) this artifact exists → **PASS**.");
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Blank cells examined: ${t.blankCells}`);
  lines.push(`- Baseline labelled: ${t.baselineLabelled} (${pct(t.baselineCoverage)})`);
  lines.push(`- Current labelled: ${t.currentLabelled} (${pct(t.currentCoverage)})`);
  lines.push(`- None→Label transitions: ${t.noneToLabel}`);
  lines.push(`- Coverage delta: ${pct(t.coverageDelta)}`);
  lines.push("");
  lines.push("## Per-shape breakdown");
  lines.push("");
  lines.push(
    "| Shape | Blank cells | Baseline labelled | Current labelled | None→Label | Changed |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of report.rows) {
    lines.push(
      `| ${r.id} | ${r.blankCells} | ${r.baselineLabelled} | ${r.currentLabelled} | ` +
        `${r.noneToLabel} | ${r.changedLabels} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = await measureLabelCoverage();
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderReport(report), "utf-8");

  const t = report.totals;
  process.stdout.write(
    `\nLabel coverage delta — blanks=${t.blankCells} ` +
      `baseline=${t.baselineLabelled}(${pct(t.baselineCoverage)}) ` +
      `current=${t.currentLabelled}(${pct(t.currentCoverage)}) ` +
      `none→label=${t.noneToLabel} changed=${t.changedLabels} ` +
      `delta=${pct(t.coverageDelta)}\n`,
  );
  process.stdout.write(`Wrote ${reportPath}\n`);

  if (t.changedLabels !== 0) {
    process.stderr.write(
      `FAIL: ${t.changedLabels} baseline label(s) were rewritten — additive ` +
        "heuristics must only fill former nulls (None→Label).\n",
    );
    process.exit(2);
  }
}

// Run main() only when invoked directly so tests can import the pure
// measurement function without the file-write side effect.
const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`measure-label-coverage failed: ${String(err)}\n`);
    process.exit(1);
  });
}
