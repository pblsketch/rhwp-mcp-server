/**
 * src/skill/dispatcher.ts
 *
 * Thin skill surface over the existing tool core.
 *
 * The value of this project lives in the HWP domain core (`src/rhwp/`) and the
 * pure `execute*` handlers under `src/tools/`. The MCP server is one surface
 * that calls those handlers; this skill dispatcher is a second, equally thin
 * surface. It lets a host that already provides the user's own model/API key
 * drive the same Korean-document actions outside the MCP protocol — no separate
 * subscription, bring-your-own model.
 *
 * Design contract:
 *   - ZERO new business logic. Every action name maps 1:1 to the same pure
 *     `execute*` handler the MCP tool registration calls, so the skill path and
 *     the MCP path produce byte-identical output for the same input + session.
 *   - The engine is warmed via the same `ensureEngine()` the handlers use; the
 *     open/blank handlers already warm defensively, so the dispatcher does not
 *     need its own warm step. A convenience `warmSkillEngine()` is exported for
 *     hosts that want to pay the warm cost up-front (mirrors the server's
 *     warm-on-start).
 *   - No MCP tool is registered here. The public tool surface (and therefore
 *     the schema-diff contract) is untouched by adding this file.
 */

import { ensureEngine } from "../rhwp/loader.js";

import { executeHwpOpen } from "../tools/open.js";
import { executeHwpSaveAs } from "../tools/save_as.js";
import { executeHwpListFields } from "../tools/list_fields.js";
import { executeHwpFillFields } from "../tools/fill_fields.js";
import { executeHwpInsertText } from "../tools/insert_text.js";
import { executeHwpCreateTable } from "../tools/create_table.js";
import { executeHwpSetParagraphStyle } from "../tools/set_paragraph_style.js";
import { executeHwpApplyAction } from "../tools/apply_action.js";
import { executeHwpListActions } from "../tools/list_actions.js";
import { executeHwpOpenBlank } from "../tools/open_blank.js";
import { executeHwpOpenBase64 } from "../tools/open_base64.js";
import { executeHwpSaveAsBase64 } from "../tools/save_as_base64.js";
import { executeHwpLocateBlanks } from "../tools/locate_blanks.js";
import { executeHwpFillCells } from "../tools/fill_cells.js";
import { executeHwpOpenBase64Validated } from "../tools/open_base64_validated.js";
import { executeHwpEngineStatus } from "../tools/engine_status.js";

/**
 * Skill action registry — action name → pure core handler.
 *
 * The names match the MCP tool names (minus nothing) so a host can reuse the
 * same identifiers across both surfaces. Each value is the exact `execute*`
 * function the MCP layer wraps; we type the map loosely as
 * `(input?) => Promise<unknown>` so heterogeneous handler signatures coexist,
 * and re-narrow per-call via `runSkillAction`'s generic.
 *
 * Handlers that take no input (`hwp_list_fields`, `hwp_open_blank`,
 * `hwp_engine_status`) accept and ignore an optional argument so the dispatcher
 * can call every entry uniformly.
 */
