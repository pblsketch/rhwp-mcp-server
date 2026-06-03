# Sprint 3 Corpus Gate — Measurement Report

Generated: 2026-06-03 (baseline, pre-N=30)
rhwp/core version: 0.7.13
Runner: `scripts/corpus-runner.ts` (Pass A + Pass B combined; see ADR-0006)
Reproduce: `npm run gate:binary-identity`

## Current snapshot — N = 5 synthetic

The corpus today is the Sprint 1.5 synthetic baseline only. No real `.hwp`
or `.hwpx` forms have been added to `corpus/forms/` yet — Sprint 3's N=30
expansion is pending user-corpus delivery (Sprint 3 plan: +10 정부24, +5
교육, +5 기업).

Because rated total (5) < 30, the runner auto-selects the **Sprint 1.5
baseline gate** (threshold ≥ 90%) rather than the Decision Gate 3.0
threshold (≥ 95%). The escalation is data-driven — see ADR-0006 §5.

### Summary

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| Total cases       | 5                                                      |
| Pass              | 5                                                      |
| Fail              | 0                                                      |
| Skip              | 0                                                      |
| Rated denominator | 5 (skips excluded — none here)                         |
| Pass rate         | 100.0%                                                 |
| Wilson 95% CI     | [56.6%, 100.0%]                                        |
| Threshold applied | 90% (Sprint 1.5 baseline — pre-N=30)                   |
| Gate verdict      | **PASS**                                               |

### Per-case detail

| Case                        | Format | Pass A   | Pass B | Combined | Notes                                          |
| --------------------------- | ------ | -------- | ------ | -------- | ---------------------------------------------- |
| synthetic/blank             | hwp    | skip     | pass   | pass     | 0 fields → Pass A skip; bytes 12800 → 12800   |
| synthetic/text-only         | hwp    | skip     | pass   | pass     | 0 fields → Pass A skip; bytes 12800 → 12800   |
| synthetic/table-only        | hwp    | skip     | pass   | pass     | 0 fields → Pass A skip; bytes 13312 → 13312   |
| synthetic/paragraph-style   | hwp    | skip     | pass   | pass     | 0 fields → Pass A skip; bytes 12800 → 12800   |
| synthetic/mixed             | hwp    | skip     | pass   | pass     | 0 fields → Pass A skip; bytes 13312 → 13312   |

All five synthetic cases lack form fields by construction (the
`generate-synthetic-corpus.ts` cases exercise text / table / paragraph
formatting, not form-field creation), so Pass A is uniformly "skip"
across the baseline. Pass B confirms the HWP 5.0 binary write contract
on every case — page count is preserved, the re-import recovers the
document cleanly, and the strict byte-equal compare passes for all five
(which means rhwp 0.7.13's exporter is deterministic on this slice).

## Sprint 3 target — N ≥ 30 mix

The Sprint 3 plan calls for 30 cases mixing `.hwp` and `.hwpx`:

- **+10 정부24** — 신청서 / 증명서 / 동의서 / 위임장 / 이력서 / 사직서 etc.
- **+5 교육** — 생활기록부 / 시험지 / 학생부 / 가정통신문
- **+5 기업** — 회의록 / 보고서 / 제안서 / 견적서 / 계약서
- (10 from the Sprint 1 baseline list also re-merged here per
  `corpus/SOURCES.md` §"Sprint 1 corpus target (N = 10)")

When the corpus reaches 30 rated cases the runner auto-switches to
Decision Gate 3.0 (≥ 95% combined). This document and ADR-0006 will be
revised to record the verdict.

### Empty target table (fill when corpus lands)

| # | Filename | Format | Source | Capture date | Failure mode | Pass A | Pass B | Combined |
|---|----------|--------|--------|--------------|--------------|--------|--------|----------|
| 1 |          |        |        |              |              |        |        |          |
| 2 |          |        |        |              |              |        |        |          |
| … |          |        |        |              |              |        |        |          |
| 30 |         |        |        |              |              |        |        |          |

## Reproduction

```
# regenerate synthetic baseline
npm run corpus:generate

# run the combined gate
npm run gate:binary-identity

# JSON output for CI consumption
cat corpus-report.json
```

The JSON output captures every case with `passA` and `passB` sub-objects,
the combined `status`, `threshold` / `thresholdSource`, and Wilson 95%
bounds. CI artifact upload is wired through `.github/workflows/binary-identity.yml`.

## Known scoping decisions (cross-link to ADR-0006)

- **Pass A skip path** is the dominant path on the current synthetic
  baseline (5/5 skips). Real corpora are expected to mix pass / fail /
  skip rows on Pass A. ADR-0006 §1.
- **Pass B is HWP-5.0-only** — `.hwpx` sources skip Pass B with a typed
  reason. ADR-0006 §3.
- **Skips are excluded from the rate denominator** (rate = pass / rated)
  so field-less and `.hwpx` documents don't unfairly drag the score.
  ADR-0006 §4.
- **Threshold auto-escalates at N = 30** — no manual flag flip.
  ADR-0006 §5.
- **Verdict line for Decision Gate 3.0 is deferred** until the corpus
  reaches N = 30. ADR-0006 §"Verdict".
