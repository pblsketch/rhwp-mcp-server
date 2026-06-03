/**
 * Sprint 2.5 smoke — hwp_open_base64.
 *
 * Round-trip: open_blank → save_as_base64 → open_base64 produces an
 * equivalent document. Also covers the BAD_BASE64 negative path.
 */

import { describe, expect, it } from "vitest";

import { RhwpError } from "../../src/rhwp/errors.js";
import { executeHwpOpenBlank } from "../../src/tools/open_blank.js";
import { executeHwpOpenBase64 } from "../../src/tools/open_base64.js";
import { executeHwpSaveAsBase64 } from "../../src/tools/save_as_base64.js";

describe("hwp_open_base64 smoke", () => {
  it("round-trips a blank document through save→open", async () => {
    const opened = await executeHwpOpenBlank();
    const saved = await executeHwpSaveAsBase64({ format: "hwpx" });
    const reopened = await executeHwpOpenBase64({
      bytes_base64: saved.bytes_base64,
      format: "hwpx",
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.format).toBe("hwpx");
    expect(reopened.page_count).toBe(opened.page_count);
    expect(reopened.bytes_in).toBe(saved.bytes_written);
  });

  it("detects format automatically when the hint is omitted", async () => {
    await executeHwpOpenBlank();
    const saved = await executeHwpSaveAsBase64({ format: "hwpx" });
    const reopened = await executeHwpOpenBase64({ bytes_base64: saved.bytes_base64 });
    expect(reopened.format).toBe("hwpx");
  });

  it("throws BAD_BASE64 on garbage input", async () => {
    await expect(
      executeHwpOpenBase64({ bytes_base64: "not!!valid$$base64@@@" }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_BASE64",
    } satisfies Partial<RhwpError>);
  });

  it("throws BAD_BASE64 when the input decodes to zero bytes", async () => {
    // A single '=' normalizes to a padding-only string; Buffer.from returns
    // length 0, and the strict round-trip fails because the re-encode is the
    // empty string while the normalized input is not.
    await expect(
      executeHwpOpenBase64({ bytes_base64: "=" }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_BASE64",
    } satisfies Partial<RhwpError>);
  });
});
