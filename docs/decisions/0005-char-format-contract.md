# ADR-0005: Char Format Contract for `hwp_insert_text`

| Field         | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Status        | **Accepted** (Sprint 2.7, 2026-06-03)                       |
| Supersedes    | —                                                           |
| Superseded by | —                                                           |
| Owner         | rhwp-mcp-server maintainers                                 |
| Triggered by  | Sprint 2.5/2.6 authoring use case (가정통신문) — every styled text insertion required a manual second `hwp_apply_action(applyCharFormat)` call. The `style` parameter on `hwp_insert_text` already existed but was documented as accepted-and-ignored. |

## Context

Sprint 2 shipped `hwp_insert_text` with a locked `StyleSchema` (font_size,
bold, italic, underline, color, font_family) but did not wire it to a rhwp
call. The Sprint 2 CHANGELOG entry called this out explicitly:

> The `style` parameter is accepted for forward compatibility but ignored
> in v0.1 — use `hwp_set_paragraph_style` or `hwp_apply_action` with
> `applyCharFormat` for explicit style application.

In real Korean authoring scenarios (school 가정통신문, 안내문, 요약 보고),
every styled paragraph required:

1. `hwp_insert_text(text)`
2. `hwp_apply_action({ name: "applyCharFormat", params: { section_idx, para_idx, start_offset, end_offset, props_json: '{"fontSize":1400,"bold":true,…}' }})`

The second call duplicated the coordinate the first call already implied
(both target the inserted range), forced the caller to compute
`end_offset = text.length` manually, and required the caller to know that
rhwp's `applyCharFormat` expects `fontSize` in HWPUNIT (1/100 pt) rather
than the more obvious points-as-integer.

Sprint 2.7 closes that gap inside the existing `hwp_insert_text` tool —
no new tool, no new shape — by chaining `applyCharFormat` immediately
after `insertText` when `style` is supplied.

## Decision

### Chain `applyCharFormat` after `insertText` inside `executeHwpInsertText`

When the caller supplies a non-empty `style`, the tool calls:

```
applyCharFormat(
  section_idx = 0,
  para_idx    = 0,
  start_offset = 0,
  end_offset   = text.length,
  props_json   = JSON.stringify(mappedProps)
)
```

`mappedProps` translates the user-facing StyleSchema into the rhwp
char-format JSON shape:

| StyleSchema key (input)    | rhwp props_json key | Transform                  |
| -------------------------- | ------------------- | -------------------------- |
| `font_size` (pt, number)   | `fontSize`          | `Math.round(pt * 100)` (HWPUNIT) |
| `bold` (boolean)           | `bold`              | pass-through               |
| `italic` (boolean)         | `italic`            | pass-through               |
| `underline` (boolean)      | `underline`         | pass-through               |
| `color` (`#RRGGBB`)        | `textColor`         | pass-through (string)      |
| `font_family` (string)     | `fontFamily`        | pass-through               |

Fields the caller omits are **omitted from the JSON blob** rather than
sent as `null` or `undefined`. rhwp 0.7.13 inherits the underlying
paragraph's char shape for any key not present, so omission is the
correct "do not change" signal. Verified by
`scripts/probe-char-format.ts` (see
`docs/measurements/rhwp-char-format.md`): every probed combination
returned `{ok:true}` and only the supplied keys took effect.

### When `style` is omitted (or an empty object), do NOT call `applyCharFormat`

If `style` is `undefined` OR every field is `undefined`, the tool skips
the rhwp char-format call entirely. This preserves byte-identical
behavior with v0.1.0 (no second WASM call, no chance of a spurious
`ok:false`). The check is `mapStyleToRhwpProps` returning `null` when
no keys remain after filtering.

### Reuse `wrapPanic("action", …)` and the same parse-then-throw pattern as `insertText`

The `applyCharFormat` call goes through the same `wrapPanic` discipline
as the existing `insertText` call — any rhwp panic surfaces as a typed
`RhwpError{category:"action"}`, and `ok:false` returns surface as
`code: "APPLY_CHAR_FORMAT_FAILED"` with rhwp's message preserved.
Mirrors `set_paragraph_style.ts`'s `APPLY_FORMAT_FAILED` so the error
taxonomy reads consistently to MCP clients.

### Why `end_offset = text.length` is correct for BMP text

`HwpDocument.insertText(0, 0, 0, text)` lands the text at char_offset 0
and advances the cursor to `char_offset = text.length` where length is
measured in JS UTF-16 code units. For the Basic Multilingual Plane —
which covers all of Hangul (가-힣), CJK Unified Ideographs basic+ext-A,
Latin, Hiragana, Katakana, and the punctuation our authoring use cases
need — each character is exactly one UTF-16 code unit, so JS `length`
coincides with the rhwp character count.

