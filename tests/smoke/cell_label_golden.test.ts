/**
 * Phase 3 — label golden snapshot (regression defence).
 *
 * Two guarantees are pinned here:
 *
 *  (A) GOLDEN SNAPSHOT — for a fixed set of synthetic table cases, the
 *      current `inferCellLabel` returns exactly the labels frozen below.
 *      If a future change shifts any label value, this test fails loudly.
 *
 *  (B) BASELINE INVARIANT — the additive Phase 3 heuristics may only turn a
 *      former `null` into a label (None→Label). They must NEVER change a
 *      label that the original two-step heuristic (left neighbor → header
 *      row 0) already produced (Label→other-Label is forbidden).
 *
 *      To prove (B) without a stored copy of the old code, we re-implement
 *      the ORIGINAL two-step heuristic verbatim as `baselineInferLabel` and
 *      assert, cell-by-cell across every case, that:
 *        - baseline !== null  ⇒  current === baseline   (existing labels frozen)
 *        - baseline === null  ⇒  current is null OR a string (None→Label ok)
 */

import { beforeEach, describe, expect, it } from "vitest";

import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import {
  findAllTables,
  getCellText,
  inferCellLabel,
  type TableHandle,
} from "../../src/rhwp/tables.js";
import { sessionStore } from "../../src/session/store.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

/**
 * Verbatim re-implementation of the ORIGINAL (pre-Phase-3) two-step
 * heuristic: left neighbor (col-1) → header row 0 (same col). No additive
 * fallbacks. This is the frozen baseline the invariant compares against.
 */
async function baselineInferLabel(
  doc: ReturnType<typeof sessionStore.get>,
  table: TableHandle,
  row: number,
  col: number,
): Promise<string | null> {
  if (col > 0) {
    const left = (await getCellText(doc, table, row, col - 1)).trim();
    if (left.length > 0) return left.replace(/\s+/g, " ");
  }
  if (row > 0) {
    const header = (await getCellText(doc, table, 0, col)).trim();
    if (header.length > 0) return header.replace(/\s+/g, " ");
  }
  return null;
}

interface GoldenCase {
  name: string;
  data: string[][];
  /** Expected current `inferCellLabel` output, keyed by "row,col". */
  golden: Record<string, string | null>;
}

// Frozen golden cases. Keys cover every cell whose label we assert.
const CASES: GoldenCase[] = [
  {
    // Classic 라벨→빈칸 (left neighbor). Baseline already labels (0,1).
    name: "left-neighbor label",
    data: [
      ["이름", ""],
      ["전화", ""],
    ],
    golden: {
      "0,0": null, // col 0, row 0 — no left, no header above
      "0,1": "이름", // left neighbor (unchanged from baseline)
      "1,1": "전화", // left neighbor (unchanged from baseline)
    },
  },
  {
    // Column-oriented: header row 0 labels the cells below it.
    name: "header-row label",
    data: [
      ["성명", "연락처"],
      ["", ""],
    ],
    golden: {
      "1,0": "성명", // header row 0 (unchanged from baseline)
      "1,1": "연락처", // header row 0 (unchanged from baseline)
    },
  },
  {
    // Punctuation/colon must be preserved verbatim (unchanged behaviour).
    name: "colon + parenthetical preserved",
    data: [
      ["이름:", ""],
      ["연락처(휴대폰)", ""],
    ],
    golden: {
      "0,1": "이름:",
      "1,1": "연락처(휴대폰)",
    },
  },
  {
    // Additive: upper-neighbor None→Label. Baseline returns null at (2,0)
    // (no left, header row 0 empty); Phase 3 fills it from row 1.
    name: "upper-neighbor None→Label",
    data: [["" ], ["메모"], [""]],
    golden: {
      "2,0": "메모", // None under baseline → labelled by Phase 3
    },
  },
  {
    // Additive: multi-row header None→Label. Baseline null at (4,1) (left
    // empty, header row 0 empty); upper neighbor (3,1) is also empty, so
    // Phase 3 joins the stacked header rows (row1 + row2).
    name: "multi-row header None→Label",
    data: [
      ["", ""],
      ["", "상반기"],
      ["", "매출"],
      ["", ""],
      ["", ""],
    ],
    golden: {
      "4,1": "상반기 매출",
    },
  },
  {
    // Fully empty table: every cell stays null under both baseline and
    // Phase 3 (nothing to infer).
    name: "empty table stays null",
    data: [
      ["", ""],
      ["", ""],
    ],
    golden: {
      "0,0": null,
      "0,1": null,
      "1,0": null,
      "1,1": null,
    },
  },
];

describe("inferCellLabel — golden snapshot", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      let table: TableHandle;
      beforeEach(async () => {
        await openBlankAuthoringDocument();
        const rows = c.data.length;
        const cols = c.data[0].length;
        await executeHwpCreateTable({ rows, cols, data: c.data });
        const tables = await findAllTables(sessionStore.get());
        table = tables[0];
      });

      it("matches the frozen golden labels", async () => {
        const doc = sessionStore.get();
        for (const [key, expected] of Object.entries(c.golden)) {
          const [row, col] = key.split(",").map(Number);
          const actual = await inferCellLabel(doc, table, row, col);
          expect(actual, `cell ${key} in case "${c.name}"`).toBe(expected);
        }
      });
    });
  }
});

describe("inferCellLabel — baseline invariant (None→Label only)", () => {
  for (const c of CASES) {
    it(`preserves every baseline label in case "${c.name}"`, async () => {
      await openBlankAuthoringDocument();
      const rows = c.data.length;
      const cols = c.data[0].length;
      await executeHwpCreateTable({ rows, cols, data: c.data });
      const doc = sessionStore.get();
      const table = (await findAllTables(doc))[0];

      // Walk every addressable cell, not just the golden keys.
      for (let row = 0; row < table.row_count; row += 1) {
        for (let col = 0; col < table.col_count; col += 1) {
          const baseline = await baselineInferLabel(doc, table, row, col);
          const current = await inferCellLabel(doc, table, row, col);
          if (baseline !== null) {
            // Existing label must be byte-for-byte unchanged.
            expect(
              current,
              `Label→Label change forbidden at ${row},${col} in "${c.name}"`,
            ).toBe(baseline);
          } else {
            // Baseline had no label — Phase 3 may fill it (None→Label) or
            // leave it null, but never produce anything other than a string
            // or null.
            expect(
              current === null || typeof current === "string",
              `unexpected type at ${row},${col} in "${c.name}"`,
            ).toBe(true);
          }
        }
      }
    });
  }
});
