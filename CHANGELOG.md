# Changelog

All notable changes to **rhwp-mcp-server** are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The schema-diff CI guard expects an entry in the **Unreleased** section whenever a public tool's input or output schema changes — mention the affected tool by name (e.g. `hwp_open`, `hwp_preview`) so the guard can clear the diff.

## [Unreleased]

### Added — Sprint 2.5 (Remote-friendly tools)
- `hwp_open_blank` — bootstrap a blank document into the SessionStore with no filesystem path. Internally calls `HwpDocument.createEmpty()` + `createBlankDocument()` (same path Sprint 1.5's gate exercises). Returns `{ ok, format: 'hwpx', page_count }`.
- `hwp_open_base64` — load a document from a base64-encoded byte string. Input `{ bytes_base64, format? }`, output `{ ok, format, page_count, bytes_in }`. Auto-detects format via `getSourceFormat()` when the hint is omitted. Strict base64 validation throws `parse/BAD_BASE64` on garbage characters and on zero-byte decodes (e.g. padding-only input).
- `hwp_save_as_base64` — serialize the currently-open document and return the bytes as a base64 string. Input `{ format: 'hwp' | 'hwpx' }` (explicit, no default), output `{ ok, format, bytes_base64, bytes_written }`. `bytes_written` is the BINARY count (before base64 encoding) for client-side size checks.
- Tool count grows from 10 → 13. `schemas/snapshot.json` gains 3 entries; the 10 v0.1 shapes stay untouched (per plan §3 spec lock — additions are allowed, modifications are not until private-beta sign-off).
- `src/server.ts` ready message now reads `13 tools + hwp_ping`.
- New ADR: `docs/decisions/0003-base64-tools.md` (Accepted). Documents why we add the base64 contract WITHOUT deprecating the path tools — base64 is for clients where the MCP host and the client do not share a filesystem (Claude Web/Mobile, MCP-over-HTTP brokers, sandboxed agents). For local clients the path tools remain preferred (no ~33% wire overhead, no document bytes in LLM context).
- vitest smoke tests: `tests/smoke/{open_blank,open_base64,save_as_base64}.test.ts`. The `open_base64` suite covers the round-trip happy path (open_blank → save_as_base64 → open_base64 → identical page count + byte length), automatic format detection when the hint is omitted, and the `BAD_BASE64` / `EMPTY_INPUT` negative paths.
- Triggering scenario: user reported that Claude Web could not reach the Windows host's filesystem while attempting to author a school 가정통신문. The new tools unblock that environment end-to-end.

### Added — Sprint 1.5 (Binary-Identity Save Gate)
- `scripts/corpus-runner.ts` — Pass B runner. Walks `corpus/synthetic/`, `corpus/forms/`, `corpus/private/`, opens each `.hwp` via `new HwpDocument(bytes)`, calls `exportHwpVerify()` to inspect `{bytesLen, pageCountBefore, pageCountAfter, recovered}`, round-trips through `exportHwp()` + re-open + second `exportHwpVerify`, and emits a per-case PASS/FAIL record. Computes pass rate + Wilson 95% CI + bonus `strictByteEqual` and `whitelistMatched` signals. Exits 0 on pass / 2 on fail / 0 on empty corpus (with NOTE).
- `scripts/generate-synthetic-corpus.ts` — deterministic generator for 5 synthetic cases (`blank`, `text-only`, `table-only`, `paragraph-style`, `mixed`) so the gate runs from a fresh clone without any external corpus dependency. Wired as `npm run corpus:generate`.
- `corpus/identity-whitelist.json` (v1) — documented metadata diffs allowed during byte-compare: DocInfo timestamp, generator string, document UUID, section metadata, OLE2 compression framing. v0.1.5 policy treats successful re-import as a whitelist match; per-stream byte diff is deferred to v0.2 (tracked in ADR-0002).
- `corpus/README.md`, `corpus/private/.gitignore`, `corpus/private/README.md` — corpus layout (synthetic + forms + private), with `corpus/private/` excluded from version control so users can drop confidential `.hwp` files locally and the runner picks them up automatically.
- `docs/decisions/0002-binary-save-fallback.md` — ADR-0002 (Accepted). Defines the Pass B criteria, records the v1 baseline measurement (5/5 pass on synthetic, 100.0%, Wilson 95% [56.6%, 100.0%]), and locks the fallback policy (HWPX-only Option α or pure Option D) if a future measurement falls below the 90% threshold.
- `docs/measurements/binary-identity-results.md` (v1) — measurement report with per-case verify shapes and reproduction commands.
- `scenarios/05-hwp-identity-roundtrip.md` — 호환성 persona narrative showing the gate output and per-case evidence customers can hand to QA.
- `tests/integration/binary-identity.test.ts` — in-process vitest probe that exercises the round-trip on a synthesized blank document plus a text+table+style edit, asserting `recovered=true` + page-count parity + verify-report shape. Catches regressions on rhwp version bumps inside `npm test`.
- `.github/workflows/binary-identity.yml` — CI workflow running `npm run corpus:generate` → `npm run gate:binary-identity` on push, PR, and weekly cron; uploads `corpus-report.json` as a build artifact.
- New npm scripts: `npm run corpus:generate` (regenerate synthetic corpus) and `npm run gate:binary-identity` (run Pass B).
- **Decision Gate 1.5 verdict: PASS.** rhwp 0.7.13 produced a deterministic byte stream on all 5 synthetic cases (`strictByteEqual=true`, no DocInfo timestamp drift observed). Sprint 2 already shipped; this ADR formalizes the baseline.

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
