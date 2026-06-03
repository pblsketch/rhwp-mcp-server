# Persona — Hancom Bridge (호환성 민감 사용자)

> *"한컴오피스 라이센스 없이 .hwp 받아서 처리하고 다시 돌려보내야 하는데,
> 라운드트립이 깨질까봐 매번 불안해요. 그리고 가끔 Claude Web에서
> base64로 받아서 처리해야 할 때도 있어요."*

This walkthrough covers the two scenarios that the Hancom Bridge persona
hits in production:

1. **Base64 wire transit** — Claude Web / Mobile / MCP-over-HTTP brokers
   can't see the user's filesystem, so HWP bytes ride the wire as
   base64. The validated variant catches wire corruption before rhwp
   sees a bad payload.
2. **HWP ↔ HWPX format conversion** — open one format, save the other.
3. **Binary-identity audit** — confirm rhwp's serialization preserves
   the document on a round-trip via the Sprint 1.5 / Sprint 3 corpus
   gate.

## 1. Base64 wire transit (Claude Web / Mobile)

When the MCP client has no filesystem access (Claude Web, Mobile, an
MCP-over-HTTP broker, a sandboxed agent), bytes ride the conversation
itself.

### Open by base64

```text
User: 이 base64 .hwp 파일 열어줘. (paste of ~35 KB string)
```

Claude calls `hwp_open_base64_validated` — **always prefer the validated
variant for wire transit** because Claude Web's MCP framing can subtly
corrupt long base64 strings:

```json
{
  "bytes_base64": "UEsDBBQABgAIAAAAIQ…",
  "expected_bytes": 35840,
  "expected_crc32": "0x9af28b1c"
}
```

- `expected_bytes` is the BINARY length the sender knows (before base64).
- `expected_crc32` is the CRC32 over the binary bytes (the sender computes
  it with `zlib.crc32` or any standard CRC-32 implementation). Accepts a
  number or a `0x…` hex string.

Returns:

```json
{ "ok": true, "format": "hwp", "page_count": 4, "bytes_in": 35840 }
```

If the wire corrupted the bytes:

```json
{
  "name": "RhwpError",
  "category": "parse",
  "code": "BAD_CHECKSUM",
  "message": "CRC32 mismatch: expected 0x9af28b1c, got 0x4d1e0532 (bytes_in=35840)"
}
```

The typed error is **what you want** — without integrity checks the
same scenario surfaces as `WASM_TRAP: unreachable executed` deep inside
rhwp's parser. ADR-0004 documents the CRC32 choice (wire corruption
detection, not adversarial integrity — CRC32 is the right tool).

### Save back to base64

```text
User: 같은 파일을 .hwpx로 변환해서 base64로 돌려줘.
```

```json
// hwp_save_as_base64
{ "format": "hwpx" }
```

Returns:

```json
{
  "ok": true,
  "format": "hwpx",
  "bytes_base64": "UEsDBBQABgAIAAAA…",
  "bytes_written": 38912
}
```

`bytes_written` is the BINARY count (before base64 encoding) so the
caller knows the payload size without decoding it. Claude pastes the
new base64 string back into the conversation; the user copies it to
wherever they need.

### When to use the unvalidated `hwp_open_base64`

- Trusted internal pipeline where you control both ends and don't need
  the integrity check.
- Small payloads (< 5 KB) where the wire-corruption probability is
  negligible.
- You're prototyping and don't want to compute CRC32 upfront.

For anything user-facing or > 10 KB, **use the validated variant**.

## 2. Format conversion (HWP ↔ HWPX)

Same flow, filesystem variant:

```text
User: ~/Downloads/legacy.hwp 열어서 ~/Downloads/legacy.hwpx 로 저장해줘.
```

```json
// hwp_open
{ "path": "~/Downloads/legacy.hwp" }
// → { ok, format: "hwp", page_count: ... }

// hwp_save_as
{ "path": "~/Downloads/legacy.hwpx", "format": "hwpx" }
// → { ok, path, bytes_written }
```

The reverse direction (.hwpx → .hwp) works the same way with the
format swapped. HWPX is the recommended target format whenever
downstream tools can consume it — it's an OPS-compliant ZIP+OWPML
container, easier to debug, and the rhwp serializer for .hwpx has more
exercise.

