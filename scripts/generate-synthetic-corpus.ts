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
 *   - blank.hwp           — `createBlankDocument()` only
 *   - text-only.hwp       — single insertText(0,0,0,…) of Korean prose
 *   - table-only.hwp      — single createTable(0,0,0,2,2)
 *   - paragraph-style.hwp — applyParaFormat with center alignment
 *   - mixed.hwp           — text + table + paragraph format combined
 *
 * Real user corpora live under `corpus/private/` (gitignored) and are
 * picked up by `corpus-runner.ts` automatically when present.
 *
 * Run via `npm run corpus:generate` or directly with tsx.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { warmRhwp } from "../src/rhwp/loader.js";
import type { HwpDocumentLike, RhwpModuleLike } from "../src/rhwp/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = join(repoRoot, "corpus", "synthetic");

interface SyntheticCase {
  id: string;
  filename: string;
  description: string;
  build: (doc: HwpDocumentLike) => void;
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
];

async function main(): Promise<void> {
  const mod = (await warmRhwp()) as RhwpModuleLike;
  mkdirSync(outDir, { recursive: true });

  const manifest: Array<{
    id: string;
    filename: string;
    description: string;
    bytesLen: number;
  }> = [];

  for (const c of CASES) {
    const doc = mod.HwpDocument.createEmpty();
    (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
    c.build(doc);
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
