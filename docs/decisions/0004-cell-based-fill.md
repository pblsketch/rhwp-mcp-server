# ADR-0004: Cell-based Form Fill as a Peer of Field-based Form Fill

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Status            | **Accepted** (Sprint 2.6, 2026-06-03)                |
| Supersedes        | —                                                    |
| Superseded by     | —                                                    |
| Owner             | rhwp-mcp-server maintainers                          |
| Triggered by      | User-reported scenario: real Korean school résumé form had no 누름틀, hwp_list_fields returned `[]` |

## Context

The Sprint 1 form-filling vertical (`hwp_list_fields` / `hwp_fill_fields`)
only sees **누름틀 (form-field) controls** — the dedicated HWP control type
that the original Hancom Office form designer creates. That works for
templates explicitly designed for fill-in workflows.

But the dominant pattern in **real Korean school and government HWP
corpora** is different: blanks are **empty table cells**, not 누름틀
controls. Resumes, gradesheets, application forms, 가정통신문 — the
overwhelming majority lay out labels in one column and leave empty
neighbouring cells for the responder to write into. The user surfaced
this directly:

> "이 양식에는 누름틀(양식 필드)이 전혀 없고 표 칸만 있습니다(컨트롤이 전부 tbl뿐).
> hwp_fill_fields로는 채울 대상 자체가 없습니다."

`hwp_list_fields` correctly returned `[]` on this document — there are
no fields to list — and `hwp_fill_fields` therefore had nothing to do.
A separate cell-based contract is needed.

## Decision

### Ship three Sprint 2.6 tools as a peer of the field-based pair

| Tool                          | Role                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `hwp_locate_blanks`           | Peer of `hwp_list_fields`. Walks every table, reports cells whose text is empty after trim, suggests a label via inferCellLabel. |
| `hwp_fill_cells`              | Peer of `hwp_fill_fields`. Fills cells by `'row,col'` coordinate OR by label. Unresolvable keys land in `skipped` with a typed reason. |
| `hwp_open_base64_validated`   | Hardens `hwp_open_base64` with explicit length + CRC32 checks so wire corruption fails fast as a typed parse error instead of a WASM panic. |

The first two complete the cell-based workflow; the third addresses the
**other** half of the same user-reported scenario — a 35 KB document
silently corrupted on base64 wire transit, triggering a WASM panic deep
inside rhwp. Length + CRC32 checks reject the bad payload before it
reaches the parser, so callers see `parse/BAD_LENGTH` or
`parse/BAD_CHECKSUM` with actual-vs-expected values instead of an opaque
`WASM_TRAP`.

### Why NOT deprecate `hwp_fill_fields` / `hwp_list_fields`

누름틀 controls still ship in many older templates and offer richer
semantics than bare cells:

- typed field metadata (date, number, choice) we can't infer from a cell,
- click-to-edit UX that 한컴오피스 renders specially,
- distinguished `current_value` so unchanged fields are visible at a
  glance in `hwp_list_fields` output.

A purely cell-based product would lose those affordances on the
templates that have them. The two contracts are peers, not a successor
pair, and the catalog documents both clearly. Spec lock policy from
plan §3 stays intact: only **additions** to the surface, no shape
changes.

### Label inference algorithm

Implemented in `src/rhwp/tables.ts:inferCellLabel`:

```
1. left neighbor (row, col-1) — preferred. Dominant Korean form pattern
   is `[label cell] [blank cell]` left-to-right.
2. header row (row 0, same col) — fallback. Used by column-oriented
   forms ("이름 | 부서 | 연락처" in row 0).
3. null — caller falls back to coordinate-only addressing.
```

Whitespace is normalized (`/\s+/ → ' '`); trailing punctuation is
preserved verbatim because Korean labels frequently end with `:` or
include parenthetical hints (`연락처(휴대폰)`).

### Table enumeration strategy

