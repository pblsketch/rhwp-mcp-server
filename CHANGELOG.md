# Changelog

All notable changes to **rhwp-mcp-server** are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The schema-diff CI guard expects an entry in the **Unreleased** section whenever a public tool's input or output schema changes — mention the affected tool by name (e.g. `hwp_open`, `hwp_preview`) so the guard can clear the diff.

## [Unreleased]

### Added — Phase 4 (skill surface + synthetic-corpus expansion + data-independent surrogate metric)
- New skill surface `src/skill/` (`dispatcher.ts` + `index.ts`) — a thin name → handler dispatcher (`runSkillAction(name, input)`) that lets a host already holding the user's own model/API key drive the same Korean-document actions outside the MCP protocol, no separate subscription. Each of the 16 action names maps 1:1 to the same pure `execute*` handler the MCP tool registration wraps, so the skill path and the MCP path produce identical output for the same input + session. **Zero new business logic** and **no MCP tool is registered** by it — the public tool surface and the schema-diff contract are UNCHANGED. Exposes `listSkillActions()`, `isSkillAction()`, `warmSkillEngine()`, and `UnknownSkillActionError`. Engine warming reuses `ensureEngine()`.
- `package.json` — adds an `exports` map with a `.` entry (the existing server entry) and a `./skill` subpath (`dist/skill/index.js`) so the skill surface is importable as `rhwp-mcp-server/skill`. `main`/`bin` are unchanged; the existing default entry behaviour is preserved.
- `scripts/generate-synthetic-corpus.ts` — adds 5 table-shape cases (`table-label-value`, `table-colon-label`, `table-multirow-header`, `table-stacked-label`, `table-sparse-merge`) alongside the existing 5, exercising the additive cell-discovery heuristics (left/upper neighbor, multi-row header) and a sparse merge-style layout. The 5 original cases are byte-for-byte preserved. `npm run gate:binary-identity` stays PASS on the expanded corpus (10/10; rated < 30 keeps the Sprint 1.5 baseline gate, judgment-deferred mode, not a failure).
- New script `scripts/measure-label-coverage.ts` (`npm run measure:label-coverage`) + report `docs/measurements/label-coverage-delta.md` — the **data-independent surrogate metric**: relative cell-label coverage of the additive heuristics vs the original two-step baseline (left neighbor → header row 0), measured over synthetic table shapes. Records None→Label transitions and a coverage delta. This is a **regression-defence + directionality** signal, NOT an absolute-accuracy claim (absolute accuracy is gated to the real N=30 corpus in a later phase). Verification rules: (a) baseline label values rewritten == 0, (b) None→Label ≥ 0, (c) the delta report artifact exists.
- `tests/integration/skill-surface.test.ts` — drives open → locate_blanks → fill_cells through both the MCP `execute*` handlers and the skill dispatcher and asserts deep-equal results at every step, plus the dispatcher's structural contract (one action per tool name, sorted listing, unknown-name rejection).
- `tests/integration/label-coverage.test.ts` — pins the three surrogate-metric acceptance rules and the accounting identity `current = baseline + none→label` (valid because changed == 0).
- `docs/surfaces/skill.md` — skill-surface usage doc: bring-your-own-model / no-subscription rationale (first-principles), action reference, engine selection. README gains a "표면은 교체 가능합니다" callout linking it.
- No public tool schema changed in Phase 4 — the 16 existing tools keep their exact input/output shapes; `schemas/snapshot.json` is unchanged and `npm run schema:diff` stays clean.

