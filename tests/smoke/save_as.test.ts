import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeHwpOpen } from "../../src/tools/open.js";
import { executeHwpSaveAs } from "../../src/tools/save_as.js";
import { sessionStore } from "../../src/session/store.js";
import { makeBlankHwpxFixture } from "../setup/fixture.js";

describe("hwp_save_as", () => {
  let fixture: string;
  beforeAll(async () => {
    fixture = await makeBlankHwpxFixture();
  });
  afterEach(() => {
    sessionStore.clear();
  });

  it("saves the open document as HWPX and bytes_written matches file size", async () => {
    await executeHwpOpen({ path: fixture });
    const outPath = join(tmpdir(), `rhwp-mcp-saveas-${process.pid}.hwpx`);
    const result = await executeHwpSaveAs({ path: outPath, format: "hwpx" });

    expect(result.ok).toBe(true);
    expect(result.path).toBe(outPath);
    expect(result.format).toBe("hwpx");
    expect(result.bytes_written).toBeGreaterThan(0);

    const stat = statSync(outPath);
    expect(stat.size).toBe(result.bytes_written);

    unlinkSync(outPath);
  });

  it("throws NO_DOCUMENT when no document is open", async () => {
    await expect(
      executeHwpSaveAs({ path: join(tmpdir(), `rhwp-mcp-nodoc-${process.pid}.hwpx`), format: "hwpx" }),
    ).rejects.toMatchObject({
      category: "session",
      code: "NO_DOCUMENT",
    });
  });

  it("throws BAD_OUTPUT_DIR when the parent directory does not exist", async () => {
    await executeHwpOpen({ path: fixture });
    await expect(
      executeHwpSaveAs({ path: "/no/such/dir/x.hwpx", format: "hwpx" }),
    ).rejects.toMatchObject({
      category: "serialize",
      code: "BAD_OUTPUT_DIR",
    });
  });
});
