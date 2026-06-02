/**
 * Sprint 2 smoke — hwp_apply_action generic dispatcher.
 *
 * Verifies:
 *   - Known action ('insertText') with valid params returns ok:true.
 *   - Unknown action name raises UNKNOWN_ACTION.
 *   - Missing required params raises BAD_PARAMS.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { RhwpError } from "../../src/rhwp/errors.js";
import { executeHwpApplyAction } from "../../src/tools/apply_action.js";
import { openBlankAuthoringDocument } from "../setup/fixture.js";

describe("hwp_apply_action smoke", () => {
  beforeAll(async () => {
    await openBlankAuthoringDocument();
  });

  it("dispatches insertText with explicit coordinates", async () => {
    const result = await executeHwpApplyAction({
      name: "insertText",
      params: {
        section_idx: 0,
        para_idx: 0,
        char_offset: 0,
        text: "테스트",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("insertText");
  });

  it("rejects an unknown action name with UNKNOWN_ACTION", async () => {
    await expect(
      executeHwpApplyAction({ name: "doesNotExist", params: {} }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "UNKNOWN_ACTION",
    } satisfies Partial<RhwpError>);
  });

  it("rejects insertText missing required params with BAD_PARAMS", async () => {
    await expect(
      executeHwpApplyAction({
        name: "insertText",
        params: { text: "missing coords" },
      }),
    ).rejects.toMatchObject({
      name: "RhwpError",
      code: "BAD_PARAMS",
    } satisfies Partial<RhwpError>);
  });
});
