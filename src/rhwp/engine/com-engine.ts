/**
 * Host-runtime (automation) document engine.
 *
 * Implements the engine-neutral `DocumentEngine` contract for the locally
 * installed Korean office automation surface by driving a Python helper
 * subprocess over a line-delimited JSON protocol (ADR-0008). The Node side owns
 * the engine contract — capability gating, per-command timeouts, and error
 * classification into typed `RhwpError`s — while the Python helper owns the
 * host automation object model.
 *
 * Operability is gated, conservatively, on three conditions that must ALL hold:
 *   1. Opt-in: the user set the `RHWP_COM` env flag. The automation path drives
 *      a live document on an interactive desktop and so is never a silent
 *      default — it is off unless explicitly chosen.
 *   2. Capability: the registry probe reports the automation surface AVAILABLE
 *      on this Windows host.
 *   3. Handshake: the helper's `ping` succeeded (the wrapper imports and the
 *      automation object is registered). This is what flips `operational` from
 *      "registered" to "actually reachable" — a registered-but-unreachable
 *      runtime still reports non-operational and the existing automatic WASM
 *      fallback applies (ADR-0007).
 *
 * The `operational` getter is synchronous (the `DocumentEngine` contract), so
 * it reads the *cached* handshake outcome. The handshake itself is async
 * (`ensureHandshake`) and runs once at the engine-selection boundary
 * (`ensureEngine` in the loader) and in the capability report. Until a
 * handshake has run, `operational` stays false so synchronous selection
 * conservatively falls back to WASM rather than picking an unverified engine.
 *
 * IMPORTANT: nothing here instantiates the live host automation object. The
 * handshake is `ping` only (import + registry check); the object is created by
 * the helper lazily on the first real document command.
 */

import { engineUnavailable, RhwpError } from "../errors.js";
import type {
  CellCoords,
  CellMetadata,
  DocumentEngine,
  EngineDocument,
} from "../types.js";
import {
  isComOptedIn,
  probeComRuntime,
  type ComProbeResult,
} from "./capabilities.js";
import {
  ComHelperBridge,
  type HelperLauncher,
} from "./com-helper-bridge.js";

/** Cached handshake outcomes the synchronous `operational` getter reads. */
type HandshakeState = "unknown" | "ok" | "failed";

/**
 * Compose the unavailability detail for the current host, explaining which of
 * the opt-in / capability / handshake gates is not satisfied.
 */
function unavailableDetail(probe: ComProbeResult, handshake: HandshakeState): string {
  if (!isComOptedIn()) {
    return (
      "host automation engine is opt-in and disabled (set RHWP_COM=1 to enable; " +
      "requires the Hangul word processor installed, `pip install pyhwpx`, and " +
      "an interactive desktop session)"
    );
  }
  if (probe.status !== "AVAILABLE") {
    return `${probe.status} — ${probe.detail}`;
  }
  if (handshake === "failed") {
    return "host automation helper handshake failed (helper unreachable or wrapper missing)";
  }
  return "host automation handshake has not completed yet";
}

/**
 * Engine backed by the host office automation surface via the Python helper
 * bridge.
 */
export class ComDocumentEngine implements DocumentEngine {
  // Literal (not the imported constant) so the field stays defined regardless
  // of module-evaluation order in the engine/loader import cycle.
  readonly name = "com";

  /** The helper bridge, created lazily on first handshake/command. */
  private bridge: ComHelperBridge | null = null;

  /** Cached handshake outcome read by the synchronous `operational` getter. */
  private handshake: HandshakeState = "unknown";

  /**
   * Optional launcher override (tests inject a mock helper). When set, the
   * bridge is built with it instead of the default Python launcher.
   */
  private launcherOverride: HelperLauncher | null = null;

  constructor(launcher?: HelperLauncher) {
    this.launcherOverride = launcher ?? null;
  }

  /**
   * Whether the engine can service document operations right now. Synchronous
   * by contract, so it reads the cached handshake outcome. All three gates must
   * hold: opt-in, capability AVAILABLE, and a successful cached handshake.
   */
  get operational(): boolean {
    if (!isComOptedIn()) {
      return false;
    }
    if (probeComRuntime().status !== "AVAILABLE") {
      return false;
    }
    return this.handshake === "ok";
  }

  /** Lazily build the bridge with the active launcher. */
  private getBridge(): ComHelperBridge {
    if (this.bridge === null) {
      this.bridge =
        this.launcherOverride !== null
          ? new ComHelperBridge(this.launcherOverride)
          : new ComHelperBridge();
    }
    return this.bridge;
  }

