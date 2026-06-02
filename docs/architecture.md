# Architecture

This document is the canonical one-page reference for how rhwp-mcp-server is laid out internally.

## 5 components (locked by spec)

```
   ┌─────────────────────────────────────────────────────────────────┐
   │                       MCP Client                                 │
   │       (Claude Desktop, Cursor, Claude Code, ...)                 │
   └───────────────────────────────┬─────────────────────────────────┘
                                   │  stdio (JSON-RPC framing)
   ┌───────────────────────────────┴─────────────────────────────────┐
   │                    MCP Server Layer  (src/server.ts)             │
   │   StdioServerTransport • registers 10 tools + hwp_ping           │
   │   Warms WASM BEFORE accepting tool calls                         │
   └──┬─────────────────┬─────────────────┬──────────────┬───────────┘
      │                 │                 │              │
  Document I/O    Form Filling    New Doc Authoring    Preview/Render
  open / save_as  list_fields     insert_text          preview
                  fill_fields     create_table
                                  set_paragraph_style
                                  apply_action
                                  list_actions
      │                 │                 │              │
      └─────────────────┴────────┬────────┴──────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │    SessionStore                  │
                │  (single global current doc)     │
                └────────────────┬────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │   rhwp WASM loader              │
                │   warmRhwp + wrapPanic          │
                └────────────────┬────────────────┘
                                 │
                          @rhwp/core (Rust + WASM)
```

## Why these choices

| Choice | Rationale |
| --- | --- |
| **Single global session** | Tools take no `session_id` parameter — LLM-friendly signatures. Multi-document deferred to v0.2. |
| **WASM warm on server start** | First-tool-call WASM cost (typically 0.5–1.5 s) would race the MCP client's per-call timeout (Claude Desktop ≈ 30 s but with stricter UX expectations). Warming up-front makes the first user request indistinguishable from the hundredth. |
| **Panic-to-Result adapter** | Rust panics across the WASM boundary surface as opaque `RuntimeError: unreachable executed`. `wrapPanic` classifies them into `RhwpError` categories (parse / serialize / action / field / render / session / other) so MCP clients (and the LLMs driving them) can recover meaningfully. |
| **10-tool hybrid surface (8 hot-path + 2 catalog)** | Token-budget aware: 30 tools as 30 dedicated MCP tools would blow the 8 K tool-description budget. Hot-path covers ≈ 90 % of real traffic; `hwp_apply_action` + `hwp_list_actions` serve the long tail. |
| **HWPX-preferred output** | rhwp v0.7.x has stronger HWPX round-trip stability than HWP binary. `hwp_save_as` defaults `format = "hwpx"` to bias toward reliability. |
| **Stdio-only v0.1** | No network listener, no auth, no SaaS surface. The server inherits its security context from the spawning client. |

## Module map

```
src/
├── server.ts                      MCP entry — wires WASM warm, tools, stdio
├── rhwp/
│   ├── loader.ts                  warmRhwp / getRhwp / getWarmDurationMs
│   └── errors.ts                  RhwpError + wrapPanic / wrapPanicSync
├── session/
│   └── store.ts                   SessionStore + sessionStore singleton
└── tools/                         One file per tool, each exports a
    ├── open.ts                       registerHwpXxx(server) function +
    ├── save_as.ts                    zod input/output schemas.
    ├── list_fields.ts                In v0.1-alpha.0 every handler throws
    ├── fill_fields.ts                NOT_IMPLEMENTED; Sprint 1+ replaces
    ├── insert_text.ts                them with real rhwp calls.
    ├── create_table.ts
    ├── set_paragraph_style.ts
    ├── preview.ts
    ├── apply_action.ts
    └── list_actions.ts
```

## Risk-aware sequencing

Sprint 0 → 1 → 1.5 → 2 → 3 → 3.5 → 4 (see `.omc/plans/plan-rhwp-mcp-mvp.md`). The two most-cascading decision gates are:

- **Sprint 1 gate (Field API):** `corpus-report.json` Pass A ≥ 8/10 on N = 10. If failed, Sprint 2 does not start.
- **Sprint 1.5 gate (binary `.hwp` save):** identity round-trip ≥ 90 % of `.hwp` sources. If failed, falls back to `docs/decisions/0002-binary-save-fallback.md` (HWPX-only output).

The catalog-manifest (Sprint 2) + weekly upstream-drift cron together prevent silent drift between our pinned rhwp version and the action catalog we expose to LLMs.