### Added — Engine abstraction Phase 2 (capability surface + host-runtime engine slot)
- `hwp_engine_status` — new read-only tool that reports which document engines are usable on the current host. Output `{ engines: [{ name, status, version?, detail? }], active, fallback_reason? }`. `status` is one of `AVAILABLE | NOT_INSTALLED | NOT_REGISTERED | VERSION_MISMATCH | UNAVAILABLE`. The bundled WASM engine is always `AVAILABLE` (reports `@rhwp/core` version); the host-runtime engine is reported `AVAILABLE` only when its automation surface is detected on Windows, otherwise it reports a structured unavailable status instead of throwing. `active` is the engine automatic selection resolves to right now, and `fallback_reason` explains why a fallback was chosen when the preferred engine is unavailable. Rationale: reliability differs per engine, so the server exposes it as an explicit, queryable capability rather than failing opaquely at call time. Tool count grows 15 → 16 (`ready on stdio (16 tools + hwp_ping)`); `schemas/snapshot.json` regenerated (`hwp_engine_status` added; the 15 existing tool shapes are UNCHANGED).
- New module `src/rhwp/engine/capabilities.ts` — `engineCapabilities()` builds the structured report behind a light, dependency-free environment probe (`probeComRuntime()`): platform check plus presence of the known host office automation registration on Windows. Detection is a total function — every probe step is wrapped so a missing registration, a denied read, or a non-Windows platform yields a structured status, never an exception. No new runtime dependency is added.
- New module `src/rhwp/engine/com-engine.ts` — `ComDocumentEngine` implements the engine-neutral `DocumentEngine` contract as a slot: its document operations raise a typed `RhwpError{category:'other', code:'ENGINE_UNAVAILABLE'}` sourced from the capability probe (the message states why the engine is unavailable on this host). Live document driving via the host runtime is intentionally out of scope for this phase and adds no dependency.
- `src/rhwp/loader.ts` — `ensureEngine` / `getEngine` now apply capability-driven selection: `"auto"` and `"com"` resolve to the host-runtime engine only when it is selectable (capability probe reports `AVAILABLE` AND the engine is `operational`), otherwise they fall back to the bundled WASM engine so a usable handle is always warmed. Because the host-runtime engine is a non-operational slot this phase, automatic selection stays on WASM even where the runtime is detected; the `operational` flag is the single gate, so live driving opening it later needs no further change. `"wasm"` selects WASM explicitly; unknown names throw `UNKNOWN_ENGINE`. The registry now keys engines strictly by concrete name so a handle warmed by `ensureEngine("auto")` is found by `getEngine("auto")`. `DocumentEngine` gains a `readonly operational` flag to mark slots vs. wired engines, and `resolveActiveEngine()` is exported so the capability surface reports the same `active` engine the loader would pick.
- `src/rhwp/types.ts` — adds `EngineStatus`, `EngineCapabilityEntry`, and `EngineCapabilityReport` to type the capability surface.
- `src/rhwp/errors.ts` — adds the `engineUnavailable(engineName, detail)` helper producing the typed `ENGINE_UNAVAILABLE` error used by the host-runtime engine slot.
- vitest smoke tests: `tests/smoke/engine_status.test.ts` — covers the WASM-always-AVAILABLE path, the host-runtime probe branches (`AVAILABLE` / `NOT_INSTALLED` / `NOT_REGISTERED` / `UNAVAILABLE` via an injectable probe override), `active` + `fallback_reason` resolution, and that the tool returns a structured report rather than throwing on an unavailable engine.

### Added — Sprint 3.5 (private-beta release prep)
- **Codex CLI + Antigravity CLI setup guides** — `docs/setup/codex-cli.md` (OpenAI Codex: `codex mcp add rhwp -- rhwp-mcp` one-liner + `~/.codex/config.toml` `[mcp_servers.rhwp]` table, Windows `cmd /c npx` note, troubleshooting) and `docs/setup/antigravity-cli.md` (Google Antigravity: shared `~/.gemini/config/mcp_config.json` `mcpServers` object, strict-JSON gotchas, CLI+IDE shared config, GUI access path). README Quick start gains Codex and Antigravity subsections and the intro now lists both alongside Claude Desktop / Code / Cursor — any stdio-speaking MCP client works. Config syntax verified against the current OpenAI Codex MCP docs and the Google Cloud Antigravity MCP configuration guide.
- **First-tester onboarding fix** — README and all three `docs/setup/*.md` files now state explicitly that `npm install -g rhwp-mcp-server@beta` is only step 1 and that the MCP client (Claude Code / Desktop / Cursor) needs a separate registration step. README Quick start restructured into a "two steps" pattern that splits install from register. `docs/setup/claude-code.md` adds the `claude mcp add rhwp -- rhwp-mcp` one-liner as the primary path (settings.json edit becomes Option B). Each setup doc carries a callout that "install ≠ register", since this was the most common first-tester confusion observed during the v0.1.0-beta.1 ship.
- **Version bump** — `0.1.0-alpha.0` → `0.1.0-beta.1`. Updated in `package.json` and `src/server.ts` (`PKG_VERSION`). The next `npm publish --tag beta` (run by the maintainer with their own credentials) will release the v0.1 surface as a private beta.
- README.md — full rewrite reflecting the v0.1.0-beta.1 state: 15 tools across Form filling (5), Authoring (4), Document I/O (5), Hardened I/O (1), Catalog (2). Drops Sprint 0 stub language ("NOT_IMPLEMENTED", "10 tools") and `hwp_preview` references. Adds typed-error envelope examples, the 6-ADR table, and three persona-example entry points.
- `docs/setup/claude-desktop.md` — config path per OS, npx vs global install, verify-with-`hwp_ping`, logs location, troubleshooting (tool not available / WASM warm timeout / mojibake / Node-too-old).
- `docs/setup/cursor.md` — MCP panel + JSON path, Composer verification, project cwd note, logs, troubleshooting.
- `docs/setup/claude-code.md` — settings.json registration, `/mcp` inspection, `--allowed-tools` headless mode, project `CLAUDE.md` template hint, allowlist troubleshooting.
- `docs/persona-examples/form-automation.md` — end-to-end 35-cell 이력서 fill on the real school form that drove Sprint 2.6 / 2.6.1 (no 누름틀 → `hwp_locate_blanks` + `hwp_fill_cells`, merged cells, label-vs-coordinate fallback). Decision tree for field vs cell families. Documented limits.
- `docs/persona-examples/authoring.md` — 가정통신문 from blank: title with Sprint 2.7 char-format chain (`hwp_insert_text` + `style: {font_size, bold, color}`), body via `hwp_apply_action(insertText/applyCharFormat)` for non-(0,0,0), schedule table, signature. ADR-0005 cross-link.
- `docs/persona-examples/compat.md` — base64 wire transit (validated variant default, `expected_bytes` + `expected_crc32`), HWP ↔ HWPX conversion, binary-identity audit via the gate, typed-error reference table. ADR-0002 / 0003 / 0006 cross-links.
- `docs/release/private-beta-program.md` — program shape, eligibility, feedback form template (markdown), maintainer / tester commitments, confidentiality, publish commands. Three "Outstanding maintainer choices" stubs flagged: feedback channel, recruitment outreach, public-release criteria.

