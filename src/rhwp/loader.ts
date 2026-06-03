/**
 * @rhwp/core WASM loader with warm-on-start semantics.
 *
 * Sprint 0 plan reference: src/rhwp/loader.ts must warm the WASM module
 * BEFORE the MCP server starts accepting tool calls. The reason is timeout:
 * MCP clients (Claude Desktop, Cursor, Claude Code) apply per-tool-call
 * timeouts. If the first tool call also has to pay for WASM instantiation,
 * we risk timing out the user's very first request — the worst possible UX.
 *
 * Sprint 0 step 9 (Architect note N1) and the spec's Open Q5 are RESOLVED
 * by `docs/measurements/rhwp-field-api.md`:
 *   - The shipped artifact is wasm-bindgen output: `rhwp.js` + `rhwp_bg.wasm`
 *     in the package root. `package.json` has no `exports` field, so direct
 *     subpath imports of the bytes are blocked — we resolve via the
 *     `package.json` path and read the bytes next to it.
 *   - The async `default` export is `__wbg_init(module_or_path)` —
 *     browser-style. Called with no argument it tries to fetch the .wasm
 *     file over HTTP, which fails in Node. The fix is to pass the WASM
 *     bytes explicitly: `await default({ module_or_path: bytes })`.
 *   - Class APIs (HwpDocument, HwpViewer) and module functions
 *     (extractThumbnail, version) all require WASM to be initialised first.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import { RhwpError } from "./errors.js";
import type { DocumentEngine } from "./types.js";
import { WasmDocumentEngine } from "./engine/wasm-engine.js";
import { ComDocumentEngine } from "./engine/com-engine.js";
import {
  COM_ENGINE_NAME,
  WASM_ENGINE_NAME,
  probeComRuntime,
} from "./engine/capabilities.js";

// The shape of @rhwp/core 0.7.x is documented in
// `docs/measurements/rhwp-field-api.md`. Until Sprint 1 wires the typed
// re-export of HwpDocument / HwpViewer / version / extractThumbnail, we
// keep this as `any` to avoid duplicating wasm-bindgen's generated typings
// here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RhwpModule = any;

let rhwpModule: RhwpModule | null = null;
let warmPromise: Promise<RhwpModule> | null = null;
let warmDurationMs: number | null = null;

/**
 * Resolve the absolute path to the WASM bytes file shipped inside
 * `@rhwp/core`. We resolve the package's `package.json` (an entry the
 * package's `files` field guarantees) and look for `rhwp_bg.wasm` next to
 * it — this avoids depending on the package's `exports` field, which
 * 0.7.x does not declare for the bytes.
 */
function resolveRhwpWasmPath(): string {
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve("@rhwp/core/package.json");
  return join(dirname(pkgJsonPath), "rhwp_bg.wasm");
}

/**
 * Force-warm the rhwp WASM module. Safe to call multiple times — subsequent
 * calls return the cached module without re-importing.
 *
 * Logs a single line to stderr in the form
 * `wasm warm: <ms>ms (rhwp/core v<X.Y.Z>, <bytes> bytes)` on first
 * successful warm. The Sprint 0 exit criterion asserts ≤ 2000 ms on each OS.
 *
 * Errors are wrapped as RhwpError(category=other, code=WARM_FAILED).
 */
