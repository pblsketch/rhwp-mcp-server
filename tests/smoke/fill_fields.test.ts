import { describe, it, expect, beforeAll, afterEach } from "vitest";

import { executeHwpOpen } from "../../src/tools/open.js";
import { executeHwpFillFields } from "../../src/tools/fill_fields.js";
import { sessionStore } from "../../src/session/store.js";
import { makeBlankHwpxFixture } from "../setup/fixture.js";

describe("hwp_fill_fields", () => {
  let fixture: string;
  beforeAll(async () => {
    fixture = await makeBlankHwpxFixture();
  });
  afterEach(() => {
    sessionStore.clear();
  });

  it("skips unknown field names without throwing", async () => {
    await executeHwpOpen({ path: fixture });
    const out = await executeHwpFillFields({
      map: { __nonexistent_field__: "ignored" },
    });
    expect(out.ok).toBe(true);
    expect(out.filled).toEqual([]);
    expect(out.skipped).toEqual(["__nonexistent_field__"]);
  });

  it("returns ok=true with empty filled/skipped for an empty map", async () => {
    await executeHwpOpen({ path: fixture });
    const out = await executeHwpFillFields({ map: {} });
    expect(out).toEqual({ ok: true, filled: [], skipped: [] });
  });

  it("throws NO_DOCUMENT when no document is open", async () => {
    await expect(executeHwpFillFields({ map: { x: "y" } })).rejects.toMatchObject({
      category: "session",
      code: "NO_DOCUMENT",
    });
  });
});
