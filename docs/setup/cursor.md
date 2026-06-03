# Setup — Cursor

This guide wires `rhwp-mcp-server` into Cursor's MCP integration. Tested
on Cursor's MCP support shipped under the **Composer** flow.

## Prerequisites

- Node.js ≥ 20.0.0 (`node --version`).
- Cursor installed and signed in.
- A working `npx` (`npx --version`).

## 1. Open Cursor settings

Open Cursor → Settings (`Cmd+,` / `Ctrl+,`) → **Features** → **Model
Context Protocol**.

If your Cursor build doesn't surface an MCP panel yet, drop the config
directly into the JSON settings file:

| OS | Path |
| --- | --- |
| macOS | `~/.cursor/mcp.json` |
| Windows | `%USERPROFILE%\.cursor\mcp.json` |
| Linux | `~/.config/Cursor/mcp.json` |

(Cursor's MCP settings layout has changed across releases — the JSON file
above is the stable canonical form; the UI panel writes to the same place.)

## 2. Register the server

> **Important:** `npm install -g rhwp-mcp-server@beta` only installs the
> package on your PATH. It does **not** make Cursor see the server — Cursor
> reads its MCP server list from `mcp.json` only. The config edit below is
> what completes the registration. Skipping this step is the most common
> reason no `rhwp` tools appear in Composer.

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

## 3. Restart Cursor

Cursor re-reads MCP config on every cold start. Close the app fully and
relaunch.

## 4. Verify in Composer

Open Composer (`Cmd+I` / `Ctrl+I`) in any project and ask:

> *"Use the `hwp_ping` tool."*

Cursor should surface the tool call card. Confirm it returns `"pong"`.

## 5. Project context tip

Cursor passes the current workspace root to spawned MCP servers as the
cwd. That means:

- Relative paths in your prompts resolve from the workspace root, so
  *"open `samples/resume.hwp`"* works if the file is committed in the
  repo.
- Absolute paths (`/Users/me/Documents/…`) always work regardless of
  workspace.
- Cross-workspace files require absolute paths.

If you want a global resume / 양식 directory that's accessible from
every Cursor workspace, use absolute paths in your prompts.

## Filesystem vs base64

Cursor runs the MCP server as a local child process on your machine, same
as Claude Desktop — the filesystem-path tools are the right choice:

- ✅ `hwp_open`, `hwp_save_as`, `hwp_open_blank` — local files.
- ❌ `hwp_open_base64*`, `hwp_save_as_base64` — only useful for remote
  agents that can't see your filesystem.

## Logs

Cursor's MCP server logs are accessible from **View** → **Output** →
**Cursor MCP** (or the panel's gear icon → "Show Logs"). Look for:

```
rhwp-mcp-server v0.1.0-beta.1 ready on stdio (15 tools + hwp_ping)
```

If the startup line is missing, the server failed early. Check the
output for `rhwp-mcp-server fatal:`.

## Troubleshooting

### Tools don't appear in Composer

- Confirm `mcp.json` is valid JSON (no trailing commas, double-quoted
  keys).
- Restart Cursor fully — reloading the window is not enough.
- Run `npx rhwp-mcp-server@beta` from a terminal in the workspace
  directory. If the stderr line *"ready on stdio (15 tools + hwp_ping)"*
  doesn't appear within 5 seconds, the issue is upstream of Cursor.

### Tool calls hang in Composer

- The first cold start downloads `@rhwp/core` (~5 MB). Wait up to 30
  seconds on first run; subsequent runs warm WASM in ~30-70 ms.
- If the second and later runs also hang, kill any stray `node` /
  `npx` processes and try again — a lock file conflict in `~/.npm` can
  cause silent hangs.

### "Module not found" for @rhwp/core

The npx cache is per-user. If you're running Cursor as a different OS
user than the one that originally ran `npx -y rhwp-mcp-server@beta`,
each user has their own cache. Run the npx command once interactively
in a terminal as the Cursor user to seed the cache.

## Next steps

- [`docs/persona-examples/form-automation.md`](../persona-examples/form-automation.md) — fill a real 이력서.
- [`docs/persona-examples/authoring.md`](../persona-examples/authoring.md) — author 가정통신문 from blank.
- [`docs/persona-examples/compat.md`](../persona-examples/compat.md) — base64 wire path (rarely needed locally).
