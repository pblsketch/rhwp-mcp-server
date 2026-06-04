/**
 * Sprint 2.6 smoke — hwp_locate_blanks.
 *
 * Bootstraps a blank doc, creates a 3x3 table via apply_action, fills the
 * header row's first cell, and asserts locate_blanks reports the remaining
 * 8 cells with correct coordinates and label inference.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import { executeHwpLocateBlanks } from "../../src/tools/locate_blanks.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

describe("hwp_locate_blanks smoke", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("returns total=0 on a doc with no tables", async () => {
    const result = await executeHwpLocateBlanks({});
    expect(result.table_count).toBe(0);
    expect(result.total).toBe(0);
    expect(result.blanks).toEqual([]);
  });

  it("finds every empty cell of a 3x3 table", async () => {
    const created = await executeHwpCreateTable({ rows: 3, cols: 3 });
    expect(created.ok).toBe(true);

    const result = await executeHwpLocateBlanks({});
    expect(result.table_count).toBe(1);
    expect(result.total).toBe(9);
    // No labels yet because the table is fully empty — every left and
    // header probe returns an empty string.
    for (const blank of result.blanks) {
      expect(blank.suggested_label).toBeNull();
      expect(blank.current_text).toBe("");
    }
    // Coordinates cover the full 3x3 grid in row-major order.
    expect(result.blanks[0].row).toBe(0);
    expect(result.blanks[0].col).toBe(0);
    expect(result.blanks[8].row).toBe(2);
    expect(result.blanks[8].col).toBe(2);
  });

  it("infers labels from left-neighbor cell text", async () => {
    // Use executeHwpCreateTable's data path so the table's real paraIdx is
    // resolved internally (the dedicated tool already extracts paraIdx +
    // controlIdx from rhwp's createTable return). Cell (0,0) becomes the
    // label for (0,1).
    await executeHwpCreateTable({
      rows: 2,
      cols: 2,
      data: [
        ["이름", ""],
        ["", ""],
      ],
    });

    const result = await executeHwpLocateBlanks({});
    expect(result.total).toBe(3);
    const cell01 = result.blanks.find((b) => b.row === 0 && b.col === 1);
    expect(cell01).toBeDefined();
    expect(cell01?.suggested_label).toBe("이름");
  });

  it("attaches classification + label_source to each blank (additive)", async () => {
    await executeHwpCreateTable({
      rows: 2,
      cols: 2,
      data: [
        ["이름", ""],
        ["", ""],
      ],
    });

    const result = await executeHwpLocateBlanks({});
    const cell01 = result.blanks.find((b) => b.row === 0 && b.col === 1);
    expect(cell01?.classification).toBe("fillable");
    expect(cell01?.label_source).toBe("left");

    // The isolated bottom-right blank (1,1) has no immediate label → structural.
    const cell11 = result.blanks.find((b) => b.row === 1 && b.col === 1);
    expect(cell11?.classification).toBe("structural");
    expect(cell11?.label_source).toBe("none");
  });

  it("only_fillable:true returns just the fillable cells", async () => {
    await executeHwpCreateTable({
      rows: 2,
      cols: 2,
      data: [
        ["이름", ""],
        ["전화", ""],
      ],
    });

    const all = await executeHwpLocateBlanks({});
    const fillableOnly = await executeHwpLocateBlanks({ only_fillable: true });

    // Two label|value pairs → two fillable blanks.
    expect(fillableOnly.total).toBe(2);
    for (const b of fillableOnly.blanks) {
      expect(b.classification).toBe("fillable");
    }
    // The default (only_fillable:false) returns at least as many.
    expect(all.total).toBeGreaterThanOrEqual(fillableOnly.total);
  });
});
