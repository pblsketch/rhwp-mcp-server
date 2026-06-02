import { describe, it, expect, beforeAll, afterEach } from "vitest";

import { executeHwpOpen } from "../../src/tools/open.js";
import { sessionStore } from "../../src/session/store.js";
import { makeBlankHwpxFixture } from "../setup/fixture.js";

describe("hwp_open", () => {
  let fixture: string;
  beforeAll(async () => {
    fixture = await makeBlankHwpxFixture();
  });
  afterEach(() => {
    sessionStore.clear();
  });

  it("loads a blank .hwpx and returns the spec-locked output shape", async () => {
    const out = await executeHwpOpen({ path: fixture });
    expect(out.ok).toBe(true);
    expect(out.format).toBe("hwpx");
    expect(out.page_count).toBeGreaterThanOrEqual(0);
    expect(sessionStore.hasDocument()).toBe(true);
  });

  it("throws UNSUPPORTED_FORMAT on a non-HWP extension", async () => {
    await expect(executeHwpOpen({ path: "/tmp/some.txt" })).rejects.toMatchObject({
      category: "parse",
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("throws READ_FAILED when the file does not exist", async () => {
    await expect(executeHwpOpen({ path: "/tmp/definitely-not-there.hwpx" })).rejects.toMatchObject({
      category: "parse",
      code: "READ_FAILED",
    });
  });
});
