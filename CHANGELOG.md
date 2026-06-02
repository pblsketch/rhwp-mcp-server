# Changelog

All notable changes to **rhwp-mcp-server** are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The schema-diff CI guard expects an entry in the **Unreleased** section whenever a public tool's input or output schema changes — mention the affected tool by name (e.g. `hwp_open`, `hwp_preview`) so the guard can clear the diff.

## [Unreleased]

### Added
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
