/**
 * scripts/generate-synthetic-corpus.ts
 *
 * Generate a deterministic synthetic .hwp corpus for the Sprint 1.5
 * Binary-Identity Save Gate. Output goes to `corpus/synthetic/` and is
 * committed to the repo so CI can run the gate without depending on the
 * user's private .hwp library.
 *
 * Each case exercises a different subset of the Authoring surface so the
 * gate signal is granular:
 *   - blank.hwp              — `createBlankDocument()` only
 *   - text-only.hwp          — single insertText(0,0,0,…) of Korean prose
 *   - table-only.hwp         — single createTable(0,0,0,2,2)
 *   - paragraph-style.hwp    — applyParaFormat with center alignment
 *   - mixed.hwp              — text + table + paragraph format combined
 *   --- table-shape cases (exercise the cell-discovery heuristics) ---
 *   - table-label-value.hwp  — dense 라벨→빈칸 grid (left-neighbor labels)
 *   - table-colon-label.hwp  — labels carrying a trailing colon ("이름:")
 *   - table-multirow-header.hwp — stacked header rows above empty columns
 *   - table-stacked-label.hwp   — label directly above its blank (upper-neighbor)
 *   - table-sparse-merge.hwp    — sparse grid that over-shoots cell_count
 *                                 (merge-style layout — bounds the walker)
 *
 * The table-shape cases are built so the additive Phase 3 heuristics
 * (upper neighbor, multi-row header) have real None→Label opportunities to
 * fire on; the data-independent surrogate metric in
 * `scripts/measure-label-coverage.ts` reads exactly these structures.
 *
 * Real user corpora live under `corpus/private/` (gitignored) and are
 * picked up by `corpus-runner.ts` automatically when present.
 *
 * Run via `npm run corpus:generate` or directly with tsx.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEngine, warmRhwp } from "../src/rhwp/loader.js";
import type { HwpDocumentLike, RhwpModuleLike } from "../src/rhwp/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = join(repoRoot, "corpus", "synthetic");

interface SyntheticCase {
  id: string;
  filename: string;
  description: string;
  build: (doc: HwpDocumentLike) => void | Promise<void>;
}

/**
 * Build a table at document start and fill it from a row-major 2-D array.
 *
 * This mirrors `executeHwpCreateTable`'s data path exactly: createTable
 * returns the fresh paragraph + control idx the table actually landed in,
 * and each non-empty cell is written by `insertTextInCell` using the
 * row-major `cellIdx = r * cols + c` convention. Empty strings are left
 * blank so the cell-discovery heuristics have real blanks to label.
 *
 * Kept local to this script (not imported from the tool) to avoid coupling
 * the corpus generator to the tool's MCP-facing result shape — the
 * underlying doc calls are identical.
 */
function buildTableFromGrid(doc: HwpDocumentLike, grid: string[][]): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const rawCreate = doc.createTable(0, 0, 0, rows, cols);
  const parsed = JSON.parse(rawCreate) as {
    ok?: boolean;
    paraIdx?: number;
    controlIdx?: number;
  };
  if (typeof parsed.paraIdx !== "number" || typeof parsed.controlIdx !== "number") {
    throw new Error(
      `createTable did not return paraIdx/controlIdx: ${rawCreate.slice(0, 120)}`,
    );
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const text = grid[r][c];
      if (!text || text.length === 0) continue;
      const cellIdx = r * cols + c;
      doc.insertTextInCell(0, parsed.paraIdx, parsed.controlIdx, cellIdx, 0, 0, text);
    }
  }
}

