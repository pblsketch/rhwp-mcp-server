# Persona — Document Editor (지식 노동자 / 개발자)

> *"가정통신문 매번 만들기 귀찮아요. 학교 양식 없이 빈 종이에서 시작해서
> 제목은 가운데 정렬에 굵게, 본문은 적당한 크기로, 표 하나 넣고 끝내면
> 좋겠어요."*

This walkthrough exercises the Authoring vertical end-to-end on a fresh
blank document, including the Sprint 2.7 char-format chain (font size,
bold, color in one tool call — no manual `hwp_apply_action(applyCharFormat)`
follow-up).

## The document

A single-page 가정통신문 with:

- **Title** — "여름방학 안전 안내", centered, 18pt bold, navy color.
- **Body** — three paragraphs (인사말, 일정, 유의사항), 11pt black, left-aligned.
- **Schedule table** — 3 rows × 2 columns (날짜 / 일정), left-aligned.
- **Signature** — 한국학교 교장 이름, right-aligned.

No template needed.

## End-to-end via Claude Desktop

### 1. Bootstrap a blank doc

```text
User: 빈 문서 열어줘. 가정통신문 만들 거야.
```

Claude calls `hwp_open_blank` (no filesystem touch needed):

```json
{}
```

Returns `{ ok, format: "hwpx", page_count: 1 }`. The session now holds a
fresh document with one empty paragraph at `(section=0, paragraph=0)`.

### 2. Title — centered, 18pt bold, navy (single call after Sprint 2.7)

Set paragraph alignment first:

```json
// hwp_set_paragraph_style
{ "style": { "alignment": "center" } }
```

Then insert the title text with char-level style **in one call** —
Sprint 2.7 wired the previously-ignored `style` parameter to
`applyCharFormat` automatically:

```json
// hwp_insert_text
{
  "text": "여름방학 안전 안내",
  "style": {
    "font_size": 18,
    "bold": true,
    "color": "#1A237E"
  }
}
```

Returns `{ ok: true, chars_inserted: 11 }`.

The mapping (StyleSchema → rhwp char-format) is documented in
[ADR-0005](../decisions/0005-char-format-contract.md):
`font_size` pt → `fontSize` HWPUNIT (pt × 100), `color` `#hex` →
`textColor`, booleans pass through, omitted fields inherit. No follow-up
`hwp_apply_action({name:"applyCharFormat"})` call is required — that was
the manual workaround in Sprint 2.5 / 2.6 that ADR-0005 closes.

### 3. Body paragraphs — multi-paragraph requires `hwp_apply_action`

`hwp_insert_text` hardcodes `(section_idx=0, para_idx=0, char_offset=0)`
(it inserts at the document start). For paragraphs *after* the title,
use `hwp_apply_action` with `insertParagraph` + `insertText`:

```json
// para 1 — opening
{
  "name": "insertParagraph",
  "params": { "section_idx": 0, "para_idx": 1 }
}
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 1, "char_offset": 0,
    "text": "안녕하세요, 학부모님. 여름방학을 맞이하여 다음 사항을 안내드립니다."
  }
}
```

To apply 11pt black body style on this paragraph, chain a
`applyCharFormat` call on the just-inserted range — this is the
escape-hatch path for non-(0,0,0) text that ADR-0005 explicitly left to
`hwp_apply_action`:

```json
{
  "name": "applyCharFormat",
  "params": {
    "section_idx": 0, "para_idx": 1,
    "start_offset": 0, "end_offset": 32,
    "props_json": "{\"fontSize\":1100,\"textColor\":\"#000000\"}"
  }
}
```

Repeat for paragraphs 2 (일정 안내) and 3 (유의사항).

> **Note:** Sprint 2.7's automatic char-format chain only applies to the
> dedicated `hwp_insert_text` tool (which always targets (0,0,0)). When
> you reach for `hwp_apply_action(insertText)` to target arbitrary
> coordinates, you also reach for `hwp_apply_action(applyCharFormat)`
> separately. A future tool could wrap both into a single
> `hwp_insert_text_at(section, para, offset, text, style)` — see
> ADR-0005 §"Consequences for v0.2".

