#!/usr/bin/env node
/**
 * rhwp-mcp-server entry point.
 *
 * Wires:
 *   1. WASM warm-on-start (warmRhwp before server.connect)
 *   2. 15 tool registrations (9 v0.1 + 3 Sprint 2.5 remote-friendly +
 *      3 Sprint 2.6 cell-fill / base64-integrity). hwp_preview was
 *      deferred to v0.2 in Sprint 3 prep — see ADR-0001.
 *   3. Stdio transport for local MCP clients (Claude Desktop, Cursor,
 *      Claude Code) — base64 tools also serve remote clients (Claude
 *      Web/Mobile, MCP-over-HTTP brokers).
 *
 * Run:
 *   node dist/server.js
 *   or via npm: npx rhwp-mcp
 *
 * MCP client config example (Claude Desktop):
 *   "mcpServers": {
 *     "rhwp": { "command": "npx", "args": ["-y", "rhwp-mcp-server"] }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { warmRhwp } from "./rhwp/loader.js";

import { registerHwpOpen } from "./tools/open.js";
import { registerHwpSaveAs } from "./tools/save_as.js";
import { registerHwpListFields } from "./tools/list_fields.js";
import { registerHwpFillFields } from "./tools/fill_fields.js";
import { registerHwpInsertText } from "./tools/insert_text.js";
import { registerHwpCreateTable } from "./tools/create_table.js";
import { registerHwpSetParagraphStyle } from "./tools/set_paragraph_style.js";
import { registerHwpApplyAction } from "./tools/apply_action.js";
import { registerHwpListActions } from "./tools/list_actions.js";
import { registerHwpOpenBlank } from "./tools/open_blank.js";
import { registerHwpOpenBase64 } from "./tools/open_base64.js";
import { registerHwpSaveAsBase64 } from "./tools/save_as_base64.js";
import { registerHwpLocateBlanks } from "./tools/locate_blanks.js";
import { registerHwpFillCells } from "./tools/fill_cells.js";
import { registerHwpOpenBase64Validated } from "./tools/open_base64_validated.js";

const PKG_NAME = "rhwp-mcp-server";
const PKG_VERSION = "0.1.0-beta.1";

async function main(): Promise<void> {
  // Step 1: warm WASM. We do this before server.connect() so the first tool
  // call does not pay the WASM instantiation cost. Sprint 0 exit criterion
  // asserts warm load ≤ 2000 ms on each OS.
  await warmRhwp();

  // Step 2: construct server + register every tool.
  const server = new McpServer({
    name: PKG_NAME,
    version: PKG_VERSION,
  });

  // Register hwp_ping as the smoke-test tool.
  server.registerTool(
    "hwp_ping",
    {
      title: "Smoke ping",
      description:
        "Returns a fixed 'pong' text response. Used to verify the MCP " +
        "server is reachable and WASM was warmed successfully.",
    },
    async () => ({
      content: [{ type: "text" as const, text: "pong" }],
    }),
  );

  // v0.1 spec-locked tools (10).
  registerHwpOpen(server);
  registerHwpSaveAs(server);
  registerHwpListFields(server);
  registerHwpFillFields(server);
  registerHwpInsertText(server);
  registerHwpCreateTable(server);
  registerHwpSetParagraphStyle(server);
  registerHwpApplyAction(server);
  registerHwpListActions(server);

  // Sprint 2.5 remote-friendly additions (ADR-0003). Path tools above are
  // unchanged; base64 tools share the SessionStore so the two contracts
  // interoperate freely.
  registerHwpOpenBlank(server);
  registerHwpOpenBase64(server);
  registerHwpSaveAsBase64(server);

  // Sprint 2.6 cell-based fill + base64 integrity (ADR-0004). These
  // complement, never replace, the field-based and unchecked-base64 tools.
  registerHwpLocateBlanks(server);
  registerHwpFillCells(server);
  registerHwpOpenBase64Validated(server);

  // Step 3: connect stdio transport. MCP clients spawn this process; framing
  // is JSON-RPC on stdin/stdout. Anything written to stdout outside the
  // framing will corrupt the connection — keep logs on stderr.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `${PKG_NAME} v${PKG_VERSION} ready on stdio (15 tools + hwp_ping)\n`,
  );
}

main().catch((err: unknown) => {
  // Catastrophic startup failure. Stderr so MCP framing is unaffected.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${PKG_NAME} fatal: ${message}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