const CASES: SyntheticCase[] = [
  {
    id: "blank",
    filename: "blank.hwp",
    description: "Bundled blank template, no edits.",
    build: () => {
      // createBlankDocument was already called at bootstrap time.
    },
  },
  {
    id: "text-only",
    filename: "text-only.hwp",
    description: "Single Korean paragraph inserted at document start.",
    build: (doc) => {
      doc.insertText(0, 0, 0, "한글 자동화 테스트 코퍼스입니다.");
    },
  },
  {
    id: "table-only",
    filename: "table-only.hwp",
    description: "2×2 table at document start, no text.",
    build: (doc) => {
      doc.createTable(0, 0, 0, 2, 2);
    },
  },
  {
    id: "paragraph-style",
    filename: "paragraph-style.hwp",
    description: "Center alignment applied to the first paragraph.",
    build: (doc) => {
      doc.applyParaFormat(0, 0, JSON.stringify({ alignment: "center" }));
    },
  },
  {
    id: "mixed",
    filename: "mixed.hwp",
    description: "Text + 2×2 table + center alignment in one document.",
    build: (doc) => {
      doc.insertText(0, 0, 0, "혼합 케이스: 본문 + 표 + 정렬");
      doc.applyParaFormat(0, 0, JSON.stringify({ alignment: "center" }));
      // Table is appended into a fresh paragraph adjacent to insertion.
      doc.createTable(0, 0, 0, 2, 2);
    },
  },

  // --- table-shape cases: exercise the cell-discovery heuristics ----------
  {
    id: "table-label-value",
    filename: "table-label-value.hwp",
    description:
      "Dense 라벨→빈칸 grid: every odd column is a label, every even " +
      "column is the blank it labels (left-neighbor heuristic).",
    build: (doc) => {
      buildTableFromGrid(doc, [
        ["이름", "", "생년월일", ""],
        ["주소", "", "연락처", ""],
        ["소속", "", "직위", ""],
      ]);
    },
  },
  {
    id: "table-colon-label",
    filename: "table-colon-label.hwp",
    description:
      "Labels carrying a trailing colon ('이름:') and a parenthetical " +
      "hint — punctuation must be preserved verbatim in the label.",
    build: (doc) => {
      buildTableFromGrid(doc, [
        ["이름:", "", "연락처(휴대폰):", ""],
        ["이메일:", "", "비고:", ""],
      ]);
    },
  },
  {
    id: "table-multirow-header",
    filename: "table-multirow-header.hwp",
    description:
      "Stacked header rows above empty data columns: row 0 group header " +
      "('상반기') over row 1 sub-header ('매출'/'비용'), data rows below " +
      "exercise the multi-row-header heuristic.",
    build: (doc) => {
      buildTableFromGrid(doc, [
        ["구분", "상반기", "상반기"],
        ["구분", "매출", "비용"],
        ["1월", "", ""],
        ["2월", "", ""],
      ]);
    },
  },
  {
    id: "table-stacked-label",
    filename: "table-stacked-label.hwp",
    description:
      "Single-column stacked layout where each label sits directly above " +
      "its blank (upper-neighbor heuristic): row 0 empty header, then " +
      "label/blank pairs stacked vertically.",
    build: (doc) => {
      buildTableFromGrid(doc, [
        [""],
        ["신청 사유"],
        [""],
        ["희망 일자"],
        [""],
      ]);
    },
  },
  {
    id: "table-sparse-merge",
    filename: "table-sparse-merge.hwp",
    description:
      "Sparse 라벨→빈칸 grid with mostly-empty rows — a merge-style layout " +
      "where the linear row*cols+col index can over-shoot cell_count; " +
      "bounds the cell walker (ADR-0004 merged-cell limit).",
    build: (doc) => {
      buildTableFromGrid(doc, [
        ["접수번호", "", "", ""],
        ["", "", "", ""],
        ["담당부서", "", "처리기한", ""],
        ["", "", "", ""],
      ]);
    },
  },
];

async function main(): Promise<void> {
  const mod = (await warmRhwp()) as RhwpModuleLike;
  const engine = await ensureEngine();
  mkdirSync(outDir, { recursive: true });

  const manifest: Array<{
    id: string;
    filename: string;
    description: string;
    bytesLen: number;
  }> = [];

  for (const c of CASES) {
    const doc = await engine.createBlank();
    (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
    await c.build(doc);
    const bytes = doc.exportHwp();
    const outPath = join(outDir, c.filename);
    writeFileSync(outPath, bytes);
    manifest.push({
      id: c.id,
      filename: c.filename,
      description: c.description,
      bytesLen: bytes.length,
    });
    if (typeof doc.free === "function") {
      try {
        doc.free();
      } catch {
        // ignore — finaliser is best-effort
      }
    }
    process.stdout.write(`  ${c.id.padEnd(18)} → ${outPath} (${bytes.length} bytes)\n`);
  }

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rhwpCoreVersion: mod.version(),
        cases: manifest,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  process.stdout.write(`\nWrote ${manifest.length} synthetic cases + manifest.json\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`generate-synthetic-corpus failed: ${String(err)}\n`);
  process.exit(1);
});
