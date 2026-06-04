/**
 * Cell-detection measurement over a real-form corpus.
 *
 * Korean office forms frequently carry no named form-field controls; their
 * fill targets are table cells. This script measures how well the table
 * cell-detection path (findAllTables + inferCellLabel + classifyCell) locates
 * and labels the blank cells a user would fill, across every document under
 * corpus/private and corpus/forms.
 *
 * It does NOT mutate any document and never prints cell contents, so it is
 * safe to run against private forms that contain personal data — only
 * per-file counts and label-source histograms are reported.
 *
 * Run: npx tsx scripts/measure-cell-detection.ts
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEngine } from "../src/rhwp/loader.js";
import { sessionStore } from "../src/session/store.js";
import {
  findAllTables,
  getCellText,
  inferCellLabel,
  cellIndex,
  classifyCell,
} from "../src/rhwp/tables.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "corpus");

interface FileReport {
  file: string;
  bucket: string;
  tables: number;
  cells: number;
  blanks: number;
  labeled: number;
  unlabeled: number;
  fillable: number;
  structural: number;
  error?: string;
}

function listDocs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => {
      const e = extname(f).toLowerCase();
      return e === ".hwp" || e === ".hwpx";
    })
    .sort();
}

async function measureFile(
  bucket: string,
  dir: string,
  name: string,
): Promise<FileReport> {
  const report: FileReport = {
    file: name,
    bucket,
    tables: 0,
    cells: 0,
    blanks: 0,
    labeled: 0,
    unlabeled: 0,
    fillable: 0,
    structural: 0,
  };
  try {
    const bytes = readFileSync(join(dir, name));
    const ext = extname(name).toLowerCase() === ".hwpx" ? "hwpx" : "hwp";
    const engine = await ensureEngine();
    const doc = await engine.openFromBytes(new Uint8Array(bytes), ext);
    sessionStore.set(doc, { sourcePath: join(dir, name), sourceFormat: ext });

    const tables = await findAllTables(doc);
    report.tables = tables.length;
    for (const table of tables) {
      for (let row = 0; row < table.row_count; row += 1) {
        for (let col = 0; col < table.col_count; col += 1) {
          if (cellIndex(table, row, col) >= table.cell_count) continue;
          report.cells += 1;
          const text = await getCellText(doc, table, row, col);
          const isBlank = text.trim().length === 0;
          if (!isBlank) continue;
          report.blanks += 1;
          const label = await inferCellLabel(doc, table, row, col);
          if (label) report.labeled += 1;
          else report.unlabeled += 1;
          const cls = await classifyCell(doc, table, row, col);
          if (cls === "fillable") report.fillable += 1;
          else report.structural += 1;
        }
      }
    }
    sessionStore.clear();
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}

async function main(): Promise<void> {
  const buckets: Array<{ name: string; dir: string }> = [
    { name: "private", dir: join(CORPUS, "private") },
    { name: "forms", dir: join(CORPUS, "forms") },
  ];

  const reports: FileReport[] = [];
  for (const b of buckets) {
    for (const name of listDocs(b.dir)) {
      reports.push(await measureFile(b.name, b.dir, name));
    }
  }

  if (reports.length === 0) {
    process.stdout.write(
      "No real forms found under corpus/private or corpus/forms.\n",
    );
    return;
  }

  process.stdout.write("\nCell-detection measurement (real forms)\n");
  process.stdout.write("=".repeat(72) + "\n");
  let tTables = 0,
    tBlanks = 0,
    tLabeled = 0,
    tFillable = 0;
  for (const r of reports) {
    if (r.error) {
      process.stdout.write(
        `  [ERR ] ${r.bucket}/${r.file} — ${r.error}\n`,
      );
      continue;
    }
    const labelPct =
      r.blanks > 0 ? Math.round((r.labeled / r.blanks) * 100) : 0;
    process.stdout.write(
      `  ${r.bucket}/${r.file}\n` +
        `        tables=${r.tables} cells=${r.cells} blanks=${r.blanks} ` +
        `labeled=${r.labeled} (${labelPct}%) unlabeled=${r.unlabeled} ` +
        `| fillable=${r.fillable} structural=${r.structural}\n`,
    );
    tTables += r.tables;
    tBlanks += r.blanks;
    tLabeled += r.labeled;
    tFillable += r.fillable;
  }
  const overallPct = tBlanks > 0 ? Math.round((tLabeled / tBlanks) * 100) : 0;
  process.stdout.write("-".repeat(72) + "\n");
  process.stdout.write(
    `  TOTAL: files=${reports.length} tables=${tTables} blanks=${tBlanks} ` +
      `labeled=${tLabeled} (${overallPct}%) fillable=${tFillable}\n\n`,
  );
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
