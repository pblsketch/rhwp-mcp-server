/**
 * Sprint 2.5 smoke — hwp_save_as_base64.
 *
 * Exports the currently-open document as base64 in both formats and
 * asserts the bytes_written / bytes_base64 contract.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { executeHwpOpenBlank } from "../../src/tools/open_blank.js";
import { executeHwpSaveAsBase64 } from "../../src/tools/save_as_base64.js";

describe("hwp_save_as_base64 smoke", () => {
  beforeAll(async () => {
    await executeHwpOpenBlank();
  });

  it("exports the blank document as base64 hwpx", async () => {
    const result = await executeHwpSaveAsBase64({ format: "hwpx" });
    expect(result.ok).toBe(true);
    expect(result.format).toBe("hwpx");
    expect(result.bytes_written).toBeGreaterThan(1000);
    expect(result.bytes_base64.length).toBeGreaterThan(0);
    // base64 wire length is ceil(n / 3) * 4 — always at least the binary
    // size and never beyond ~37% overhead.
    expect(result.bytes_base64.length).toBeGreaterThanOrEqual(result.bytes_written);
  });

  it("exports the blank document as base64 hwp", async () => {
    const result = await executeHwpSaveAsBase64({ format: "hwp" });
    expect(result.ok).toBe(true);
    expect(result.format).toBe("hwp");
    expect(result.bytes_written).toBeGreaterThan(1000);
    expect(result.bytes_base64.length).toBeGreaterThan(0);
  });

  it("base64 string is decodable back to the original binary size", async () => {
    const result = await executeHwpSaveAsBase64({ format: "hwpx" });
    const decoded = Buffer.from(result.bytes_base64, "base64");
    expect(decoded.length).toBe(result.bytes_written);
  });
});
