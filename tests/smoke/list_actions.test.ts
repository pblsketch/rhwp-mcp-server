/**
 * Sprint 2 smoke — hwp_list_actions returns the curated catalog.
 *
 * Verifies:
 *   - total >= 30 (PRD floor).
 *   - First entry has {name, category, description, params_schema}.
 *   - Category filtering narrows results.
 */

import { describe, expect, it } from "vitest";

import { executeHwpListActions } from "../../src/tools/list_actions.js";

describe("hwp_list_actions smoke", () => {
  it("returns at least 30 actions when called with default category", async () => {
    const result = await executeHwpListActions({});
    expect(result.total).toBeGreaterThanOrEqual(30);
    expect(result.actions.length).toBe(result.total);
  });

  it("each entry exposes name, category, description, params_schema", async () => {
    const result = await executeHwpListActions({ category: "all" });
    const first = result.actions[0];
    expect(typeof first.name).toBe("string");
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.category).toBe("string");
    expect(typeof first.description).toBe("string");
    expect(first.description.length).toBeGreaterThan(0);
    expect(first.params_schema).toBeDefined();
  });

  it("category=text filters to text-only entries", async () => {
    const all = await executeHwpListActions({ category: "all" });
    const text = await executeHwpListActions({ category: "text" });
    expect(text.total).toBeGreaterThan(0);
    expect(text.total).toBeLessThan(all.total);
    for (const a of text.actions) {
      expect(a.category).toBe("text");
    }
  });

  it("includes insertText, createTable, applyParaFormat in the catalog", async () => {
    const result = await executeHwpListActions({ category: "all" });
    const names = new Set(result.actions.map((a) => a.name));
    expect(names.has("insertText")).toBe(true);
    expect(names.has("createTable")).toBe(true);
    expect(names.has("applyParaFormat")).toBe(true);
  });
});
