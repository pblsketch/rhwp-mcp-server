# Scenario 07 — Error Recovery (negative-path tour)

**Persona:** all (cross-cutting)
**Sprint:** 2 (apply_action error codes) + ongoing
**Goal:** Prove that the typed `RhwpError` surface lets Claude recover
gracefully from the most common user mistakes, rather than crashing the
conversation or producing a misleading "OK" message.

This scenario is what Form/Authoring/Compatibility personas all share:
nobody wants the LLM to silently swallow a failure.

## Story

> 박 신입: "테스트하다 보면 파일 경로 틀리고, 양식에 없는 필드 이름 적고,
> 셀 개수랑 데이터 개수 어긋나고… 그럴 때마다 Claude가 '됐어요!' 하면
> 진짜 곤란합니다. 뭐가 왜 안 됐는지 알려줘야 다음 시도를 할 수 있어요."

Each negative case below is paired with the typed error Claude (and the
user) should see.

## Pre-conditions

- rhwp-mcp-server running in Claude Desktop.
- The user is intentionally going off the happy path.

## Cases

### 7.1 — Unknown action name

> User: `unicornInjection 액션 실행해줘.`

```json
{ "name": "unicornInjection", "params": {} }
```

Server response:

```json
{
  "isError": true,
  "error": {
    "name": "RhwpError",
    "category": "action",
    "code": "UNKNOWN_ACTION",
    "message": "Unknown action 'unicornInjection'. Call hwp_list_actions to discover available actions."
  }
}
```

Expected LLM behavior: surface the message verbatim and offer
`hwp_list_actions` as the next step.

### 7.2 — Bad parameter shape

> User: `insertText 했는데 text만 줘봐.`

```json
{ "name": "insertText", "params": { "text": "좌표 없음" } }
```

Server response:

```json
{
  "isError": true,
  "error": {
    "name": "RhwpError",
    "category": "action",
    "code": "BAD_PARAMS",
    "message": "Invalid params for action 'insertText': [{\"code\":\"invalid_type\",\"expected\":\"number\",\"received\":\"undefined\",\"path\":[\"section_idx\"],\"message\":\"Required\"}, ...]"
  }
}
```

Expected LLM behavior: read the zod issue list and add the missing
coordinates, then retry.

### 7.3 — Table data shape mismatch

> User: `2x2 표인데 데이터는 한 줄만 줘봐.`

```json
{ "rows": 2, "cols": 2, "data": [["a", "b"]] }
```

Server response:

```json
{
  "isError": true,
  "error": {
    "name": "RhwpError",
    "category": "action",
    "code": "BAD_DATA_SHAPE",
    "message": "data.length=1 does not match rows=2"
  }
}
```

The error fires *before* any rhwp WASM call — no half-built table is
left behind. Sprint 2 PRD acceptance criterion US-S2-004 #4.

### 7.4 — File not found

> User: `없는파일.hwpx 열어줘.`

```json
{ "path": "없는파일.hwpx" }
```

Server response:

```json
{
  "isError": true,
  "error": {
    "name": "RhwpError",
    "category": "parse",
    "code": "READ_FAILED",
    "message": "Failed to read file '없는파일.hwpx': ENOENT: no such file or directory"
  }
}
```

The category (`parse`) lets the LLM distinguish this from a corrupt-
file failure (`parse/PARSE_FAILED`) or a write failure
(`serialize/WRITE_FAILED`).

### 7.5 — Unknown field name (soft-skip, not an error)

> User: `존재하지 않음 필드에도 값 넣어줘.`

```json
{ "map": { "이름": "박준일", "존재하지 않음": "값" } }
```

Server response:

```json
{
  "ok": true,
  "filled": ["이름"],
  "skipped": ["존재하지 않음"]
}
```

This case is intentionally NOT an error — unknown fields are part of
the contract (Sprint 1, `hwp_fill_fields`). The LLM should report the
skipped list to the user so they can correct the field name without
re-running the whole turn.

### 7.6 — WASM panic (opaque trap → typed error)

If `@rhwp/core` ever panics inside the Rust runtime, `wrapPanic`
converts it to a typed RhwpError instead of letting `RuntimeError:
unreachable executed` reach Claude:

```json
{
  "isError": true,
  "error": {
    "name": "RhwpError",
    "category": "action",
    "code": "WASM_TRAP",
    "message": "rhwp WASM panic — operation failed inside the Rust runtime. This usually means an unsupported document feature or an internal rhwp bug. Report upstream at https://github.com/edwardkim/rhwp/issues."
  }
}
```

Expected LLM behavior: stop, surface the message, suggest the user
file an issue with the offending file attached (if non-confidential).
Do NOT retry — WASM traps are deterministic on the same input.

## Acceptance for this scenario

- Every negative case produces an `isError: true` MCP response with a
  typed `category` + `code`.
- The message field is human-readable Korean-or-English text — no
  stringified stack traces, no Rust panic strings reaching the user.
- `category` values stay within the enum
  `parse | serialize | action | field | render | session | other`.
- Unknown-field fill is the only NOT-an-error negative — it surfaces
  via the `skipped` array, not an error.

## Limits

- v0.1 does not yet have a `recover()` action that resets the session
  store after a fatal WASM trap. Until v0.2, the user reopens the file
  manually after a `WASM_TRAP`.
- Error messages are returned in the language of the underlying
  message — rhwp's Korean messages stay Korean. v0.2 may localize.
- Some legitimately weird inputs (e.g. cells inside merged ranges) can
  return `ok:false` from the rhwp side without raising a typed error.
  The dedicated tools surface these as `action/<TOOL>_FAILED`; the
  generic `hwp_apply_action` surfaces them as `action/ACTION_FAILED`
  with the rhwp message attached.
