# Setup — Codex CLI (OpenAI)

This guide wires `rhwp-mcp-server` into OpenAI's Codex CLI (`codex`
command). Codex talks to MCP servers over stdio, the same transport this
package ships.

## Prerequisites

- Node.js ≥ 20.0.0 (`node --version`).
- Codex CLI installed (`codex --version`).
- A working `npx` (`npx --version`).

## 1. Register the MCP server

> **Important:** `npm install -g rhwp-mcp-server@beta` only installs the
> package on your PATH. It does **not** make Codex see the server — Codex
> reads its MCP server list from `~/.codex/config.toml` only. The step
> below is what completes the registration. Skipping it is the most common
> reason no `rhwp` tools appear in a Codex session.

### Option A — `codex mcp add` (fastest, one line)

If you've globally installed the package
(`npm install -g rhwp-mcp-server@beta`):

```bash
codex mcp add rhwp -- rhwp-mcp
```

If you'd rather skip the global install and let npx fetch on each launch:

```bash
codex mcp add rhwp -- npx -y rhwp-mcp-server@beta
```

The `--` separates Codex's own flags from the stdio server command that
follows.

### Option B — `~/.codex/config.toml` direct edit

Codex stores MCP configuration in `~/.codex/config.toml`. Add a
`[mcp_servers.rhwp]` table:

```toml
[mcp_servers.rhwp]
command = "npx"
args = ["-y", "rhwp-mcp-server@beta"]
```

If you globally installed the package, you can point at the `rhwp-mcp`
binary directly instead:

```toml
[mcp_servers.rhwp]
command = "rhwp-mcp"
```

To pin a specific version, swap `@beta` for `@0.1.0-beta.1` in the args.

A trusted project may also carry a project-scoped `.codex/config.toml`
with the same table for per-project access.

## 2. Verify

List the registered MCP servers:

```bash
codex mcp list
```

You should see `rhwp` in the output. Then start a Codex session and ask:

> *"Use the `hwp_ping` tool."*

Codex should invoke the tool and report `"pong"`.

## 3. First real call

> *"Open ~/Documents/resume.hwp and list its form fields."*

Expected flow:

1. Codex calls `hwp_open` with your file path.
2. Codex calls `hwp_list_fields`.
3. Codex reports the field names + types.

If the form has no 누름틀 controls (common for Korean school / government
forms), switch to `hwp_locate_blanks` for table-cell blanks.

## Filesystem vs base64

Codex runs the MCP server as a local child process, so the
filesystem-path tools (`hwp_open`, `hwp_save_as`, `hwp_open_blank`) are
the right fit. The base64 tools are only useful when bridging to a remote
client that can't see your filesystem.

## Windows note

On Windows, `npx` resolves through the npm shim. If `command = "npx"`
fails to spawn, use the explicit cmd wrapper that several MCP servers use
on Windows:

```toml
[mcp_servers.rhwp]
command = "cmd"
args = ["/c", "npx", "-y", "rhwp-mcp-server@beta"]
```

This mirrors the pattern other stdio MCP servers use in Codex on Windows
(e.g. `cmd /c npx -y <package>`).

## Troubleshooting

### `rhwp` doesn't appear in `codex mcp list`

- Confirm `~/.codex/config.toml` is valid TOML (table headers in
  `[mcp_servers.rhwp]` form, args as a quoted array).
- Confirm `command` resolves on PATH — run `where npx` (Windows) or
  `which npx` (macOS / Linux).
- Run `npx rhwp-mcp-server@beta` directly from a terminal. If the
  *"ready on stdio (15 tools + hwp_ping)"* line doesn't appear within 5
  seconds, the issue is upstream of Codex.

### Project config ignored

Codex loads `~/.codex/config.toml` globally; project-scoped
`.codex/config.toml` only applies in trusted projects. If a project-level
server isn't loading, register it in the global config instead, or mark
the project as trusted per the Codex docs.

### Startup line to look for

```
rhwp-mcp-server v0.1.0-beta.1 ready on stdio (15 tools + hwp_ping)
```

Codex surfaces MCP server stderr in its logs; this line confirms the
server booted and WASM warmed.

## Next steps

- [`docs/persona-examples/form-automation.md`](../persona-examples/form-automation.md) — 이력서 fill demo.
- [`docs/persona-examples/authoring.md`](../persona-examples/authoring.md) — 가정통신문 authoring demo.
- [`docs/persona-examples/compat.md`](../persona-examples/compat.md) — base64 wire transit.
- [`docs/release/private-beta-program.md`](../release/private-beta-program.md) — feedback.

## Reference

- [Model Context Protocol — Codex (OpenAI Developers)](https://developers.openai.com/codex/mcp)
- [Configuration Reference — Codex (OpenAI Developers)](https://developers.openai.com/codex/config-reference)
