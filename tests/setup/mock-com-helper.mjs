#!/usr/bin/env node
/**
 * Mock host-runtime helper for bridge tests.
 *
 * Speaks the SAME line-delimited JSON protocol as python/rhwp_hwp_helper.py but
 * launches NO host automation surface whatsoever — it is a tiny Node echo
 * server. This lets the bridge tests exercise JSON framing, the
 * timeout→typed-error path, and the dispose→process-exit lifecycle on any host
 * (including headless CI) without the real Hangul word processor.
 *
 * Behaviour is driven by a JSON config passed as argv[2] (optional):
 *   { "ping": { ... },        // body merged into the ping response
 *     "blockOn": ["open"],     // commands that hang forever (drive timeouts)
 *     "delayMs": 0,            // artificial delay before responding
 *     "badJsonOn": ["x"],      // commands answered with a non-JSON line
 *     "ignoreQuit": false }    // when true, 'quit' does not exit (tests kill)
 *
 * Defaults model a healthy, reachable helper: ping reports the automation
 * object as registered, every command echoes ok, and quit exits cleanly.
 */

import { createInterface } from "node:readline";

const cfg = (() => {
  try {
    return argvConfig();
  } catch {
    return {};
  }
})();

function argvConfig() {
  const raw = process.argv[2];
  return raw ? JSON.parse(raw) : {};
}

const blockOn = new Set(cfg.blockOn ?? []);
const badJsonOn = new Set(cfg.badJsonOn ?? []);
const delayMs = typeof cfg.delayMs === "number" ? cfg.delayMs : 0;

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function respond(req) {
  const id = req && (typeof req.id === "string" || typeof req.id === "number") ? req.id : undefined;
  const cmd = req && req.cmd;

  if (badJsonOn.has(cmd)) {
    // Emit a deliberately malformed line to drive the COM_BAD_RESPONSE path.
    process.stdout.write("this-is-not-json\n");
    return;
  }

  let body;
  switch (cmd) {
    case "ping":
      body = {
        ok: true,
        wrapper: "importable",
        automation_registered: true,
        register_module: false,
        ...(cfg.ping ?? {}),
      };
      break;
    case "open":
      body = { ok: true, opened: true, path: req.args && req.args.path };
      break;
    case "create_blank":
      body = { ok: true, created: true };
      break;
    case "get_cell_metadata":
      body = { ok: true, row_span: 2, col_span: 1, covered: false };
      break;
    case "quit":
      body = { ok: true, quit: true };
      break;
    default:
      body = { ok: true, echoed: cmd };
  }

  const out = id !== undefined ? { id, ...body } : body;
  write(out);

  if (cmd === "quit" && body.ok === true && !cfg.ignoreQuit) {
    // Exit after flushing the quit response, mirroring the real helper.
    process.exit(0);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    write({ ok: false, category: "other", code: "BAD_JSON", message: "mock: bad json" });
    return;
  }

  if (blockOn.has(req.cmd)) {
    // Never respond — the bridge's timer must fire and kill us.
    return;
  }

  if (delayMs > 0) {
    setTimeout(() => respond(req), delayMs);
  } else {
    respond(req);
  }
});
