/**
 * Typed error classes for rhwp-mcp-server.
 *
 * Why a custom class:
 *   @rhwp/core is implemented in Rust + WebAssembly. A Rust panic crossing the
 *   WASM boundary typically surfaces in Node as an opaque
 *   `RuntimeError: unreachable executed` without a stack trace. That is
 *   useless to MCP clients (and to the LLMs driving them).
 *
 *   This module provides:
 *     - RhwpError: classified error with a `category` field so callers (and
 *       LLMs) can distinguish parse vs serialize vs field vs render vs action
 *       failures.
 *     - wrapPanic: an adapter that catches any throw (including WASM traps),
 *       classifies it with a category hint from the caller, preserves the
 *       original cause, and rethrows as a typed RhwpError.
 *
 *   Every rhwp WASM call in this server MUST flow through wrapPanic so that
 *   no opaque trap reaches the MCP client.
 */

export type RhwpErrorCategory =
  | "parse"
  | "serialize"
  | "action"
  | "field"
  | "render"
  | "session"
  | "other";

export interface RhwpErrorInit {
  category: RhwpErrorCategory;
  /** Short machine-readable code, e.g. NOT_IMPLEMENTED, NO_DOCUMENT, FIELD_UNKNOWN. */
  code?: string;
  /** Human-readable message — surfaced to the MCP client. */
  message: string;
  /** Original error (Rust panic, IO error, etc.). Preserved for debugging. */
  cause?: unknown;
}

export class RhwpError extends Error {
  readonly category: RhwpErrorCategory;
  readonly code: string | undefined;
  override readonly cause: unknown;

  constructor(init: RhwpErrorInit) {
    super(init.message);
    this.name = "RhwpError";
    this.category = init.category;
    this.code = init.code;
    this.cause = init.cause;
    if (typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === "function") {
      // V8 stack-trace cleanup so the WASM trampoline frames don't drown out
      // the actual call site that invoked us.
      (Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        RhwpError,
      );
    }
  }

  /**
   * JSON-friendly serialization for MCP error responses.
   */
  toJSON(): { name: string; category: RhwpErrorCategory; code: string | undefined; message: string } {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Sniff a raw error / throw value to guess whether it looks like a WASM trap.
 * Used by wrapPanic to attach better diagnostics when a Rust panic crosses
 * the boundary.
 */
function isLikelyWasmTrap(value: unknown): boolean {
  if (value instanceof Error) {
    const message = value.message || "";
    if (/unreachable executed/i.test(message)) return true;
    if (/RuntimeError/i.test(value.name) && message.length < 80) return true;
    if (/wasm/i.test(message)) return true;
  }
  return false;
}

/**
 * Wrap a callback so any throw is reclassified into a RhwpError.
 *
 * @param category Best-guess category for failures from this callback.
 *                 Caller picks based on the rhwp operation being invoked
 *                 (e.g. "parse" for hwp_open, "field" for hwp_fill_fields).
 * @param fn       The rhwp WASM-touching callback.
 *
 * If the callback throws a RhwpError already, it is rethrown unchanged
 * (no double-wrapping). If it throws anything else, a fresh RhwpError is
 * constructed with the given category and the original throw preserved as
 * `cause`. Opaque WASM traps get a clarified message.
 */
export async function wrapPanic<T>(
  category: RhwpErrorCategory,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RhwpError) {
      throw err;
    }

    if (isLikelyWasmTrap(err)) {
      throw new RhwpError({
        category,
        code: "WASM_TRAP",
        message:
          "rhwp WASM panic — operation failed inside the Rust runtime. " +
          "This usually means an unsupported document feature or an internal " +
          "rhwp bug. Report upstream at https://github.com/edwardkim/rhwp/issues.",
        cause: err,
      });
    }

    const baseMessage = err instanceof Error ? err.message : String(err);
    throw new RhwpError({
      category,
      code: "RHWP_FAILURE",
      message: baseMessage || "rhwp operation failed without a message",
      cause: err,
    });
  }
}

// NOTE: a sync variant was considered but removed (YAGNI). Every rhwp WASM
// call we actually make is async, and `wrapPanic` accepts both sync and async
// callbacks via `T | Promise<T>` + `await fn()`. Reintroduce only if a real
// pure-sync rhwp call appears.

/**
 * Build a typed error for an engine whose document operations cannot run in
 * the current environment.
 *
 * Engines that depend on a host office runtime (rather than the bundled WASM)
 * only operate when that runtime is installed, registered, and a supported
 * version. When those preconditions are not met, the engine's document methods
 * must fail with a clear, classified error rather than an opaque throw — so
 * callers can distinguish "environment not ready" from a genuine document
 * fault and choose a fallback engine.
 *
 * @param engineName Engine that could not service the request (e.g. "com").
 * @param detail     Probe-derived reason the engine is unavailable, surfaced
 *                   verbatim so the caller knows what to remediate.
 */
export function engineUnavailable(engineName: string, detail: string): RhwpError {
  return new RhwpError({
    category: "other",
    code: "ENGINE_UNAVAILABLE",
    message:
      `Engine '${engineName}' is unavailable in this environment: ${detail}. ` +
      "Use the 'wasm' engine or query hwp_engine_status for capability detail.",
  });
}