The bytes ride the wire untouched — Claude doesn't read the contents
between open and save. The conversion happens inside `@rhwp/core`.

## 3. Binary-identity audit

For sensitive workflows (legal documents, certified forms) you'll want
evidence that the round-trip didn't silently drop information. The
Sprint 1.5 / Sprint 3 corpus gate is the audit tool:

```bash
# Add the file to the local audit corpus
cp ~/Downloads/contract.hwp corpus/private/contract.hwp

# Run the combined Pass A + Pass B gate
npm run gate:binary-identity
```

Output:

```
Binary-Identity Save Gate (Sprint 1.5 baseline — pre-N=30) — rhwp 0.7.13
  Cases : total=6  pass=6  fail=0  skip=0
  Rate  : 100.0%  (rated=6, skips excluded)  Wilson 95% [60.7%, 100.0%]
  Gate  : PASS (threshold ≥90%)

  [PASS] synthetic/blank.hwp (A=skip, B=pass)  (pages 1, bytes 12800→12800)
  [PASS] synthetic/mixed.hwp (A=skip, B=pass)  (pages 1, bytes 13312→13312)
  [PASS] private/contract.hwp (A=pass, B=pass)  (pages 4, bytes 35840→35840)
  ...
```

- **Pass A** — field round-trip (open → fill every form field with a
  synthetic value → re-export → re-open → verify field names + values
  preserved). Skips with reason `no fields` if the document has zero
  form fields.
- **Pass B** — binary identity (open → `exportHwpVerify` → re-export
  → re-open → second verify). Reserved for `.hwp` 5.0 sources; `.hwpx`
  sources skip Pass B with a typed reason.
- **Combined** — pass requires at least one explicit pass and no fails.

Cases under `corpus/private/` are gitignored — your audit files never
hit the repo. Per-case `failReason`s are pinned in `corpus-report.json`
so you can hand the output to legal / compliance verbatim.

When the corpus grows to N ≥ 30 rated cases the gate auto-switches to
Decision Gate 3.0 with the stricter ≥ 95% threshold. The escalation is
purely data-driven — no flag flip required.
[ADR-0006](../decisions/0006-decision-gate-3.md) documents the contract.

## Typed errors you'll see

| Code | Category | Meaning | Action |
| --- | --- | --- | --- |
| `BAD_BASE64` | parse | The bytes aren't valid base64 (garbage characters, empty input). | Re-encode at the sender. |
| `BAD_LENGTH` | parse | `expected_bytes` doesn't match the decoded length. | The wire corrupted the payload. Resend. |
| `BAD_CHECKSUM` | parse | CRC32 mismatch. | Wire corruption. Resend. |
| `BAD_FORMAT` | parse | Magic bytes don't match the declared `format`. | Re-check the sender's format hint. |
| `WASM_TRAP` | parse | rhwp panicked inside the WASM module. | Open an issue with the failing input. |

## Limits to be aware of

- **Base64 round-trip overhead is ~33%** — a 30 KB doc becomes ~40 KB
  on the wire. For local clients (Claude Desktop, Cursor, Claude Code),
  prefer the filesystem-path tools.
- **Wire-corruption integrity ≠ adversarial integrity.** CRC32 detects
  bit flips and run errors — it doesn't detect adversarial tampering.
  If you need cryptographic integrity, sign the binary separately
  before the base64 encoding.
- **Binary-identity gate Pass B is HWP-5.0-only.** `.hwpx` sources skip
  Pass B with a typed reason (`Pass B reserved for HWP 5.0 sources`).
  Pass A is format-agnostic and runs on both.
- **The audit corpus needs the user to drop files in.** No tool
  automatically downloads forms from 정부24 or other archives — that's
  intentional (PII hygiene).

## Related

- [ADR-0003 — Base64 wire-friendly contract](../decisions/0003-base64-tools.md).
- [ADR-0002 — Binary-identity Pass B baseline](../decisions/0002-binary-save-fallback.md).
- [ADR-0006 — Decision Gate 3.0 structure](../decisions/0006-decision-gate-3.md).
- [Scenario 05 — HWP identity roundtrip](../../scenarios/05-hwp-identity-roundtrip.md).
- [Scenario 06 — HWP to HWPX export](../../scenarios/06-hwp-to-hwpx-export.md).
- [Scenario 07 — Error recovery](../../scenarios/07-error-recovery.md).
