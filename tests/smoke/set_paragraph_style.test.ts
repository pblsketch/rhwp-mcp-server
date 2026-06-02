/**
 * Sprint 2 smoke — hwp_set_paragraph_style on the blank HWPX fixture.
 *
 * Verifies executeHwpSetParagraphStyle returns ok:true with a minimal style
 * blob. We do NOT introspect the document afterwards — the exact applied
 * shape depends on rhwp's internal interpretation of the props JSON, which
 * is not part of our public contract.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { executeHwpSetParagraphStyle } from "../../src/tools/set_paragraph_style.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

describe("hwp_set_paragraph_style smoke", () => {
  beforeAll(async () => {
    await openBlankAuthoringDocument();
  });

  it("applies an alignment-only style without throwing", async () => {
    const result = await executeHwpSetParagraphStyle({
      style: { alignment: "center" },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts an empty style object", async () => {
    const result = await executeHwpSetParagraphStyle({ style: {} });
    expect(result.ok).toBe(true);
  });
});