**Known limit:** supplementary-plane characters (emoji, CJK ext-B+,
ancient scripts) are encoded as UTF-16 surrogate pairs. JS `length`
counts each surrogate, so `text.length` overshoots the actual character
count by the number of surrogate pairs. The result is that the
char-format range extends past the last logical character and into
whatever follows on the same paragraph. We accept this in v0.1 because
(a) the existing `chars_inserted` field has the same characteristic, so
the two stay consistent, and (b) authoring documents that rely on
supplementary-plane characters are rare in our target corpus. v0.2 may
swap to a code-point count when rhwp exposes a "characters in last
insert" return field.

### Why we did NOT retrofit the same machinery onto `hwp_set_paragraph_style`

`set_paragraph_style.ts` targets `applyParaFormat` — a different rhwp
method addressing paragraph-level layout (alignment, indents, line
spacing). Its `style` shape is a peer of, not a subset of, the
char-format shape. Mixing the two would either:

- Force callers to know which keys go to which rhwp method (the current
  design's strength is that they don't), or
- Require us to split a single style blob across two rhwp calls,
  duplicating the coordinate logic in two places.

A future ADR could introduce a `hwp_apply_style_at_range` that mixes
both, but it would need a clear use case that the existing
two-tools-side-by-side flow cannot satisfy.

### Probe (runtime verification)

`scripts/probe-char-format.ts` calls `applyCharFormat` against a blank
authoring doc seeded with `"abcdef"` and runs four scenarios:

1. `{fontSize: 1200}` — 12pt × 100
2. `{bold: true, textColor: "#1A1A1A"}` — bold + hex color
3. Full set `{fontSize, bold, italic, underline, textColor, fontFamily}`
4. `{}` empty — no-op

All four returned `{"ok":true}` from rhwp/core 0.7.13. Report committed
at `docs/measurements/rhwp-char-format.md`.

## Consequences

### Positive

- Single-call styled insertion: `hwp_insert_text({text, style})` replaces
  the previous two-call workaround. Direct win for 가정통신문, 안내문,
  보고서 표지 — the dominant authoring shapes the user has driven.
- Mapping table lives in one place (`mapStyleToRhwpProps` in
  `src/tools/insert_text.ts`). Future style fields slot in there without
  spreading rhwp key names through callers.
- No surface change: `HwpInsertTextInput` zod shape stays byte-identical
  to v0.1, so the schema-diff guard catches only the description-text
  drift and the snapshot is regenerated alongside this ADR.
- Typed `APPLY_CHAR_FORMAT_FAILED` error keeps the WASM-trap envelope:
  rhwp panics surface with a category + code instead of an opaque
  `RuntimeError`.

### Negative

- `end_offset = text.length` is only correct for BMP text — emoji /
  supplementary-plane characters will see their format range bleed past
  the inserted text. Documented above; not blocking v0.1 corpora.
- The `font_size → fontSize` conversion assumes the pt × 100 convention.
  If rhwp changes the unit for `fontSize` in a future minor (e.g. switch
  to true HWPUNIT 1/7200 inch), the probe will catch it but the mapping
  needs a one-line update.
- `font_family` is passed through as the caller's string. rhwp does not
  validate that the font exists on the rendering machine, so an unknown
  family silently falls back at render time. We rely on the caller (or
  a future `hwp_list_fonts` tool) to pre-validate.

### Neutral

- `set_paragraph_style` retains its single-call paragraph contract.
- `hwp_apply_action(applyCharFormat)` remains available for callers that
  need to format an arbitrary range (not just the just-inserted text)
  or that need to target coordinates other than `(0, 0, 0)`.

## References

- Triggering scenario: 가정통신문 authoring (Sprint 2.5/2.6 실증) — every
  styled insertion required `hwp_insert_text` then a manual
  `hwp_apply_action(applyCharFormat)`.
- Probe: `scripts/probe-char-format.ts` → `docs/measurements/rhwp-char-format.md`.
- Code: `src/tools/insert_text.ts` (`mapStyleToRhwpProps`,
  `applyInsertedRangeCharFormat`, `executeHwpInsertText`).
- Tests: `tests/smoke/insert_text.test.ts` Sprint 2.7 describe block
  (style omitted / font_size only / bold+color / full / invalid hex).
- Schema baseline: `schemas/snapshot.json` regenerated; CHANGELOG
  Unreleased section acknowledges the `hwp_insert_text` description-text
  drift.
- Related ADRs: ADR-0004 (cell-based fill — same authoring family);
  ADR-0002 (binary-identity gate — orthogonal, unaffected).
