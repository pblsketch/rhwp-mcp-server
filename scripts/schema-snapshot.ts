/**
 * schema-snapshot.ts
 *
 * Regenerate schemas/snapshot.json from the live zod schemas exported by each
 * tool module. Run this script whenever a tool schema changes, then commit
 * the new snapshot WITH a CHANGELOG.md entry that describes the change.
 *
 * Usage:
 *   npm run schema:snapshot     # rewrites schemas/snapshot.json in place
 *
 * The companion script scripts/schema-diff.ts compares the live schemas
 * against the committed snapshot on every PR and blocks merge if they
 * differ without a CHANGELOG entry.
 *
 * Why this exists: public API stability is Principle 3 in the plan. Without
 * a snapshot guard, signatures can drift silently as developers iterate
 * inside src/tools/*.ts.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { zodToJsonSchema } from "zod-to-json-schema";

import {
  HwpOpenInput,
  HwpOpenOutput,
} from "../src/tools/open.js";
import {
  HwpSaveAsInput,
  HwpSaveAsOutput,
} from "../src/tools/save_as.js";
import {
  HwpListFieldsInput,
  HwpListFieldsOutput,
} from "../src/tools/list_fields.js";
import {
  HwpFillFieldsInput,
  HwpFillFieldsOutput,
} from "../src/tools/fill_fields.js";
import {
  HwpInsertTextInput,
  HwpInsertTextOutput,
} from "../src/tools/insert_text.js";
import {
  HwpCreateTableInput,
  HwpCreateTableOutput,
} from "../src/tools/create_table.js";
import {
  HwpSetParagraphStyleInput,
  HwpSetParagraphStyleOutput,
} from "../src/tools/set_paragraph_style.js";
import { HwpPreviewInput } from "../src/tools/preview.js";
import {
  HwpApplyActionInput,
  HwpApplyActionOutput,
} from "../src/tools/apply_action.js";
import {
  HwpListActionsInput,
  HwpListActionsOutput,
} from "../src/tools/list_actions.js";
import {
  HwpOpenBlankInput,
  HwpOpenBlankOutput,
} from "../src/tools/open_blank.js";
import {
  HwpOpenBase64Input,
  HwpOpenBase64Output,
} from "../src/tools/open_base64.js";
import {
  HwpSaveAsBase64Input,
  HwpSaveAsBase64Output,
} from "../src/tools/save_as_base64.js";

const SNAPSHOT_PATH = resolve(process.cwd(), "schemas", "snapshot.json");
const PKG_JSON_PATH = resolve(process.cwd(), "package.json");

async function readPkgVersion(): Promise<string> {
  try {
    const raw = await readFile(PKG_JSON_PATH, "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // fall through
  }
  return "unknown";
}

const tools = {
  hwp_open: {
    input: zodToJsonSchema(HwpOpenInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpOpenOutput, { target: "jsonSchema7" }),
  },
  hwp_save_as: {
    input: zodToJsonSchema(HwpSaveAsInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpSaveAsOutput, { target: "jsonSchema7" }),
  },
  hwp_list_fields: {
    input: zodToJsonSchema(HwpListFieldsInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpListFieldsOutput, { target: "jsonSchema7" }),
  },
  hwp_fill_fields: {
    input: zodToJsonSchema(HwpFillFieldsInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpFillFieldsOutput, { target: "jsonSchema7" }),
  },
  hwp_insert_text: {
    input: zodToJsonSchema(HwpInsertTextInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpInsertTextOutput, { target: "jsonSchema7" }),
  },
  hwp_create_table: {
    input: zodToJsonSchema(HwpCreateTableInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpCreateTableOutput, { target: "jsonSchema7" }),
  },
  hwp_set_paragraph_style: {
    input: zodToJsonSchema(HwpSetParagraphStyleInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpSetParagraphStyleOutput, { target: "jsonSchema7" }),
  },
  hwp_preview: {
    input: zodToJsonSchema(HwpPreviewInput, { target: "jsonSchema7" }),
    output_shape_note:
      "Returns MCP image content (type: 'image', mimeType: 'image/png', data: base64) rather than a structuredContent payload. No outputSchema.",
  },
  hwp_apply_action: {
    input: zodToJsonSchema(HwpApplyActionInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpApplyActionOutput, { target: "jsonSchema7" }),
  },
  hwp_list_actions: {
    input: zodToJsonSchema(HwpListActionsInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpListActionsOutput, { target: "jsonSchema7" }),
  },
  hwp_open_blank: {
    input: zodToJsonSchema(HwpOpenBlankInput, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpOpenBlankOutput, { target: "jsonSchema7" }),
  },
  hwp_open_base64: {
    input: zodToJsonSchema(HwpOpenBase64Input, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpOpenBase64Output, { target: "jsonSchema7" }),
  },
  hwp_save_as_base64: {
    input: zodToJsonSchema(HwpSaveAsBase64Input, { target: "jsonSchema7" }),
    output: zodToJsonSchema(HwpSaveAsBase64Output, { target: "jsonSchema7" }),
  },
};

async function main(): Promise<void> {
  const version = await readPkgVersion();
  const snapshot = {
    $comment:
      "Auto-generated by scripts/schema-snapshot.ts — do not edit by hand. " +
      "Regenerate via `npm run schema:snapshot`. Changes must be accompanied " +
      "by a CHANGELOG.md entry referencing the affected tool.",
    version,
    generated_by: "scripts/schema-snapshot.ts",
    generated_at: new Date().toISOString(),
    tool_count_expected: 13,
    tools,
  };
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  process.stderr.write(
    `schema-snapshot: wrote ${SNAPSHOT_PATH} (${Object.keys(tools).length} tools, v${version})\n`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`schema-snapshot failed: ${message}\n`);
  process.exit(1);
});
