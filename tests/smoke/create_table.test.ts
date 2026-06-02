/**
 * Sprint 2 smoke — hwp_create_table on the blank HWPX fixture.
 *
 * Verifies:
 *   - 2×2 empty table: ok=true, cells_filled=0.
 *   - 2×2 with data: ok=true, cells_filled=4.
 *   - Mismatched data shape throws BAD_DATA_SHAPE before any rhwp call.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { RhwpError } from "../../src/rhwp/errors.js";
import { executeHwpCreateTable } from "../../src/tools/create_table.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

describe("hwp_create_table smoke", () => {
  beforeEach(async () => {
    // Re-open the blank doc per test so earlier tables don't pile up.
    await openBlankAuthoringDocument();
  });

  it("creates an empty 2x2 table", async () => {
    const result = await executeHwpCreateTable({ rows: 2, cols: 2 });
    expect(result.ok).toBe(true);
    expect(result.rows).toBe(2);
    expect(result.cols).toBe(2);
    expect(result.cells_filled).toBe(0);
  });

  it("creates a 2x2 table with data filling all 4 cells", async () => {
    const result = await executeHwpCreateTable({
      rows: 2,
      cols: 2,
      data: [
        ["a", "b"],
        ["c", "d"],
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.cells_filled).toBe(4);
  });

  it("rejects mismatched data shape before calling rhwp", async () => {
    await expect(
      executeHwpCreateTable({
        rows: 2,
        cols: 2,
        // Only 1 row instead of 2 — caught before any WASM call.
        data: [["a", "b"]],
      }),
    ).rejects.toBeInstanceOf(RhwpError);
  });
});
