# Setup — Antigravity CLI (Google)

This guide wires `rhwp-mcp-server` into Google's Antigravity CLI.
Antigravity 2.0, its IDE, and the CLI **share a single central MCP
configuration**, so registering here also surfaces the server in the
Antigravity IDE.

## Prerequisites

- Node.js ≥ 20.0.0 (`node --version`).
- Antigravity CLI installed.
- A working `npx` (`npx --version`).

## 1. Locate the config file

Antigravity reads MCP servers from a single shared file:

```
~/.gemini/config/mcp_config.json
```

(Windows: `%USERPROFILE%\.gemini\config\mcp_config.json`.)

If the `~/.gemini/config/` folder or the `mcp_config.json` file doesn't
exist yet, create them.

You can also open it from the GUI: Antigravity **Settings** →
**Customizations** tab → **Open MCP Config**.

## 2. Register the server

> **Important:** `npm install -g rhwp-mcp-server@beta` only installs the
> package on your PATH. It does **not** make Antigravity see the server —
> Antigravity reads its MCP server list from `mcp_config.json` only. The
> config edit below is what completes the registration. Skipping it is the
> most common reason no `rhwp` tools appear.

Add a `rhwp` entry under the `mcpServers` object:

```json
{
  "mcpServers": {
    "rhwp": {
      "command": "npx",
      "args": ["-y", "rhwp-mcp-server@beta"]
    }
  }
}
```

If you already have other MCP servers configured, keep them and add
`rhwp` alongside — `mcpServers` is a flat object keyed by server name.

### Global install instead of npx

If you'd rather avoid the npx fetch on each launch:

```bash
npm install -g rhwp-mcp-server@beta
```

Then point at the `rhwp-mcp` binary:

```json
{
  "mcpServers": {
    "rhwp": {
      "command": "rhwp-mcp"
    }
  }
}
```

### Pinning a specific version

Swap `@beta` for `@0.1.0-beta.1` in the args to pin a release.

> **JSON gotchas (Antigravity-specific):**
> - Inline comments are **not** permitted in `mcp_config.json` — it's
>   strict JSON, not JSONC. A `//` comment will break the parse.
> - The top-level `timeout` parameter is no longer supported.
> - Use `serverUrl` (not the deprecated `httpUrl`) for remote HTTP servers
>   — not needed for this stdio package.

## 3. Restart Antigravity

Antigravity re-reads `mcp_config.json` on cold start. Quit the CLI / IDE
fully and relaunch so the new server is picked up.

## 4. Verify

Start an Antigravity CLI session and ask:

> *"Use the `hwp_ping` tool."*

It should invoke the tool and report `"pong"`. Because the config is
shared, the same `rhwp` server now also appears in the Antigravity IDE's
MCP panel.

## 5. First real call

> *"가정통신문 초안 만들어줘. 빈 문서에서 시작."*

Expected flow: `hwp_open_blank` → `hwp_insert_text` (with `style`) →
`hwp_create_table` → `hwp_save_as`. See
[`docs/persona-examples/authoring.md`](../persona-examples/authoring.md).

## Filesystem vs base64

Antigravity runs the MCP server as a local child process, so the
filesystem-path tools (`hwp_open`, `hwp_save_as`, `hwp_open_blank`) are
the right fit. The base64 tools are only useful when bridging to a remote
client that can't see your filesystem.

## Windows note

If `command = "npx"` fails to spawn on Windows, wrap it through cmd:

```json
{
  "mcpServers": {
    "rhwp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "rhwp-mcp-server@beta"]
    }
  }
}
```

## Troubleshooting

### No `rhwp` tools after restart

- Confirm `mcp_config.json` is valid **strict JSON** (no comments, no
  trailing commas, double-quoted keys).
- Confirm the file is at `~/.gemini/config/mcp_config.json` exactly —
  a misplaced file in `~/.gemini/` (without the `config/` subfolder) is
  not read.
- Confirm `command` resolves on PATH — `where npx` (Windows) /
  `which npx` (macOS / Linux).
- Run `npx rhwp-mcp-server@beta` from a terminal. If the
  *"ready on stdio (15 tools + hwp_ping)"* line doesn't appear within 5
  seconds, the issue is upstream of Antigravity.

### Startup line to look for

```
rhwp-mcp-server v0.1.0-beta.1 ready on stdio (15 tools + hwp_ping)
```

## Next steps

- [`docs/persona-examples/form-automation.md`](../persona-examples/form-automation.md) — 이력서 fill demo.
- [`docs/persona-examples/authoring.md`](../persona-examples/authoring.md) — 가정통신문 authoring demo.
- [`docs/persona-examples/compat.md`](../persona-examples/compat.md) — base64 wire transit.
- [`docs/release/private-beta-program.md`](../release/private-beta-program.md) — feedback.

## Reference

- [Configuring MCP Servers and Skills for Antigravity CLI and IDE (Google Cloud Community)](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78)
- [Antigravity Editor: MCP Integration (official docs)](https://antigravity.google/docs/mcp)
