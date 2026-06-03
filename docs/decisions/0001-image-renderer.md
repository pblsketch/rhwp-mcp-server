# ADR-0001: Image Renderer — Deferred to v0.2 (hwp_preview Removed in Sprint 3 prep)

| Field             | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Status            | **Accepted** (Sprint 3 prep, 2026-06-03)              |
| Supersedes        | ADR-0001 draft (Sprint 0, 2026-06-02 — DEFERRED)      |
| Superseded by     | —                                                     |
| Owner             | rhwp-mcp-server maintainers                           |
| Triggered by      | Sprint 2.6 retro: user-driven analysis exposed that MCP image content does NOT render inline in Claude Desktop today |

## Context

The Sprint 0 ADR-0001 draft set up an image-renderer probe (`sharp` vs
`@resvg/resvg-js` vs "rhwp emits resized PNG itself") to decide which
backend `hwp_preview` would use. The decision was DEFERRED pending probe
data.

In Sprint 3 prep we re-examined the question **"why does hwp_preview
exist at all?"** with the user. The probe became moot because the
fundamental delivery assumption — that returning MCP image content
gives the user an **inline preview in the chat** — turns out to be
false on the dominant MCP client today.

### Evidence (gathered 2026-06-03)

1. **Claude Desktop does NOT render MCP image content inline in the
   final assistant response.** Active GitHub issues confirm:
   - `anthropic-sdk-python#1329`: "Image content blocks from tool
     results not rendered inline in assistant response."
   - `claude-ai-mcp#238` (same complaint, separate tracker):
     "Image appears inside the collapsed 'tool use' accordion (which
     most users never expand), but is never rendered inline in the final
     assistant response visible to the user."
   - The LLM can still **see and reason about** the image, but the end
     user cannot.
2. **Excalidraw-style inline preview uses a different mechanism.** The
   official `excalidraw/excalidraw-mcp` does NOT return
   `{type: "image", data, mimeType}` content. It returns an
   **EmbeddedResource (interactive HTML interface — "MCP Apps")** that
   the client surfaces as an artifact. That channel is experimental:
   `claude-ai-mcp#287` reports "Claude Desktop does not surface MCP
   EmbeddedResource blocks as artifacts" consistently.
3. **Our 1차 페르소나 has a working answer already.** Korean form-fill
   and authoring users either run Claude Desktop alongside the
   filesystem (and open results in 한컴오피스 — installed almost
   everywhere in Korea), or use the `hwp_save_as_base64` path from
   Sprint 2.5 to retrieve bytes directly in remote-client environments.
   Inline preview is not on the critical path for either flow.

### What we actually need vs what `hwp_preview` would have provided

| Need | Provided by hwp_preview (image content)? | Real answer |
| ---- | ---------------------------------------- | ----------- |
| End-user inline preview in chat | **No** (lands in collapsed accordion) | 한컴오피스 open, or v0.2 EmbeddedResource |
| LLM self-verification of layout | Yes (LLM sees the image) | Optional — Sprint 2.6.1 real-form testing showed text + skipped-array signal already suffices for the dominant failure modes |
| CI visual regression | Yes (PNG + image diff) | Better done as a separate corpus-runner Pass C, not an MCP tool |
| PDF / mass-share workflow | No | Separate `hwp_export_pdf` candidate (also deferred) |

The original justification for `hwp_preview` was "end-user inline
preview." That justification fails the evidence test.

## Decision

### Remove `hwp_preview` from the v0.1 tool surface.

- `src/tools/preview.ts` deleted.
- Registration removed from `src/server.ts`. Tool count
  16 → **15**. Ready message updates to `15 tools + hwp_ping`.
- `scripts/_shared/schemas.ts` drops the `hwp_preview` entry and the
  `output_shape_note` comment. `TOOL_COUNT` 16 → 15.
- `schemas/snapshot.json` regenerated.
- `scripts/measure-tool-tokens.ts` drops the preview entry.
- `src/tools/open.ts` description list no longer mentions
  `hwp_preview`.