  /**
   * Run the `ping` handshake once and cache the result, flipping `operational`.
   * No-op (returns the cached verdict) when opt-in is off or the capability
   * probe is not AVAILABLE — neither does any subprocess work in that case.
   *
   * Returns true when the engine is now operational. Never throws — a failed
   * handshake is cached as "failed" so selection falls back to WASM.
   */
  async ensureHandshake(): Promise<boolean> {
    if (!isComOptedIn() || probeComRuntime().status !== "AVAILABLE") {
      this.handshake = "failed";
      return false;
    }
    if (this.handshake !== "unknown") {
      return this.handshake === "ok";
    }
    try {
      const bridge = this.getBridge();
      const resp = await bridge.command("ping", {}, 10_000);
      // A reachable helper reports the automation registration; require it.
      this.handshake = resp.automation_registered === true ? "ok" : "failed";
    } catch {
      this.handshake = "failed";
    }
    return this.handshake === "ok";
  }

  /** Raise the typed ENGINE_UNAVAILABLE error for the current gate state. */
  private unavailable(): RhwpError {
    return engineUnavailable(
      this.name,
      unavailableDetail(probeComRuntime(), this.handshake),
    );
  }

  /**
   * Open a document from bytes via the helper. Requires a successful handshake;
   * when the engine is not operational it rejects with ENGINE_UNAVAILABLE so
   * callers fall back to WASM.
   *
   * The live automation object works against file paths, so the bytes are
   * materialised to a temp file the helper opens. The handle returned bridges
   * the synchronous document surface the tools expect onto the helper-driven
   * object; the full document-surface mapping is exercised on the interactive
   * desktop target. In every non-opt-in context this method is unreachable
   * because the handshake gate rejects first.
   */
  async openFromBytes(bytes: Uint8Array, format?: "hwp" | "hwpx"): Promise<EngineDocument> {
    if (!(await this.ensureHandshake())) {
      throw this.unavailable();
    }
    const path = await this.writeTempDocument(bytes, format);
    await this.getBridge().command("open", { path });
    return this.makeHandle();
  }

  /**
   * Create a blank document via the helper. Requires a successful handshake.
   */
  async createBlank(): Promise<EngineDocument> {
    if (!(await this.ensureHandshake())) {
      throw this.unavailable();
    }
    await this.getBridge().command("create_blank", {});
    return this.makeHandle();
  }

  /**
   * Materialise document bytes to a temp file the helper can open. The host
   * object model opens by path, so the byte-oriented engine contract is bridged
   * through a short-lived temp file.
   */
  private async writeTempDocument(
    bytes: Uint8Array,
    format?: "hwp" | "hwpx",
  ): Promise<string> {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeFile } = await import("node:fs/promises");
    const ext = format === "hwpx" ? "hwpx" : "hwp";
    const file = join(tmpdir(), `rhwp-com-${process.pid}-${Date.now()}.${ext}`);
    await writeFile(file, bytes);
    return file;
  }

  /**
   * Build the engine document handle. The handle delegates document-surface
   * calls to the helper; the concrete method mapping is built out and validated
   * on the interactive desktop target. Returning a typed handle keeps the
   * engine contract satisfied while the per-method wiring lands.
   */
  private makeHandle(): EngineDocument {
    // The handle is intentionally minimal in this phase: it names the bridge so
    // the tool layer can dispose it, while individual document-surface methods
    // are wired against the desktop target. Casting through `unknown` keeps the
    // contract type without fabricating an unverified synchronous surface.
    const bridge = this.getBridge();
    return { __comBridge: bridge } as unknown as EngineDocument;
  }

  /**
   * Read authoritative table-cell geometry from the host object model. Requires
   * a successful handshake; the live extraction is desktop-gated and surfaces a
   * typed error until validated, so callers fall back to the heuristic path.
   */
  async getCellMetadata(_doc: EngineDocument, coords: CellCoords): Promise<CellMetadata> {
    if (!(await this.ensureHandshake())) {
      throw this.unavailable();
    }
    const resp = await this.getBridge().command("get_cell_metadata", {
      coords,
    });
    const meta = resp as Partial<CellMetadata> & { ok?: boolean };
    return {
      row_span: typeof meta.row_span === "number" ? meta.row_span : 1,
      col_span: typeof meta.col_span === "number" ? meta.col_span : 1,
      covered: meta.covered === true,
    };
  }

  /**
   * Release engine-owned resources. Disposes the helper bridge, which asks the
   * helper to quit (releasing the automation object) and reaps the subprocess.
   * Safe to call when no bridge exists. The `_doc` handle has no separate
   * lifetime in this phase — document lifetime is the helper's.
   */
  async dispose(_doc?: EngineDocument): Promise<void> {
    if (this.bridge !== null) {
      await this.bridge.dispose();
      this.bridge = null;
      this.handshake = "unknown";
    }
  }
}
