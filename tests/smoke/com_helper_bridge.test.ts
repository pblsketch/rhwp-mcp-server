/**
 * Phase 5c smoke — Node ⇄ helper bridge against a MOCK helper.
 *
 * These tests NEVER launch the real host automation surface. They drive the
 * bridge with a tiny Node echo helper (tests/setup/mock-com-helper.mjs) that
 * speaks the same line-delimited JSON protocol, so JSON framing, the
 * timeout→typed-error path, structured-failure→typed-error conversion, and the
 * dispose→process-exit lifecycle are all exercised on any host (including
 * headless CI) with no Hangul word processor present.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ComHelperBridge,
  type HelperLauncher,
} from "../../src/rhwp/engine/com-helper-bridge.js";
import { RhwpError } from "../../src/rhwp/errors.js";

const MOCK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "setup",
  "mock-com-helper.mjs",
);

/** Build a launcher that runs the mock helper under Node with optional config. */
function mockLauncher(config?: Record<string, unknown>): HelperLauncher {
  const args = [MOCK];
  if (config !== undefined) {
    args.push(JSON.stringify(config));
  }
  return { command: process.execPath, args };
}

describe("ComHelperBridge (mock helper)", () => {
  let bridge: ComHelperBridge | null = null;

  afterEach(async () => {
    if (bridge !== null) {
      await bridge.dispose();
      bridge = null;
    }
  });

  it("round-trips a ping over JSON framing", async () => {
    bridge = new ComHelperBridge(mockLauncher());
    const resp = await bridge.command("ping");
    expect(resp.ok).toBe(true);
    expect(resp.automation_registered).toBe(true);
  });

  it("sends args and reads back a structured success", async () => {
    bridge = new ComHelperBridge(mockLauncher());
    const resp = await bridge.command("open", { path: "C:/tmp/x.hwp" });
    expect(resp.ok).toBe(true);
    expect(resp.opened).toBe(true);
    expect(resp.path).toBe("C:/tmp/x.hwp");
  });

  it("converts a structured {ok:false} failure into a typed RhwpError", async () => {
    // ping config flips automation_registered off AND marks the response as a
    // failure so command() must throw a typed error.
    bridge = new ComHelperBridge(
      mockLauncher({ ping: { ok: false, category: "session", code: "WRAPPER_IMPORT_FAILED", message: "no wrapper" } }),
    );
    await expect(bridge.command("ping")).rejects.toMatchObject({
      code: "WRAPPER_IMPORT_FAILED",
      category: "session",
    });
  });

  it("times out a blocked command into a typed COM_TIMEOUT and kills the helper", async () => {
    bridge = new ComHelperBridge(mockLauncher({ blockOn: ["open"] }));
    let caught: unknown;
    try {
      await bridge.command("open", { path: "x" }, 300);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RhwpError);
    expect((caught as RhwpError).code).toBe("COM_TIMEOUT");
    expect((caught as RhwpError).category).toBe("session");
    // The helper was killed on timeout — the bridge is no longer running.
    expect(bridge.running).toBe(false);
  });

  it("surfaces a malformed response line as COM_BAD_RESPONSE", async () => {
    bridge = new ComHelperBridge(mockLauncher({ badJsonOn: ["open"] }));
    await expect(bridge.command("open", { path: "x" }, 1000)).rejects.toMatchObject({
      code: "COM_BAD_RESPONSE",
    });
  });

  it("fails with a typed COM_SPAWN_FAILED when the interpreter is missing", async () => {
    bridge = new ComHelperBridge({
      command: "definitely-not-a-real-interpreter-xyz",
      args: ["nope.py"],
    });
    let caught: unknown;
    try {
      await bridge.command("ping", {}, 2000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RhwpError);
    expect((caught as RhwpError).code).toBe("COM_SPAWN_FAILED");
  });

  it("dispose terminates the helper process (no lingering child)", async () => {
    bridge = new ComHelperBridge(mockLauncher());
    await bridge.command("ping");
    expect(bridge.running).toBe(true);
    await bridge.dispose();
    expect(bridge.running).toBe(false);
    // Idempotent: a second dispose is a no-op that resolves.
    await expect(bridge.dispose()).resolves.toBeUndefined();
    bridge = null;
  });

  it("dispose still reaps the process when the helper ignores quit", async () => {
    // The mock ignores 'quit' so dispose must fall through to the kill path and
    // still reap the child within its bounded guard.
    bridge = new ComHelperBridge(mockLauncher({ ignoreQuit: true }));
    await bridge.command("ping");
    await bridge.dispose();
    expect(bridge.running).toBe(false);
    bridge = null;
  });

  it("rejects a second concurrent command with COM_BUSY", async () => {
    bridge = new ComHelperBridge(mockLauncher({ blockOn: ["open"], delayMs: 0 }));
    // Start a command that never resolves (blocked) — keep its rejection from
    // becoming an unhandled rejection by attaching a catch.
    const first = bridge.command("open", { path: "x" }, 5000).catch(() => undefined);
    // A second command issued while the first is in flight is rejected.
    await expect(bridge.command("ping", {}, 1000)).rejects.toMatchObject({
      code: "COM_BUSY",
    });
    await bridge.dispose();
    await first;
    bridge = null;
  });
});
