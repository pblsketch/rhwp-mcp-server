/**
 * Engine capability detection.
 *
 * Reports which document engines are usable on the current host without
 * pulling in any heavyweight runtime dependency. The WASM engine ships inside
 * this package and is therefore always available; the COM engine depends on a
 * host office runtime, so its availability is determined by a *light*
 * environment probe (platform check + known install-path / typelib-registration
 * presence) — never by loading a COM bridge or spawning a helper process.
 *
 * Design rule: detection MUST NOT throw. Every probe step is wrapped so a
 * missing file, a denied registry read, or a non-Windows platform yields a
 * structured `NOT_INSTALLED` / `NOT_REGISTERED` / `UNAVAILABLE` status instead
 * of an exception. Callers (the loader's fallback logic, the
 * `hwp_engine_status` tool) rely on this total-function contract.
 *
 * Primary rationale for offering a host-runtime engine at all: Korean offices
 * commonly have the Hangul word processor installed locally, and editing a
 * live document through its automation surface yields higher fidelity than a
 * pure byte-level engine. Detecting that runtime's presence is the first step;
 * actually driving it is a later, separately-gated capability.
 */

import { getRhwp, resolveActiveEngine } from "../loader.js";
import type {
  EngineCapabilityEntry,
  EngineCapabilityReport,
  EngineStatus,
} from "../types.js";

/** Stable engine identifiers. */
export const WASM_ENGINE_NAME = "wasm";
export const COM_ENGINE_NAME = "com";

/**
 * Outcome of the host-runtime probe for the COM engine. Kept separate from the
 * public `EngineCapabilityEntry` so the probe can be unit-tested and injected
 * independently of how the report is assembled.
 */
export interface ComProbeResult {
  status: EngineStatus;
  version?: string;
  detail: string;
}

/**
 * Probe override hook (tests only). When set, `probeComRuntime()` returns this
 * value instead of running the real environment detection, so the
 * NOT_REGISTERED / VERSION_MISMATCH / AVAILABLE branches can be exercised
 * deterministically on any host.
 *
 * @internal
 */
let comProbeOverride: (() => ComProbeResult) | null = null;

/**
 * Install a COM-probe override for tests. Pass `null` to restore real
 * detection.
 *
 * @internal
 */
export function __setComProbeOverrideForTests(
  override: (() => ComProbeResult) | null,
): void {
  comProbeOverride = override;
}

/**
 * Known registry paths that indicate the host office automation surface is
 * registered. Reading these is best-effort: failure to read is treated as
 * "not registered", never as an error.
 *
 * These are generic Windows registry locations for the locally-installed
 * Korean office suite's automation object and install metadata. We only read
 * them — we never write, and we never instantiate the object.
 */
const REGISTRY_PROBE_KEYS: readonly string[] = [
  // Automation ProgID for the office suite's document frame object.
  "HKLM\\SOFTWARE\\Classes\\HWPFrame.HwpObject",
  "HKLM\\SOFTWARE\\Classes\\HWPFrame.HwpObject.1",
  // WOW6432 view for 32-bit registration on 64-bit Windows.
  "HKLM\\SOFTWARE\\WOW6432Node\\Classes\\HWPFrame.HwpObject",
];

/**
 * Read a Windows registry key's presence via `reg query`. Returns true only if
 * the key exists and the query succeeds. Any failure (missing key, denied
 * access, command unavailable) returns false — this is a presence probe, not
 * an assertion.
 */
