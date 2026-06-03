# Scenario 03 — One-Page Status Report

**Persona:** Authoring (지식 노동자)
**Sprint:** 2 — Authoring vertical (advanced — mixed content)
**Goal:** Prove that Claude can compose a single-page status report that
mixes a centered title, a multi-paragraph body, an aligned KPI table,
and an in-place edit (replace one number) before saving — entirely
through the MCP surface.

## Story

> 최 PM: "팀 위클리 리포트는 매주 금요일 4시까지 한컴 양식으로 제출해야
> 합니다. 한 페이지 안에 이번 주 핵심, 막힌 부분, 다음 주 계획, 그리고
> 지표 표가 들어가요. AI한테 초안 만들어달라고 한 다음, 표에서 숫자 하나만
> 고치고 저장하는 게 가능하면 시간 정말 많이 아낄 수 있어요."

This is the "complex authoring + in-place edit" demo. It exercises the
`replaceAll` and `replaceText` actions in addition to insertion.

## Pre-conditions

- rhwp-mcp-server running in Claude Desktop.
- The user has summarized the week's events in the conversation.
- The user knows one KPI number needs to change after the table is
  generated.

## Walkthrough

### Turn 1 — Bootstrap the document

```json
{ "path": "corpus/synthetic/blank.hwp" }
```

`hwp_open` returns `{ ok: true, format: "hwp", pages: 1 }`.

### Turn 2 — Title (centered)

```json
// hwp_set_paragraph_style
{ "style": { "alignment": "center" } }
// hwp_insert_text
{ "text": "주간 상태 보고 — 26W23" }
```

### Turn 3 — Body sections via apply_action

Claude inserts three body paragraphs at increasing `para_idx` values:

```json
// para 1 — 이번 주 핵심
{
  "name": "insertParagraph",
  "params": { "section_idx": 0, "para_idx": 1 }
}
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 1, "char_offset": 0,
    "text": "■ 이번 주 핵심 — OKR2 진척 +8pt, 캠페인 A/B 1라운드 종료."
  }
}
// para 2 — 막힌 부분
{
  "name": "insertParagraph",
  "params": { "section_idx": 0, "para_idx": 2 }
}
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 2, "char_offset": 0,
    "text": "■ 막힌 부분 — 데이터 파이프라인 SLA 미충족 (P2), 외부 벤더 응답 지연."
  }
}
// para 3 — 다음 주 계획
{
  "name": "insertParagraph",
  "params": { "section_idx": 0, "para_idx": 3 }
}
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 3, "char_offset": 0,
    "text": "■ 다음 주 계획 — 캠페인 B 출시, 데이터 SLA 재협상, OKR3 킥오프."
  }
}
```

### Turn 4 — KPI table

```json
// hwp_create_table
{
  "rows": 4,
  "cols": 3,
  "data": [
    ["지표",     "이번 주", "지난 주"],
    ["MAU",      "12500",   "11800"],
    ["전환율",   "3.2%",    "2.9%"],
    ["NPS",      "42",      "39"]
  ]
}
```

Response: `{ ok: true, rows: 4, cols: 3, cells_filled: 12 }`.

### Turn 5 — Correct one number in place

> User: `MAU 12500이 아니라 12830이야. 고쳐줘.`

Claude does NOT regenerate the table. It calls `hwp_apply_action` with
`replaceAll`:

```json
{
  "name": "replaceAll",
  "params": {
    "query": "12500",
    "new_text": "12830",
    "case_sensitive": false
  }
}
```

The result is a JSON match-count report (count: 1 in this case). The
table cell is now `12830` without any other edits.

### Turn 6 — Save

```json
{ "path": "weekly-26W23.hwpx", "format": "hwpx" }
```

The user opens the file in 한컴오피스 and confirms:

- title is centered and on the first line,
- three bullet paragraphs follow it,
- the KPI table is 4×3 with `12830` in the MAU "이번 주" cell,
- everything fits on one page.

## Acceptance for this scenario

- The mixed sequence (title → body × 3 → table) completes without
  RhwpError.
- `replaceAll` updates exactly the targeted cell (count = 1 in the
  response).
- The output `.hwpx` round-trips through 한컴오피스 with the layout
  intact.
- Total tool calls ≤ 12.

## Limits

- `replaceAll` is body-wide. If the same string appears in multiple
  places (header, footer, footnotes) it will be replaced everywhere.
  Use `hwp_apply_action` with `replaceText` for surgical, coordinate-
  scoped edits.
- The five dedicated Authoring tools all target (0,0,0). Bullet lists
  beyond paragraph 0 require the `insertParagraph` + `insertText`
  apply_action chain shown above.
- Page count is not enforced by the server. Trim or split content
  yourself if the report grows past one page.
