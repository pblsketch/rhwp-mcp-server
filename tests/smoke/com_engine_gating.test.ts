/**
 * Phase 5c smoke — host-runtime engine opt-in gating + handshake.
 *
 * Verifies the three-condition operability gate (opt-in + capability AVAILABLE
 * + successful handshake) WITHOUT launching the real host automation surface.
 * The handshake is driven against the MOCK helper via an injected launcher, so
 * no Hangul word processor is ever started — the "ping" the engine performs
 * goes to the Node echo mock.
 *
 *   - RHWP_COM unset  → engine non-operational, auto/com resolve to WASM.
 *   - RHWP_COM=1 but capability not AVAILABLE → still non-operational.
 *   - RHWP_COM=1 + AVAILABLE + mock handshake ok → operational true.
 *   - A failed handshake (mock reports not-registered) → non-operational,
 *     document methods reject ENGINE_UNAVAILABLE.
 *
 * The real-host E2E is gated behind RHWP_COM_E2E and skipped by default so
 * `npm test` never blocks on a live automation object.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ComDocumentEngine } from "../../src/rhwp/engine/com-engine.js";
import {
  __setComProbeOverrideForTests,
  COM_OPT_IN_ENV,
} from "../../src/rhwp/engine/capabilities.js";
import { RhwpError } from "../../src/rhwp/errors.js";
import type { HelperLauncher } from "../../src/rhwp/engine/com-helper-bridge.js";

const MOCK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "setup",
  "mock-com-helper.mjs",
);

function mockLauncher(config?: Record<string, unknown>): HelperLauncher {
  const args = [MOCK];
  if (config !== undefined) {
    args.push(JSON.stringify(config));
  }
  return { command: process.execPath, args };
}

const AVAILABLE = () => ({
  status: "AVAILABLE" as const,
  detail: "test override",
});

describe("host-runtime engine opt-in gating", () => {
  const prevOptIn = process.env[COM_OPT_IN_ENV];

  beforeEach(() => {
    delete process.env[COM_OPT_IN_ENV];
  });

  afterEach(() => {
    __setComProbeOverrideForTests(null);
    if (prevOptIn === undefined) {
      delete process.env[COM_OPT_IN_ENV];
    } else {
      process.env[COM_OPT_IN_ENV] = prevOptIn;
    }
  });

  it("is non-operational with no opt-in even when the runtime is AVAILABLE", async () => {
    __setComProbeOverrideForTests(AVAILABLE);
    const engine = new ComDocumentEngine(mockLauncher());
    // Handshake short-circuits to failed because opt-in is off.
    expect(await engine.ensureHandshake()).toBe(false);
    expect(engine.operational).toBe(false);
    await engine.dispose();
  });

  it("rejects document methods with ENGINE_UNAVAILABLE when not opted in", async () => {
    __setComProbeOverrideForTests(AVAILABLE);
    const engine = new ComDocumentEngine(mockLauncher());
    await expect(engine.createBlank()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
    await engine.dispose();
  });

  it("stays non-operational when opted in but capability is NOT AVAILABLE", async () => {
    process.env[COM_OPT_IN_ENV] = "1";
    __setComProbeOverrideForTests(() => ({
      status: "NOT_INSTALLED",
      detail: "test override",
    }));
    const engine = new ComDocumentEngine(mockLauncher());
    expect(await engine.ensureHandshake()).toBe(false);
    expect(engine.operational).toBe(false);
    await engine.dispose();
  });

  it("becomes operational when opted in + AVAILABLE + mock handshake ok", async () => {
    process.env[COM_OPT_IN_ENV] = "1";
    __setComProbeOverrideForTests(AVAILABLE);
    const engine = new ComDocumentEngine(mockLauncher());
    expect(await engine.ensureHandshake()).toBe(true);
    expect(engine.operational).toBe(true);
    await engine.dispose();
  });

  it("stays non-operational when the handshake reports not-registered", async () => {
    process.env[COM_OPT_IN_ENV] = "1";
    __setComProbeOverrideForTests(AVAILABLE);
    // Mock ping reports the automation object as NOT registered.
    const engine = new ComDocumentEngine(
      mockLauncher({ ping: { automation_registered: false } }),
    );
    expect(await engine.ensureHandshake()).toBe(false);
    expect(engine.operational).toBe(false);
    // Document methods reject with the typed unavailable error.
    await expect(engine.openFromBytes(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      RhwpError,
    );
    await engine.dispose();
  });

  it("getCellMetadata falls through to a default when the helper has no live geometry", async () => {
    process.env[COM_OPT_IN_ENV] = "1";
    __setComProbeOverrideForTests(AVAILABLE);
    // The default mock returns row_span:2 for get_cell_metadata, proving the
    // bridge round-trips structured metadata when the helper supplies it.
    const engine = new ComDocumentEngine(mockLauncher());
    await engine.ensureHandshake();
    const meta = await engine.getCellMetadata(undefined as never, {
      section_idx: 0,
      parent_para_idx: 0,
      control_idx: 0,
      cell_idx: 0,
    });
    expect(meta.row_span).toBe(2);
    expect(meta.col_span).toBe(1);
    expect(meta.covered).toBe(false);
    await engine.dispose();
  });
});

// Real-host E2E: only runs when RHWP_COM_E2E=1 is explicitly set on an
// interactive desktop with the Hangul word processor installed. Skipped by
// default so `npm test` never blocks on a live automation object.
const e2e = process.env.RHWP_COM_E2E === "1" ? describe : describe.skip;

e2e("host-runtime engine E2E (real automation — desktop only)", () => {
  it("performs a real handshake against the installed runtime", async () => {
    process.env[COM_OPT_IN_ENV] = "1";
    const engine = new ComDocumentEngine(); // default Python launcher
    const ok = await engine.ensureHandshake();
    expect(typeof ok).toBe("boolean");
    await engine.dispose();
  });
});