function registryKeyExists(key: string): boolean {
  try {
    // Lazy require keeps this module importable on non-Windows hosts where the
    // child_process spawn would never be reached anyway.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    execFileSync("reg", ["query", key], {
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the light host-runtime probe for the COM engine.
 *
 * Resolution order:
 *   1. Test override, if installed.
 *   2. Non-Windows platforms → UNAVAILABLE (the host automation surface is
 *      Windows-only).
 *   3. Windows → check known registry registrations. If a registration is
 *      found, report AVAILABLE; otherwise NOT_INSTALLED.
 *
 * Every branch returns a structured result; this function never throws.
 */
export function probeComRuntime(): ComProbeResult {
  if (comProbeOverride !== null) {
    try {
      return comProbeOverride();
    } catch {
      return {
        status: "UNAVAILABLE",
        detail: "probe override threw; treating engine as unavailable",
      };
    }
  }

  try {
    if (process.platform !== "win32") {
      return {
        status: "UNAVAILABLE",
        detail:
          `host automation surface is Windows-only (platform=${process.platform})`,
      };
    }

    for (const key of REGISTRY_PROBE_KEYS) {
      if (registryKeyExists(key)) {
        return {
          status: "AVAILABLE",
          detail: `automation registration found (${key})`,
        };
      }
    }

    return {
      status: "NOT_INSTALLED",
      detail:
        "no host office automation registration found in the known registry locations",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "UNAVAILABLE",
      detail: `environment probe failed (${message})`,
    };
  }
}

/**
 * Read the WASM engine's backing version, best-effort. Returns undefined if
 * the module is not warmed yet or the version call is unavailable — never
 * throws.
 */
function readWasmVersion(): string | undefined {
  try {
    const mod = getRhwp() as { version?: () => string };
    if (typeof mod.version === "function") {
      return mod.version();
    }
  } catch {
    // Module not warmed yet, or version() unavailable — fall through.
  }
  return undefined;
}

/**
 * Build the WASM engine capability entry. The WASM engine is bundled in this
 * package, so it is always AVAILABLE; the version is advisory.
 */
function wasmEntry(): EngineCapabilityEntry {
  const version = readWasmVersion();
  const entry: EngineCapabilityEntry = {
    name: WASM_ENGINE_NAME,
    status: "AVAILABLE",
    detail: "bundled engine (always available)",
  };
  if (version !== undefined) {
    entry.version = version;
  }
  return entry;
}

/**
 * Build the COM engine capability entry from the host-runtime probe.
 */
function comEntry(): EngineCapabilityEntry {
  const probe = probeComRuntime();
  const entry: EngineCapabilityEntry = {
    name: COM_ENGINE_NAME,
    status: probe.status,
    detail: probe.detail,
  };
  if (probe.version !== undefined) {
    entry.version = probe.version;
  }
  return entry;
}

/**
 * Produce a structured capability report for all known engines.
 *
 * `active` reflects the engine the loader's automatic selection would pick
 * right now (`resolveActiveEngine()`) — a single source of truth shared with
 * `ensureEngine("auto")`. When `active` is not the preferred host-runtime
 * engine, `fallback_reason` explains why: either the runtime is not detected
 * (probe status) or it is detected but not yet operational (slot phase).
 *
 * This function is total — it never rejects. Each engine entry is built behind
 * its own non-throwing probe; the active-engine resolution is likewise
 * defensive.
 */
export async function engineCapabilities(): Promise<EngineCapabilityReport> {
  const wasm = wasmEntry();
  const com = comEntry();

  // Preference order in the listing: COM first, WASM fallback.
  const engines = [com, wasm];

  let active = WASM_ENGINE_NAME;
  try {
    active = resolveActiveEngine();
  } catch {
    // Defensive — selection should not throw, but never let the report fail.
    active = WASM_ENGINE_NAME;
  }

  if (active === COM_ENGINE_NAME) {
    return { engines, active };
  }

  // Active is the WASM fallback. Explain why the host-runtime engine was not
  // chosen: detection status when unavailable, or slot phase when detected.
  const reason =
    com.status === "AVAILABLE"
      ? `engine '${COM_ENGINE_NAME}' is detected but not yet operational (live document driving is slotted for a later phase)`
      : `engine '${COM_ENGINE_NAME}' is ${com.status}: ${com.detail ?? "no detail"}`;

  return { engines, active, fallback_reason: reason };
}
