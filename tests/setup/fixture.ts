/**
 * tests/setup/fixture.ts
 *
 * Synthetic HWPX fixture for Sprint 1 smoke tests. We don't commit any
 * binary HWP/HWPX files into the repo — instead we use rhwp's bundled
 * blank template (`HwpDocument.createEmpty().exportHwpx()`) to materialise
 * a tiny .hwpx in the OS temp dir at first use.
 *
 * The path is cached per-process so the four smoke tests (open / save_as /
 * list_fields / fill_fields) share a single fixture instead of paying for
 * createEmpty + exportHwpx on every test.
 */

import { writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureEngine } from "../../src/rhwp/loader.js";
import { sessionStore } from "../../src/session/store.js";
import type { HwpDocumentLike } from "../../src/rhwp/types.js";

let cachedPath: string | null = null;

export async function makeBlankHwpxFixture(): Promise<string> {
  if (cachedPath !== null) {
    try {
      const s = statSync(cachedPath);
      if (s.isFile() && s.size > 0) return cachedPath;
    } catch {
      // fall through and regenerate
    }
  }

  const engine = await ensureEngine();
  const doc = await engine.createBlank();
  let bytes: Uint8Array;
  try {
    bytes = doc.exportHwpx();
  } finally {
    // Release the WASM-owned doc handle so test runs don't leak.
    if (typeof doc.free === "function") {
      try { doc.free(); } catch { /* ignore */ }
    }
  }

  const path = join(tmpdir(), `rhwp-mcp-blank-${process.pid}.hwpx`);
  writeFileSync(path, bytes);
  cachedPath = path;
  return path;
}

/**
 * Sprint 2 Authoring tests need a document with at least one section so
 * that coordinate-based actions (insertText, createTable, applyParaFormat,
 * …) can target (section_idx=0, para_idx=0, char_offset=0).
 *
 * Bootstrap recipe:
 *   1. `HwpDocument.createEmpty()` — returns a sectionless skeleton.
 *   2. `doc.createBlankDocument()` — loads the bundled saved/blank2010.hwp
 *      template, giving us a doc with a real section 0 and a single empty
 *      paragraph at (0, 0).
 *
 * The helper bypasses the file round-trip and injects the resulting doc
 * directly into `sessionStore`. The static `createEmpty()` alone is NOT
 * enough for Authoring — it reports `구역 인덱스 0 범위 초과 (총 0개)`
 * on any coordinate-based action.
 */
export async function openBlankAuthoringDocument(): Promise<HwpDocumentLike> {
  const engine = await ensureEngine();
  const doc = await engine.createBlank();
  (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
  sessionStore.clear();
  sessionStore.set(doc, {
    sourcePath: "<in-memory blank>",
    sourceFormat: "hwpx",
  });
  return doc;
}
