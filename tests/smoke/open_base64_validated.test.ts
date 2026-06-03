/**
 * Sprint 2.6 smoke — hwp_open_base64_validated.
 *
 * Covers:
 *   - happy path with both expected_bytes and expected_crc32 correct
 *   - wrong expected_bytes → BAD_LENGTH
 *   - wrong expected_crc32 → BAD_CHECKSUM
 *   - garbage base64 → BAD_BASE64 (forwarded from decodeBase64Strict)
 *   - hex-string and numeric forms of expected_crc32 both accepted
 */

import { crc32 } from "node:zlib";

import { describe, expect, it } from "vitest";

import { RhwpError } from "../../src/rhwp/errors.js";
import { executeHwpOpenBlank } from "../../src/tools/open_blank.js";
import { executeHwpOpenBase64Validated } from "../../src/tools/open_base64_validated.js";
import { executeHwpSaveAsBase64 } from "../../src/tools/save_as_base64.js";

interface Sample {
  bytes_base64: string;
  bytes_written: number;
  crc32: number;
}

async function makeSample(): Promise<Sample> {
  await executeHwpOpenBlank();
  const saved = await executeHwpSaveAsBase64({ format: "hwpx" });
  const decoded = Buffer.from(saved.bytes_base64, "base64");
  return {
    bytes_base64: saved.bytes_base64,
    bytes_written: saved.bytes_written,
    crc32: crc32(decoded) >>> 0,
  };
}

describe("hwp_open_base64_validated smoke", () => {
  it("accepts a correctly-described payload (numeric crc)", async () => {
    const s = await makeSample();
    const result = await executeHwpOpenBase64Validated({
      bytes_base64: s.bytes_base64,
      expected_bytes: s.bytes_written,
      expected_crc32: s.crc32,
    });
    expect(result.ok).toBe(true);
    expect(result.format).toBe("hwpx");
    expect(result.bytes_in).toBe(s.bytes_written);
    expect(result.crc32_actual).toBe(s.crc32);
  });

  it("accepts hex-string form of expected_crc32", async () => {
    const s = await makeSample();
    const hex = "0x" + s.crc32.toString(16);
    const result = await executeHwpOpenBase64Validated({
      bytes_base64: s.bytes_base64,
      expected_crc32: hex,
    });
    expect(result.ok).toBe(true);
  });

  it("throws BAD_LENGTH when expected_bytes is wrong", async () => {
    const s = await makeSample();
    await expect(
      executeHwpOpenBase64Validated({
        bytes_base64: s.bytes_base64,
        expected_bytes: s.bytes_written + 1,
      }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_LENGTH",
    } satisfies Partial<RhwpError>);
  });

  it("throws BAD_CHECKSUM when expected_crc32 is wrong", async () => {
    const s = await makeSample();
    await expect(
      executeHwpOpenBase64Validated({
        bytes_base64: s.bytes_base64,
        expected_crc32: s.crc32 + 1,
      }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_CHECKSUM",
    } satisfies Partial<RhwpError>);
  });

  it("forwards BAD_BASE64 from decodeBase64Strict on garbage input", async () => {
    await expect(
      executeHwpOpenBase64Validated({ bytes_base64: "not!!valid$$base64@@@" }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_BASE64",
    } satisfies Partial<RhwpError>);
  });
});
