/**
 * Sprint 3 integration test — corpus-runner Pass A skip path + pure logic.
 *
 * Pass A's pass path requires a document carrying form fields, which the
 * synthetic corpus does not (and cannot — rhwp's body-form-field create
 * API is not on the public surface in 0.7.13). We test:
 *
 *   1. Pass A returns SKIP on a synthetic blank doc with zero fields.
 *   2. `combine()` matches the truth table from ADR-0006 §2.
 *   3. `selectThreshold()` honors the N=30 escalation from ADR-0006 §5.
 *
 * Pass A's pass path is covered by the real-corpus run after Sprint 3 B2
 * (corpus delivery). The runner exports the pure functions so this test
 * does not have to spin up a subprocess to inspect them.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  combine,
  runPassA,
  selectThreshold,
} from "../../scripts/corpus-runner.js";
import { warmRhwp } from "../../src/rhwp/loader.js";
import type { HwpDocumentLike, RhwpModuleLike } from "../../src/rhwp/types.js";

function buildBlankBytes(mod: RhwpModuleLike): Uint8Array {
  const doc = mod.HwpDocument.createEmpty();
  (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
  const bytes = doc.exportHwp();
  if (typeof (doc as HwpDocumentLike).free === "function") {
    try {
      (doc as HwpDocumentLike).free?.();
    } catch {
      // ignore
    }
  }
  return bytes;
}

describe("Sprint 3 — corpus-runner Pass A skip path", () => {
  let mod: RhwpModuleLike;

  beforeAll(async () => {
    mod = (await warmRhwp()) as RhwpModuleLike;
  });

  it("Pass A skips a synthetic blank doc (zero form fields)", () => {
    const bytes = buildBlankBytes(mod);
    const result = runPassA(mod, bytes, "hwp");
    expect(result.status).toBe("skip");
    expect(result.fieldCount).toBe(0);
    expect(result.filledCount).toBe(0);
    expect(result.reopenedFieldCount).toBe(0);
    expect(result.valueRoundtripOk).toBe(false);
    expect(result.failReason).toBeUndefined();
  });
});

describe("Sprint 3 — combine() truth table (ADR-0006 §2)", () => {
  const passA = (status: "pass" | "fail" | "skip", failReason?: string) => ({
    status,
    fieldCount: 0,
    filledCount: 0,
    reopenedFieldCount: 0,
    valueRoundtripOk: false,
    failReason,
  });
  const passB = (status: "pass" | "fail" | "skip", failReason?: string) => ({
    status,
    initialBytesLen: 0,
    failReason,
  });

  it("pass + pass → pass", () => {
    expect(combine(passA("pass"), passB("pass")).status).toBe("pass");
  });

  it("pass + skip → pass", () => {
    expect(combine(passA("pass"), passB("skip")).status).toBe("pass");
  });

  it("skip + pass → pass", () => {
    expect(combine(passA("skip"), passB("pass")).status).toBe("pass");
  });

  it("skip + skip → skip with reason", () => {
    const r = combine(passA("skip"), passB("skip"));
    expect(r.status).toBe("skip");
    expect(r.combinedReason).toContain("both passes skipped");
  });

  it("fail in Pass A → fail with Pass A's reason", () => {
    const r = combine(passA("fail", "Pass A: value drift"), passB("pass"));
    expect(r.status).toBe("fail");
    expect(r.combinedReason).toBe("Pass A: value drift");
  });

  it("fail in Pass B → fail with Pass B's reason", () => {
    const r = combine(passA("pass"), passB("fail", "Pass B: not recovered"));
    expect(r.status).toBe("fail");
    expect(r.combinedReason).toBe("Pass B: not recovered");
  });

  it("Pass A fail dominates Pass B status", () => {
    const r = combine(passA("fail", "PA"), passB("fail", "PB"));
    expect(r.status).toBe("fail");
    // PA evaluated first per ADR-0006 §2.
    expect(r.combinedReason).toBe("PA");
  });
});

describe("Sprint 3 — selectThreshold() escalation (ADR-0006 §5)", () => {
  it("rated=0 → empty source", () => {
    expect(selectThreshold(0)).toEqual({ threshold: 0, source: "empty" });
  });

  it("rated below 30 → Sprint 1.5 baseline 90%", () => {
    for (const n of [1, 5, 10, 29]) {
      expect(selectThreshold(n)).toEqual({
        threshold: 0.9,
        source: "sprint-1.5-baseline",
      });
    }
  });

  it("rated at the N=30 boundary → Decision Gate 3.0 95%", () => {
    expect(selectThreshold(30)).toEqual({
      threshold: 0.95,
      source: "decision-gate-3",
    });
  });

  it("rated above 30 → Decision Gate 3.0 95%", () => {
    for (const n of [31, 50, 100]) {
      expect(selectThreshold(n)).toEqual({
        threshold: 0.95,
        source: "decision-gate-3",
      });
    }
  });
});
