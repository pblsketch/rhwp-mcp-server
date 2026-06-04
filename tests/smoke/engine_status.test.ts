/**
 * Phase 2 smoke — hwp_engine_status + capability detection + engine fallback.
 *
 * Exercises the capability query path without any host runtime installed:
 *   - the bundled WASM engine is always AVAILABLE,
 *   - the host-runtime ("com") engine reports a structured unavailable status
 *     (NOT_INSTALLED / NOT_REGISTERED / UNAVAILABLE) and never throws,
 *   - an injected probe override drives the AVAILABLE branch deterministically,
 *   - automatic selection (`active` / `fallback_reason`) reflects the probe,
 *   - `ensureEngine` / `getEngine` apply capability-driven fallback,
 *   - the COM slot's document methods raise a typed ENGINE_UNAVAILABLE error.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  executeHwpEngineStatus,
} from "../../src/tools/engine_status.js";
import {
  __setComProbeOverrideForTests,
  engineCapabilities,
  probeComRuntime,
  COM_ENGINE_NAME,
  WASM_ENGINE_NAME,
} from "../../src/rhwp/engine/capabilities.js";
import { ComDocumentEngine } from "../../src/rhwp/engine/com-engine.js";
import {
  __resetForTests,
  ensureEngine,
  getEngine,
} from "../../src/rhwp/loader.js";
import { RhwpError } from "../../src/rhwp/errors.js";

function entry(report: { engines: { name: string }[] }, name: string) {
  return report.engines.find((e) => e.name === name);
}

describe("engine capability detection", () => {
  afterEach(() => {
    __setComProbeOverrideForTests(null);
  });

  it("reports the bundled WASM engine as AVAILABLE", async () => {
    // Warm the module so the version is populated (best-effort, but on this
    // host createBlank works so warming succeeds).
    await ensureEngine("wasm");
    const report = await engineCapabilities();
    const wasm = entry(report, WASM_ENGINE_NAME);
    expect(wasm).toBeDefined();
    expect(wasm?.status).toBe("AVAILABLE");
  });

  it("reports the host-runtime engine with a structured status (never throws)", async () => {
    const report = await engineCapabilities();
    const com = entry(report, COM_ENGINE_NAME);
    expect(com).toBeDefined();
    expect([
      "AVAILABLE",
      "NOT_INSTALLED",
      "NOT_REGISTERED",
      "VERSION_MISMATCH",
      "UNAVAILABLE",
    ]).toContain(com?.status);
    // A detail string is always present so callers can explain the status.
    expect(typeof com?.detail).toBe("string");
  });

  it("falls back to WASM with a reason when the host runtime is NOT_REGISTERED", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "NOT_REGISTERED",
      detail: "registration absent (test override)",
    }));
    const report = await engineCapabilities();
    expect(report.active).toBe(WASM_ENGINE_NAME);
    expect(report.fallback_reason).toBeDefined();
    expect(report.fallback_reason).toContain("NOT_REGISTERED");
    expect(entry(report, COM_ENGINE_NAME)?.status).toBe("NOT_REGISTERED");
  });

  it("falls back to WASM when the host runtime is UNAVAILABLE", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "UNAVAILABLE",
      detail: "probe could not determine state (test override)",
    }));
    const report = await engineCapabilities();
    expect(report.active).toBe(WASM_ENGINE_NAME);
    expect(report.fallback_reason).toContain("UNAVAILABLE");
  });

  it("reports the host-runtime version when detected, but stays on the WASM fallback (slot phase)", async () => {
    // Even when the runtime probe reports AVAILABLE, the host-runtime engine is
    // a non-operational slot this phase, so automatic selection stays on WASM
    // and the report explains the runtime is detected-but-not-operational.
    __setComProbeOverrideForTests(() => ({
      status: "AVAILABLE",
      version: "9.99.0.0",
      detail: "automation registration found (test override)",
    }));
    const report = await engineCapabilities();
    expect(report.active).toBe(WASM_ENGINE_NAME);
    expect(report.fallback_reason).toContain("not yet operational");
    const com = entry(report, COM_ENGINE_NAME);
    expect(com?.status).toBe("AVAILABLE");
    expect(com?.version).toBe("9.99.0.0");
  });

  it("probeComRuntime is total — returns a structured result with no override", () => {
    const result = probeComRuntime();
    expect(typeof result.status).toBe("string");
    expect(typeof result.detail).toBe("string");
  });
});

describe("hwp_engine_status tool", () => {
  afterEach(() => {
    __setComProbeOverrideForTests(null);
  });

  it("returns a structured report without throwing", async () => {
    const result = await executeHwpEngineStatus();
    expect(Array.isArray(result.engines)).toBe(true);
    expect(result.engines.length).toBeGreaterThanOrEqual(2);
    expect(typeof result.active).toBe("string");
    // WASM entry is always present and AVAILABLE.
    const wasm = result.engines.find((e) => e.name === WASM_ENGINE_NAME);
    expect(wasm?.status).toBe("AVAILABLE");
  });

  it("surfaces the fallback reason when the host runtime is unavailable", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "NOT_INSTALLED",
      detail: "no host office automation registration found (test override)",
    }));
    const result = await executeHwpEngineStatus();
    expect(result.active).toBe(WASM_ENGINE_NAME);
    expect(result.fallback_reason).toContain("NOT_INSTALLED");
  });
});

describe("engine selection / fallback (ensureEngine + getEngine)", () => {
  beforeEach(() => {
    __resetForTests();
  });

  afterEach(() => {
    __setComProbeOverrideForTests(null);
    __resetForTests();
  });

  it("auto resolves to WASM when the host runtime is unavailable", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "NOT_INSTALLED",
      detail: "test override",
    }));
    const engine = await ensureEngine("auto");
    expect(engine.name).toBe(WASM_ENGINE_NAME);
    // getEngine("auto") finds the same warmed handle.
    expect(getEngine("auto").name).toBe(WASM_ENGINE_NAME);
  });

  it("explicit 'com' falls back to WASM when unavailable", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "UNAVAILABLE",
      detail: "test override",
    }));
    const engine = await ensureEngine("com");
    expect(engine.name).toBe(WASM_ENGINE_NAME);
  });

  it("auto stays on WASM even when the host runtime is detected (slot not operational)", async () => {
    // The host-runtime engine is a non-operational slot this phase, so auto
    // must NOT select it even when the probe reports AVAILABLE — driving a
    // document through the slot would fail. It falls back to WASM.
    __setComProbeOverrideForTests(() => ({
      status: "AVAILABLE",
      detail: "test override",
    }));
    const engine = await ensureEngine("auto");
    expect(engine.name).toBe(WASM_ENGINE_NAME);
    expect(getEngine("auto").name).toBe(WASM_ENGINE_NAME);
  });

  it("explicit 'com' also falls back to WASM while the slot is non-operational", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "AVAILABLE",
      detail: "test override",
    }));
    const engine = await ensureEngine("com");
    expect(engine.name).toBe(WASM_ENGINE_NAME);
  });

  it("explicit 'wasm' always selects WASM", async () => {
    const engine = await ensureEngine("wasm");
    expect(engine.name).toBe(WASM_ENGINE_NAME);
  });

  it("unknown engine name throws UNKNOWN_ENGINE", async () => {
    await expect(ensureEngine("nope")).rejects.toMatchObject({
      code: "UNKNOWN_ENGINE",
    });
  });

  it("getEngine before ensureEngine throws ENGINE_NOT_READY", () => {
    expect(() => getEngine("wasm")).toThrowError(
      expect.objectContaining({ code: "ENGINE_NOT_READY" }),
    );
  });
});

describe("ComDocumentEngine slot", () => {
  afterEach(() => {
    __setComProbeOverrideForTests(null);
  });

  it("openFromBytes throws a typed ENGINE_UNAVAILABLE error", async () => {
    const engine = new ComDocumentEngine();
    await expect(engine.openFromBytes(new Uint8Array([1, 2, 3]))).rejects.toMatchObject(
      { code: "ENGINE_UNAVAILABLE" },
    );
  });

  it("createBlank throws a typed ENGINE_UNAVAILABLE error", async () => {
    const engine = new ComDocumentEngine();
    let caught: unknown;
    try {
      await engine.createBlank();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RhwpError);
    expect((caught as RhwpError).code).toBe("ENGINE_UNAVAILABLE");
  });

  it("the unavailable message states the reason even when the runtime is AVAILABLE", async () => {
    __setComProbeOverrideForTests(() => ({
      status: "AVAILABLE",
      detail: "test override",
    }));
    const engine = new ComDocumentEngine();
    await expect(engine.createBlank()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("dispose is a no-op that resolves", async () => {
    const engine = new ComDocumentEngine();
    await expect(
      engine.dispose(undefined as never),
    ).resolves.toBeUndefined();
  });
});
