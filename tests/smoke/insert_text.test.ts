/**
 * Sprint 2 smoke — hwp_insert_text on the blank HWPX fixture.
 *
 * Verifies:
 *   - executeHwpInsertText returns ok:true + chars_inserted matching input.
 *   - The text is actually present in the document afterwards (searchAllText
 *     finds at least one hit) — proves the rhwp call really fired.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { executeHwpInsertText } from "../../src/tools/insert_text.js";
import { sessionStore } from "../../src/session/store.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

describe("hwp_insert_text smoke", () => {
  beforeAll(async () => {
    await openBlankAuthoringDocument();
  });

  it("inserts UTF-8 text at document start", async () => {
    const result = await executeHwpInsertText({ text: "박준일" });
    expect(result.ok).toBe(true);
    expect(result.chars_inserted).toBe(3);
  });

  it("inserted text is findable via searchAllText", async () => {
    // Insert a distinctive marker, then search for it.
    await executeHwpInsertText({ text: "테스트마커-SmokeCheck" });
    const doc = sessionStore.get();
    const rawHits = doc.searchAllText("테스트마커-SmokeCheck", false, true);
    expect(typeof rawHits).toBe("string");
    expect(rawHits.length).toBeGreaterThan(0);
    // rhwp's searchAllText returns a JSON array of `{sec, para, charOffset,
    // length}` location records. We don't introspect the exact shape —
    // existence of at least one hit proves the text actually landed in the
    // document body.
    const hits = JSON.parse(rawHits) as Array<{ length: number }>;
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].length).toBeGreaterThan(0);
  });
});
