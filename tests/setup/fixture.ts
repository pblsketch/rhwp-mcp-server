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

import { warmRhwp } from "../../src/rhwp/loader.js";
import type { RhwpModuleLike } from "../../src/rhwp/types.js";

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

  const mod = (await warmRhwp()) as RhwpModuleLike;
  const doc = mod.HwpDocument.createEmpty();
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