Sprint 3.5 ships docs + version bump. **npm publish itself is deferred to the maintainer's own run** because the credentials live with them. The publish command sequence is documented in `docs/release/private-beta-program.md` §"Publishing the beta".

### Added — Sprint 3 (Pass A round-trip + Decision Gate 3.0 structure)
- `scripts/corpus-runner.ts` — adds **Pass A (field round-trip)** as a peer of the existing Pass B (binary identity). For each corpus file: open → `getFieldList` → fill every field with a deterministic synthetic value (`value-N` by index) → `exportHwp`/`exportHwpx` (preserves source format) → reopen → re-fetch field list → verify field-name set + per-field value round-trip. Documents with zero form fields skip Pass A with reason `no fields` (counted as `skip`, not `fail`).
- `scripts/corpus-runner.ts` — combined per-case verdict: PASS when at least one pass passes and neither fails; FAIL when either pass fails; SKIP when both passes skip. Combined-fail surfaces the offending pass's `failReason` verbatim.
- `scripts/corpus-runner.ts` — Pass B reserved for HWP 5.0 sources; `.hwpx` sources skip Pass B with reason `Pass B reserved for HWP 5.0 sources (ADR-0002, ADR-0006)`. Pass A is format-agnostic and uses the source format for its re-export.
- `scripts/corpus-runner.ts` — corpus discovery widened to `.hwp` + `.hwpx` under `corpus/synthetic/`, `corpus/forms/`, `corpus/private/`. Source format auto-detected from the extension (with PK magic-byte fallback).
- `scripts/corpus-runner.ts` — **threshold auto-escalates with rated corpus size**. When `rated total < 30`, the gate keeps the Sprint 1.5 baseline label and ≥ 90% threshold; when `rated total ≥ 30`, the gate flips to "Sprint 3 Decision Gate 3.0 (Pass A + Pass B combined)" with ≥ 95%. Threshold change is purely data-driven so the small-N pre-release iteration doesn't trip the stricter bar.
- `scripts/corpus-runner.ts` — rate denominator excludes skips (`passRate = pass / (pass + fail)`). Skipped cases are reported in the summary but carry no signal in either direction. Wilson 95% CI is computed against the rated denominator too. Documented in ADR-0006 §4.
- `scripts/corpus-runner.ts` — pure functions (`runPassA`, `runPassB`, `combine`, `selectThreshold`, `tryParseVerify`) are exported alongside the runtime entry point, and the `main()` execution is gated behind an `invokedDirectly` check so `npm run gate:binary-identity` still works while `tests/integration/corpus-passes.test.ts` can import the same functions without re-running the gate.
- `tests/integration/corpus-passes.test.ts` — locks Pass A's skip path on a synthetic blank doc, the full `combine()` truth table from ADR-0006 §2 (7 cases), and the `selectThreshold()` escalation behavior at the N=30 boundary (rated 0 / 1-29 / 30 / 31+).
- New ADR-0006 (`docs/decisions/0006-decision-gate-3.md`, Accepted — decision structure) — records the Pass A contract, the combine truth table, the HWP-5.0 / HWPX scope split for Pass B, the skip-excluded denominator policy, the threshold-escalation policy, and a verdict placeholder pending N=30 corpus delivery.
- New measurement report `docs/measurements/sprint-3-corpus-results.md` — captures the current Sprint 1.5 synthetic baseline (5/5 PASS at 100%, Sprint 1.5 90% threshold applied because rated < 30) plus an empty N=30 table to fill once the real corpus lands.
- Per-case stdout now shows `(A=…, B=…)` alongside the combined verdict so humans can see which contract carried (or broke) each case.

