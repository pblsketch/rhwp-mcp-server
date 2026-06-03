/**
 * Sprint 2.5 smoke — hwp_open_blank.
 *
 * Bootstraps a blank document with NO filesystem path and verifies the
 * SessionStore is populated correctly. Downstream tools (insert_text)
 * must work immediately after open_blank returns.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { executeHwpOpenBlank } from "../../src/tools/open_blank.js";
import { executeHwpInsertText } from "../../src/tools/insert_text.js";
import { sessionStore } from "../../src/session/store.js";

describe("hwp_open_blank smoke", () => {
  beforeAll(() => {
    // Ensure no previous test left a document in the global store.
    sessionStore.clear();
  });

  it("returns ok=true with format hwpx and pages>=1", async () => {
    const result = await executeHwpOpenBlank();
    expect(result.ok).toBe(true);
    expect(result.format).toBe("hwpx");
    expect(result.page_count).toBeGreaterThanOrEqual(1);
  });

  it("populates the SessionStore so downstream Authoring tools work", async () => {
    await executeHwpOpenBlank();
    const insert = await executeHwpInsertText({ text: "원격 환경 테스트" });
    expect(insert.ok).toBe(true);
    // "원격 환경 테스트" — 2 + 1 (space) + 2 + 1 (space) + 3 = 9 characters.
    expect(insert.chars_inserted).toBe(9);
  });
});
