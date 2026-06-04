/**
 * Phase 4 integration test — skill surface equivalence (AC-5).
 *
 * The skill dispatcher (`runSkillAction`) must call the SAME pure `execute*`
 * handlers the MCP tool registrations call, so for the same input and session
 * state it produces byte-identical output. This test drives a realistic flow
 * — open a table document, locate its blanks, fill some cells — first through
 * the MCP-facing `execute*` handlers and then through the skill dispatcher,
 * and asserts the results are deep-equal at every step.
 *
 * It also confirms the dispatcher's structural contract: every MCP tool name
 * has a skill action, unknown names throw, and the action list matches.
 *
 * Both surfaces share the process-level `sessionStore`, so each flow is run
 * against a freshly-built document to keep them independent.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  runSkillAction,
  listSkillActions,
  isSkillAction,
  UnknownSkillActionError,
  SKILL_ACTIONS,
} from "../../src/skill/dispatcher.js";

import { ensureEngine } from "../../src/rhwp/loader.js";
import { sessionStore } from "../../src/session/store.js";
import type { HwpDocumentLike } from "../../src/rhwp/types.js";

import { executeHwpOpenBase64 } from "../../src/tools/open_base64.js";
import { executeHwpLocateBlanks } from "../../src/tools/locate_blanks.js";
import { executeHwpFillCells } from "../../src/tools/fill_cells.js";
import { executeHwpListActions } from "../../src/tools/list_actions.js";
import { executeHwpEngineStatus } from "../../src/tools/engine_status.js";

/**
 * Build a base64 .hwpx carrying one labelled-blank table so locate_blanks +
 * fill_cells have something real to operate on. Returns the base64 string.
 */
async function makeTableDocBase64(): Promise<string> {
  const engine = await ensureEngine();
  const doc = await engine.createBlank();
  (doc as unknown as { createBlankDocument(): string }).createBlankDocument();
  // 라벨→빈칸 grid: (r,c+1) blanks labelled by their left neighbor.
  const grid = [
    ["이름", "", "생년월일", ""],
    ["주소", "", "연락처", ""],
  ];
  const raw = doc.createTable(0, 0, 0, grid.length, grid[0].length);
  const parsed = JSON.parse(raw) as { paraIdx?: number; controlIdx?: number };
  const paraIdx = parsed.paraIdx as number;
  const controlIdx = parsed.controlIdx as number;
  const cols = grid[0].length;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r][c].length === 0) continue;
      doc.insertTextInCell(0, paraIdx, controlIdx, r * cols + c, 0, 0, grid[r][c]);
    }
  }
  const bytes = doc.exportHwpx();
  const b64 = Buffer.from(bytes).toString("base64");
  if (typeof (doc as HwpDocumentLike).free === "function") {
    try {
      (doc as HwpDocumentLike).free?.();
    } catch {
      /* ignore */
    }
  }
  return b64;
}

describe("skill surface — structural contract", () => {
  it("exposes one action per MCP tool name (16) and lists them sorted", () => {
    const names = listSkillActions();
    expect(names.length).toBe(16);
    expect(Object.keys(SKILL_ACTIONS).length).toBe(16);
    // sorted
    expect([...names].sort()).toEqual(names);
    // every name is recognised
    for (const n of names) expect(isSkillAction(n)).toBe(true);
  });

  it("rejects an unknown action name", async () => {
    expect(isSkillAction("hwp_does_not_exist")).toBe(false);
    await expect(runSkillAction("hwp_does_not_exist", {})).rejects.toBeInstanceOf(
      UnknownSkillActionError,
    );
  });
});

describe("skill surface — equivalence with MCP execute* handlers", () => {
  let docB64: string;

  beforeAll(async () => {
    docB64 = await makeTableDocBase64();
  });

  it("open → locate_blanks → fill_cells produces identical output on both paths", async () => {
    // --- MCP path -------------------------------------------------------
    const mcpOpen = await executeHwpOpenBase64({ bytes_base64: docB64, format: "hwpx" });
    const mcpBlanks = await executeHwpLocateBlanks({});
    const mcpFill = await executeHwpFillCells({ map: { 이름: "홍길동", "1,1": "값" } });

    // --- skill path (fresh session via re-open of the same bytes) -------
    const skillOpen = await runSkillAction("hwp_open_base64", {
      bytes_base64: docB64,
      format: "hwpx",
    });
    const skillBlanks = await runSkillAction("hwp_locate_blanks", {});
    const skillFill = await runSkillAction("hwp_fill_cells", {
      map: { 이름: "홍길동", "1,1": "값" },
    });

    expect(skillOpen).toEqual(mcpOpen);
    expect(skillBlanks).toEqual(mcpBlanks);
    expect(skillFill).toEqual(mcpFill);

    // Sanity: the flow actually did something — a labelled blank was found
    // and at least one cell filled.
    expect(mcpBlanks.total).toBeGreaterThan(0);
    expect(mcpFill.filled.length).toBeGreaterThan(0);
  });

  it("no-input actions (list_actions, engine_status) match the MCP path", async () => {
    const mcpActions = await executeHwpListActions({});
    const skillActions = await runSkillAction("hwp_list_actions", {});
    expect(skillActions).toEqual(mcpActions);

    const mcpStatus = await executeHwpEngineStatus();
    const skillStatus = await runSkillAction("hwp_engine_status", undefined);
    expect(skillStatus).toEqual(mcpStatus);
  });

  it("the skill open path leaves the same session document the MCP path would", async () => {
    await runSkillAction("hwp_open_base64", { bytes_base64: docB64, format: "hwpx" });
    expect(sessionStore.hasDocument()).toBe(true);
  });
});
