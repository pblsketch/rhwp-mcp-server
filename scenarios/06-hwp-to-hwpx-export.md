# Scenario 06 — Legacy `.hwp` → modern `.hwpx` Export

**Persona:** Compatibility (호환성)
**Sprint:** 3 — Compatibility persona (forward-migration angle)
**Goal:** Prove that an older `.hwp` (HWP 5.0 binary OLE2) document can be
opened and re-saved as a `.hwpx` (OWPML ZIP) without manual conversion
in 한컴오피스, with both saves verifiable via `exportHwpVerify`.

This complements `05-hwp-identity-roundtrip.md`, which proves
`.hwp` → `.hwp` byte-level identity. Scenario 06 proves the
**forward-migration** direction needed for orgs moving off legacy HWP
storage.

## Story

> 정 IT팀장: "10년치 .hwp 문서가 NAS에 쌓여있는데, 새 워크플로는 다
> .hwpx 기준으로 짜고 있어요. 매번 한컴 켜서 '다른 이름으로 저장' 하기
> 싫어요. Claude한테 폴더 던지면 알아서 .hwpx로 컨버트해주면 좋겠습니다.
> 단 한 페이지짜리 문서도, 표가 들어있는 문서도 다 깨지면 안 되고요."

## Pre-conditions

- rhwp-mcp-server running in Claude Desktop.
- A `.hwp` source file. For reproducibility this scenario uses one of
  the synthetic corpus cases (`corpus/synthetic/mixed.hwp`, which
  contains text + a 2×2 table + center alignment).

## Walkthrough

### Turn 1 — Open the legacy file

> User: `corpus/synthetic/mixed.hwp 열어줘.`

```json
{ "path": "corpus/synthetic/mixed.hwp" }
```

Response:

```json
{ "ok": true, "format": "hwp", "pages": 1, "session_id": "global" }
```

`format: "hwp"` confirms rhwp's source-format detector saw the OLE2
container — the file is genuinely HWP 5.0, not a misrenamed `.hwpx`.

### Turn 2 — Optional: validate before exporting

Claude calls `hwp_apply_action` with `exportHwpVerify` to inspect the
in-memory state *before* the format conversion:

```json
{ "name": "exportHwpVerify", "params": {} }
```

Result (the action passes rhwp's JSON through unchanged):

```json
{
  "ok": true,
  "name": "exportHwpVerify",
  "result": {
    "bytesLen": 13312,
    "pageCountBefore": 1,
    "pageCountAfter": 1,
    "recovered": true
  }
}
```

`recovered: true` + page-count parity is the same gate as Sprint 1.5
binary-identity. A `recovered: false` here means Claude should warn the
user *before* writing the `.hwpx` — the export would otherwise look
fine but the source file is partially understood.

### Turn 3 — Save as `.hwpx`

> User: `mixed.hwpx 로 저장해줘.`

```json
{ "path": "mixed.hwpx", "format": "hwpx" }
```

Response:

```json
{ "ok": true, "path": "mixed.hwpx", "bytes_written": 22528 }
```

The atomic-write contract still holds: the destination either contains
the full new file or is untouched.

### Turn 4 — Verify by re-opening

Optional but recommended for batch migrations: re-open the freshly
written `.hwpx` and re-run `exportHwpVerify`.

```json
{ "path": "mixed.hwpx" }
{ "name": "exportHwpVerify", "params": {} }
```

Expected: `format: "hwpx"`, `recovered: true`, page count unchanged.

If you also want a structural diff between the original and the new
file, drop both into `corpus/private/` (the original as `.hwp`, the
new as `.hwpx`) and run `npm run gate:binary-identity` — Pass B will
report per-case verify metrics for both, side-by-side.

## Acceptance for this scenario

- Source format is detected as `hwp` on open.
- `exportHwpVerify` reports `recovered: true` and stable page count on
  both the source and the new `.hwpx`.
- The `.hwpx` opens in 한컴오피스 with the original content
  (text + table + alignment) preserved.
- Total tool calls ≤ 4 for a single document.

## Limits

- This scenario does NOT guarantee `.hwpx` → `.hwp` byte-level identity
  if the user later round-trips back. The reverse direction is
  scenario 05's contract.
- Header/footer fidelity on `.hwp` → `.hwpx` is not gated by
  `exportHwpVerify`; visual diff in 한컴오피스 is still the human-
  level check.
- Embedded objects (KAS/OOXML embeds, OLE objects from other programs)
  may be lost during format conversion. rhwp's release notes are the
  source of truth for the embed support matrix.
- For batch migrations across hundreds of files, wrap this scenario in
  a loop similar to `scenarios/04-bulk-official-letters.md` and write
  a manifest of conversion outcomes.
