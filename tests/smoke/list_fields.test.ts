import { describe, it, expect, beforeAll, afterEach } from "vitest";

import { executeHwpOpen } from "../../src/tools/open.js";
import { executeHwpListFields } from "../../src/tools/list_fields.js";
import { sessionStore } from "../../src/session/store.js";
import { makeBlankHwpxFixture } from "../setup/fixture.js";

describe("hwp_list_fields", () => {
  let fixture: string;
  beforeAll(async () => {
    fixture = await makeBlankHwpxFixture();
  });
  afterEach(() => {
    sessionStore.clear();
  });

  it("returns the spec-locked { fields: [...] } shape for a blank doc", async () => {
    await executeHwpOpen({ path: fixture });
    const out = await executeHwpListFields();
    expect(out).toHaveProperty("fields");
    expect(Array.isArray(out.fields)).toBe(true);
    for (const f of out.fields) {
      expect(typeof f.name).toBe("string");
      expect(typeof f.type).toBe("string");
      expect(f.current_value === null || typeof f.current_value === "string").toBe(true);
    }
  });

  it("throws NO_DOCUMENT when no document is open", async () => {
    await expect(executeHwpListFields()).rejects.toMatchObject({
      category: "session",
      code: "NO_DOCUMENT",
    });
  });
});
