# rhwp-mcp-server

> MCP server for Korean HWP / HWPX documents — read, fill form fields, fill cells, author new docs, base64 round-trip — powered by [@rhwp/core](https://github.com/edwardkim/rhwp) (Rust + WebAssembly).

**Status:** `0.1.0-beta.1` — private-beta release prep. 15 tools wired to real
`@rhwp/core` calls, 66 vitest cases passing, binary-identity gate 5/5 PASS on
the synthetic baseline. See [`CHANGELOG.md`](./CHANGELOG.md) for the full
Sprint 1 → 3 trail.

---

## What this is

An [MCP](https://modelcontextprotocol.io) server that lets an LLM (Claude
Desktop, Claude Code, Cursor, Codex CLI, Antigravity CLI, Claude Web/Mobile
via base64) work with Korean `.hwp` and `.hwpx` files natively. Any
MCP-compliant client that speaks stdio can use it. The design balances
**three personas** equally — none is the headline:

1. **공공기관·HR·총무 자동화 (Form Filler)** — bulk-fill 한컴 양식 (이력서 / 공문 / 계약서 / 가정통신문) from structured data. **누름틀** and **table-cell** layouts both supported.
2. **지식 노동자 / 개발자 (Document Editor)** — author new HWP / HWPX documents top-down: title, body, tables, styled char shape, paragraph layout. No 한컴오피스 license required.
3. **호환성 민감 사용자 (Hancom Bridge)** — read/write HWP ↔ HWPX safely on machines without 한컴오피스 installed. Includes a binary-identity save gate (ADR-0002) so round-trips are auditable.

## Quick start

Setup is **two steps**: install the package **and** register it with your MCP
client. `npm install` alone does NOT make Claude Code / Claude Desktop /
Cursor see the server — registration is a separate step. Pick your client:

### Claude Code (one line)

```bash
npm install -g rhwp-mcp-server@beta
claude mcp add rhwp -- rhwp-mcp
```

Verify: `claude mcp list` should show `rhwp ... ✓ Connected`.

Want to skip the global install and let npx fetch on each launch?

```bash
claude mcp add rhwp -- npx -y rhwp-mcp-server@beta
```

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
adding the `rhwp` entry under `mcpServers`:

```jsonc
{
  "mcpServers": {
    "rhwp": {
      "command": "npx",
      "args": ["-y", "rhwp-mcp-server@beta"]
    }
  }
}
```

Then **quit Claude Desktop fully** (Cmd+Q on macOS, right-click tray → Quit
on Windows) and relaunch — Claude Desktop only re-reads the config on cold
start.

### Cursor

Edit `%USERPROFILE%\.cursor\mcp.json` (Windows) or `~/.cursor/mcp.json`
(macOS / Linux) with the same JSON block. Restart Cursor fully.

### Codex CLI (OpenAI, one line)

```bash
npm install -g rhwp-mcp-server@beta
codex mcp add rhwp -- rhwp-mcp
```

Or, skipping the global install: `codex mcp add rhwp -- npx -y rhwp-mcp-server@beta`.
Verify with `codex mcp list`.

### Antigravity CLI (Google)

Edit the shared config at `~/.gemini/config/mcp_config.json` (Windows:
`%USERPROFILE%\.gemini\config\mcp_config.json`) with the same `mcpServers`
JSON block, then restart Antigravity. The config is shared across the
Antigravity CLI and IDE. Note: strict JSON only — no comments.

Full per-client setup, troubleshooting, and verification:
- [`docs/setup/claude-code.md`](./docs/setup/claude-code.md)
- [`docs/setup/claude-desktop.md`](./docs/setup/claude-desktop.md)
- [`docs/setup/cursor.md`](./docs/setup/cursor.md)
- [`docs/setup/codex-cli.md`](./docs/setup/codex-cli.md)
- [`docs/setup/antigravity-cli.md`](./docs/setup/antigravity-cli.md)

Once configured, try:

- *"이력서 양식 `~/Documents/resume.hwp`에 이 정보로 채워줘."* → `hwp_open` → `hwp_list_fields` / `hwp_locate_blanks` → `hwp_fill_fields` / `hwp_fill_cells` → `hwp_save_as`.
- *"가정통신문 초안 만들어줘. 빈 문서에서 시작."* → `hwp_open_blank` → `hwp_insert_text` (with `style`) → `hwp_create_table` → `hwp_save_as`.
- *"이 base64 .hwp를 .hwpx로 변환해줘."* → `hwp_open_base64_validated` → `hwp_save_as_base64` (format: hwpx).

End-to-end walkthroughs per persona live under
[`docs/persona-examples/`](./docs/persona-examples/):
- [`form-automation.md`](./docs/persona-examples/form-automation.md) — 35-cell 이력서 fill on a real school form.
- [`authoring.md`](./docs/persona-examples/authoring.md) — 가정통신문 with title style, body paragraphs, attendee table.
- [`compat.md`](./docs/persona-examples/compat.md) — base64 wire transit + binary-identity gate.

## Tools — 15 + `hwp_ping`

### Form filling (5)

| Tool | Purpose |
| --- | --- |
| `hwp_list_fields` | Enumerate 누름틀 form-field controls (name, type, current value). |
| `hwp_fill_fields(map)` | Bulk-fill 누름틀 by name. Unknown names → `skipped`. |
| `hwp_locate_blanks` | Enumerate empty table cells with a suggested label (left-neighbor → header-row). |
| `hwp_fill_cells(map)` | Fill table cells by `'row,col'` or by inferred label. Unresolvable keys → typed `skipped` reason. |
| `hwp_apply_action(name='setFieldValueByName', …)` | Escape hatch — call any rhwp field API by name. |

### Authoring (4)

| Tool | Purpose |
| --- | --- |
| `hwp_insert_text(text, style?)` | Insert text at document start with optional char-level style (font_size pt, bold, italic, underline, color, font_family). See ADR-0005. |
| `hwp_create_table(rows, cols, data?)` | Insert a table, optionally pre-filled cell-by-cell. |
| `hwp_set_paragraph_style(style)` | Apply paragraph-level layout (alignment, indent, line spacing). |
| `hwp_apply_action(name, params)` | Generic dispatcher — call any rhwp action with explicit coordinates (35 catalog entries across text / table / paragraph / header_footer / page / field / image / math / other). |

### Document I/O (5)

| Tool | Purpose |
| --- | --- |
| `hwp_open(path)` | Open .hwp or .hwpx by filesystem path. |
| `hwp_save_as(path, format?)` | Save current doc by path. Format default `hwpx`. |
| `hwp_open_blank()` | Bootstrap a blank doc without touching the filesystem. |
| `hwp_open_base64(bytes_base64, format?)` | Load a doc from a base64 byte string (no filesystem needed). |
| `hwp_save_as_base64(format)` | Serialize current doc to a base64 byte string + length. |

### Hardened I/O (1)

| Tool | Purpose |
| --- | --- |
| `hwp_open_base64_validated(bytes_base64, expected_bytes?, expected_crc32?)` | Same as `hwp_open_base64` with explicit length + CRC32 integrity checks. Wire-corruption surfaces as a typed `parse/BAD_LENGTH` or `parse/BAD_CHECKSUM`, not a WASM panic. |

### Catalog (2)

| Tool | Purpose |
| --- | --- |
| `hwp_apply_action(name, params)` | Generic dispatcher — invoke any rhwp action by name (insertText, createTable, applyParaFormat, applyCharFormat, replaceAll, insertEquation, insertPicture, createHeaderFooter, setPageDef, …). |
| `hwp_list_actions(category?)` | Discover available actions with JSON Schemas. Categories: text / table / paragraph / header_footer / page / field / image / math / other. |

The 15 + `hwp_ping` smoke tool stay under the **8 K token budget** for tool
descriptions, measured by `npm run measure:tokens`.

## Errors are typed

Every rhwp WASM call flows through `wrapPanic` and surfaces as a typed
`RhwpError` with `category` and `code`. Examples:

- `parse/BAD_BASE64` — base64 input was not valid base64.
- `parse/BAD_LENGTH` — `expected_bytes` mismatch (corruption detected).
- `parse/BAD_CHECKSUM` — CRC32 mismatch (corruption detected).
- `field/FILL_FAILED` — rhwp `setFieldValueByName` returned `ok:false`.
- `action/APPLY_CHAR_FORMAT_FAILED` — rhwp `applyCharFormat` returned `ok:false`.
- `*/WASM_TRAP` — a Rust panic crossed the WASM boundary; the original
  error is preserved in `cause` for diagnosis.

No raw `RuntimeError: unreachable executed` reaches the MCP client.

## Architecture (one paragraph)

A Node.js stdio MCP server holds a **single global rhwp document** in memory
(`SessionStore`). `hwp_open` / `hwp_open_blank` / `hwp_open_base64` /
`hwp_open_base64_validated` load, subsequent tools mutate, `hwp_save_as` /
`hwp_save_as_base64` flush. WASM warms on server start (~30-70 ms after
first load) so the first tool call never pays instantiation cost. Rust
panics from `@rhwp/core` are caught at the WASM boundary by `wrapPanic`
and surfaced as classified `RhwpError`s — no opaque
`unreachable executed` reaches the MCP client. See
[`docs/architecture.md`](./docs/architecture.md) for the full picture and
[`docs/decisions/`](./docs/decisions/) for the 6 accepted ADRs.

## Verification

- **vitest**: `npm test` — 17 files / 66 tests pass (smoke per tool + Sprint 3 corpus-pass logic + Sprint 1.5 binary-identity probe).
- **schema:diff**: `npm run schema:diff` — per-PR drift guard against the locked tool surface; current snapshot is 15 tools clean.
- **gate:binary-identity**: `npm run gate:binary-identity` — Sprint 1.5 / Sprint 3 combined corpus gate (Pass A field round-trip + Pass B binary identity). Current synthetic baseline = 5/5 PASS at Sprint 1.5 90% threshold (auto-escalates to Decision Gate 3.0 ≥ 95% when rated corpus ≥ 30). See ADR-0006.
- **probes**: `npm run probe:fields`, `npm run probe:char-format` — runtime signature confirmations against the pinned `@rhwp/core` version, with markdown reports under `docs/measurements/`.

## Development

```bash
npm ci

npm run dev               # tsx-driven server on stdio
npm run build             # tsc → dist/
npm run test              # vitest
npm run test:watch        # vitest --watch

npm run probe:fields            # → docs/measurements/rhwp-field-api.md
npm run probe:char-format       # → docs/measurements/rhwp-char-format.md
npm run measure:tokens          # tool-description budget check
npm run schema:diff             # CI guard against signature drift
npm run schema:snapshot         # regenerate schemas/snapshot.json
npm run corpus:generate         # synthetic .hwp corpus → corpus/synthetic/
npm run gate:binary-identity    # run Pass A + Pass B corpus gate
npm run generate:catalog-manifest # regenerate src/rhwp/catalog-manifest.json
npm run lint:md                 # markdown lint
```

## Releases

Private beta lives on the `beta` dist-tag:

```bash
npm install -g rhwp-mcp-server@beta
# or
npx rhwp-mcp-server@beta
```

Feedback program details:
[`docs/release/private-beta-program.md`](./docs/release/private-beta-program.md).

## Decision records

| ADR | Subject | Status |
| --- | --- | --- |
| [0001](./docs/decisions/0001-image-renderer.md) | `hwp_preview` image renderer | **Deferred to v0.2** (Sprint 3 prep) |
| [0002](./docs/decisions/0002-binary-save-fallback.md) | Binary-identity Pass B baseline (Sprint 1.5) | Accepted |
| [0003](./docs/decisions/0003-base64-tools.md) | Base64 wire-friendly contract (Sprint 2.5) | Accepted |
| [0004](./docs/decisions/0004-cell-based-fill.md) | Cell-based fill peer to field-based fill (Sprint 2.6) | Accepted |
| [0005](./docs/decisions/0005-char-format-contract.md) | `hwp_insert_text` style → applyCharFormat chain (Sprint 2.7) | Accepted |
| [0006](./docs/decisions/0006-decision-gate-3.md) | Decision Gate 3.0 structure (Pass A + Pass B combined, threshold escalation) | Accepted (structure); verdict pending N=30 corpus |

## License

MIT — see [LICENSE](./LICENSE). Third-party attributions in [NOTICE](./NOTICE).
