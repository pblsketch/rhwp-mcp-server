# Setup — Claude Code (CLI)

This guide wires `rhwp-mcp-server` into Anthropic's Claude Code CLI
(`claude` command). Both interactive and headless modes are supported.

## Prerequisites

- Node.js ≥ 20.0.0 (`node --version`).
- Claude Code installed (`claude --version`).
- A working `npx` (`npx --version`).

## 1. Register the MCP server

> **Important:** `npm install -g rhwp-mcp-server@beta` only installs the
> package on your PATH. It does **not** tell Claude Code to spawn the server
> — Claude Code maintains its own MCP registry. The step below is what
> actually wires the two together. Skipping this step is the most common
> reason `rhwp` doesn't show up in `claude mcp list`.

### Option A — `claude mcp add` (fastest, one line)

If the package is globally installed (`npm install -g rhwp-mcp-server@beta`):

```bash
claude mcp add rhwp -- rhwp-mcp
```

If you'd rather skip the global install and let npx fetch on each launch:

```bash
claude mcp add rhwp -- npx -y rhwp-mcp-server@beta
```

Verify:

```bash
claude mcp list
```

You should see:

```
rhwp: rhwp-mcp - ✓ Connected
```

If `rhwp` is missing or shows `✗ Failed to connect`, jump to
[Troubleshooting](#troubleshooting).

### Option B — `~/.claude/settings.json` direct edit

If you want to manage the registration in your project's `.claude/settings.json`
(per-project access, recommended when the project has Korean form templates),
add `rhwp` to the `mcpServers` block:

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

For a pinned version or a global install, use the same patterns as
[Claude Desktop setup](./claude-desktop.md#pinning-a-specific-version).

## 2. Verify

Open a new Claude Code session in any directory:

```bash
claude
```

Then:

> *"Use the `hwp_ping` tool."*

Claude Code should show the tool call in the agent log and report
`"pong"`.

You can also list registered MCP servers from inside the session:

```
/mcp
```

This shows every active server, including `rhwp`, with its tool count.

## 3. Headless mode

For non-interactive automation, pass the rhwp tools through the headless
flag:

```bash
claude --allowed-tools "mcp__rhwp__*" \
  --prompt "Open ~/Documents/resume.hwp and list its fields"
```

The `mcp__rhwp__*` glob matches every tool registered by this server
(MCP tool names are prefixed `mcp__<serverName>__`).

## Filesystem vs base64

Claude Code runs the MCP server as a local child process, so the
filesystem-path tools (`hwp_open`, `hwp_save_as`, `hwp_open_blank`) are
the right fit. The base64 tools are only useful when Claude is bridging
to a remote MCP client (e.g. via MCP-over-HTTP).

## Logs

Claude Code's MCP server logs land in `~/.claude/logs/mcp/rhwp.log`
(macOS / Linux) or `%USERPROFILE%\.claude\logs\mcp\rhwp.log` (Windows).
Tail it during a session to see WASM warm time and per-call breadcrumbs:

```bash
tail -f ~/.claude/logs/mcp/rhwp.log
```

Startup line to look for:

```
rhwp-mcp-server v0.1.0-beta.1 ready on stdio (15 tools + hwp_ping)
```

## Project conventions

If your project commits HWP templates under `templates/` or `forms/`,
make their paths discoverable from the Claude Code prompt by mentioning
them in the project `CLAUDE.md`. Example:

```markdown
# Project Conventions

Korean form templates live under `templates/`:
- `templates/resume.hwp` — 이력서 (35-cell layout, no 누름틀)
- `templates/notice.hwpx` — 가정통신문 base

Always use the cell-based fill tools (`hwp_locate_blanks` +
`hwp_fill_cells`) for these, NOT the field-based tools — the templates
don't carry 누름틀 controls.
```

This kind of hint lets the LLM pick the right tool family without
guessing.

## Troubleshooting

### `/mcp` doesn't show `rhwp`

- Confirm `settings.json` is valid JSON.
- Confirm `command` resolves on PATH — run `which npx` (macOS / Linux)
  or `where npx` (Windows).
- Run `npx rhwp-mcp-server@beta` directly from a terminal in the same
  directory. If the *"ready on stdio (15 tools + hwp_ping)"* line
  doesn't appear within 5 seconds, the issue is upstream.

### Tool blocked by allowlist

By default Claude Code asks the user to confirm each tool call. To
pre-approve a tool family, set:

```jsonc
{
  "allowedTools": ["mcp__rhwp__hwp_ping", "mcp__rhwp__hwp_open"]
}
```

…or use `"mcp__rhwp__*"` to allow all rhwp tools. This is in
`~/.claude/settings.json` (or the project-scoped equivalent).

## Next steps

- [`docs/persona-examples/form-automation.md`](../persona-examples/form-automation.md) — 이력서 fill demo.
- [`docs/persona-examples/authoring.md`](../persona-examples/authoring.md) — 가정통신문 authoring demo.
- [`docs/persona-examples/compat.md`](../persona-examples/compat.md) — base64 wire transit.
- [`docs/release/private-beta-program.md`](../release/private-beta-program.md) — feedback.