Implemented in `findAllTables`:
- Walk every (sec, para) by iterating `getSectionCount` → `getParagraphCount`.
- Probe `getTableDimensions(sec, para, 0)`. Tables created via the
  Sprint 2 `createTable` helper sit at `control_idx=0` in their own
  paragraph (verified empirically), so this catches the common case
  cleanly.
- Failures throw via wrapPanic; we catch and continue.

### Known limits (documented for v0.1.6)

1. **Tables at `control_idx > 0`** — multi-control paragraphs (e.g.
   table immediately followed by an image in the same paragraph) may
   underreport. Workaround: use `hwp_apply_action` with
   `getControlTextPositions` to enumerate and pass coordinates directly
   to `insertTextInCell`.
2. **Merged cells** — `cellIndex(row, col) = row * col_count + col`
   assumes a regular grid. Merged cells alias to one canonical
   `cell_idx`; writes to the other coordinates silently target the
   canonical cell.
3. **Cells in header/footer** — `findAllTables` only walks body
   sections. Header/footer tables need `getHeaderFooter` + a separate
   walk, deferred to v0.2.
4. **Cells in nested tables** — current depth-1 only. A table inside
   another table is not enumerated.

These map directly to the limits the user is most likely to hit on real
forms; we name them in `hwp_locate_blanks`' description so the LLM
surfaces the workaround.

### Why CRC32 (and not SHA-256 or MD5)?

Three reasons:

1. **Wire-corruption detection** is the goal, not adversarial integrity.
   CRC32 catches single-bit flips and run errors at very low cost — the
   exact failure mode the user observed.
2. **Node 20+ ships `zlib.crc32`** built-in — no new dependency, no
   bundled implementation to keep in sync.
3. **Wire-size cost is zero.** A 4-byte integer transits with negligible
   overhead vs. the base64 payload it guards.

If a use case ever needs cryptographic integrity (signed documents,
tampering detection), that's a v0.2 candidate — separate code, separate
tool, separate ADR.

## Consequences

### Positive

- Real Korean school / 관공서 forms (the dominant template style) are
  now fillable through MCP.
- `hwp_open_base64_validated` gives Claude Web/Mobile a clean failure
  path on transit corruption — the user gets a typed error to act on
  instead of a WASM panic to puzzle over.
- Tool count grows 13 → 16, all additions; 13 existing shapes stay locked
  (verified by `schema-diff` regenerated against the shared
  `_shared/schemas.ts`).
- DRY fix folded in: `schema-snapshot` and `schema-diff` now share one
  tool-list source, removing the Sprint 2.5 architect-noted nit.

### Negative

- The label-inference heuristic is approximate. Adversarial layouts
  (label spans two cells, label is a header image, etc.) will produce
  `null` labels. The fallback to coordinate-only addressing is a
  graceful degradation, not a silent failure.
- Tool count creeping toward the 15-tool soft cap LLM clients tolerate
  before surface fatigue. Sprint 3 may consolidate
  `hwp_open_base64` + `hwp_open_base64_validated` into a single tool
  with optional integrity fields.

### Neutral

- ADR-0001 (image renderer) remains independent — Sprint 3 owns that.
- ADR-0002 (binary-save fallback) remains independent — Pass B applies
  to `hwp_save_as` and `hwp_save_as_base64` already; cell-fill changes
  don't affect the gate.
- ADR-0003 (base64 dual contract) extended: the validated variant lives
  alongside the unchecked one, callers pick based on payload size and
  transit trust.

## References

- Triggering scenario: user resume form (cell-based blanks, base64 wire
  corruption on a 35 KB payload).
- Spec lock policy: `.omc/plans/plan-rhwp-mcp-mvp.md` §Principle 3.
- Tools: `src/tools/{locate_blanks,fill_cells,open_base64_validated}.ts`.
- Shared helpers: `src/rhwp/tables.ts`.
- Snapshot: `schemas/snapshot.json` (regenerated via `npm run schema:snapshot`).
- DRY fix: `scripts/_shared/schemas.ts`.
- Tests: `tests/smoke/{locate_blanks,fill_cells,open_base64_validated}.test.ts`.
