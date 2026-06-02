# Changelog

All notable changes to **rhwp-mcp-server** are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The schema-diff CI guard expects an entry in the **Unreleased** section whenever a public tool's input or output schema changes — mention the affected tool by name (e.g. `hwp_open`, `hwp_preview`) so the guard can clear the diff.

## [Unreleased]

### Added — Sprint 1 (Form Filling vertical)
- Real `@rhwp/core` `HwpDocument` calls behind the four Form Filling tools — `hwp_open`, `hwp_save_as`, `hwp_list_fields`, `hwp_fill_fields` no longer throw `NOT_IMPLEMENTED`.
- `hwp_open` loads a `.hwp`/`.hwpx` file via `new HwpDocument(bytes)`, cross-checks the format against the file extension, and parks the doc in `SessionStore`. Returns `{ ok, format, page_count }`.
- `hwp_save_as` serializes the open doc via `exportHwp()` / `exportHwpx()` and atomic-writes (temp + rename) to the target path. HWPX remains the default; HWP is best-effort in v0.1.
- `hwp_list_fields` parses `getFieldList()` JSON, drops nameless entries (with stderr breadcrumb), and maps rhwp `fieldType` → MCP `type`, rhwp `value` → MCP `current_value` (null when empty).
- `hwp_fill_fields` pre-fetches the known field set with a single `getFieldList()` call, routes unknown names to `skipped` (no throw), and only invokes `setFieldValueByName` for known names. Failed `ok:false` responses surface as a typed `field/FILL_FAILED` error including the rhwp message.
- `src/rhwp/types.ts` declares the narrow `HwpDocumentLike` / `RhwpModuleLike` / `RhwpFieldEntry` / `RhwpSetFieldResult` interfaces used by the four tools. `SessionStore` is now typed against `HwpDocumentLike` instead of `unknown`.
- vitest smoke tests for each of the four tools (`tests/smoke/{open,save_as,list_fields,fill_fields}.test.ts`) plus a process-cached HWPX fixture generator (`tests/setup/fixture.ts`) that uses `HwpDocument.createEmpty().exportHwpx()`.
- `vitest.config.ts` (forks pool, 15 s timeout) so the WASM cache doesn't leak between test files.
- Each tool module now also exports a pure `executeHwpXxx(input)` handler alongside `registerHwpXxx(server)` so tests can run the handler without spinning up an MCP server.

### Added — Sprint 0 scaffolding
- Sprint 0 scaffolding: package.json, tsconfig.json (strict NodeNext ESM), MCP server entry on stdio (`src/server.ts`), single-document `SessionStore`, WASM warm-on-start loader, panic-to-Result error adapter (`RhwpError`).
- 10 tool stub modules with locked zod input/output schemas: `hwp_open`, `hwp_save_as`, `hwp_list_fields`, `hwp_fill_fields`, `hwp_insert_text`, `hwp_create_table`, `hwp_set_paragraph_style`, `hwp_preview`, `hwp_apply_action`, `hwp_list_actions`. All handlers currently throw `NOT_IMPLEMENTED`.
- `hwp_ping` smoke tool (returns text "pong").
- Schema snapshot baseline (`schemas/snapshot.json`) plus regenerator (`scripts/schema-snapshot.ts`) and CI drift guard (`scripts/schema-diff.ts`).
- Token-budget measurement (`scripts/measure-tool-tokens.ts`, threshold 8 000 tokens).
- rhwp Field API probe (`scripts/probe-rhwp-fields.ts`) — Sprint 0 step 9; resolves spec Open Q5.
- CI workflows: `ci.yml` (Node 20/22 × Win/macOS/Linux matrix + WASM warm assertion), `schema-diff.yml`, `catalog-drift.yml` (Sprint 2 placeholder), `upstream-drift.yml` (weekly cron auto-opens info issue when @rhwp/core has a newer release than the pinned version).
- Documentation skeletons: README, architecture, SECURITY, ADR template, image-renderer ADR (DEFERRED), `corpus/SOURCES.md`.

### Changed
- _Nothing yet — pre-1.0._

### Deprecated / Removed / Fixed / Security
- _Nothing yet._

---

## Format note

When a release is cut, this section is renamed to its version + date heading, e.g.:

```
## [0.1.0] — 2026-08-DD

### Added
- ...
```

A fresh empty **Unreleased** block is then started.
