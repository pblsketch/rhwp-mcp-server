# ADR-0008: Automation Engine via a Python Helper (interactive desktop target, opt-in security module)

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Status        | **Accepted** (2026-06-04)                                            |
| Supersedes    | —                                                                    |
| Superseded by | —                                                                    |
| Owner         | rhwp-mcp-server maintainers                                          |
| Builds on     | ADR-0007 (engine-neutral DocumentEngine abstraction)                 |
| Triggered by  | ADR-0007 left the automation-engine implementation approach and the dispose/error lifetime contract open, to be decided from a read-only spike. |

## Context

ADR-0007 introduced an automation engine as a capability-gated slot and
deferred two things: (1) how to drive the host office automation object
model, and (2) the dispose/error lifetime contract. This ADR resolves
both from spike evidence.

### Spike evidence (read-only, on a host with the office suite installed)

- The automation object is registered: the version-independent ProgID
  and version-specific ProgIDs are present, with a resolvable CLSID. The
  capability probe in `src/rhwp/engine/capabilities.ts` reports this
  correctly as available.
- **Bare instantiation blocks in a non-interactive context.** Creating
  the automation object from a non-interactive shell blocked until it was
  force-terminated, returning no version and leaving a headless process
  behind. The object *starts* but does not finish initialising without
  (a) the automation security module registered and (b) an interactive
  desktop session.

### What the spike changes

The hard part is not the language binding. It is **registering the
automation security module and managing the process/session lifetime**.
That burden is shared by any binding choice, and a mature Python wrapper
already solves it (security-module registration helpers, process
lifetime, parameter-set helpers). This outweighs the single-stack
simplicity argument for an in-process Node bridge, because a Node bridge
would have to reimplement exactly that burden.

The maintainer also confirmed the deployment context: the tool runs on a
user's **interactive Windows desktop with the office suite installed**,
a Python runtime dependency is acceptable, and bundling security-module
handling is acceptable provided it is opt-in.

## Decision

Implement the automation engine as a **Python helper subprocess** spoken
to over a line-delimited JSON protocol on stdio, driven from
`src/rhwp/engine/com-engine.ts`. The helper uses a mature automation
wrapper (with a direct `pywin32` path as a fallback substrate). The Node
side owns the engine contract, error classification, and capability
gating; the Python side owns the automation object model.

Scope and gating:

- **Interactive desktop is the supported target.** The automation engine
  is offered only where the capability probe reports the runtime present
  **and** the user has opted in. Headless/server/CI contexts keep the
  WASM engine; the automation engine reports itself non-operational there
  and the existing automatic fallback applies (ADR-0007).
- **The security module is opt-in.** Registering a permissive file-path
  checker suppresses the automation security prompt, which means the tool
  can read/write files without a per-operation confirmation. This is a
  deliberate relaxation of a safety prompt, so it is **off by default**
  and enabled by an explicit user setting, and it is documented as such.
  The project does **not** redistribute the office vendor's sample
  checker binary; registration is handled by the Python wrapper / a
  setup step against what is already on the host.
- **`operational` flips only when the helper is actually reachable.** The
  capability probe extends from "registered" to "helper handshake
  succeeded", so a registered-but-unreachable runtime still falls back.

### Dispose / error lifetime contract (resolved)

- **Dispose** is process- and handle-scoped: closing a document asks the
  helper to release it; shutting the engine down terminates the helper
  subprocess. `dispose(): Promise<void>` from ADR-0007 maps to a helper
  request, and engine shutdown is guaranteed to reap the subprocess.
- **Errors** cross the IPC boundary as typed JSON and are re-raised on
  the Node side as `RhwpError`s with a category/code, preserving the
  helper's message — the same envelope discipline the WASM path uses via
  `wrapPanic`. A blocked or unresponsive helper surfaces as a typed
  timeout error and triggers fallback, never a hang in the tool caller.

## Drivers

1. Resolve the accuracy pains by reaching the real object model (cell
   geometry, live editing) — only the automation engine can.
2. Reliability: the security-module + lifetime burden is the real cost,
   and a mature Python wrapper already handles it.
3. Preserve the no-install WASM path as the fallback for every context
   the automation engine cannot serve.

## Alternatives considered

- **In-process Node COM bridge.** Rejected as the primary path: it would
  have to reimplement the security-module registration and process/
  session lifetime that the spike showed to be the real difficulty, with
  a less mature ecosystem for exactly that part. The single-stack
  simplicity does not offset reimplementing the hard part.
- **Bundle the vendor's sample checker binary.** Rejected: unclear
  redistribution rights. Registration is delegated to the wrapper / a
  setup step instead.
- **Enable the security bypass by default.** Rejected: it silently
  relaxes a safety prompt. Made opt-in and documented.

## Consequences

### Positive
- The accuracy path (real cell metadata, live editing) becomes
  implementable behind the existing capability gate without touching the
  public tool surface.
- Reliability burden is carried by a battle-tested wrapper rather than a
  hand-rolled bridge.

### Negative
- A Python runtime + wrapper become an optional dependency for the
  automation path. The default WASM path stays Python-free.
- The automation path cannot be validated in headless CI; its tests are
  environment-gated and skip where the runtime/opt-in are absent. Real
  validation happens on the interactive desktop target.

### Neutral
- ADR-0007's abstraction, the public 16-tool surface, and the
  binary-identity gate are unaffected; the WASM engine remains the
  default and the byte-for-byte verdict is unchanged.

## Follow-ups

- Implement the helper + bridge and flip `operational` (engine work).
- Cell-metadata-backed detection through the `getCellMetadata` seam.
- Finished-document generation against institution exemplars.
- Real-form accuracy measurement (Decision Gate 3.0, ADR-0006).

## References

- ADR-0007 (`docs/decisions/0007-engine-abstraction.md`).
- Capability probe: `src/rhwp/engine/capabilities.ts`.
- Engine slot: `src/rhwp/engine/com-engine.ts`.
