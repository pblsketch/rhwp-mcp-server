# ADR-0006: Decision Gate 3.0 — Pass A + Pass B Combined Corpus Gate

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Status        | **Accepted (decision structure)** (Sprint 3, 2026-06-03)             |
| Verdict       | **Deferred** — pending N=30 real-corpus delivery (see "Verdict" §)   |
| Supersedes    | —                                                                    |
| Superseded by | —                                                                    |
| Owner         | rhwp-mcp-server maintainers                                          |
| Builds on     | ADR-0002 (Binary-Identity Save Gate — Pass B baseline, Sprint 1.5)   |
| Triggered by  | Sprint 3 plan: extend corpus N=5 (synthetic only) → N=30 (real forms) with a combined Pass A + Pass B verdict; Sprint 1.5 ran Pass B only. |

## Context

Sprint 1.5 shipped a single-pass corpus gate (`scripts/corpus-runner.ts`)
exercising **Pass B — binary identity** on every `.hwp` file under
`corpus/synthetic/`, `corpus/forms/`, and `corpus/private/`. The gate
threshold was a single constant **≥ 90%** and the synthetic baseline
(N = 5) recorded 5/5 PASS at 100% (Wilson 95% [56.6%, 100%]).

Two follow-on gaps remained:

1. **Pass A (field round-trip) was documented in the runner's header but
   never implemented.** The Sprint 1 form-filling vertical (`hwp_list_fields`
   + `hwp_fill_fields`) ships every release without an automated round-trip
   gate beyond per-tool smoke tests. A document whose form-field shape rhwp
   could *read* but not preserve through `open → fill → export → reopen`
   would silently regress and the existing gate would not catch it.
2. **A single ≥ 90% threshold conflates the Sprint 1.5 baseline (small N,
   high uncertainty) with the Sprint 3 acceptance bar (large N, narrow CI).**
   With N = 5, even 4/5 = 80% has a Wilson 95% upper bound > 95%, so the
   threshold gives almost no signal. With N = 30 and a real corpus, the
   threshold should escalate to ≥ 95% to actually distinguish a healthy
   release from a regressed one.

Sprint 3 closes both gaps inside the existing `scripts/corpus-runner.ts`
binary by adding Pass A, combining the two passes per case, and
parameterizing the gate threshold by rated corpus size.

## Decision

### 1. Implement Pass A — field round-trip — as a peer of Pass B

For each corpus file:

```
Pass A:
  1. open(bytes) → doc
  2. fields = doc.getFieldList()        // JSON array of {name, fieldType, value, …}
  3. if fields.length == 0  → status = SKIP, reason = "no fields"
  4. for i, f in fields:
       doc.setFieldValueByName(f.name, `value-${i+1}`)   // deterministic synthetic
  5. bytes2 = (sourceFormat == "hwpx") ? doc.exportHwpx() : doc.exportHwp()
  6. doc2 = new HwpDocument(bytes2)
  7. fields2 = doc2.getFieldList()
  8. assert |fields2| == |fields|
  9. assert {f.name for f in fields} == {f.name for f in fields2}     // names preserved
  10. for f in fields:
        v = doc2.getFieldValueByName(f.name)
        assert v.value == `value-${i+1}`                              // values round-trip
  → status = PASS
```

**Why deterministic synthetic values?** A fixed `value-N` pattern ordered by
the `getFieldList()` result keeps Pass A reproducible across runs and across
machines. Re-running the gate produces an identical `corpus-report.json` so
diffs are caused only by actual behavior changes, not by test-data
randomness.

**Why skip (not fail) on zero fields?** Pass A measures *round-trip
integrity*, not a requirement that every corpus document carry form fields.
The synthetic baseline (blank / text-only / table-only / paragraph-style /
mixed) contains zero `누름틀` controls by construction, and the real
corpus will mix field-bearing forms with field-less template-style
documents. Conflating "nothing to test" with "test failed" would
artificially drag the pass rate down.

### 2. Combine Pass A + Pass B into a single per-case verdict

For each case the combined status is:

