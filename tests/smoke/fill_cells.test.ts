/**
 * Sprint 2.6 smoke — hwp_fill_cells.
 *
 * Covers:
 *   - coord-keyed fill ('row,col')
 *   - label-keyed fill (via inferCellLabel)
 *   - skipped[] for unknown labels, out-of-range coords, and bad formats
 */

import { beforeEach, describe, expect, it } from "vitest";

import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import { executeHwpFillCells } from "../../src/tools/fill_cells.js";
import { executeHwpLocateBlanks } from "../../src/tools/locate_blanks.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

async function makeLabeledTable(): Promise<void> {
  await openBlankAuthoringDocument();
  // executeHwpCreateTable resolves the table's real paraIdx and uses it
  // for the per-cell insertTextInCell calls — sidesteps the issue where
  // apply_action(createTable) hides the paraIdx from a downstream
  // apply_action(insertTextInCell) call.
  await executeHwpCreateTable({
    rows: 2,
    cols: 2,
    data: [
      ["이름", ""],
      ["", ""],
    ],
  });
}

describe("hwp_fill_cells smoke", () => {
  beforeEach(async () => {
    await makeLabeledTable();
  });

  it("fills by coord and the cell is no longer blank", async () => {
    const result = await executeHwpFillCells({
      map: { "1,0": "전화번호", "1,1": "010-1234-5678" },
    });
    expect(result.ok).toBe(true);
    expect(result.filled.sort()).toEqual(["1,0", "1,1"]);
    expect(result.skipped).toEqual([]);

    const after = await executeHwpLocateBlanks({});
    // Originally 3 blanks (since (0,0) had "이름"); we filled 2 of them.
    expect(after.total).toBe(1);
  });

  it("fills by label via inferCellLabel", async () => {
    const result = await executeHwpFillCells({
      map: { 이름: "박준일" },
    });
    expect(result.ok).toBe(true);
    expect(result.filled).toEqual(["이름"]);
    expect(result.skipped).toEqual([]);
  });

  it("records unknown labels and out-of-range coords in skipped[]", async () => {
    const result = await executeHwpFillCells({
      map: {
        "1,0": "ok",
        "9,9": "out_of_range",
        존재하지않는라벨: "unknown_label",
      },
    });
    expect(result.filled).toEqual(["1,0"]);
    expect(result.skipped).toHaveLength(2);
    const reasons = new Map(result.skipped.map((s) => [s.key, s.reason]));
    expect(reasons.get("9,9")).toBe("out_of_range");
    expect(reasons.get("존재하지않는라벨")).toBe("unknown_label");
  });

  it("returns ok:true with all skipped when there is no table", async () => {
    // Fresh blank doc, no createTable.
    await openBlankAuthoringDocument();
    const result = await executeHwpFillCells({ map: { "0,0": "value" } });
    expect(result.ok).toBe(true);
    expect(result.filled).toEqual([]);
    expect(result.skipped).toEqual([{ key: "0,0", reason: "no_table" }]);
  });
});
