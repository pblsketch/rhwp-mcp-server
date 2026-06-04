/**
 * Host-runtime (COM) document engine — capability slot.
 *
 * Implements the engine-neutral `DocumentEngine` contract for the locally
 * installed Korean office automation surface. This phase ships the engine as a
 * *slot*: the document operations (open / create / dispose) are wired to fail
 * with an explicit, typed `ENGINE_UNAVAILABLE` error rather than attempting to
 * drive the host runtime. Actually instantiating and editing a live document
 * is a later, separately-gated capability and intentionally introduces no new
 * runtime dependency here.
 *
 * Why the slot exists now: it lets the loader register a real engine handle for
 * the host-runtime path so capability reporting and automatic fallback can be
 * exercised end-to-end, while keeping the build dependency-free and CI-safe.
 *
 * Each failing method consults the capability probe so the thrown error
 * explains *why* the engine is unavailable on this host (platform, missing
 * registration, etc.), giving callers an actionable remediation hint.
 */

import { engineUnavailable } from "../errors.js";
import type { DocumentEngine, EngineDocument } from "../types.js";
import { probeComRuntime, type ComProbeResult } from "./capabilities.js";

/**
 * Compose the unavailability detail for the current host. When the runtime is
 * actually AVAILABLE we still raise — live document driving is not implemented
 * in this slot — and say so explicitly so the message is never misleading.
 */
function unavailableDetail(probe: ComProbeResult): string {
  if (probe.status === "AVAILABLE") {
    return (
      "host automation runtime detected, but live document driving is not " +
      "yet implemented for this engine"
    );
  }
  return `${probe.status} — ${probe.detail}`;
}

/**
 * Engine backed by the host office automation surface.
 *
 * The construction/serialization boundary is asynchronous to match the
 * `DocumentEngine` contract; in this slot every boundary method rejects with a
 * typed `ENGINE_UNAVAILABLE` error sourced from the capability probe.
 */
export class ComDocumentEngine implements DocumentEngine {
  // Literal (not the imported constant) so the field stays defined regardless
  // of module-evaluation order in the engine/loader import cycle.
  readonly name = "com";
  /**
   * Slot only — document driving is not implemented this phase, so automatic
   * engine selection must skip this engine and fall back to an operational
   * one even when the host runtime is detected.
   */
  readonly operational = false;

  /** Slot: rejects with ENGINE_UNAVAILABLE (live driving not implemented). */
  openFromBytes(_bytes: Uint8Array, _format?: "hwp" | "hwpx"): Promise<EngineDocument> {
    // Return a rejected promise (not a synchronous throw) so callers awaiting
    // the asynchronous boundary observe a normal rejection.
    return Promise.reject(
      engineUnavailable(this.name, unavailableDetail(probeComRuntime())),
    );
  }

  /** Slot: rejects with ENGINE_UNAVAILABLE (live driving not implemented). */
  createBlank(): Promise<EngineDocument> {
    return Promise.reject(
      engineUnavailable(this.name, unavailableDetail(probeComRuntime())),
    );
  }

  /**
   * Release engine-owned resources. No handle can exist for this slot (open /
   * create never succeed), so dispose is a no-op that resolves immediately.
   */
  dispose(_doc: EngineDocument): Promise<void> {
    return Promise.resolve();
  }
}
