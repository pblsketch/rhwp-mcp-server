# Scenario 01 — Resume Form Auto-fill

**Persona:** Form (양식 자동화)
**Sprint:** 1 — Form Filling vertical
**Goal:** Prove that an `.hwpx` template with 누름틀(form field) controls can
be opened, enumerated, filled with the user's data, and saved back to
disk in a single Claude Desktop conversation.

## Story

> 박 인사담당자: "저희 회사는 한컴오피스로 만든 이력서 양식을 신입사원
> 입사 서류로 받습니다. 면접 통과한 25명에게 같은 양식의 일부 칸을 미리
> 채워서 보내드리고 싶은데, 매번 한컴을 켜서 손으로 채우는 게 너무
> 비효율적이에요. Claude한테 '이 양식에 이 사람 정보 좀 미리 채워줘'
> 하면 되면 좋겠어요."

This scenario is the canonical Form-persona demo. The user opens a real
이력서 template (`.hwpx`), names a candidate, and Claude figures out which
fields to set without being told the field names in advance.

## Pre-conditions

- rhwp-mcp-server v0.1.0-alpha.0 or later running in Claude Desktop.
- A `.hwpx` resume template at a known path. For reproducibility this
  scenario uses the synthetic blank document at
  `corpus/synthetic/blank.hwp` — to exercise real form fields, swap in
  any 한컴 이력서 template that contains 누름틀 controls.
- The user already greeted Claude in the same conversation.

## Walkthrough

### Turn 1 — User opens the template

> User: `corpus/synthetic/blank.hwp 열어줘.`

Claude calls `hwp_open`:

```json
{ "path": "corpus/synthetic/blank.hwp" }
```

Expected response:

```json
{
  "ok": true,
  "format": "hwp",
  "pages": 1,
  "session_id": "global"
}
```

### Turn 2 — Discover the fields

> User: `어떤 필드가 있는지 알려줘.`

Claude calls `hwp_list_fields` (no arguments).

```json
{
  "fields": [
    { "name": "이름",    "type": "ClickHere", "current_value": null },
    { "name": "생년월일", "type": "ClickHere", "current_value": null },
    { "name": "연락처",  "type": "ClickHere", "current_value": null },
    { "name": "이메일",  "type": "ClickHere", "current_value": null },
    { "name": "주소",    "type": "ClickHere", "current_value": null }
  ]
}
```

(For the synthetic blank corpus this returns `[]` — to exercise the full
flow, swap in a template that has 누름틀 controls.)

### Turn 3 — Fill with candidate data

> User: `박준일, 1996년 4월 12일생, 010-1234-5678, junil.park@example.com 으로 채워줘.`

Claude maps the natural-language values onto the discovered field names
and calls `hwp_fill_fields`:

```json
{
  "map": {
    "이름":     "박준일",
    "생년월일": "1996-04-12",
    "연락처":   "010-1234-5678",
    "이메일":   "junil.park@example.com"
  }
}
```

Expected response:

```json
{
  "ok": true,
  "filled": ["이름", "생년월일", "연락처", "이메일"],
  "skipped": []
}
```

If Claude accidentally includes a field the template does not have
(e.g. `"주소":""` when the candidate didn't provide an address), the
server records it under `skipped` instead of throwing — the UX never
breaks on a partial dataset.

### Turn 4 — Save with a new name

> User: `박준일_이력서_2026.hwpx 로 저장해줘.`

Claude calls `hwp_save_as`:

```json
{ "path": "박준일_이력서_2026.hwpx", "format": "hwpx" }
```

Expected response:

```json
{
  "ok": true,
  "path": "박준일_이력서_2026.hwpx",
  "bytes_written": 14336
}
```

The file is written atomically (`<final>.tmp.<pid>.<rand>` + rename) so
a partial write never corrupts an existing template at the same path.

## Acceptance for this scenario

- `hwp_open` accepts both `.hwp` and `.hwpx`.
- `hwp_list_fields` returns at least the documented fields when the
  template is a real 누름틀 form (synthetic blank returns `[]`).
- `hwp_fill_fields` records unknown field names under `skipped` rather
  than failing the whole call.
- The output file is openable in 한컴오피스 without errors.
- Total tool calls ≤ 4. No retry loops.

## Limits

- `current_value` is `null` for empty fields, never an empty string —
  matches the locked schema (`HwpListFieldsOutput`).
- Date fields are stored as strings; the template determines parsing.
  Sprint 2.5 may add a typed-value contract.
- Bulk filling (one template → many output files) lives in
  `scenarios/04-bulk-official-letters.md`.