Sprint 3 B1 (this entry) ships the code infrastructure. **B2 — N=30 real-corpus delivery + Decision Gate 3.0 PASS verdict — is deferred** to a follow-up session once the user drops `.hwp`/`.hwpx` files into `corpus/forms/` per `corpus/SOURCES.md`. The current synthetic baseline (5/5 PASS at 100%) continues to pass the Sprint 1.5 baseline gate.

### Changed — Sprint 2.7 (hwp_insert_text char format now applied)
- `hwp_insert_text` — the `style` parameter (font_size, bold, italic, underline, color, font_family) is no longer accepted-then-ignored. When provided, `executeHwpInsertText` now chains `applyCharFormat(0, 0, 0, text.length, props_json)` after `insertText` so the inserted range carries the requested char shape — eliminating the manual `hwp_apply_action(applyCharFormat)` chained-call burden surfaced by the 가정통신문 authoring use case (Sprint 2.5/2.6 실증). Behavior when `style` is omitted is byte-identical to v0.1.0 (no rhwp char-format call, identical return value).
- Mapping (StyleSchema → rhwp char-format props_json): `font_size` pt → `fontSize` HWPUNIT (pt × 100); `bold` / `italic` / `underline` pass-through booleans; `color` `#RRGGBB` → `textColor`; `font_family` → `fontFamily`. Fields omitted from input are omitted from the JSON blob — never sent as null. Explicit `false` on bold/italic/underline is forwarded to rhwp to override an inherited true. Documented in ADR-0005.
- `HwpInsertTextInput` zod shape is UNCHANGED (no fields added/removed/widened). `schemas/snapshot.json` is regenerated to reflect the description-text update; this entry's mention of `hwp_insert_text` clears the schema-diff CI guard.
- Surfaces a typed `RhwpError{category:'action', code:'APPLY_CHAR_FORMAT_FAILED'}` if rhwp rejects the char-format JSON, preserving rhwp's message — no opaque WASM trap escapes.
- New script `scripts/probe-char-format.ts` (`npm run probe:char-format`) and report `docs/measurements/rhwp-char-format.md` lock in the runtime-verified rhwp 0.7.13 char-format key set ({fontSize, bold, italic, underline, textColor, fontFamily}) that the mapping targets.
- New ADR-0005 (`docs/decisions/0005-char-format-contract.md`, Accepted) — records the decision, mapping table, unit convention (pt × 100), end-offset semantics (JS string length tracks rhwp char_offset for BMP text), why set_paragraph_style was not similarly retrofitted (different rhwp method, different category), and consequences for v0.2.

### Removed — Sprint 3 prep (hwp_preview deferred to v0.2)
- `hwp_preview` removed from the v0.1 tool surface. Tool count 16 → **15** (`ready on stdio (15 tools + hwp_ping)`). ADR-0001 rewritten to record the decision: MCP image content does not render inline in Claude Desktop today (collapsed inside the tool-use accordion — confirmed by `anthropic-sdk-python#1329` and sibling issues), and the Excalidraw-style inline preview uses a separate experimental EmbeddedResource ("MCP Apps") channel that is out of v0.1 scope.
- Deleted `src/tools/preview.ts`. Removed import + registration from `src/server.ts`. Stripped `hwp_preview` entries from `scripts/_shared/schemas.ts`, `scripts/measure-tool-tokens.ts`, and `src/tools/open.ts`' description list. `schemas/snapshot.json` regenerated.
- `TOOL_COUNT` in the shared schemas helper is now `15`.
- Sprint 3 work that was gated on `hwp_preview` (renderer probe, ADR-0001 acceptance) is closed out; freed budget moves to corpus N=30 expansion for Decision Gate 3.0.

