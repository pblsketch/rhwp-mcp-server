/**
 * Phase 4 integration test — data-independent surrogate metric (AC-4b).
 *
 * Pins the three acceptance rules for the relative label-coverage delta:
 *   (a) changed labels == 0       — no baseline label value was rewritten
 *                                   (golden-snapshot invariant, as a metric).
 *   (b) none→label transitions ≥ 0 — directional improvement is non-negative.
 *   (c) the delta report artifact exists on disk.
 *
 * The metric is a relative regression-defence + directionality signal, NOT an
 * absolute accuracy claim — absolute accuracy is gated to the real N=30 form
 * corpus in a later phase. The measurement function is imported directly so
 * the test does not spawn a subprocess.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { measureLabelCoverage } from "../../scripts/measure-label-coverage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const reportPath = join(repoRoot, "docs", "measurements", "label-coverage-delta.md");

describe("label coverage surrogate metric (AC-4b)", () => {
  it("(a) rewrites zero baseline labels (changed == 0)", async () => {
    const report = await measureLabelCoverage();
    expect(report.totals.changedLabels).toBe(0);
    // every per-shape row must also be clean
    for (const row of report.rows) {
      expect(row.changedLabels, `shape ${row.id}`).toBe(0);
    }
  });

  it("(b) produces a non-negative none→label improvement", async () => {
    const report = await measureLabelCoverage();
    expect(report.totals.noneToLabel).toBeGreaterThanOrEqual(0);
    // current coverage never regresses below baseline
    expect(report.totals.currentCoverage).toBeGreaterThanOrEqual(
      report.totals.baselineCoverage,
    );
    // the additive heuristics demonstrably fire on the synthetic shapes
    expect(report.totals.noneToLabel).toBeGreaterThan(0);
  });

  it("(c) the delta report artifact exists", () => {
    expect(existsSync(reportPath)).toBe(true);
  });

  it("current labelled count = baseline labelled + none→label (accounting identity)", async () => {
    const report = await measureLabelCoverage();
    // Since changed == 0 and the additive steps only fill former nulls, the
    // current label count is exactly baseline + the none→label transitions.
    expect(report.totals.currentLabelled).toBe(
      report.totals.baselineLabelled + report.totals.noneToLabel,
    );
  });
});