export const SKILL_ACTIONS = {
  hwp_open: (input: { path: string }) => executeHwpOpen(input),
  hwp_save_as: (input: { path: string; format?: "hwpx" | "hwp" }) =>
    executeHwpSaveAs(input),
  hwp_list_fields: () => executeHwpListFields(),
  hwp_fill_fields: (input: { map: Record<string, string> }) =>
    executeHwpFillFields(input),
  hwp_insert_text: (input: Parameters<typeof executeHwpInsertText>[0]) =>
    executeHwpInsertText(input),
  hwp_create_table: (input: { rows: number; cols: number; data?: string[][] }) =>
    executeHwpCreateTable(input),
  hwp_set_paragraph_style: (
    input: Parameters<typeof executeHwpSetParagraphStyle>[0],
  ) => executeHwpSetParagraphStyle(input),
  hwp_apply_action: (input: { name: string; params?: Record<string, unknown> }) =>
    executeHwpApplyAction(input),
  hwp_list_actions: (input: Parameters<typeof executeHwpListActions>[0]) =>
    executeHwpListActions(input),
  hwp_open_blank: () => executeHwpOpenBlank(),
  hwp_open_base64: (input: { bytes_base64: string; format?: "hwp" | "hwpx" }) =>
    executeHwpOpenBase64(input),
  hwp_save_as_base64: (input: { format: "hwp" | "hwpx" }) =>
    executeHwpSaveAsBase64(input),
  hwp_locate_blanks: (input: { include_filled?: boolean }) =>
    executeHwpLocateBlanks(input),
  hwp_fill_cells: (input: { map: Record<string, string>; table_idx?: number }) =>
    executeHwpFillCells(input),
  hwp_open_base64_validated: (
    input: Parameters<typeof executeHwpOpenBase64Validated>[0],
  ) => executeHwpOpenBase64Validated(input),
  hwp_engine_status: () => executeHwpEngineStatus(),
} as const;

/** Union of every action name the skill surface can dispatch. */
export type SkillActionName = keyof typeof SKILL_ACTIONS;

/** Input type accepted by a given action. */
export type SkillActionInput<N extends SkillActionName> = Parameters<
  (typeof SKILL_ACTIONS)[N]
>[0];

/** Result type produced by a given action. */
export type SkillActionResult<N extends SkillActionName> = Awaited<
  ReturnType<(typeof SKILL_ACTIONS)[N]>
>;

/** Stable, sorted list of action names — useful for host capability listing. */
export function listSkillActions(): SkillActionName[] {
  return (Object.keys(SKILL_ACTIONS) as SkillActionName[]).sort();
}

/** Whether a string names a dispatchable skill action. */
export function isSkillAction(name: string): name is SkillActionName {
  return Object.prototype.hasOwnProperty.call(SKILL_ACTIONS, name);
}

/**
 * Error thrown when a host asks for an action the skill surface does not know.
 * Kept as a plain Error (not RhwpError) because it is a host-integration
 * mistake, not a document-domain failure.
 */
export class UnknownSkillActionError extends Error {
  constructor(public readonly action: string) {
    super(
      `Unknown skill action '${action}'. Known actions: ${listSkillActions().join(", ")}.`,
    );
    this.name = "UnknownSkillActionError";
  }
}

/**
 * Warm the document engine up-front (optional convenience).
 *
 * Mirrors the MCP server's warm-on-start: a host can call this once before its
 * first `runSkillAction` so the first action does not pay the engine-warm cost.
 * Idempotent — `ensureEngine()` caches the warmed engine.
 */
export async function warmSkillEngine(name?: string): Promise<void> {
  await ensureEngine(name);
}

/**
 * Dispatch a single skill action by name.
 *
 * This is the entire skill surface: look the name up in `SKILL_ACTIONS` and
 * invoke the same pure handler the MCP tool registration calls. No validation,
 * normalization, or side effect is added on top — the handler owns all of that,
 * so the skill result is identical to the MCP result for the same input and
 * session state.
 *
 * @throws UnknownSkillActionError when `name` is not a known action.
 */
export async function runSkillAction<N extends SkillActionName>(
  name: N,
  input: SkillActionInput<N>,
): Promise<SkillActionResult<N>>;
export async function runSkillAction(
  name: string,
  input?: unknown,
): Promise<unknown>;
export async function runSkillAction(
  name: string,
  input?: unknown,
): Promise<unknown> {
  if (!isSkillAction(name)) {
    throw new UnknownSkillActionError(name);
  }
  // The map's value is a union of handler signatures; we have already narrowed
  // `name` to a known action, so the cast to a permissive callable is safe and
  // confined to this single dispatch site.
  const handler = SKILL_ACTIONS[name] as (input?: unknown) => Promise<unknown>;
  return handler(input);
}
