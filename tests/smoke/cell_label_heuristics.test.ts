/**
 * Phase 3 — additive cell-label heuristics + classifyCell.
 *
 * Exercises the NEW fallbacks added to `inferCellLabel` (upper neighbor,
 * multi-row header) and the new `classifyCell` pure function against
 * synthetic tables built via createTable + per-cell text.
 *
 * The original two-step heuristic (left neighbor → header row 0) is NOT
 * re-tested here — it is locked by the golden snapshot test
 * (cell_label_golden.test.ts) and the existing locate_blanks/fill_cells
 * smoke tests. These cases focus on layouts that the original heuristic
 * could NOT label (so the result was null) and that the additive fallbacks
 * now resolve.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import {
  classifyCell,
  findAllTables,
  inferCellLabel,
  type TableHandle,
} from "../../src/rhwp/tables.js";
import { sessionStore } from "../../src/session/store.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

/** Build a table from row-major data and return its handle. */
async function makeTable(data: string[][]): Promise<TableHandle> {
  const rows = data.length;
  const cols = data[0].length;
  await executeHwpCreateTable({ rows, cols, data });
  const tables = await findAllTables(sessionStore.get());
  expect(tables.length).toBe(1);
  return tables[0];
}

describe("inferCellLabel — upper-neighbor fallback (additive)", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("labels a blank from the cell directly above it when left + header row 0 are empty", async () => {
    // 3 rows, 1 col. Col 0 has no left neighbor; header row 0 is empty, so
    // the original heuristic returns null. The upper neighbor (row 1) of the
    // blank at (2,0) carries the label "메모".
    //   row0: ""      <- empty header
    //   row1: "메모"   <- upper neighbor / label
    //   row2: ""      <- blank we label
    const table = await makeTable([["" ], ["메모"], [""]]);
    const doc = sessionStore.get();

    const label = await inferCellLabel(doc, table, 2, 0);
    expect(label).toBe("메모");
  });

  it("does not fire the upper-neighbor probe when the left neighbor already labels (behaviour preserved)", async () => {
    // (1,1)'s left neighbor (1,0) = "전화"; the original step-1 wins and the
    // additive upper-neighbor path is never reached.
    const table = await makeTable([
      ["제목", "값A"],
      ["전화", ""],
    ]);
    const doc = sessionStore.get();
    const label = await inferCellLabel(doc, table, 1, 1);
    expect(label).toBe("전화");
  });
});

describe("inferCellLabel — multi-row header fallback (additive)", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("joins stacked header rows above a blank when both row 0 and the immediate upper cell are empty", async () => {
    // 5 rows, 2 cols. Target blank = (4,1). Resolution walk:
    //   - left neighbor (4,0)        → empty (skip step 1)
    //   - header row 0 col 1 (0,1)   → empty (skip step 2 — baseline null)
    //   - upper neighbor (3,1)       → empty (skip step 3)
    //   - multi-row header rows 0..3 → "상반기" (row1) + "매출" (row2) joined
    // The blank line at row 3 is what stops the upper-neighbor probe from
    // winning, so the stacked-header join is the resolving step.
    //   row0: ["", ""]
    //   row1: ["", "상반기"]   <- header part 1
    //   row2: ["", "매출"]     <- header part 2
    //   row3: ["", ""]        <- empty spacer (upper neighbor of target)
    //   row4: ["", ""]        <- blank at (4,1)
    const table = await makeTable([
      ["", ""],
      ["", "상반기"],
      ["", "매출"],
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    const label = await inferCellLabel(doc, table, 4, 1);
    expect(label).toBe("상반기 매출");
  });

  it("dedupes repeated merged-header fragments", async () => {
    // A merged group header repeats its text down the stacked rows. The
    // walk collapses consecutive identical fragments to one. Row 0 and the
    // immediate upper cell (row 3) stay empty so steps 1-3 fail and the
    // multi-row header join is the resolving step.
    //   row0: ["", ""]
    //   row1: ["", "구분"]
    //   row2: ["", "구분"]
    //   row3: ["", ""]   <- empty spacer (upper neighbor of target)
    //   row4: ["", ""]   <- blank at (4,1)
    const table = await makeTable([
      ["", ""],
      ["", "구분"],
      ["", "구분"],
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    const label = await inferCellLabel(doc, table, 4, 1);
    expect(label).toBe("구분");
  });
});

describe("classifyCell — fillable vs structural", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("marks a labelled blank as fillable", async () => {
    // (0,1) is empty and its left neighbor "이름" labels it → fillable.
    const table = await makeTable([
      ["이름", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 0, 1)).toBe("fillable");
  });

  it("marks a label cell (carries text) as structural", async () => {
    // (0,0) carries "이름" → it is the scaffolding side, structural.
    const table = await makeTable([
      ["이름", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 0, 0)).toBe("structural");
  });

  it("marks an unlabelled empty cell as structural (decorative/spacer)", async () => {
    // Fully empty 2x2 table: no cell can infer a label → all structural.
    const table = await makeTable([
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 1, 1)).toBe("structural");
  });

  it("marks a column-under-header blank as fillable", async () => {
    // (1,0) is empty; header row 0 col 0 = "성명" labels it → fillable.
    const table = await makeTable([
      ["성명"],
      [""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 1, 0)).toBe("fillable");
  });
});
