# Scenario 04 — Bulk Official Letters (Form-fill at scale)

**Persona:** Form (양식 자동화)
**Sprint:** 3 — Form persona at scale
**Goal:** Prove that one `.hwpx` template can be filled with N different
data rows in one Claude Desktop conversation, producing N output files
without manual intervention or token blow-up.

## Story

> 김 학교행정실장: "졸업증명서 요청이 매학기 200건 가까이 들어옵니다.
> 양식은 다 같고 학생 이름·학번·발급일자만 다르거든요. 학교 양식 한 개랑
> 학생 명부 CSV만 주면 Claude가 한 번에 다 만들어줬으면 합니다. 사람이
> 200번 손으로 채우면 실수가 안 날 수가 없어요."

This is the canonical "form-fill at scale" demo. The MCP server keeps a
single global SessionStore, so the loop is sequential per file — but the
LLM drives the loop, not the server.

## Pre-conditions

- rhwp-mcp-server running in Claude Desktop.
- A `.hwpx` template that uses 누름틀 fields named (for this example)
  `student_name`, `student_id`, `issued_at`.
- A small recipient list in the conversation, e.g. as a CSV blob:

  ```text
  student_name,student_id,issued_at
  박준일,20231234,2026-06-03
  최서연,20231256,2026-06-03
  이태경,20231311,2026-06-03
  ```

- A writable output directory.

## Walkthrough

The LLM repeats steps 1–4 for each row in the recipient list. The
server does NOT batch — every iteration is one `open` → `fill` →
`save_as`. This is intentional: each iteration is independently
recoverable, and the SessionStore is a single global handle (per the
spec lock).

### Iteration N

#### Step 1 — Re-open the template

```json
{ "path": "templates/졸업증명서.hwpx" }
```

Why re-open every time? `hwp_fill_fields` mutates the in-memory document.
If you skip step 1 you accumulate previous rows' edits on top of each
other.

#### Step 2 — Sanity-check the fields once (optional)

On the first iteration only, Claude calls `hwp_list_fields` to confirm
the expected field names exist. If `student_name` is missing the
template is wrong — Claude warns the user and stops the batch instead
of producing 200 corrupted files.

```json
{
  "fields": [
    { "name": "student_name", "type": "ClickHere", "current_value": null },
    { "name": "student_id",   "type": "ClickHere", "current_value": null },
    { "name": "issued_at",    "type": "ClickHere", "current_value": null }
  ]
}
```

#### Step 3 — Fill from the current row

```json
{
  "map": {
    "student_name": "박준일",
    "student_id":   "20231234",
    "issued_at":    "2026-06-03"
  }
}
```

Response:

```json
{ "ok": true, "filled": ["student_name", "student_id", "issued_at"], "skipped": [] }
```

If a row is missing a field (e.g. `issued_at` empty), Claude omits it
from the map; the template's blank default stays in place.

#### Step 4 — Save with a per-row filename

```json
{
  "path": "out/졸업증명서_박준일_20231234.hwpx",
  "format": "hwpx"
}
```

Response:

```json
{ "ok": true, "path": "out/졸업증명서_박준일_20231234.hwpx", "bytes_written": 19712 }
```

The atomic-write contract means a failure mid-write leaves the
template untouched — no orphan partial file at the destination path.

### After the loop — produce a manifest

After processing every row, Claude summarizes the run in the chat
(no tool call needed):

```text
✅ 졸업증명서 3개 생성:
   1. out/졸업증명서_박준일_20231234.hwpx (19712 bytes)
   2. out/졸업증명서_최서연_20231256.hwpx (19712 bytes)
   3. out/졸업증명서_이태경_20231311.hwpx (19712 bytes)
```

For larger batches (N=200), encourage the user to ask Claude to write a
JSON manifest file alongside the output directory so downstream tools
can verify completion.

## Acceptance for this scenario

- N output files are created with one `open` → `fill` → `save_as` cycle
  each.
- The first iteration runs `hwp_list_fields`; subsequent iterations do
  not (to save tokens).
- Any row with missing data lands in `hwp_fill_fields.skipped` and is
  visible in the per-iteration response — never silently dropped.
- The atomic-write contract guarantees no partial files in `out/`.
- For N=3 the total token budget stays under a single conversation
  turn limit; for N=200 the user is encouraged to split into chunks of
  ~30 to avoid context exhaustion.

## Limits

- The SessionStore is a single global handle. Concurrent batches in two
  Claude Desktop conversations would step on each other. Serialize at
  the user level if needed.
- No server-side templating engine. The LLM is responsible for
  per-row data substitution.
- v0.1 does not expose a bulk `hwp_fill_many` tool; that is a v0.2
  candidate (see ROADMAP if it ships).
- The `list_fields` check on iteration 1 is a soft guard, not a contract.
  If the template changes mid-batch (e.g. user re-saves it in 한컴) the
  remainder of the run may silently skip fields. Re-validate by
  restarting the conversation.