export async function warmRhwp(): Promise<RhwpModule> {
  if (rhwpModule !== null) {
    return rhwpModule;
  }

  if (warmPromise !== null) {
    return warmPromise;
  }

  warmPromise = (async () => {
    const start = performance.now();
    try {
      const mod = (await import("@rhwp/core")) as RhwpModule;

      if (typeof mod.default !== "function") {
        throw new Error(
          "rhwp.default is not a function — expected wasm-bindgen __wbg_init signature.",
        );
      }

      // Load the WASM bytes synchronously from the installed package and
      // hand them to the async init. The default export accepts a
      // `module_or_path` argument; passing a Uint8Array (BufferSource) skips
      // the browser fetch path entirely.
      const wasmPath = resolveRhwpWasmPath();
      const bytes = readFileSync(wasmPath);
      await mod.default({ module_or_path: bytes });

      // Wire up the rust panic hook if available — turns Rust panics into
      // legible JS error messages for the wrapPanic adapter to classify.
      if (typeof mod.init_panic_hook === "function") {
        try {
          mod.init_panic_hook();
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          process.stderr.write(`wasm init_panic_hook ignored (${m})\n`);
        }
      }

      const ms = Math.round(performance.now() - start);
      warmDurationMs = ms;
      const ver = typeof mod.version === "function" ? mod.version() : "?";
      // Use stderr so the line never collides with MCP stdio JSON-RPC framing
      // on stdout.
      process.stderr.write(
        `wasm warm: ${ms}ms (rhwp/core v${ver}, ${bytes.length} bytes)\n`,
      );

      rhwpModule = mod;
      return mod;
    } catch (err) {
      warmPromise = null; // allow retry
      throw new RhwpError({
        category: "other",
        code: "WARM_FAILED",
        message:
          "Failed to warm @rhwp/core WASM module. Check that the package is " +
          "installed (`npm install @rhwp/core`), Node ≥ 20, and that " +
          "rhwp_bg.wasm is present next to @rhwp/core/package.json.",
        cause: err,
      });
    }
  })();

  return warmPromise;
}

/**
 * Return the warmed rhwp module. Throws if warmRhwp() has not completed yet.
 * This is intentional — every tool handler should be invoked AFTER server
 * startup wires warmRhwp() into the boot sequence, so getRhwp() failing
 * indicates a wiring bug, not a runtime condition.
 */
export function getRhwp(): RhwpModule {
  if (rhwpModule === null) {
    throw new RhwpError({
      category: "other",
      code: "NOT_WARMED",
      message:
        "rhwp WASM module accessed before warmRhwp() completed. " +
        "Ensure src/server.ts awaits warmRhwp() before server.connect().",
    });
  }
  return rhwpModule;
}

/**
 * Inspection helper, currently used by tests / probes. Returns the duration
 * of the warm-load step in ms, or null if warmRhwp() has not completed.
 */
export function getWarmDurationMs(): number | null {
  return warmDurationMs;
}

/**
 * Engine registry — maps an engine name to its constructed instance.
 *
 * The default engine is WASM (@rhwp/core). The registry exists so additional
 * engine implementations can be registered as separate slots without touching
 * the tool layer, which only ever asks for "an engine" via the factory below.
 *
 * "auto" resolves to the preferred available engine (host-runtime when its
 * capability probe reports AVAILABLE, otherwise the WASM fallback); explicit
 * names ("wasm", "com") select a specific implementation. The concrete-name
 * resolution lives in `resolveEngineName`, so the registry stores and looks up
 * engines strictly by their concrete `engine.name`.
 */
class EngineRegistry {
  private readonly engines = new Map<string, DocumentEngine>();

  register(engine: DocumentEngine): void {
    this.engines.set(engine.name, engine);
  }

  /** Look up an engine by its concrete name ("wasm" / "com"). */
  get(concreteName: string): DocumentEngine | undefined {
    return this.engines.get(concreteName);
  }

  clear(): void {
    this.engines.clear();
  }
}

const engineRegistry = new EngineRegistry();

/**
 * Construct (but do not warm) the engine instance for a concrete name.
 */
function constructEngine(concreteName: string): DocumentEngine {
  if (concreteName === COM_ENGINE_NAME) {
    return new ComDocumentEngine();
  }
  return new WasmDocumentEngine();
}

/**
 * Decide whether the host-runtime engine should be selected right now.
 *
 * Two conditions must both hold: (1) its capability probe reports AVAILABLE,
 * and (2) the engine implementation is `operational` — i.e. its document
 * methods are actually wired. In this phase the host-runtime engine is a slot
 * (`operational === false`), so this returns false even when the runtime is
 * detected, and automatic selection falls back to the WASM engine. The
 * `operational` flag is the single source of truth, so when live driving
 * lands this gate opens automatically with no further change here.
 */
function comSelectable(): boolean {
  if (probeComRuntime().status !== "AVAILABLE") {
    return false;
  }
  return constructEngine(COM_ENGINE_NAME).operational;
}