| Pass A   | Pass B   | Combined | Note                                                       |
| -------- | -------- | -------- | ---------------------------------------------------------- |
| pass     | pass     | pass     | full signal — both contracts satisfied                     |
| pass     | skip     | pass     | typical for `.hwpx` with form fields (Pass B is HWP-only)  |
| skip     | pass     | pass     | typical for field-less HWP (synthetic baseline today)      |
| skip     | skip     | skip     | no testable signal — `.hwpx` with no fields                |
| fail     | any      | fail     | combined reason = Pass A's failReason                      |
| any      | fail     | fail     | combined reason = Pass B's failReason                      |

**Why `pass` requires at least one explicit pass and no fails?** Two
skips on the same case give the gate zero signal, so reporting them as
pass would inflate the rate. They are recorded but excluded from the
denominator (see §4).

### 3. Reserve Pass B for HWP 5.0 sources; skip `.hwpx` sources for Pass B only

Pass B's contract per ADR-0002 is specifically about HWP 5.0 binary
serialization stability via `exportHwp()` → `exportHwpVerify`. Running
Pass B on `.hwpx` sources would either (a) silently transform the source
format (HWPX → HWP 5.0 binary on round-trip) or (b) require a parallel
HWPX-only verify path that doesn't exist in rhwp 0.7.13. We choose
**explicit skip with reason** instead.

Pass A is format-agnostic — it preserves source format on re-export
(`.hwpx` → `exportHwpx()`, `.hwp` → `exportHwp()`) so the round-trip
stays in-format end-to-end.

This split keeps the existing Sprint 1.5 Pass B contract intact while
giving `.hwpx` sources their own measurement under Pass A.

### 4. Rate denominator excludes skips

`passRate = pass / (pass + fail)` (rated denominator), **not**
`pass / total`. Skipped cases are reported in the summary but excluded
from the rate calculation because they carry no signal in either
direction. Wilson 95% is computed against the rated denominator too.

**Why this changes from Sprint 1.5?** The Sprint 1.5 runner used
`pass / total` because the synthetic corpus had no skips — both formulas
gave the same number. With Pass A's skip path enabled, real corpus will
mix field-bearing and field-less documents, and including skips in the
denominator would punish documents that simply have no fields to test.
The new denominator is the principled fix.

### 5. Threshold escalates with rated corpus size

| Rated total | Threshold | Gate label                                                  |
| ----------- | --------- | ----------------------------------------------------------- |
| 0           | N/A       | "Corpus gate" (empty — exit 0 with NOTE)                    |
| 1 — 29      | ≥ 90%     | "Binary-Identity Save Gate (Sprint 1.5 baseline — pre-N=30)" |
| ≥ 30        | ≥ 95%     | "Sprint 3 Decision Gate 3.0 (Pass A + Pass B combined)"     |

The escalation point N = 30 is the Sprint 3 plan's target corpus size.
Below that, the gate keeps the Sprint 1.5 baseline so a smaller curated
corpus during pre-release iteration doesn't trip the stricter 95% bar
and falsely block a release.

Once the corpus reaches N ≥ 30 (real `.hwp` + `.hwpx` mix per
`corpus/SOURCES.md` Sprint 3 plan), the runner auto-switches to the
Decision Gate 3.0 label and threshold. No manual flag flip; the
threshold change is purely data-driven so a regression that drops the
corpus below 30 (e.g. a delete or move) ALSO drops the gate back to the
baseline label, surfacing the corpus state in stdout.

### 6. Per-case stdout shows both passes' status

```
[PASS] synthetic/blank.hwp (A=skip, B=pass)  (pages 1, bytes 12800→12800)
[PASS] forms/govt24-resume.hwp (A=pass, B=pass)
[FAIL] forms/edu-grades.hwpx (A=fail, B=skip) — Pass A: value drift on field '이름' …
[SKIP] forms/edu-blank.hwpx (A=skip, B=skip) — both passes skipped …
```

Combined status is the top-level signal; the `(A=…, B=…)` parenthetical
reveals which contract carried the case (or which one broke it). The
existing `[PASS]` style and verify-report tail are preserved for
backward compatibility with humans who already read this output.

### 7. Verdict deferred — Sprint 3 Decision Gate 3.0 PASS requires N ≥ 30