### Defer the inline-preview product question to v0.2+

When (and if) we revisit, the candidate paths are:

1. **EmbeddedResource / MCP Apps** — interactive HTML interface
   embedding `rhwp/core` WebAssembly directly in the chat artifact
   (Excalidraw-style). Requires a small JS viewer app + server-side
   resource wrapping. Real product value if EmbeddedResource stabilizes
   across clients.
2. **Static image content + LLM-only contract** — keep the previous
   plan but rename the tool to `hwp_render_for_llm` and document it as
   "not user-visible." Cheap to ship; narrow value.
3. **Out-of-MCP web viewer** — a separate `rhwp-web-viewer` project
   that loads `.hwp/.hwpx` directly in a browser tab. Out of scope for
   `rhwp-mcp-server`.

Each path gets its own ADR (ADR-0001b/c/d) if and when it lands.

### `scripts/probe-renderer.ts` is also removed from Sprint 0 follow-ups

The probe was gated on `hwp_preview`. With the tool gone, the probe
itself is moot. The script does not exist today; no work to undo.

## Consequences

### Positive

- **Smaller surface.** 15 tools instead of 16; one fewer dead `NOT_IMPLEMENTED`
  for LLM clients to discover and misuse.
- **Honest spec.** The "inline preview" promise was not deliverable on
  Claude Desktop today; removing it ends a stub that would have shipped
  with a misleading description.
- **No 1차 페르소나 loss.** Korean form-fill / authoring users open
  results in 한컴오피스 (or read bytes via `hwp_save_as_base64`); none
  of the working scenarios depended on `hwp_preview`.
- **Sprint 3 freed up.** The slot originally reserved for `hwp_preview`
  implementation can absorb corpus N=30 expansion (Decision Gate 3.0)
  without timeline pressure.

### Negative

- **LLM self-verification gets thinner.** The LLM can no longer "look
  at the page." Real-resume testing (Sprint 2.6.1) showed the
  `filled/skipped` array plus `recovered=true` from `exportHwpVerify`
  is enough signal for the dominant failure modes, but adversarial
  layouts (table overflow, font fallback) won't be caught by
  text-only inspection.
- **CI visual regression** still needs a renderer. The plan now is to
  add this to `corpus-runner.ts` as a separate Pass (image-diff)
  rather than via an MCP tool. Deferred to Sprint 3+.
- **`hwp_preview` was named in `scenarios/02-meeting-notes.md` and
  `03-one-page-report.md` introductory tables.** Those references
  remain because the scenarios were drafted before this ADR;
  Sprint 3 prep does NOT touch scenarios. A follow-up doc-cleanup
  commit will replace the mentions when the scenarios next change.

### Neutral

- ADR-0002 (binary-save fallback) and ADR-0003 (base64 dual contract)
  are unaffected. ADR-0004 (cell-based fill) is unaffected.
- Spec-lock policy (plan §3): the v0.1 surface is mutable until
  private-beta sign-off. Removing a `NOT_IMPLEMENTED` stub before any
  client adoption is well inside that window. `schema-diff` will flag
  the drop; CHANGELOG acknowledges `hwp_preview` by name.

## References

- Original Sprint 0 draft (DEFERRED):
  `docs/decisions/0001-image-renderer.md` @ Sprint 0 commit.
- Issue trackers confirming the inline-render gap:
  - https://github.com/anthropics/anthropic-sdk-python/issues/1329
  - https://github.com/anthropics/claude-ai-mcp/issues/287
  - https://github.com/modelcontextprotocol/csharp-sdk/issues/1261
- Excalidraw's actual mechanism: https://github.com/excalidraw/excalidraw-mcp
- Spec lock policy: `.omc/plans/plan-rhwp-mcp-mvp.md` §Principle 3.
- Replacement signal for LLM self-verification: Sprint 2.6.1 fix
  (`fix(sprint-2.6.1)` commit) — merged-cell handling validated on
  35-cell real résumé without any visual probe.
