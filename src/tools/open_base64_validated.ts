import { crc32 } from "node:zlib";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getRhwp, warmRhwp } from "../rhwp/loader.js";
import { RhwpError, wrapPanic } from "../rhwp/errors.js";
import type { RhwpModuleLike } from "../rhwp/types.js";
import { sessionStore } from "../session/store.js";
import { decodeBase64Strict } from "./open_base64.js";

/**
 * Accept the expected CRC32 either as a number or a hex string ("0x..." or
 * bare "deadbeef"). Surfacing both lets clients pass whichever form their
 * transport prefers without a side conversion step.
 */
const Crc32Schema = z.union([
  z.number().int().nonnegative(),
  z
    .string()
    .regex(/^(0[xX])?[0-9a-fA-F]+$/, "expected_crc32 must be a hex string"),
]);

export const HwpOpenBase64ValidatedInput = z
  .object({
    bytes_base64: z
      .string()
      .min(1)
      .describe("Base64-encoded document bytes (same encoding as hwp_open_base64)."),
    expected_bytes: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Expected decoded byte count. If supplied and the decoded length " +
          "differs, throws parse/BAD_LENGTH before any rhwp call.",
      ),
    expected_crc32: Crc32Schema.optional().describe(
      "Expected CRC32 of the decoded bytes (zlib polynomial 0xEDB88320, " +
        "matching node:zlib crc32). Hex string or number both accepted.",
    ),
    format: z
      .enum(["hwp", "hwpx"])
      .optional()
      .describe("Optional format hint, same semantics as hwp_open_base64."),
  })
  .strict();

export const HwpOpenBase64ValidatedOutput = z
  .object({
    ok: z.literal(true),
    format: z.enum(["hwp", "hwpx"]),
    page_count: z.number().int().nonnegative(),
    bytes_in: z.number().int().nonnegative(),
    crc32_actual: z.number().int().nonnegative(),
  })
  .strict();

export const DESCRIPTION =
  "Open a document from base64 bytes with EXPLICIT length + CRC32 " +
  "integrity checks. Designed for documents >10 KB where LLM context " +
  "fragmentation has been observed to silently corrupt the base64 wire " +
  "payload, leading to a WASM panic deep inside rhwp instead of a typed " +
  "error. Supply expected_bytes (decoded binary length) and/or " +
  "expected_crc32 (zlib CRC-32 of the decoded bytes). Both checks fire " +
  "BEFORE rhwp sees the bytes, so transit damage surfaces as " +
  "parse/BAD_LENGTH or parse/BAD_CHECKSUM with the actual vs expected " +
  "values for easy diagnosis.";

export interface HwpOpenBase64ValidatedResult {
  [k: string]: unknown;
  ok: true;
  format: "hwp" | "hwpx";
  page_count: number;
  bytes_in: number;
  crc32_actual: number;
}

function parseCrc32(expected: number | string): number {
  if (typeof expected === "number") return expected >>> 0;
  const stripped = expected.replace(/^0[xX]/, "");
  return parseInt(stripped, 16) >>> 0;
}

export async function executeHwpOpenBase64Validated(input: {
  bytes_base64: string;
  expected_bytes?: number;
  expected_crc32?: number | string;
  format?: "hwp" | "hwpx";
}): Promise<HwpOpenBase64ValidatedResult> {
  await warmRhwp();
  const rhwp = getRhwp() as RhwpModuleLike;

  const bytes = decodeBase64Strict(input.bytes_base64);

  if (input.expected_bytes !== undefined && input.expected_bytes !== bytes.length) {
    throw new RhwpError({
      category: "parse",
      code: "BAD_LENGTH",
      message:
        `Decoded length ${bytes.length} does not match expected_bytes ` +
        `${input.expected_bytes}. Wire payload corrupted in transit.`,
    });
  }

  const actualCrc = crc32(bytes) >>> 0;
  if (input.expected_crc32 !== undefined) {
    const wanted = parseCrc32(input.expected_crc32);
    if (wanted !== actualCrc) {
      throw new RhwpError({
        category: "parse",
        code: "BAD_CHECKSUM",
        message:
          `CRC32 0x${actualCrc.toString(16)} does not match expected 0x${wanted.toString(16)}. ` +
          "Wire payload corrupted in transit.",
      });
    }
  }

  const doc = await wrapPanic("parse", () => new rhwp.HwpDocument(bytes));
  const detected = await wrapPanic("parse", () => doc.getSourceFormat());
  const format: "hwp" | "hwpx" =
    detected === "hwp" || detected === "hwpx" ? detected : (input.format ?? "hwpx");
  const pageCount = await wrapPanic("parse", () => doc.pageCount());

  sessionStore.set(doc, {
    sourcePath: "<base64-validated>",
    sourceFormat: format,
  });

  return {
    ok: true,
    format,
    page_count: pageCount,
    bytes_in: bytes.length,
    crc32_actual: actualCrc,
  };
}

export function registerHwpOpenBase64Validated(server: McpServer): void {
  server.registerTool(
    "hwp_open_base64_validated",
    {
      title: "Open base64 with length + CRC32 integrity",
      description: DESCRIPTION,
      inputSchema: HwpOpenBase64ValidatedInput.shape,
      outputSchema: HwpOpenBase64ValidatedOutput.shape,
    },
    async ({ bytes_base64, expected_bytes, expected_crc32, format }) => {
      const result = await executeHwpOpenBase64Validated({
        bytes_base64,
        expected_bytes,
        expected_crc32,
        format,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
