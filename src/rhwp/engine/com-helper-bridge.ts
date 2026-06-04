/**
 * Node ⇄ Python helper bridge for the host-runtime (automation) engine.
 *
 * Spawns the long-lived Python helper (`python/rhwp_hwp_helper.py`) and speaks
 * the line-delimited JSON protocol it implements: one JSON request object per
 * line written to its stdin, one JSON response object per line read from its
 * stdout. The Node side owns the engine contract — per-command timeouts, error
 * classification into typed `RhwpError`s, and process lifetime — while the
 * Python side owns the host automation object model (ADR-0008).
 *
 * Why a subprocess with Node-imposed timeouts: the host automation surface can
 * block on interactive dialogs (auto-recovery, update prompts) that a
 * non-interactive caller cannot dismiss. A blocked helper must surface as a
 * typed timeout on the Node side and never hang the tool caller. Every command
 * is therefore raced against a timer; on timeout the bridge throws a typed
 * `COM_TIMEOUT` error and kills the helper so a wedged automation object cannot
 * leak a headless process.
 *
 * Testability: the launcher (python executable + helper script path) is
 * injectable, so a mock helper (a tiny echo script) can exercise the JSON
 * framing, timeout→typed-error path, and dispose→process-exit lifecycle
 * without launching the real host automation surface.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { once } from "node:events";

import { RhwpError } from "../errors.js";

/** Default per-command timeout. The host automation surface is interactive and
 * can block on dialogs; 15 s balances real first-command warmup against not
 * wedging the caller. Override per call where a command is known to be slower. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

/** Shape of a helper response line (success or structured failure). */
interface HelperResponse {
  ok: boolean;
  id?: string | number;
  category?: string;
  code?: string;
  message?: string;
  [k: string]: unknown;
}

/** How to launch the helper process. Injectable so tests can substitute a mock
 * script (and a different interpreter) for the real Python helper. */
export interface HelperLauncher {
  /** Executable to run (e.g. "python", or "node" for a mock). */
  command: string;
  /** Leading arguments — typically the helper script path. */
  args: string[];
}

/**
 * Resolve the default launcher: the bundled Python helper driven by the
 * interpreter named in `RHWP_PYTHON` (default "python"). The helper script
 * ships next to the built engine under `python/` at the package root.
 */
export function defaultHelperLauncher(): HelperLauncher {
  // dist/rhwp/engine/com-helper-bridge.js → package root is three levels up,
  // and the python helper sits at <root>/python/rhwp_hwp_helper.py. The source
  // tree mirrors this (src/rhwp/engine → <root>/python) so dev (tsx) and built
  // (dist) resolution both land on the same script.
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..");
  const script = join(root, "python", "rhwp_hwp_helper.py");
  const command = process.env.RHWP_PYTHON ?? "python";
  return { command, args: [script] };
}

/** Map a helper failure category string onto a `RhwpError` category. */
function asErrorCategory(category: string | undefined): RhwpError["category"] {
  switch (category) {
    case "parse":
    case "serialize":
    case "action":
    case "field":
    case "render":
    case "session":
    case "other":
      return category;
    default:
      return "other";
  }
}

/**
 * A spawned helper process with line-framed JSON request/response. One command
 * is in flight at a time (the helper is single-threaded request/response); the
 * bridge serializes calls and races each against a timeout.
 */