### 4. Schedule table

```text
User: 일정 표 넣어줘. 3행 2열 — 날짜, 일정.
```

```json
// hwp_create_table
{
  "rows": 3,
  "cols": 2,
  "data": [
    ["날짜",           "일정"],
    ["2026-07-22",     "방학 시작"],
    ["2026-08-25",     "개학"]
  ]
}
```

Returns `{ ok: true, rows: 3, cols: 2, cells_filled: 6 }`. The table is
inserted as a new paragraph adjacent to the most recent insertion point.

### 5. Signature — right-aligned

`hwp_set_paragraph_style` always targets `(section=0, paragraph=0)` —
i.e. the title paragraph, which we already styled. For the last
paragraph of the document, fall back to `hwp_apply_action` with
`applyParaFormat`:

```json
{
  "name": "applyParaFormat",
  "params": {
    "section_idx": 0,
    "para_idx": 5,   // adjust to the actual signature paragraph index
    "props_json": "{\"alignment\":\"right\"}"
  }
}
```

```json
// hwp_apply_action with insertText into the signature line
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 5, "char_offset": 0,
    "text": "한국초등학교 교장 김ㅇㅇ"
  }
}
```

### 6. Save

```text
User: ~/Documents/가정통신문-2026-여름방학.hwpx 로 저장해줘.
```

```json
{ "path": "~/Documents/가정통신문-2026-여름방학.hwpx", "format": "hwpx" }
```

Returns `{ ok, path, bytes_written }`.

Open in 한컴오피스: title centered + bold + navy, body left-aligned in
11pt black, table aligned with the body, signature right-aligned with
the school name + 교장.

## Authoring decision tree

```
hwp_open_blank ─→ blank doc in session

  Document start (always (0,0,0)):
    hwp_set_paragraph_style   ← alignment / indent / line spacing
    hwp_insert_text(style?)   ← char shape applied in same call (Sprint 2.7)

  Document body (any other coordinate):
    hwp_apply_action(insertParagraph, …)
    hwp_apply_action(insertText, …)
    hwp_apply_action(applyCharFormat, …)   ← if char style needed
    hwp_apply_action(applyParaFormat, …)   ← if para style needed

  Tables, header/footer, equations, images:
    hwp_create_table        ← document start
    hwp_apply_action(*)     ← any coordinate

  Save:
    hwp_save_as / hwp_save_as_base64
```

## Limits to be aware of

- **`hwp_insert_text` / `hwp_set_paragraph_style` / `hwp_create_table` all
  hard-code (0,0,0)** — the locked v0.1 surface chose convenience for
  the dominant cases over flexibility. Reach for `hwp_apply_action` for
  any other coordinate. Documented in CHANGELOG Sprint 2 §"coordinate-
  defaulting choice".
- **Char format on supplementary-plane characters** — `text.length` in
  JS counts UTF-16 code units, so emoji / CJK Ext-B characters drift
  the `end_offset` by the surrogate-pair count. BMP-only Korean and
  Latin is unaffected. Documented in ADR-0005 §"BMP".
- **Font family is pass-through** — rhwp doesn't validate that the
  named font exists on the rendering machine; an unknown family
  silently falls back at render time. Use the same font names you'd see
  in 한컴오피스 (e.g. `함초롬바탕`, `함초롬돋움`).
- **Page count is not enforced**. Trim or split content yourself if the
  document grows beyond your target.

## Related

- [ADR-0005 — Char format contract](../decisions/0005-char-format-contract.md).
- [Scenario 02 — Meeting notes from scratch](../../scenarios/02-meeting-notes.md).
- [Scenario 03 — One-page status report](../../scenarios/03-one-page-report.md).
