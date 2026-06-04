# ADR-0007: Engine-Neutral Document Engine Abstraction (WASM default, automation engine as a capability-gated slot)

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Status        | **Accepted** (2026-06-04)                                            |
| Supersedes    | —                                                                    |
| Superseded by | —                                                                    |
| Owner         | rhwp-mcp-server maintainers                                          |
| Builds on     | ADR-0004 (cell-based fill), ADR-0005 (char-format contract)          |
| Triggered by  | Two field-observed accuracy pains — (1) table-heavy forms where the cell to fill is hard to locate, and (2) producing finished documents that match a target institution's usual layout — plus the goal of a no-subscription, bring-your-own-model path. |

## Context

Every tool reaches the open document through a single accessor
(`sessionStore.get()`), and only the `hwp_open*` tools construct one
(`new HwpDocument(bytes)` / `createEmpty()`). The domain logic in
`src/rhwp/` (fields, tables, actions) is therefore already separated
from the MCP protocol surface in `src/tools/` and `src/server.ts`.

The bundled WASM engine (`@rhwp/core`) reimplements the HWP/HWPX object
model. For table-heavy forms it cannot always expose the structural
metadata (real cell geometry, merge spans) needed to decide *which*
cell a value belongs in, which is the root of pain (1). In the Korean
market the office runtime is installed on almost every target machine,
so an automation-backed engine that drives the installed runtime can
read that metadata directly and operate on a live document — at the cost
of being platform- and install-dependent.

We also want the same domain core to be reachable without a separate
subscription: an MCP server lets the user's existing client supply the
model, and a thin skill/runner surface lets a bring-your-own-key agent
call the same handlers.

## Decision

Abstract the HWP domain core behind an **engine-neutral `DocumentEngine`
interface plus an engine registry**. The default engine is WASM
(`@rhwp/core`); an automation engine that drives an installed office
runtime is introduced as a **capability-gated slot** that becomes the
preferred path only where it is operational. The MCP server and the
skill surface are two thin surfaces over the same core.

Key shape decisions:

- **The interface is asynchronous from the start.** `openFromBytes`,
  `createBlank`, and `dispose` return `Promise`s. The WASM engine wraps
  its synchronous results in `Promise.resolve`; an engine that must spin
  up an external process can return a genuinely deferred handle without
  changing the contract. Every direct construction/serialization call
  site (the `hwp_open*` tools, `save_as_base64`, the corpus runner, and
  the affected tests/scripts) was migrated to go through the engine in
  one atomic change; missing `await`s are caught by the type checker.
- **Selection is capability-gated with automatic fallback.** Each engine
  reports an `operational` flag; a non-operational slot is reported in
  the capability surface but skipped by automatic selection, which falls
  back to an operational engine. `hwp_engine_status` exposes the
  capability report.
- **Cell-detection stays heuristic on WASM and gains an engine seam.**
  The existing label heuristics are preserved unchanged; new fallbacks
  (upper-neighbour, multi-row header) only fill previously-unlabelled
  cells. A `getCellMetadata` hook on the interface is the seam through
  which an operational automation engine can later supply authoritative
  cell geometry.

## Drivers

1. Resolving the field-observed accuracy pains (cell detection, finished
   documents matching an institution's usual layout) is the primary
   value.
2. The brownfield assets (the tool surface, the test suite, the
   binary-identity gate, the prior ADRs) must be absorbed without loss.
3. A no-subscription, bring-your-own-model economy follows from MCP's
   nature: the client provides the model the user already pays for.

## Alternatives considered

- **Full core redesign (per-engine cores).** Rejected: regression risk
  and gate rewrite cost; behaviour preservation would be impossible.
- **Keep a single WASM engine.** Rejected: it cannot always supply the
  cell metadata that drives the table-detection pain, and it cannot
  operate on a live document, so it does not close pain (1) or (2) on
  its own. The no-install benefit is preserved as the fallback instead.

The automation engine's implementation approach is deferred to a
follow-up decision (see Follow-ups); only the slot and capability
surface ship here.

## Why chosen

A single construction point and a single document interface already
exist, so the abstraction cost is minimal and behaviour is preserved.
Direct access to structural metadata and live editing — the only path
that addresses the accuracy pains — is opened through the automation
engine, while the no-install advantage is retained as the WASM fallback.

## Consequences

### Positive
- One core, two surfaces (MCP + skill). An accuracy improvement lands in
  both at once.
- No new runtime dependency in this step; the automation engine is a
  slot, and its capability probe is read-only.
- Public tool surface stays a contract: the 15 prior tools are
  unchanged; `hwp_engine_status` is added additively (CHANGELOG
  `Unreleased` + regenerated `schemas/snapshot.json`, schema-diff clean).

### Negative / provisional
- **The dispose/error lifetime contract is intentionally left
  provisional here.** This ADR introduces an engine-neutral
  `dispose(): Promise<void>` signature and keeps the WASM finalizer
  semantics; the precise lifetime and error-propagation semantics are
  deferred, because an external-process engine and an in-process bridge
  differ in disposal timing and error flow.
- The automation engine carries environment-dependent reliability
  (runtime version, registration, security-module approval). This is
  surfaced as structured capability state rather than hidden.

### Neutral
- ADR-0002/0003/0004/0005 are unaffected. The binary-identity gate keeps
  its byte-for-byte verdict because the WASM engine is a 1:1 pass-through.

## Verification

- `npm run build` — 0 errors (missing `await`s caught by the type checker).
- `npm test` — full suite green, no regression.
- `npm run schema:diff` — clean; the only drift is the additive
  `hwp_engine_status` plus the tool-count bump.
- `npm run gate:binary-identity` — all cases PASS, bytes identical.

## Follow-ups

- **ADR-0008** — automation engine implementation approach (external
  Python helper vs in-process Node bridge) **and** the dispose/error
  lifetime + error-propagation contract, decided from a read-only spike.
- Decision Gate 3.0 verdict on a real N=30 corpus (ADR-0006).
- Finished-document generation validated against institution exemplars.
- Transaction-style multi-step editing model.

## References

- Plan: `.omc/plans/plan-rhwp-byo-com-pivot.md` (engine abstraction, §1 Principles, §6 Phase 1–4).
- Capability surface: `src/rhwp/engine/capabilities.ts`, `hwp_engine_status`.
- Engine interface: `src/rhwp/types.ts` (`DocumentEngine`, `EngineDocument`).