/**
 * Resolve a requested engine name to the concrete engine that should actually
 * be warmed/returned, applying capability-driven selection.
 *
 * - `undefined` / `"auto"` → host-runtime engine when it is selectable
 *   (AVAILABLE + operational), otherwise the WASM fallback.
 * - `"com"` → the host-runtime engine only when selectable; otherwise WASM
 *   (the slot's document methods would reject anyway, so warming the usable
 *   engine keeps `getEngine` viable).
 * - `"wasm"` → WASM.
 * - anything else → UNKNOWN_ENGINE.
 *
 * Returns the resolved concrete engine name. Throws only for unknown names.
 */
function resolveEngineName(name?: string): string {
  if (name === undefined || name === "auto") {
    return comSelectable() ? COM_ENGINE_NAME : WASM_ENGINE_NAME;
  }

  if (name === WASM_ENGINE_NAME) {
    return WASM_ENGINE_NAME;
  }

  if (name === COM_ENGINE_NAME) {
    return comSelectable() ? COM_ENGINE_NAME : WASM_ENGINE_NAME;
  }

  throw new RhwpError({
    category: "other",
    code: "UNKNOWN_ENGINE",
    message:
      `Unknown engine '${name}'. Known engines are ` +
      `'${WASM_ENGINE_NAME}', '${COM_ENGINE_NAME}', and 'auto'.`,
  });
}

/**
 * Ensure an engine is warmed and registered, returning its handle.
 *
 * For the WASM engine this warms the underlying module (via `warmRhwp`) before
 * constructing and registering the engine instance. The host-runtime engine
 * needs no WASM warm. This is the asynchronous counterpart to `getEngine`:
 * callers `await ensureEngine()` once (typically at a creation boundary), then
 * may use the synchronous `getEngine()` thereafter.
 *
 * Engine selection applies capability-driven fallback (see `resolveEngineName`):
 * `"auto"` and `"com"` resolve to the host-runtime engine only when its
 * capability probe reports AVAILABLE, otherwise to WASM. Unknown engine names
 * throw RhwpError(other, UNKNOWN_ENGINE).
 */
export async function ensureEngine(name?: string): Promise<DocumentEngine> {
  const resolved = resolveEngineName(name);

  const existing = engineRegistry.get(resolved);
  if (existing !== undefined) {
    return existing;
  }

  // The WASM-backed engine needs the module warmed before use. The
  // host-runtime engine carries no WASM dependency, so it skips the warm.
  if (resolved === WASM_ENGINE_NAME) {
    await warmRhwp();
  }

  const engine = constructEngine(resolved);
  engineRegistry.register(engine);
  return engine;
}

/**
 * Concrete engine name that `ensureEngine("auto")` / `getEngine("auto")` would
 * resolve to right now, applying capability-driven selection. Exposed so the
 * capability surface reports the same `active` engine the loader would pick —
 * a single source of truth for selection.
 */
export function resolveActiveEngine(): string {
  return resolveEngineName("auto");
}

/**
 * Return an already-warmed, registered engine handle synchronously.
 *
 * Throws RhwpError(other, ENGINE_NOT_READY) if `ensureEngine()` has not
 * completed for this engine yet — mirroring `getRhwp()`'s NOT_WARMED contract.
 * This split keeps a synchronous factory (`getEngine`) for the hot path while
 * the asynchronous warming (`ensureEngine`) happens once at a boundary.
 *
 * Selection mirrors `ensureEngine`: the same capability-driven resolution maps
 * `"auto"` / `"com"` to the concrete engine name, so a handle warmed by
 * `ensureEngine("auto")` is found by `getEngine("auto")`. Unknown names throw
 * UNKNOWN_ENGINE (via the shared resolver).
 */
export function getEngine(name?: string): DocumentEngine {
  const resolved = resolveEngineName(name);
  const engine = engineRegistry.get(resolved);
  if (engine === undefined) {
    throw new RhwpError({
      category: "other",
      code: "ENGINE_NOT_READY",
      message:
        `Engine '${resolved}' accessed before ensureEngine('${name ?? "auto"}') completed. ` +
        "Ensure the creation boundary awaits ensureEngine() first.",
    });
  }
  return engine;
}

/**
 * Reset state — used only by tests. Do not call from production code.
 *
 * @internal
 */
export function __resetForTests(): void {
  rhwpModule = null;
  warmPromise = null;
  warmDurationMs = null;
  engineRegistry.clear();
}
