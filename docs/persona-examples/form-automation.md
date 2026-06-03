# Persona — Form Filler (공공기관 · HR · 총무 자동화)

> *"35칸짜리 학교 이력서 양식 받았는데 매번 손으로 채워요. AI한테 정보만
> 던지면 알아서 채워주면 좋겠어요."*

This walkthrough mirrors the real Sprint 2.6 / 2.6.1 use case that drove
the cell-based fill family: a Korean 학교 이력서 양식 with **no 누름틀
controls** — every blank is a table cell.

## The form

- 35 fillable cells across one page.
- Three merged-cell regions (header band, photo cell, signature row).
- Built in 한컴오피스 by the school's 행정실. Saved as `.hwp` 5.0.
- Originally distributed by email as a base64 string (~ 35 KB).

`hwp_list_fields` on this template returns `[]` — the school never used
`누름틀`, so the field-based vertical can't see anything to fill. The
cell-based vertical (`hwp_locate_blanks` + `hwp_fill_cells`) handles it
directly.

## End-to-end via Claude Desktop

### 1. Open the form

If the file is on disk:

```text
User: ~/Downloads/school-resume.hwp 열어줘.
```

Claude calls `hwp_open`:

```json
{ "path": "~/Downloads/school-resume.hwp" }
```

Returns `{ ok, format: "hwp", page_count: 1 }`.

If the form arrived as base64 (e.g. via Claude Web/Mobile that has no
filesystem access), use `hwp_open_base64_validated` instead — see
[`compat.md`](./compat.md).

### 2. Locate the blanks + suggested labels

```text
User: 빈 칸 목록 보여줘. 라벨도 같이.
```

Claude calls `hwp_locate_blanks` (no parameters needed — it walks every
body table):

```json
{}
```

Returns something like:

```json
{
  "blanks": [
    { "table_idx": 0, "row": 1, "col": 1, "suggested_label": "성명",
      "current_text": "",
      "coords": { "section_idx": 0, "parent_para_idx": 5, "control_idx": 0, "cell_idx": 3 } },
    { "table_idx": 0, "row": 1, "col": 3, "suggested_label": "생년월일",
      "current_text": "",
      "coords": { "section_idx": 0, "parent_para_idx": 5, "control_idx": 0, "cell_idx": 5 } },
    { "table_idx": 0, "row": 2, "col": 1, "suggested_label": "연락처(휴대폰)",
      "current_text": "",
      "coords": { "section_idx": 0, "parent_para_idx": 5, "control_idx": 0, "cell_idx": 9 } },
    "..."
  ],
  "total": 35,
  "table_count": 1
}
```

The labels come from the
`inferCellLabel(left-neighbor → header-row → null)` heuristic
documented in [ADR-0004](../decisions/0004-cell-based-fill.md). For
this form the left-neighbor rule resolves > 90% of blanks; the merged
header band falls back to the header-row rule.

### 3. Fill by label (preferred) or coordinate

```text
User: 다음 정보로 채워줘 — 성명: 박준일, 생년월일: 1992-04-15,
연락처(휴대폰): 010-1234-5678, 주소: 서울시 광진구 ...
```

Claude calls `hwp_fill_cells` with a label-keyed map:

```json
{
  "map": {
    "성명":              "박준일",
    "생년월일":          "1992-04-15",
    "연락처(휴대폰)":     "010-1234-5678",
    "주소":              "서울시 광진구 ...",
    "이메일":            "박준일@example.com",
    "최종학력":          "서울대학교 컴퓨터공학과 학사",
    "..."
  }
}
```

Returns:

```json
{
  "ok": true,
  "filled": ["성명", "생년월일", "연락처(휴대폰)", "주소", "이메일", "최종학력", "..."],
  "skipped": [
    { "key": "사진", "reason": "out_of_range", "detail": "cellIndex 6 ≥ cell_count 4" }
  ]
}
```

The `out_of_range` skip is the merged photo cell — `inferCellLabel`
returned a candidate label but the canonical `cell_idx` for the merged
region is already occupied by other coordinates. Sprint 2.6.1 added the
`cell_count` guard so the rest of the map still completes instead of
aborting on the first merged cell. Documented in
[ADR-0004 §"Known limits"](../decisions/0004-cell-based-fill.md).

### 4. Cells without labels — fall back to coordinates

Some cells lack a label (decorative blanks, signature row). Use
`'row,col'` keys from the `hwp_locate_blanks` output:

```json
{
  "map": {
    "8,2": "2026-06-03",
    "8,4": "박준일 (서명)"
  }
}
```

`row,col` is 0-based and counted within the table at `table_idx`. The
`table_idx` is implicit: in v0.1 `hwp_fill_cells` targets `table_idx=0`.
For documents with multiple body tables, partition the calls by table.

### 5. Save

```text
User: ~/Documents/resume-filled.hwpx 로 저장해줘.
```

Claude calls `hwp_save_as`:

```json
{ "path": "~/Documents/resume-filled.hwpx", "format": "hwpx" }
```

Returns `{ ok, path, bytes_written }`.

Open the file in 한컴오피스: all the labeled cells carry their values,
the merged photo cell is still empty (expected), the layout is intact.

## When to use `hwp_list_fields` / `hwp_fill_fields` instead

Older 정부24 templates and 한컴오피스-designed forms often use **누름틀
controls**. For those:

```json
// hwp_list_fields
{}
// → { fields: [{ name: "이름", type: "text", current_value: null }, …] }

// hwp_fill_fields
{ "map": { "이름": "박준일", "연락처": "010-..." } }
// → { ok, filled: ["이름", "연락처"], skipped: [] }
```

Field-based fill gives richer metadata (typed fields, click-to-edit UX
preserved) when the template has 누름틀. Cell-based fill gives a
catch-all for forms that don't. They're peers, not a successor pair —
ADR-0004 spells out the boundary.

## Quick decision tree

```
hwp_open → hwp_list_fields
                        │
                        ├─ returns ≥ 1 field   → hwp_fill_fields
                        │
                        └─ returns []          → hwp_locate_blanks
                                                       │
                                                       └─ hwp_fill_cells
```

## Limits to be aware of

- **Merged cells** alias to one canonical `cell_idx`. Writes to other
  coordinates surface as `skipped[{reason:"out_of_range"}]`.
- **Header / footer table blanks** aren't reached by `hwp_locate_blanks`
  in v0.1 — the walker only iterates body sections.
- **Nested tables** (table inside a table cell) — only depth-1 tables
  are enumerated; nested cells are invisible to the locator.
- **Label inference** is heuristic. Adversarial layouts (multi-cell
  label spans, image labels) return `suggested_label: null` and you
  fall back to `'row,col'` coordinates.

## Related

- [ADR-0004 — Cell-based fill](../decisions/0004-cell-based-fill.md).
- [Scenario 01 — Field-based resume fill](../../scenarios/01-resume-fill.md).
- [Scenario 04 — Bulk official letters](../../scenarios/04-bulk-official-letters.md).
