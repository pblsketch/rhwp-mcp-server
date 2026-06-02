# Binary-Identity Save Gate — Measurement v1

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| Measurement ID   | v1                                     |
| Date             | 2026-06-03                             |
| rhwp/core        | 0.7.13                                 |
| Runner           | `scripts/corpus-runner.ts`             |
| Generator        | `scripts/generate-synthetic-corpus.ts` |
| Whitelist        | `corpus/identity-whitelist.json` v1    |
| Gate threshold   | ≥ 90% pass rate                        |
| Gate result      | **PASS**                               |

## Summary

| Metric          | Value                          |
| --------------- | ------------------------------ |
| Total cases     | 5                              |
| Pass            | 5                              |
| Fail            | 0                              |
| Skip            | 0                              |
| Pass rate       | **100.0%**                     |
| Wilson 95% CI   | [56.6%, 100.0%]                |
| Strict byte-equal | 5 / 5 (bonus signal)         |

## Corpus

All five cases come from `scripts/generate-synthetic-corpus.ts`. None of
the cases in `corpus/forms/` or `corpus/private/` were available at the
time of this measurement.

| Case ID                       | Description                                          | Bytes (in / out) |
| ----------------------------- | ---------------------------------------------------- | ---------------- |
| `synthetic/blank`             | Bundled blank template, no edits                     | 12 800 / 12 800  |
| `synthetic/text-only`         | Single Korean paragraph inserted at document start   | 12 800 / 12 800  |
| `synthetic/table-only`        | 2 × 2 table at document start, no text               | 13 312 / 13 312  |
| `synthetic/paragraph-style`   | Center alignment on the first paragraph              | 12 800 / 12 800  |
| `synthetic/mixed`             | Text + 2 × 2 table + center alignment in one document | 13 312 / 13 312  |

### Per-case verify reports

| Case ID                       | recovered | pages before | pages after | strict byte-equal |
| ----------------------------- | --------- | ------------ | ----------- | ----------------- |
| `synthetic/blank`             | true      | 1            | 1           | **true**          |
| `synthetic/text-only`         | true      | 1            | 1           | **true**          |
| `synthetic/table-only`        | true      | 1            | 1           | **true**          |
| `synthetic/paragraph-style`   | true      | 1            | 1           | **true**          |
| `synthetic/mixed`             | true      | 1            | 1           | **true**          |

## Observations

1. **rhwp 0.7.13 emits a deterministic byte stream for synthetic
   inputs.** No DocInfo timestamp drift, no UUID regeneration was
   observable on the 5 cases. The identity-whitelist v1 documents the
   *possibility* of such diffs (per upstream notes) but the
   measurement could not exhibit one.
2. **Strict byte-equal is a bonus signal, not the contract.** The gate
   passes on `exportHwpVerify(recovered=true)` + page-count parity. The
   strict byte-equal observation is recorded so a future regression
   (e.g. rhwp 0.8 introducing timestamps) shows up as a measurable
   downgrade.
3. **Wilson lower bound at 56.6% on N=5 is wide.** This is structurally
   unavoidable for a small corpus. Real-world cases (`corpus/forms/`,
   `corpus/private/`) tighten the bound automatically — the runner
   re-computes Wilson 95% on every invocation.

## Reproduction

```sh
# from a fresh checkout
npm ci
npm run build              # tsc strict NodeNext
npm run corpus:generate    # regenerate corpus/synthetic/*.hwp
npm run gate:binary-identity
```

Expected exit code: `0`. Expected stdout (final line):

```
  Gate  : PASS (threshold ≥90%)
```

The full per-case JSON is dumped to `corpus-report.json` in the repo
root. Inspect `results[].verifyBefore`, `results[].verifyAfter`,
`results[].strictByteEqual`, and `results[].whitelistMatched` for each
case.

## Open items for v2 measurement

- Add ≥ 5 real public-domain `.hwp` files to `corpus/forms/` with
  `SOURCES.md` entries. Targets: 정부24 forms, school templates.
- Re-run the gate; expect a tighter Wilson interval. Document the
  pass rate at v2 and compare to v1 baseline.
- If `strictByteEqual` drops below 100% on real corpora, file an
  upstream issue with the offending stream identified by per-OLE2 diff
  (v0.2 deliverable from ADR-0002).
