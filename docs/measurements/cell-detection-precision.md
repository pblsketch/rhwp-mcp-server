# Cell-detection precision — `classifyCell` over-detection reduction

**What this measures.** The number of table blanks the cell-detection path
classifies as `fillable` (a real human-input slot) before vs. after the
`classifyCell` precision pass. **This is a precision signal — fewer
false-positive fill targets — NOT a label-answer-correctness claim.** Whether
each surviving `fillable` cell's `suggested_label` is the *right* label still
requires human confirmation; that is a separate axis the surrogate
label-coverage metric and a future N=30 rated corpus address.

**How.** `scripts/measure-cell-detection.ts` walks every table in every form
under `corpus/private` + `corpus/forms`, counts blanks, and runs `classifyCell`
on each. It never mutates a document and never prints cell contents, so it is
safe over private forms containing personal data — only per-file counts are
reported here (file contents are PII and are NOT reproduced).

Run: `npx tsx scripts/measure-cell-detection.ts` (bundled WASM engine; no host
office runtime is instantiated, so the run does not hang).

## The over-detection problem

`inferCellLabel` (frozen, unchanged) nearly always resolves *some* label via
its distant fallbacks (header row, multi-row stacked header). The original
`classifyCell` marked a blank `fillable` whenever any label existed, so it
labelled almost every blank as a fill target. On the real corpus this was
**351 of 354 blanks (99%)** — clearly over-detecting on spreadsheet-style grids
where most empty cells are spacers, not inputs.

## The precision rule (after)

A blank is `fillable` only with **strong evidence**: an *immediate* label-like
neighbor (a short, non-empty cell directly to its left or directly above — the
value half of a 라벨→빈칸 pair). Excluded: isolated spacer blanks, blanks whose
only label comes from a weak/distant fallback (far header row, multi-row
header), and blanks beside a long-text (content, not label) neighbor.

## Before → after (`fillable` counts, real corpus)

| file (bucket/private)   | blanks | fillable BEFORE | fillable AFTER | Δ    |
|-------------------------|-------:|----------------:|---------------:|-----:|
| eval-report.hwp         |    111 |             111 |             75 |  −36 |
| event-apply.hwp         |      0 |               0 |              0 |    0 |
| fieldtrip-notice.hwpx   |      3 |               3 |              3 |    0 |
| mentor-apply.hwp        |      6 |               5 |              3 |   −2 |
| resume-shared.hwp       |     31 |              30 |             22 |   −8 |
| resume-synthetic.hwp    |      6 |               5 |              5 |    0 |
| survey-data.hwpx        |    197 |             197 |            110 |  −87 |
| **TOTAL**               |**354** |         **351** |        **218** |**−133** |

Over-detected `fillable` cells dropped from **351 → 218** (−133, ≈ 38% fewer
false-positive fill targets). The largest reduction is on `survey-data.hwpx`
(197 → 110), the spreadsheet-grid form that drove the over-detection observation
— its many spacer/sub-header empty cells are now `structural`.

**No regression on the normal case.** `resume-synthetic.hwp` (a canonical
이력서 with clean 라벨|값 pairs) stays **5 → 5**; `fieldtrip-notice.hwpx` stays
**3 → 3**. The obvious label→blank pairs that resume/application forms depend on
are all retained.

## Honesty / limits

- This is **precision (false-positive reduction)**, not recall and not label
  accuracy. A surviving `structural` cell *could* in principle be a real input
  a strict-immediate-label rule misses; the trade is intentional (precision over
  recall) because an AI writing into spacer cells is the costly failure mode.
- Counts are over the current `corpus/private` set (N = 7 files). They are a
  directional signal, not a rated accuracy figure. The rated N=30 corpus gate
  (Decision Gate 3.0) is a separate, later milestone.
- `event-apply.hwp` has no tables (0 blanks) and is unaffected. The two `.hwpx`
  files report fewer blanks because their grids are sparser.
