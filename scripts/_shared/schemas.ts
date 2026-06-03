/**
 * scripts/_shared/schemas.ts
 *
 * Single source of truth for the live tool-schema map used by both
 * `schema-snapshot.ts` (writer) and `schema-diff.ts` (reader). Before this
 * module existed each script kept its own 13+ tool import list — adding a
 * Sprint 2.5 tool required editing both, and an out-of-sync edit would
 * have silently broken the drift guard.
 *
 * Add a new tool here, in ONE place, and both downstream scripts see it.
 *
 * NOTE: `hwp_preview` was removed in Sprint 3 prep (ADR-0001 deferred to
 * v0.2). The MCP image content channel does NOT render inline in Claude
 * Desktop today — image blocks land inside the collapsed tool-use
 * accordion. Excalidraw-style inline preview uses the experimental
 * EmbeddedResource (MCP Apps) mechanism, which is a separate v0.2+
 * scope. See `docs/decisions/0001-image-renderer.md`.
 */

import { zodToJsonSchema } from "zod-to-json-schema";

import {
  HwpOpenInput,
  HwpOpenOutput,
} from "../../src/tools/open.js";
import {
  HwpSaveAsInput,
  HwpSaveAsOutput,
} from "../../src/tools/save_as.js";
import {
  HwpListFieldsInput,
  HwpListFieldsOutput,
} from "../../src/tools/list_fields.js";
import {
  HwpFillFieldsInput,
  HwpFillFieldsOutput,
} from "../../src/tools/fill_fields.js";
import {
  HwpInsertTextInput,
  HwpInsertTextOutput,
} from "../../src/tools/insert_text.js";
import {
  HwpCreateTableInput,
  HwpCreateTableOutput,
} from "../../src/tools/create_table.js";
import {
  HwpSetParagraphStyleInput,
  HwpSetParagraphStyleOutput,
} from "../../src/tools/set_paragraph_style.js";
import {
  HwpApplyActionInput,
  HwpApplyActionOutput,
} from "../../src/tools/apply_action.js";
import {
  HwpListActionsInput,
  HwpListActionsOutput,
} from "../../src/tools/list_actions.js";
import {
  HwpOpenBlankInput,
  HwpOpenBlankOutput,
} from "../../src/tools/open_blank.js";
import {
  HwpOpenBase64Input,
  HwpOpenBase64Output,
} from "../../src/tools/open_base64.js";
import {
  HwpSaveAsBase64Input,
  HwpSaveAsBase64Output,
} from "../../src/tools/save_as_base64.js";
import {
  HwpLocateBlanksInput,
  HwpLocateBlanksOutput,
} from "../../src/tools/locate_blanks.js";
import {
  HwpFillCellsInput,
  HwpFillCellsOutput,
} from "../../src/tools/fill_cells.js";
import {
  HwpOpenBase64ValidatedInput,
  HwpOpenBase64ValidatedOutput,
} from "../../src/tools/open_base64_validated.js";
import {
  HwpEngineStatusInput,
  HwpEngineStatusOutput,
} from "../../src/tools/engine_status.js";

const opts = { target: "jsonSchema7" as const };

export const TOOL_COUNT = 16;

export function liveSchemas(): Record<string, unknown> {
  return {
    hwp_open: {
      input: zodToJsonSchema(HwpOpenInput, opts),
      output: zodToJsonSchema(HwpOpenOutput, opts),
    },
    hwp_save_as: {
      input: zodToJsonSchema(HwpSaveAsInput, opts),
      output: zodToJsonSchema(HwpSaveAsOutput, opts),
    },
    hwp_list_fields: {
      input: zodToJsonSchema(HwpListFieldsInput, opts),
      output: zodToJsonSchema(HwpListFieldsOutput, opts),
    },
    hwp_fill_fields: {
      input: zodToJsonSchema(HwpFillFieldsInput, opts),
      output: zodToJsonSchema(HwpFillFieldsOutput, opts),
    },
    hwp_insert_text: {
      input: zodToJsonSchema(HwpInsertTextInput, opts),
      output: zodToJsonSchema(HwpInsertTextOutput, opts),
    },
    hwp_create_table: {
      input: zodToJsonSchema(HwpCreateTableInput, opts),
      output: zodToJsonSchema(HwpCreateTableOutput, opts),
    },
    hwp_set_paragraph_style: {
      input: zodToJsonSchema(HwpSetParagraphStyleInput, opts),
      output: zodToJsonSchema(HwpSetParagraphStyleOutput, opts),
    },
    hwp_apply_action: {
      input: zodToJsonSchema(HwpApplyActionInput, opts),
      output: zodToJsonSchema(HwpApplyActionOutput, opts),
    },
    hwp_list_actions: {
      input: zodToJsonSchema(HwpListActionsInput, opts),
      output: zodToJsonSchema(HwpListActionsOutput, opts),
    },
    hwp_open_blank: {
      input: zodToJsonSchema(HwpOpenBlankInput, opts),
      output: zodToJsonSchema(HwpOpenBlankOutput, opts),
    },
    hwp_open_base64: {
      input: zodToJsonSchema(HwpOpenBase64Input, opts),
      output: zodToJsonSchema(HwpOpenBase64Output, opts),
    },
    hwp_save_as_base64: {
      input: zodToJsonSchema(HwpSaveAsBase64Input, opts),
      output: zodToJsonSchema(HwpSaveAsBase64Output, opts),
    },
    hwp_locate_blanks: {
      input: zodToJsonSchema(HwpLocateBlanksInput, opts),
      output: zodToJsonSchema(HwpLocateBlanksOutput, opts),
    },
    hwp_fill_cells: {
      input: zodToJsonSchema(HwpFillCellsInput, opts),
      output: zodToJsonSchema(HwpFillCellsOutput, opts),
    },
    hwp_open_base64_validated: {
      input: zodToJsonSchema(HwpOpenBase64ValidatedInput, opts),
      output: zodToJsonSchema(HwpOpenBase64ValidatedOutput, opts),
    },
    hwp_engine_status: {
      input: zodToJsonSchema(HwpEngineStatusInput, opts),
      output: zodToJsonSchema(HwpEngineStatusOutput, opts),
    },
  };
}