This ADR records the **decision structure** for Sprint 3. The verdict
itself — "Decision Gate 3.0 PASSED at X/30 = Y%" — requires the user's
corpus collection (Sprint 3 plan: +10 정부24 신청서/증명서/동의서/위임장,
+5 교육 생활기록부/시험지/학생부, +5 기업 회의록/보고서/제안서).

Until then:

- Current synthetic baseline (N = 5, all field-less) ⇒ Sprint 1.5
  baseline label, ≥ 90% threshold, **5/5 PASS at 100%**. Unchanged
  Sprint 1.5 contract preserved.
- When the corpus reaches N ≥ 30 with the gate combined rate ≥ 95%,
  this ADR will be updated with the verdict line and the measurement
  link.

## Consequences

### Positive

- Pass A catches a regression class that Pass B alone cannot: a release
  that breaks `getFieldList` / `setFieldValueByName` round-trip would
  fail Pass A even if Pass B's binary serialization stays clean.
- The combined gate gives field-bearing forms a richer signal (both
  contracts must hold) without penalizing field-less or `.hwpx`-format
  documents.
- The auto-escalating threshold lets the Sprint 1.5 baseline keep
  working at small N while Sprint 3 corpus growth automatically unlocks
  the stricter Decision Gate 3.0 bar — no manual flag, no two-runner
  code paths.
- Skip-exclusion in the denominator removes a known fairness issue that
  would have made `.hwpx` and field-less docs unfairly weigh against
  the rate.
- The pure pass / combine / threshold-selection functions are exported
  from `scripts/corpus-runner.ts` so tests can lock the logic without
  spinning up a subprocess.

### Negative

- Pass A on real corpora will surface field-shape rhwp quirks (merged
  cells, click-here-fields with restricted character sets, computed
  fields). The first Sprint 3 corpus run is expected to produce non-zero
  fail rows that the runner *must* surface as `failReason` rather than
  panic — fixing each row may be a small per-form ADR addition or a
  rhwp upstream report.
- The synthetic baseline never exercises Pass A's pass path (no fields
  to round-trip). Until real forms land, Pass A is tested only on the
  skip path. The `tests/integration/corpus-passes.test.ts` suite locks
  the skip path + the pure combine/threshold-selection logic; the
  pass-path coverage comes from real corpus integration runs.
- The runner's exported surface (`runPassA`, `runPassB`, `combine`,
  `selectThreshold`) is a thin API. If future Sprint 4+ work wants to
  reach in for finer-grained orchestration (per-form retry, parallel
  worker pool), the API may need to widen.

### Neutral

- The `.hwpx` discovery widening (extension filter from `.hwp` to
  `.hwp` + `.hwpx`) takes effect immediately, but `corpus/synthetic/`
  contains only `.hwp` today. Discovery sees zero `.hwpx` files until a
  real-corpus drop populates `corpus/forms/` or `corpus/private/`.
- `identity-whitelist.json` and ADR-0002's Pass B semantics are
  unchanged. Pass B's bytewise compare policy remains "successful
  re-open of our export counts as a whitelist match"; per-stream byte
  diffing is still v0.2 future work.

## Verdict (placeholder — fill on N ≥ 30 delivery)

- **Date:**
- **Corpus snapshot SHA (or list):**
- **N (rated):**
- **Pass A pass rate:**
- **Pass B pass rate:**
- **Combined pass rate:**
- **Wilson 95% CI on combined:**
- **Decision Gate 3.0:** PASS / FAIL
- **`docs/measurements/sprint-3-corpus-results.md` revision link:**

## References

- Triggering plan: Sprint 3 expansion of N=10 (Sprint 1 baseline) → N=30,
  see `corpus/SOURCES.md` §"Sprint 3 expansion to N = 30".
- Code: `scripts/corpus-runner.ts` (`runPassA`, `runPassB`, `combine`,
  `selectThreshold`, exported alongside the runtime entry point).
- Tests: `tests/integration/corpus-passes.test.ts` — Pass A skip path +
  combine/threshold-selection pure logic.
- Baseline measurement: `docs/measurements/sprint-3-corpus-results.md`.
- Related ADRs: ADR-0002 (Sprint 1.5 binary-identity baseline — Pass B
  contract); ADR-0004 (cell-based fill, complementary to field-based
  fill that Pass A round-trips).
