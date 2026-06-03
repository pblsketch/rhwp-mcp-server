# ADR-0003: Add base64-bytes Tools Alongside Path-based Tools

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Status            | **Accepted** (Sprint 2.5, 2026-06-03)                |
| Supersedes        | —                                                    |
| Superseded by     | —                                                    |
| Owner             | rhwp-mcp-server maintainers                          |
| Triggered by      | User-reported scenario: Claude Web could not reach the Windows host's filesystem |

## Context

The v0.1 tool surface (`hwp_open(path)` / `hwp_save_as(path)`) assumes the
MCP client and the rhwp-mcp host share a filesystem. That assumption holds
for **Claude Desktop** running on the user's PC alongside the server, and
it holds for **Claude Code** in the same workspace. It does **not** hold
for:

- **Claude Web / Mobile** — the conversation runs in an Anthropic
  container; user-controlled MCP tools execute on a remote host (the
  user's PC). The container creates files in its sandbox, the rhwp-mcp
  host cannot see them, and `hwp_open` reports "file not found".
- **MCP-over-HTTP brokers** — same shape: the bridge runs in cloud
  infrastructure with no path mapping to the document source.
- **Sandboxed agents** — any environment that intentionally denies
  shared-filesystem access for security.

The user hit this directly while trying to author a 학교 가정통신문 in
Claude Web:

> "The rhwp server runs on a Windows host (a separate filesystem). I
> could not find a shared mount between the container and that host."

`hwp_open` failed; the rest of the toolchain could not start. The user
fell back to a fully native approach, which left rhwp-mcp value on the
table.

## Decision

### Add three base64 tools without modifying the v0.1 path tools

| Tool                  | Input                                         | Output                                                          | Purpose                                                |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `hwp_open_blank`      | `{}`                                          | `{ ok, format: 'hwpx', page_count }`                            | Bootstrap a blank document with no path at all.        |
| `hwp_open_base64`     | `{ bytes_base64, format? }`                   | `{ ok, format, page_count, bytes_in }`                          | Load a document the client has in memory.              |
| `hwp_save_as_base64`  | `{ format: 'hwp' \| 'hwpx' }`                 | `{ ok, format, bytes_base64, bytes_written }`                   | Return serialized bytes to the client, no disk write.  |

The three new tools:

1. **Share the SessionStore** with the existing path tools. The client
   may freely mix `hwp_open` (path) with `hwp_save_as_base64` (bytes),
   or vice versa, because both end up in the same single-document
   session.
2. **Reuse `wrapPanic`**. Same category model: `parse` for open,
   `serialize` for save, with a new `BAD_BASE64` code for malformed
   input.
3. **Do not deprecate the path tools.** The path contract is still the
   correct path on Claude Desktop / Claude Code / local-server
   deployments — it avoids a ~33% wire-size penalty and keeps disk I/O
   out of the LLM context budget.

### Why not just one of the two contracts?

- **Path-only** (status quo) — fails on Claude Web/Mobile, fails on any
  sandboxed agent. The user already showed this is a real-world block.
- **base64-only** — would force every Claude Desktop user to ferry
  multi-MB documents through the LLM context. Even at 4 MB the base64
  encoding lands at ~5.4 MB of text — punitive for the path-was-fine
  90% case.
- **dual contract (chosen)** — adds 3 tools, no surface migration, no
  removal of locked v0.1 shapes. The client picks based on its
  environment.

### Why is `bytes_in` / `bytes_written` in the output?

So callers can sanity-check the round-trip without parsing the base64
themselves. `bytes_in` is the decoded byte count from
`hwp_open_base64`'s input; `bytes_written` is the binary byte count
from `hwp_save_as_base64`'s `exportHwp{,x}` call (BEFORE base64
encoding). These numbers should round-trip identically through a
no-op session — useful for the smoke tests and for client-side
validation.

### Size policy (informational)

The MCP transport does not impose a hard limit on tool-result size. We
recommend (but do not enforce) clients cap base64 payloads at **16 MB
binary** (≈21 MB after base64) — larger documents should use the path
contract or split into multiple opens. This advisory is repeated in
the Sprint 2.5 CHANGELOG entry.

## Consequences

### Positive

- Claude Web / Mobile / any-sandbox client can use rhwp-mcp end-to-end
  without filesystem coordination.
- No migration cost for existing Claude Desktop users — their path
  workflows keep working unchanged.
- Tool count grows from 10 → 13. `tool_count_expected` updates to 13
  in `schemas/snapshot.json`. The v0.1 surface lock applies to the 10
  existing tools; the 3 new tools are added under the same lock policy
  (mutable until private-beta sign-off per plan §3).

### Negative

- Base64 ~33% wire overhead. Documented in the tool descriptions so the
  LLM can advise the user.
- Three additional tools to maintain: per-tool zod schemas, snapshot
  entries, smoke tests, CHANGELOG. Mitigated by the strong pattern
  reuse (each new tool is < 100 lines including comments).
- Tool count crossing 10 (`hwp_*` × 11 + `hwp_apply_action`,
  `hwp_list_actions` + 3 new = 13) gets closer to the 15-tool soft
  cap LLM clients typically tolerate without surface fatigue. Sprint 3
  will absorb `hwp_preview` into the count; v0.2 may consolidate.

### Neutral

- ADR-0001 (image renderer) remains independent.
- ADR-0002 (binary-save fallback policy) remains independent — the
  Pass B gate applies to `hwp_save_as` and `hwp_save_as_base64` both
  (both call `doc.exportHwp()` under the hood).

## References

- Triggering scenario: `scenarios/04-bulk-official-letters.md` and the
  user-reported Claude Web filesystem-split failure that motivated this
  ADR.
- Spec lock policy: `.omc/plans/plan-rhwp-mcp-mvp.md` §Principle 3.
- Tools: `src/tools/{open_blank,open_base64,save_as_base64}.ts`.
- Snapshot: `schemas/snapshot.json` (regenerated via `npm run
  schema:snapshot`).
- Tests: `tests/smoke/{open_blank,open_base64,save_as_base64}.test.ts`.
