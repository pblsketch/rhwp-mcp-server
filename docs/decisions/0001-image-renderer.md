# ADR-0001: Image renderer choice for `hwp_preview`

- **Status:** DEFERRED (Sprint 0 step 7) — decided once `scripts/probe-renderer.ts` returns
- **Date:** 2026-06-02
- **Decision drivers:**
  1. Cross-platform install success (Windows ARM, macOS arm64, Linux x64)
  2. Bundle / install footprint when installed as a transitive dep of `rhwp-mcp-server`
  3. PNG resize performance on N = 3 sample documents

## Context

`hwp_preview` returns a PNG ≤ 1024 px (longest edge) as a base64 inline MCP image content item. rhwp's Canvas/PNG export may already produce a PNG buffer of arbitrary size; we need a renderer to resize that buffer down to the 1024 px cap.

Two candidates from Sprint 0 step 7:

### Option A — `sharp`
- Pros:
  - Ubiquitous; very fast (libvips bindings).
  - Excellent quality controls.
- Cons:
  - Prebuilt native binaries are platform-specific; historically Windows ARM and some Apple Silicon configurations have had install failures (Risk R9 in the plan).
  - ≈ 30–100 MB install size depending on platform.

### Option B — `@resvg/resvg-js`
- Pros:
  - Pure WASM — installs identically on every platform; no native binary risk.
  - Smaller install size.
- Cons:
  - SVG-focused; raster resize support is more limited.
  - Slightly slower for pure raster pipelines.

### Option C — rhwp already emits the resized PNG
- Pros: zero extra dependency.
- Cons: depends on rhwp Canvas API — only viable if the probe confirms rhwp supports configurable PNG output size.

## Decision

DEFERRED until `scripts/probe-renderer.ts` runs on Windows ARM + macOS arm64 + Linux x64 and reports install success rate (≥ 90 % on each cell required) plus per-doc resize timing. Decision recorded here once data is in.

## Consequences

- Sprint 3 (`hwp_preview` implementation) is gated on this decision but can proceed using Option C as a placeholder if probe is inconclusive.
- The chosen renderer is added to `package.json` dependencies during the ADR-accept PR.

## Follow-ups

- [ ] Run `scripts/probe-renderer.ts` (Sprint 0 step 7).
- [ ] Update this ADR with probe data and accepted option.
- [ ] Update `package.json` and CHANGELOG.

## References

- Plan: `.omc/plans/plan-rhwp-mcp-mvp.md` § Sprint 0, R9, R10.
