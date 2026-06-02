/**
 * Single-document session store.
 *
 * Plan reference (spec lock): the MCP server holds at most ONE open document
 * in memory at a time. No session_id parameter is exposed on any tool — the
 * "current" document is implicit. Multi-document sessions are deferred to
 * v0.2+ per the spec's Constraint and Non-Goals sections.
 *
 * The store is a process-level singleton. Because each MCP stdio server
 * instance is a separate process spawned by the client, two simultaneous
 * users of the same server binary each have their own process and therefore
 * their own session. Race conditions inside a single process are precluded
 * by the JSON-RPC framing of MCP: tool calls are serialised per connection.
 */

import { RhwpError } from "../rhwp/errors.js";

/**
 * Opaque type for whatever rhwp returns from its parse path. Typed as
 * `unknown` because the actual @rhwp/core 0.7.x document shape is one of
 * the items being verified during the Sprint 0 probe (Open Q5).
 */
export type RhwpDocument = unknown;

export class SessionStore {
  private currentDocument: RhwpDocument | null = null;
  private sourcePath: string | null = null;
  private sourceFormat: "hwp" | "hwpx" | null = null;

  /**
   * Replace the current document. Discards any previously held document
   * (caller is responsible for saving before swapping).
   */
  set(doc: RhwpDocument, opts: { sourcePath: string; sourceFormat: "hwp" | "hwpx" }): void {
    this.currentDocument = doc;
    this.sourcePath = opts.sourcePath;
    this.sourceFormat = opts.sourceFormat;
  }

  /**
   * Return the current document. Throws RhwpError(category=session,
   * code=NO_DOCUMENT) if none is open — this is the canonical error tools
   * surface when the LLM calls e.g. `hwp_fill_fields` before `hwp_open`.
   */
  get(): RhwpDocument {
    if (this.currentDocument === null) {
      throw new RhwpError({
        category: "session",
        code: "NO_DOCUMENT",
        message:
          "No document is currently open. Call hwp_open(path) first.",
      });
    }
    return this.currentDocument;
  }

  hasDocument(): boolean {
    return this.currentDocument !== null;
  }

  /**
   * Clear the current document. Used by hwp_close (future) or by tests.
   */
  clear(): void {
    this.currentDocument = null;
    this.sourcePath = null;
    this.sourceFormat = null;
  }

  /** Inspection helper. */
  describe(): { hasDocument: boolean; sourcePath: string | null; sourceFormat: "hwp" | "hwpx" | null } {
    return {
      hasDocument: this.hasDocument(),
      sourcePath: this.sourcePath,
      sourceFormat: this.sourceFormat,
    };
  }
}

/**
 * Process-level singleton. All tool modules import this instance — there
 * MUST NOT be a way to construct or substitute a second store at runtime.
 */
export const sessionStore = new SessionStore();
