/**
 * Cell-detection precision — classifyCell strong-evidence rules + helpers.
 *
 * The original classifyCell marked a blank `fillable` whenever ANY label
 * could be inferred, which over-detected because inferCellLabel nearly always
 * resolves via a distant fallback. The precision pass requires STRONG
 * evidence (an immediate label-like neighbor) and excludes:
 *   - isolated blanks (spacer grids),
 *   - blanks whose only label comes from a weak/distant fallback,
 *   - blanks beside a long-text (content, not label) neighbor.
 *
 * These cases exercise the new behaviour on synthetic tables. The label
 * VALUES are not touched here (inferCellLabel is frozen by the golden test);
 * only the fillable/structural decision and the new pure helpers are tested.
 *
 * Also pins inferCellLabelWithSource().label === inferCellLabel() for every
 * cell, so the provenance side-channel can never drift the label value.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import {
  classifyCell,
  findAllTables,
  hasImmediateLabel,
  inferCellLabel,
  inferCellLabelWithSource,
  isIsolatedBlank,
  isLabelLike,
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

// A neighbor longer than the label-like cutoff (collapsed length > 25). This
// reads as content/prose, not a label.
const LONG_TEXT =
  "이것은 라벨이 아니라 본문에 해당하는 매우 긴 안내 문장입니다 그러므로 옆 칸은 입력칸이 아닙니다";

describe("isLabelLike — label vs content cutoff (pure)", () => {
  it("treats a short string as label-like", () => {
    expect(isLabelLike("이름")).toBe(true);
    expect(isLabelLike("비상연락처(휴대폰)")).toBe(true);
  });

  it("rejects empty / whitespace-only", () => {
    expect(isLabelLike("")).toBe(false);
    expect(isLabelLike("   ")).toBe(false);
  });

  it("rejects long prose as not label-like", () => {
    expect(isLabelLike(LONG_TEXT)).toBe(false);
  });

  it("collapses whitespace before measuring length", () => {
    // 5 visible chars + collapsed spaces — well under the cutoff.
    expect(isLabelLike("이  름   :")).toBe(true);
  });
});

describe("inferCellLabelWithSource — value parity + provenance", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("reports source=left for the canonical 라벨→빈칸 pair", async () => {
    const table = await makeTable([
      ["이름", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    const got = await inferCellLabelWithSource(doc, table, 0, 1);
    expect(got).toEqual({ label: "이름", source: "left" });
  });

  it("reports source=header for a column-under-header blank", async () => {
    const table = await makeTable([["성명", "연락처"], ["", ""]]);
    const doc = sessionStore.get();
    const got = await inferCellLabelWithSource(doc, table, 1, 0);
    expect(got).toEqual({ label: "성명", source: "header" });
  });

  it("reports source=upper for a stacked label above a blank", async () => {
    // (2,0): no left, row 0 empty (skip header), upper neighbor (1,0)="메모".
    const table = await makeTable([[""], ["메모"], [""]]);
    const doc = sessionStore.get();
    const got = await inferCellLabelWithSource(doc, table, 2, 0);
    expect(got).toEqual({ label: "메모", source: "upper" });
  });

  it("reports source=multirow for a distant stacked header", async () => {
    const table = await makeTable([
      ["", ""],
      ["", "상반기"],
      ["", "매출"],
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    const got = await inferCellLabelWithSource(doc, table, 4, 1);
    expect(got).toEqual({ label: "상반기 매출", source: "multirow" });
  });

  it("reports source=none when nothing can be inferred", async () => {
    const table = await makeTable([
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    const got = await inferCellLabelWithSource(doc, table, 0, 0);
    expect(got).toEqual({ label: null, source: "none" });
  });

  it("label value is identical to inferCellLabel for every cell", async () => {
    // Walk a mixed table and assert the two label paths never disagree.
    const data = [
      ["이름", "", "구분"],
      ["", "메모", ""],
      ["", "", ""],
    ];
    const table = await makeTable(data);
    const doc = sessionStore.get();
    for (let row = 0; row < table.row_count; row += 1) {
      for (let col = 0; col < table.col_count; col += 1) {
        const frozen = await inferCellLabel(doc, table, row, col);
        const mirrored = (await inferCellLabelWithSource(doc, table, row, col))
          .label;
        expect(mirrored, `mismatch at ${row},${col}`).toBe(frozen);
      }
    }
  });
});

describe("classifyCell — precision (strong evidence only)", () => {
  beforeEach(async () => {
    await openBlankAuthoringDocument();
  });

  it("RETAINS the obvious 라벨|값 pair as fillable (no regression)", async () => {
    // The normal resume/application case must never be dropped.
    const table = await makeTable([
      ["이름", ""],
      ["전화", ""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 0, 1)).toBe("fillable");
    expect(await classifyCell(doc, table, 1, 1)).toBe("fillable");
  });

  it("RETAINS a column-under-header blank as fillable (immediate upper label)", async () => {
    const table = await makeTable([["성명"], [""]]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 1, 0)).toBe("fillable");
  });

  it("marks an isolated blank as structural (spacer grid)", async () => {
    // Center cell (1,1) of a 3x3 grid whose only non-empty cell is far away
    // (0,0). Its four immediate neighbors are all empty → isolated.
    const table = await makeTable([
      ["X", "", ""],
      ["", "", ""],
      ["", "", ""],
    ]);
    const doc = sessionStore.get();
    expect(await isIsolatedBlank(doc, table, 1, 1)).toBe(true);
    expect(await classifyCell(doc, table, 1, 1)).toBe("structural");
  });

  it("marks a blank beside a LONG-TEXT neighbor as structural (content, not label)", async () => {
    // (0,1)'s left neighbor is a long prose paragraph, not a label, so the
    // blank is part of a content block, not an input slot.
    const table = await makeTable([
      [LONG_TEXT, ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    // inferCellLabel still returns the long text (label heuristic unchanged),
    // but classifyCell rejects it because the neighbor is not label-like.
    expect(await inferCellLabel(doc, table, 0, 1)).not.toBeNull();
    expect(await hasImmediateLabel(doc, table, 0, 1)).toBe(false);
    expect(await classifyCell(doc, table, 0, 1)).toBe("structural");
  });

  it("marks a weak/distant multi-row-header blank as structural", async () => {
    // (4,1) resolves a label ONLY via the multi-row header walk (source=
    // multirow). Its immediate neighbors (left (4,0), upper (3,1)) are empty,
    // so there is no strong evidence → structural, even though a label exists.
    const table = await makeTable([
      ["", ""],
      ["", "상반기"],
      ["", "매출"],
      ["", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    // (4,1)'s immediate neighbors (left (4,0), upper (3,1)) are empty and the
    // right/lower directions are out of range, so it is both isolated AND
    // lacks an immediate label. A label exists only via the distant multi-row
    // header walk — weak evidence — so classification stays structural.
    expect(await inferCellLabel(doc, table, 4, 1)).toBe("상반기 매출");
    expect(await hasImmediateLabel(doc, table, 4, 1)).toBe(false);
    expect(await classifyCell(doc, table, 4, 1)).toBe("structural");
  });

  it("marks a header/label cell (carries text) as structural", async () => {
    const table = await makeTable([
      ["이름", ""],
      ["", ""],
    ]);
    const doc = sessionStore.get();
    expect(await classifyCell(doc, table, 0, 0)).toBe("structural");
  });
});