### Fixed — Sprint 2.6.1 (Real-form robustness)
- `src/rhwp/tables.ts` — `getCellText` now wraps `doc.getTextInCell` in `try/catch` and returns `""` on rhwp panic. Real Korean forms contain merged/hidden cells that rhwp's `getTextInCell` may refuse with a per-cell panic; previously the locate_blanks walker aborted on the first such cell. The cell is still reported as blank with `current_text=""` so callers can still address it by coordinate.
- `src/tools/fill_cells.ts` — `executeHwpFillCells` now checks `cellIndex(row, col) < table.cell_count` before calling `insertTextInCell`. Merged cells collapse multiple logical `(row, col)` tuples into one canonical `cell_idx`, so the linear `row * col_count + col` formula can over-shoot. Surfaces as `skipped[{reason:"out_of_range"}]` so the rest of the map still processes.
- `src/tools/locate_blanks.ts` — same `cellIndex >= cell_count` guard in the walker so the row/col iteration doesn't report ghost blanks for cells that don't actually exist in merged-cell tables.
- All three changes implement the ADR-0004 §"Known limits #2 (merged cells)" mitigation discovered during real-resume testing (35-cell form with 3 merged-cell skips).

### Added — Sprint 2.6 (Cell-based fill + base64 integrity)
- `hwp_locate_blanks` — table-cell counterpart of `hwp_list_fields`. Walks every body table, reports cells whose text is empty after trim, suggests a label via `inferCellLabel` (left-neighbor → header-row → null). Output `{ blanks: [{ table_idx, row, col, suggested_label, current_text, coords: { section_idx, parent_para_idx, control_idx, cell_idx } }], total, table_count }`. Use BEFORE `hwp_fill_cells` when the cell layout isn't known. Does NOT mutate the document.
- `hwp_fill_cells` — table-cell counterpart of `hwp_fill_fields`. Fills cells by `'row,col'` coordinate OR by label (matched against `inferCellLabel`, case-insensitive + whitespace-normalized). Unresolvable keys land in `skipped[]` with a typed reason (`unknown_label` / `out_of_range` / `coord_format` / `no_table`); the rest of the map still processes — never abort-on-first-failure.
- `hwp_open_base64_validated` — hardens `hwp_open_base64` with explicit length + CRC32 integrity checks BEFORE the bytes reach rhwp. Input gains optional `expected_bytes` and `expected_crc32` (number or hex string both accepted). Wire corruption surfaces as a typed `parse/BAD_LENGTH` or `parse/BAD_CHECKSUM` with actual-vs-expected values instead of a WASM panic. CRC32 uses Node 20+'s built-in `zlib.crc32` (no new dependency, zlib polynomial 0xEDB88320).
- New module `src/rhwp/tables.ts` — shared `findAllTables`, `getCellText`, `cellIndex`, `inferCellLabel`. Reused across the two cell-based tools so the matrix walk + label heuristic has one canonical implementation.
- New ADR-0004 (`docs/decisions/0004-cell-based-fill.md`, Accepted) — documents why cell-fill is a peer of field-fill (not a replacement), the left-neighbor-first label heuristic, the `(sec, para, control_idx=0)` table-enumeration convention, and the v0.1.6 known limits (merged cells, header/footer tables, nested tables, multi-control paragraphs).
- Triggered by user-reported scenario: a real Korean 학교/관공서 résumé form had no 누름틀, `hwp_list_fields` returned `[]`, and the same 35 KB payload also corrupted on base64 wire transit, triggering a WASM panic.

### Changed — Sprint 2.6 DRY cleanup
- `scripts/_shared/schemas.ts` — new module holding the SINGLE 16-tool `liveSchemas()` definition. `scripts/schema-snapshot.ts` and `scripts/schema-diff.ts` both import it instead of maintaining duplicate tool lists. Closes the architect-noted DRY violation deferred from Sprint 2.5.
- `src/server.ts` — registers the three Sprint 2.6 tools; ready message updates from `13 tools + hwp_ping` to `16 tools + hwp_ping`.
- `schemas/snapshot.json` — `tool_count_expected` grows to 16 (3 entries added, 13 v0.1 / Sprint 2.5 shapes UNCHANGED). Acknowledged here: `hwp_locate_blanks`, `hwp_fill_cells`, `hwp_open_base64_validated`.
- `src/rhwp/types.ts` — `HwpDocumentLike` gains `getTableDimensions`, `getTextInCell`, `getParagraphCount`, `getSectionCount` to back the new helpers (catch-all index signature still covers everything else).
- `src/tools/open_base64.ts` — `decodeBase64Strict` exported so `hwp_open_base64_validated` can reuse the same strict round-trip without duplicating the implementation.

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
