# Scenario 02 — Meeting Notes from Scratch

**Persona:** Authoring (지식 노동자)
**Sprint:** 2 — Authoring vertical
**Goal:** Prove that a blank `.hwp` document can be authored end-to-end —
title, body paragraphs, attendee table — using only the five Sprint 2
Authoring tools, and saved to `.hwpx` in one Claude Desktop session.

## Story

> 이 팀장: "회의 끝나고 회의록을 쓰는 데 30분이 매번 사라져요. 다음 회의
> 시작 전까지 작성해서 슬랙에 올려야 하는데, 받아쓴 메모를 정리하면서
> 한컴 양식에 맞추는 게 제일 귀찮습니다. Claude한테 회의록 초안을 부탁
> 하고, 표준 양식으로 저장만 받으면 좋겠어요."

This is the canonical Authoring-persona demo. No template, no form
fields — a fresh document constructed top-down.

## Pre-conditions

- rhwp-mcp-server running in Claude Desktop.
- The user has already given Claude the meeting facts (date, attendees,
  agenda items) in the same conversation.
- A writable output directory.

## Walkthrough

### Turn 1 — Open a blank document

> User: `회의록 초안 만들어줘. 빈 문서에서 시작해.`

Claude opens the bundled blank from `corpus/synthetic/blank.hwp`:

```json
{ "path": "corpus/synthetic/blank.hwp" }
```

Response:

```json
{ "ok": true, "format": "hwp", "pages": 1, "session_id": "global" }
```

### Turn 2 — Title with center alignment

Claude calls `hwp_set_paragraph_style` first to center the first
paragraph:

```json
{ "style": { "alignment": "center" } }
```

Then `hwp_insert_text` for the title:

```json
{ "text": "주간 운영 회의록 — 2026-06-03" }
```

Response (both):

```json
{ "ok": true }
{ "ok": true, "chars_inserted": 21 }
```

### Turn 3 — Body paragraphs

For each body paragraph (overview, decisions, action items) Claude
calls `hwp_apply_action` to insert a new paragraph at explicit
coordinates rather than re-using the document-start hardcoded path:

```json
{
  "name": "insertParagraph",
  "params": { "section_idx": 0, "para_idx": 1 }
}
```

… followed by:

```json
{
  "name": "insertText",
  "params": {
    "section_idx": 0, "para_idx": 1, "char_offset": 0,
    "text": "1. 안건 — Q3 OKR 정렬 / 2. 결정 — 영업 채널 통합 / 3. 액션 — 김 PM 정리 후 공유"
  }
}
```

Using `hwp_apply_action` for the body lets Claude target paragraphs
*after* the title without disturbing it (the dedicated
`hwp_insert_text` hardcodes coordinates to (0,0,0)).

### Turn 4 — Attendee table

> User: `참석자 표도 넣어줘. 이름과 부서 두 열로.`

Claude calls `hwp_create_table` with row-major data:

```json
{
  "rows": 4,
  "cols": 2,
  "data": [
    ["이름",   "부서"],
    ["이태경", "운영"],
    ["박준일", "엔지니어링"],
    ["최서연", "프로덕트"]
  ]
}
```

Response:

```json
{ "ok": true, "rows": 4, "cols": 2, "cells_filled": 8 }
```

### Turn 5 — Save

> User: `meeting-notes-2026-06-03.hwpx 로 저장해줘.`

```json
{ "path": "meeting-notes-2026-06-03.hwpx", "format": "hwpx" }
```

Response:

```json
{ "ok": true, "path": "meeting-notes-2026-06-03.hwpx", "bytes_written": 17920 }
```

The user opens the file in 한컴오피스 and confirms the title is
centered, the body paragraph is below it, and the 4×2 table sits at the
end with the attendee names already populated.

## Acceptance for this scenario

- `hwp_insert_text` inserts at document start (0,0,0) — the title path.
- `hwp_apply_action` lets Claude target non-zero coordinates for body
  paragraphs (escape hatch when the dedicated tool's hardcoded (0,0,0)
  is too restrictive).
- `hwp_create_table` fills every requested cell — `cells_filled` equals
  `rows × cols` when `data` has no empty strings.
- The saved `.hwpx` opens cleanly in 한컴오피스 with the layout intact.
- Total tool calls ≤ 7.

## Limits

- The five dedicated Authoring tools hard-code `(section_idx=0,
  para_idx=0, char_offset=0)`. Multi-paragraph authoring relies on
  `hwp_apply_action` for explicit coordinates (see CHANGELOG Sprint 2,
  "coordinate-defaulting choice").
- Character-level formatting (bold, font size, color) is not yet
  exposed via the dedicated tools. Use `hwp_apply_action` with
  `applyCharFormat` and a `props_json` payload for v0.1.
- Equation, image, and chart insertion are catalog actions but have no
  dedicated tool — call `hwp_apply_action` with `insertEquation` /
  `insertPicture`.
