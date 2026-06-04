/**
 * WASM document engine adapter.
 *
 * Implements the engine-neutral `DocumentEngine` contract on top of the
 * @rhwp/core WASM module. Every method is a 1:1 delegation to the synchronous
 * WASM surface, wrapped in `Promise.resolve(...)` so the asynchronous engine
 * boundary holds without changing observable behaviour: the cost is a single
 * microtask tick, and the produced handle is the same synchronous document the
 * tools already manipulate directly.
 *
 * No normalization or restructuring of the WASM result happens here — that is
 * intentionally out of scope so the creation boundary stays behaviour-
 * preserving.
 */

import { getRhwp } from "../loader.js";
import type { DocumentEngine, EngineDocument, RhwpModuleLike } from "../types.js";

/**
 * Engine backed by the warmed @rhwp/core WASM module.
 *
 * The engine reads the module via `getRhwp()` at call time (not at
 * construction), so a single engine instance stays valid across the module's
 * lifecycle. Warming is the loader's responsibility (`ensureEngine`).
 */
export class WasmDocumentEngine implements DocumentEngine {
  readonly name = "wasm";
  /** Fully implemented — services document operations directly. */
  readonly operational = true;

  /**
   * Build a document handle from bytes. The `format` hint is accepted for
   * interface symmetry but is advisory: the underlying constructor detects the
   * format from the byte signature, matching the prior direct-construction
   * behaviour.
   */
  openFromBytes(bytes: Uint8Array, _format?: "hwp" | "hwpx"): Promise<EngineDocument> {
    const mod = getRhwp() as RhwpModuleLike;
    return Promise.resolve(new mod.HwpDocument(bytes));
  }

  /** Build a blank document handle from the bundled template. */
  createBlank(): Promise<EngineDocument> {
    const mod = getRhwp() as RhwpModuleLike;
    return Promise.resolve(mod.HwpDocument.createEmpty());
  }

  /**
   * Release the WASM-owned handle. Delegates to the handle's finaliser when
   * present; safe to call multiple times. Provisional lifetime semantics.
   */
  dispose(doc: EngineDocument): Promise<void> {
    if (typeof doc.free === "function") {
      try {
        doc.free();
      } catch {
        // Best-effort — the finaliser is idempotent and may have already run.
      }
    }
    return Promise.resolve();
  }
}
