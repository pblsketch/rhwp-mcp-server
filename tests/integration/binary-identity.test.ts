/**
 * Sprint 1.5 integration test — binary-identity gate framework.
 *
 * The CI workflow runs `npm run gate:binary-identity` directly, but a
 * vitest probe is useful because:
 *   - it catches regressions on rhwp version bumps inside the same
 *     `npm test` pass the contributors already run,
 *   - it exercises the in-process round-trip without spawning a
 *     subprocess (faster iteration during local development),
 *   - it lets us assert structured invariants (per-case fields, JSON
 *     shape) instead of grepping stdout.
 *
 * The test regenerates the synthetic corpus on-demand under the OS
 * temp dir so it never depends on a committed `corpus/synthetic/`.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { warmRhwp } from "../../src/rhwp/loader.js";
import type { HwpDocumentLike, RhwpModuleLike } from "../../src/rhwp/types.js";

interface VerifyReport {
  bytesLen: number;
  pageCountBefore: number;
  pageCountAfter: number;
  recovered: boolean;
}

function parseVerify(raw: string): VerifyReport {
  const v = JSON.parse(raw) as VerifyReport;
  expect(typeof v.bytesLen).toBe("number");
  expect(typeof v.pageCountBefore).toBe("number");
  expect(typeof v.pageCountAfter).toBe("number");
  expect(typeof v.recovered).toBe("boolean");
  return v;
}

function buildBlank(mod: RhwpModuleLike): HwpDocumentLike {
  const doc = mod.HwpDocument.createEmpty();
  (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
  return doc;
}

describe("Sprint 1.5 binary-identity gate (in-process)", () => {
  let mod: RhwpModuleLike;
  let tmp: string;

  beforeAll(async () => {
    mod = (await warmRhwp()) as RhwpModuleLike;
    tmp = mkdtempSync(join(tmpdir(), "rhwp-mcp-gate-"));
  });

  it("synthesizes a blank document that round-trips with recovered=true", () => {
    const doc = buildBlank(mod);
    const bytes = doc.exportHwp();
    const v1 = parseVerify(
      (doc as unknown as { exportHwpVerify(): string }).exportHwpVerify(),
    );
    expect(v1.recovered).toBe(true);
    expect(v1.pageCountBefore).toBe(v1.pageCountAfter);
    expect(bytes.length).toBeGreaterThan(0);

    const path = join(tmp, "blank.hwp");
    writeFileSync(path, bytes);

    const doc2 = new mod.HwpDocument(readFileSync(path));
    const v2 = parseVerify(
      (doc2 as unknown as { exportHwpVerify(): string }).exportHwpVerify(),
    );
    expect(v2.recovered).toBe(true);
    expect(v2.pageCountBefore).toBe(v1.pageCountAfter);
  });

  it("authoring edits do not break the round-trip contract", () => {
    const doc = buildBlank(mod);
    doc.insertText(0, 0, 0, "혼합 케이스 — 텍스트");
    doc.applyParaFormat(0, 0, JSON.stringify({ alignment: "center" }));
    doc.createTable(0, 0, 0, 2, 2);

    const bytes = doc.exportHwp();
    expect(bytes.length).toBeGreaterThan(0);

    const reopened = new mod.HwpDocument(bytes);
    const v = parseVerify(
      (reopened as unknown as { exportHwpVerify(): string }).exportHwpVerify(),
    );
    expect(v.recovered).toBe(true);
    expect(v.pageCountBefore).toBe(v.pageCountAfter);
  });

  it("verify report shape stays JSON with the documented keys", () => {
    const doc = buildBlank(mod);
    const raw = (doc as unknown as { exportHwpVerify(): string }).exportHwpVerify();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["bytesLen", "pageCountBefore", "pageCountAfter", "recovered"]) {
      expect(parsed).toHaveProperty(key);
    }
  });
});
