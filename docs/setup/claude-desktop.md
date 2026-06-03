# Setup — Claude Desktop

This guide wires `rhwp-mcp-server` into Anthropic's Claude Desktop client
(macOS / Windows). Tested on Claude Desktop 0.x with the Model Context
Protocol API.

## Prerequisites

- Node.js ≥ 20.0.0 (`node --version`).
- Claude Desktop installed and signed in.
- A working `npx` (`npx --version`).

## 1. Locate the config file

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

If the file doesn't exist, create it.

## 2. Register the server

> **Important:** `npm install -g rhwp-mcp-server@beta` only installs the
> package on your PATH. It does **not** make Claude Desktop see the server —
> Claude Desktop reads its server list from `claude_desktop_config.json`
> only. The config edit below is what completes the registration. Skipping
> this step is the most common reason no `rhwp` tools appear in Claude
> Desktop.

Append (or merge) the `rhwp` entry under `mcpServers`:

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

If you already have other MCP servers configured, keep them and add `rhwp`
alongside — `mcpServers` is a flat object keyed by server name.

### Pinning a specific version

The `@beta` dist-tag tracks the latest private-beta release. To pin a
specific version (recommended for stable workflows):

```jsonc
{
  "mcpServers": {
    "rhwp": {
      "command": "npx",
      "args": ["-y", "rhwp-mcp-server@0.1.0-beta.1"]
    }
  }
}
```

### Global install instead of npx

If you'd rather avoid the npx fetch on each launch:

```bash
npm install -g rhwp-mcp-server@beta
```

Then:

```jsonc
{
  "mcpServers": {
    "rhwp": {
      "command": "rhwp-mcp"
    }
  }
}
```

(The `rhwp-mcp` binary ships under `package.json` `bin`.)

## 3. Restart Claude Desktop

Quit completely (Cmd+Q / right-click tray → Quit on Windows) and relaunch.
Claude Desktop only re-reads `claude_desktop_config.json` on cold start.

## 4. Verify with `hwp_ping`

Open a new chat and ask:

> *"`hwp_ping` 호출해줘."*

Claude should invoke the tool and report `"pong"`. If you see "tool not
available" or no tool call, see Troubleshooting below.

## 5. Try a real call

> *"`~/Documents/resume.hwp` 열어서 누름틀 목록 보여줘."*

Expected flow:

1. Claude calls `hwp_open` with your file path.
2. Claude calls `hwp_list_fields`.
3. Claude reports the field names + types found.

If the form has no 누름틀 controls (common for school / government
forms), the list will be empty. Switch to `hwp_locate_blanks` for
table-cell-style blanks.

## Filesystem vs base64 — which to use

Claude Desktop runs the MCP server **as a local child process on your own
machine**, so the filesystem-path tools (`hwp_open`, `hwp_save_as`) are the
natural fit:

- ✅ Filesystem-path tools — local Claude Desktop, Cursor, Claude Code.
- ❌ Base64 tools (`hwp_open_base64*`, `hwp_save_as_base64`) — overhead
  with no benefit when the file is already on disk. Reserve these for
  Claude Web / Mobile or MCP-over-HTTP brokers (see
  [`compat.md`](../persona-examples/compat.md)).

## Logs

stderr from `rhwp-mcp-server` flows to Claude Desktop's MCP log. To
inspect:

| OS | Log path |
| --- | --- |
| macOS | `~/Library/Logs/Claude/mcp-server-rhwp.log` |
| Windows | `%APPDATA%\Claude\logs\mcp-server-rhwp.log` |

Look for the startup line:

```
rhwp-mcp-server v0.1.0-beta.1 ready on stdio (15 tools + hwp_ping)
```

If you don't see this line, the server failed to start. Check the log for
WASM load errors (most often a Node version too old).

## Troubleshooting

### "tool not available" / no tool calls

- Confirm you restarted Claude Desktop fully (Quit, not just close window).
- Confirm `command` resolves on your PATH — Claude Desktop spawns the MCP
  server through your shell, so `npx` or `rhwp-mcp` must be invokable.
  Run `which npx` (macOS) or `where npx` (Windows) from a terminal.
- Open the MCP log (above) and search for `rhwp-mcp-server fatal:`.

### WASM warm timeout / slow first launch

The first launch downloads `@rhwp/core` (~5 MB) into the npx cache.
Subsequent launches reuse the cache and warm WASM in under 100 ms.

### Korean text appears as ??? in input fields

Claude Desktop input is UTF-8 throughout the MCP boundary. If you see
mojibake **in the saved file**, the offending step is rhwp's serializer,
not the MCP wire. Open an issue with the input string and the
`hwp_save_as` call.

### Server "exits unexpectedly"

Usually one of:
- Node < 20 on your PATH (rhwp-mcp-server requires Node 20+).
- A pre-existing process holding the `npx` cache lock — kill stray
  `npx` / `node` processes and relaunch.
- An older `claude_desktop_config.json` with a malformed JSON comma —
  the file is JSON, not JSONC; trailing commas break it.

## Next steps

- [`docs/persona-examples/form-automation.md`](../persona-examples/form-automation.md) — fill a real 이력서 양식.
- [`docs/persona-examples/authoring.md`](../persona-examples/authoring.md) — write a 가정통신문 from a blank doc.
- [`docs/persona-examples/compat.md`](../persona-examples/compat.md) — base64 wire transit (only needed for Claude Web/Mobile).
- [`docs/release/private-beta-program.md`](../release/private-beta-program.md) — feedback program.