export class ComHelperBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  /** Resolver for the in-flight command, if any. */
  private pending:
    | {
        resolve: (r: HelperResponse) => void;
        reject: (e: unknown) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | null = null;
  private nextId = 1;
  private spawnError: unknown = null;
  private exited = false;

  constructor(private readonly launcher: HelperLauncher = defaultHelperLauncher()) {}

  /** True once the child has been spawned and not yet disposed/exited. */
  get running(): boolean {
    return this.child !== null && !this.exited;
  }

  /**
   * Spawn the helper process (idempotent). Wiring failures (interpreter not
   * found, script missing) surface lazily on the first command as a typed
   * `COM_SPAWN_FAILED` error so callers get one consistent error channel.
   */
  private ensureSpawned(): void {
    if (this.child !== null) {
      return;
    }
    try {
      const child = spawn(this.launcher.command, this.launcher.args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;
      this.child = child;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      // A write to a killed/exited helper raises an async stream 'error'
      // (EPIPE) that would otherwise surface as an unhandled exception. Swallow
      // it: the exit handler already fails any in-flight command with a typed
      // error, so the stream error carries no additional caller-facing signal.
      child.stdin.on("error", () => {
        /* see comment — handled via exit/timeout paths */
      });
      child.on("error", (err) => {
        // Spawn-level failure (ENOENT etc.) — record and fail the in-flight
        // command if any.
        this.spawnError = err;
        this.failPending(
          new RhwpError({
            category: "session",
            code: "COM_SPAWN_FAILED",
            message:
              `Failed to launch the host-runtime helper ` +
              `('${this.launcher.command}'): ${err instanceof Error ? err.message : String(err)}. ` +
              "Ensure a Python runtime is installed and on PATH (or set RHWP_PYTHON).",
            cause: err,
          }),
        );
      });
      child.on("exit", () => {
        this.exited = true;
        // If a command was awaiting when the process died, fail it rather than
        // hanging the caller.
        this.failPending(
          new RhwpError({
            category: "session",
            code: "COM_HELPER_EXITED",
            message: "host-runtime helper exited before responding",
          }),
        );
      });
    } catch (err) {
      this.spawnError = err;
    }
  }

  /** Accumulate stdout and dispatch each complete JSON line. */
  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIdx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
      if (line.length === 0) {
        continue;
      }
      this.dispatchLine(line);
    }
  }

  private dispatchLine(line: string): void {
    if (this.pending === null) {
      // Unsolicited line (helper noise) — ignore; protocol is strict 1:1.
      return;
    }
    let parsed: HelperResponse;
    try {
      parsed = JSON.parse(line) as HelperResponse;
    } catch {
      // Malformed response line — fail the in-flight command with a typed error
      // rather than crashing the bridge.
      this.failPending(
        new RhwpError({
          category: "other",
          code: "COM_BAD_RESPONSE",
          message: `host-runtime helper returned a non-JSON line: ${line.slice(0, 200)}`,
        }),
      );
      return;
    }
    const settle = this.pending;
    this.pending = null;
    clearTimeout(settle.timer);
    settle.resolve(parsed);
  }

  /** Reject the in-flight command (if any) with `err` and clear its timer. */
  private failPending(err: unknown): void {
    const settle = this.pending;
    if (settle === null) {
      return;
    }
    this.pending = null;
    clearTimeout(settle.timer);
    settle.reject(err);
  }

  /**
   * Send one command and await its response, racing against `timeoutMs`. On
   * timeout the helper is killed (a blocked automation object cannot be
   * unblocked from here) and a typed `COM_TIMEOUT` error is thrown.
   *
   * Throws typed `RhwpError`s for spawn failure, timeout, helper exit, and
   * malformed responses. A structured `{ok:false,...}` helper failure is NOT
   * thrown here — it is returned as-is so callers can decide; `command()` below
   * is the convenience wrapper that converts those into typed errors.
   */
  async send(
    cmd: string,
    args?: Record<string, unknown>,
    timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Promise<HelperResponse> {
    this.ensureSpawned();

    if (this.child === null || this.spawnError !== null) {
      const cause = this.spawnError;
      throw new RhwpError({
        category: "session",
        code: "COM_SPAWN_FAILED",
        message:
          `Host-runtime helper is not running ` +
          `('${this.launcher.command}'): ${cause instanceof Error ? cause.message : String(cause ?? "spawn failed")}. ` +
          "Ensure a Python runtime is installed and on PATH (or set RHWP_PYTHON).",
        cause,
      });
    }

    if (this.exited) {
      throw new RhwpError({
        category: "session",
        code: "COM_HELPER_EXITED",
        message: "host-runtime helper has exited; re-create the bridge to retry",
      });
    }

    if (this.pending !== null) {
      throw new RhwpError({
        category: "session",
        code: "COM_BUSY",
        message: "host-runtime helper is already processing a command",
      });
    }

    const id = this.nextId++;
    const request = JSON.stringify({ cmd, args: args ?? {}, id }) + "\n";

    return await new Promise<HelperResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The command exceeded its budget — assume the automation surface is
        // blocked (e.g. on a dialog). Kill the helper so it cannot leak a
        // headless process, then surface a typed timeout.
        this.pending = null;
        this.killHelper();
        reject(
          new RhwpError({
            category: "session",
            code: "COM_TIMEOUT",
            message:
              `Host-runtime command '${cmd}' timed out after ${timeoutMs}ms ` +
              "and the helper was terminated. The automation surface may be " +
              "blocked on an interactive dialog; falling back to the WASM engine.",
          }),
        );
      }, timeoutMs);

      this.pending = { resolve, reject, timer };

      try {
        this.child!.stdin.write(request);
      } catch (err) {
        this.failPending(
          new RhwpError({
            category: "session",
            code: "COM_WRITE_FAILED",
            message: `failed to write command '${cmd}' to the host-runtime helper`,
            cause: err,
          }),
        );
      }
    });
  }

  /**
   * Send a command and convert a structured `{ok:false}` helper failure into a
   * typed `RhwpError`, so callers get a single throw-based error channel.
   * Returns the response on success.
   */
  async command(
    cmd: string,
    args?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<HelperResponse> {
    const resp = await this.send(cmd, args, timeoutMs);
    if (resp.ok !== true) {
      throw new RhwpError({
        category: asErrorCategory(resp.category),
        code: resp.code ?? "COM_HELPER_ERROR",
        message:
          resp.message ??
          `host-runtime command '${cmd}' failed without a message`,
      });
    }
    return resp;
  }

  /**
   * Kill the helper process immediately (used on timeout). Marks the bridge as
   * exited synchronously: once a kill has been requested the helper is no longer
   * usable, so `running` must report false right away rather than waiting for
   * the async `exit` event. The exit handler is idempotent.
   */
  private killHelper(): void {
    if (this.child !== null && !this.exited) {
      try {
        this.child.kill();
      } catch {
        // Best-effort — `exited` is set below regardless.
      }
    }
    this.exited = true;
  }

  /**
   * Shut the helper down and reap the process. Asks the helper to quit (so it
   * releases the automation object cleanly), then waits for the process to
   * exit; if the quit request itself blocks or the process lingers, it is
   * force-killed. Idempotent and never throws.
   */
  async dispose(): Promise<void> {
    if (this.child === null) {
      return;
    }
    const child = this.child;

    // Best-effort graceful quit. Bounded so a wedged helper cannot block
    // disposal — on timeout we fall through to the kill path.
    if (!this.exited && this.pending === null) {
      try {
        await this.send("quit", {}, 3_000);
      } catch {
        // Quit blocked or failed — the kill below guarantees reaping.
      }
    }

    if (!this.exited) {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
    }

    // Guarantee the process is reaped before resolving, so engine shutdown
    // leaves no lingering child. Bounded so a stuck exit cannot hang dispose.
    if (!this.exited) {
      const exitRace = once(child, "exit");
      const guard = new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Best-effort terminal kill.
          }
          resolve();
        }, 3_000);
        // Don't keep the event loop alive solely for this guard.
        if (typeof t.unref === "function") t.unref();
      });
      await Promise.race([exitRace.then(() => undefined), guard]);
    }

    this.child = null;
    this.exited = true;
  }
}
