# rhwp-mcp-server

> MCP server for Korean HWP / HWPX documents — read, fill form fields, author new docs, preview — powered by [@rhwp/core](https://github.com/edwardkim/rhwp) (Rust + WebAssembly).

⚠️ **Status:** `0.1.0-alpha.0` — Sprint 0 scaffolding only. All 10 tools are registered with locked signatures, but their handlers currently throw `NOT_IMPLEMENTED`. Sprint 1+ wires the real rhwp calls. See [`.omc/plans/plan-rhwp-mcp-mvp.md`](./.omc/plans/plan-rhwp-mcp-mvp.md) for the full delivery plan.

---

## What this is

An [MCP](https://modelcontextprotocol.io) server that lets an LLM (Claude, Cursor, Claude Code, etc.) work with Korean `.hwp` and `.hwpx` files natively. The design intentionally balances **three personas equally** — none is the headline feature:

1. **지식 노동자 / 개발자 (Document Editor)** — LLM authors and edits Korean documents as if using a word processor.
2. **공공기관·HR·총무 자동화 담당자 (Form Filler)** — bulk-fill 한컴 form templates (이력서, 공문, 계약서…) from structured data.
3. **호환성 민감 사용자 (Hancom Bridge)** — read/write HWP/HWPX safely on machines without 한컴오피스 installed.

## Quick start (after Sprint 1+ when handlers are live)

```bash
npm install -g rhwp-mcp-server   # or use npx in your client config
```

Claude Desktop config:

```jsonc
{
  "mcpServers": {
    "rhwp": {
      "command": "npx",
      "args": ["-y", "rhwp-mcp-server"]
    }
  }
}
```

Then ask:
- *"내 이력서 양식 `~/Documents/resume.hwp`에 이 정보로 채워줘."* → uses `hwp_open`, `hwp_list_fields`, `hwp_fill_fields`, `hwp_save_as`.
- *"공문 양식으로 회의록 작성해줘."* → uses `hwp_insert_text`, `hwp_create_table`, `hwp_set_paragraph_style`.
- *".hwp 파일 미리보기 보여줘."* → uses `hwp_preview` (PNG inline).

## Tools (v0.1 surface — 10 tools)

Hot-path (8):

| Tool | Purpose |
| --- | --- |
| `hwp_open(path)` | Open .hwp or .hwpx into the single-document session. |
| `hwp_save_as(path, format?)` | Save current doc. Default `format = "hwpx"`. |
| `hwp_list_fields()` | Enumerate form fields. |
| `hwp_fill_fields(map)` | Bulk-fill form fields. Unknown → `skipped`. |
| `hwp_insert_text(text, style?)` | Insert text at cursor (with optional inline style). |
| `hwp_create_table(rows, cols, data?)` | Insert a table, optionally with cell data. |
| `hwp_set_paragraph_style(style)` | Apply paragraph-level styling. |
| `hwp_preview(page?)` | Render a page to PNG (base64 inline, ≤ 1024 px). |

Generic / catalog (2):

| Tool | Purpose |
| --- | --- |
| `hwp_apply_action(name, params)` | Invoke any rhwp action by name (머리말/꼬리말, 차트, 수식, etc.). |
| `hwp_list_actions(category?)` | Discover available actions with JSON Schemas. |

The 10 + `hwp_ping` smoke tool stay under the **8 K token budget** for tool descriptions, measured by `npm run measure:tokens`.

## Architecture (one paragraph)

A Node.js stdio MCP server holds a **single global rhwp document** in memory (`SessionStore`). `hwp_open(path)` loads, subsequent tools mutate, `hwp_save_as(path)` flushes. WASM warms on server start (≤ 2 s on each OS) so the first tool call never pays instantiation cost. Rust panics from `@rhwp/core` are caught at the WASM boundary by a `wrapPanic` adapter and surfaced as classified `RhwpError`s — no opaque `unreachable executed` reaches the MCP client. See [`docs/architecture.md`](./docs/architecture.md) for the full picture.

## Development

```bash
npm ci

npm run dev               # tsx-driven server on stdio
npm run build             # tsc → dist/
npm run test              # vitest

npm run probe:fields      # Sprint 0 probe → docs/measurements/rhwp-field-api.md
npm run measure:tokens    # tool-description budget → docs/measurements/...
npm run schema:diff       # CI guard against signature drift
npm run schema:snapshot   # regenerate schemas/snapshot.json
npm run lint:md           # markdown lint
```

## Plan, spec, and consensus artifacts

- `.omc/specs/deep-interview-rhwp-mcp.md` — locked spec (ambiguity 18 %, PASSED).
- `.omc/plans/plan-rhwp-mcp-mvp.md` — 9-week implementation plan (Architect + Critic consensus).
- `.omc/drafts/` — pre-consensus drafts retained for audit.

## License

MIT — see [LICENSE](./LICENSE). Third-party attributions in [NOTICE](./NOTICE).
