# Changelog

All notable changes to **rhwp-mcp-server** are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The schema-diff CI guard expects an entry in the **Unreleased** section whenever a public tool's input or output schema changes — mention the affected tool by name (e.g. `hwp_open`, `hwp_preview`) so the guard can clear the diff.

## [Unreleased]

### Added — Sprint 2 (Authoring vertical)
- Real `@rhwp/core` `HwpDocument` calls behind the five Authoring tools — `hwp_insert_text`, `hwp_create_table`, `hwp_set_paragraph_style`, `hwp_apply_action`, `hwp_list_actions` no longer throw `NOT_IMPLEMENTED`.
- `hwp_insert_text` maps to `HwpDocument.insertText(0, 0, 0, text)` (document start). The `style` parameter is accepted for forward compatibility but ignored in v0.1 — use `hwp_set_paragraph_style` or `hwp_apply_action` with `applyCharFormat` for explicit style application.
- `hwp_create_table` maps to `HwpDocument.createTable(0, 0, 0, rows, cols)` and, when `data` is supplied, fills each non-empty cell via `insertTextInCell` using the `paraIdx`/`controlIdx` returned by `createTable`. Mismatched data shape raises `BAD_DATA_SHAPE` before any WASM call.
- `hwp_set_paragraph_style` builds a `props_json` blob from the input style and calls `HwpDocument.applyParaFormat(0, 0, propsJson)`. Failed `ok:false` returns surface as a typed `action/APPLY_FORMAT_FAILED` error.
- `hwp_apply_action` is the generic dispatcher — it looks up the action in `ACTIONS`, validates `params` via zod (`BAD_PARAMS` on mismatch), throws `UNKNOWN_ACTION` for missing names, and forwards to the catalog `invoke` function inside `wrapPanic('action')`.
- `hwp_list_actions` returns the catalog (name, category, description, params_schema as JSON Schema). Default category `all`; supported filters: `text`, `table`, `paragraph`, `header_footer`, `page`, `field`, `image`, `math`, `style` (legacy alias for `paragraph`), `chart` (reserved, empty in v0.1).
- Coordinate-defaulting choice: the four mutating Authoring tools hard-code `(section_idx=0, para_idx=0, char_offset=0)` because the locked zod schemas do not expose coordinates. `hwp_apply_action` is the escape hatch for explicit coordinates (it accepts `insertText`, `createTable`, `applyParaFormat`, etc. with full coordinate params per the action's schema).
- New module `src/rhwp/actions.ts` — typed catalog of 35 curated rhwp actions across text/table/paragraph/header_footer/page/field/image/math/other categories. Exposes `ACTIONS`, `getActionByName`, `listActions`, and a `validateCatalog()` self-check.
- New module `src/rhwp/catalog-manifest.json` — serialized snapshot of the catalog pinned to `@rhwp/core 0.7.13` (matches the `package.json` pin). Contains `{rhwpCoreVersion, generatedAt, actionCount, actions: [{name, category, description, params_schema}]}` with JSON Schema bodies generated via `zod-to-json-schema`.
- New script `scripts/generate-catalog-manifest.ts` — regenerator wired as `npm run generate:catalog-manifest`. Used by the `catalog-drift.yml` CI workflow to detect undocumented catalog changes.
- `HwpDocumentLike` widened with the Sprint 2 Authoring methods (`insertText`, `insertTextInCell`, `createTable`, `applyParaFormat`, `searchAllText`) plus a `[method: string]: unknown` catch-all so `hwp_apply_action` can dispatch any rhwp method by name without further re-declarations.
- vitest smoke tests for each of the five tools (`tests/smoke/{insert_text,create_table,set_paragraph_style,apply_action,list_actions}.test.ts`) plus an `openBlankAuthoringDocument()` helper in `tests/setup/fixture.ts` that bootstraps a section via `HwpDocument.createEmpty()` + `createBlankDocument()` (the static `createEmpty` alone has 0 sections and is unusable for Authoring).

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
