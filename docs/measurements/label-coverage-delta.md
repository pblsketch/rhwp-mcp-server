# Label coverage delta (data-independent surrogate metric)

Relative cell-label coverage of the additive cell-discovery heuristics (upper neighbor + multi-row header) versus the original two-step baseline (left neighbor → header row 0), measured over synthetic table shapes. This is a **regression-defence + directionality** signal, NOT an absolute accuracy claim — absolute accuracy is gated to the real N=30 form corpus in a later phase.

- Generated: `2026-06-03T17:01:05.190Z`

## Acceptance rules

- (a) changed labels == 0 → **PASS** (observed 0). No baseline label value was rewritten.
- (b) none→label transitions ≥ 0 → **PASS** (observed 3). Directional improvement is non-negative.
- (c) this artifact exists → **PASS**.

## Totals

- Blank cells examined: 30
- Baseline labelled: 19 (63.3%)
- Current labelled: 22 (73.3%)
- None→Label transitions: 3
- Coverage delta: 10.0%

## Per-shape breakdown

| Shape | Blank cells | Baseline labelled | Current labelled | None→Label | Changed |
| --- | ---: | ---: | ---: | ---: | ---: |
| table-label-value | 6 | 6 | 6 | 0 | 0 |
| table-colon-label | 4 | 4 | 4 | 0 | 0 |
| table-multirow-header | 4 | 4 | 4 | 0 | 0 |
| table-stacked-label | 3 | 0 | 2 | 2 | 0 |
| table-sparse-merge | 13 | 5 | 6 | 1 | 0 |
