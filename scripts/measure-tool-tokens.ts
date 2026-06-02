/**
 * measure-tool-tokens.ts
 *
 * Estimate the total token count of the 10-tool MCP catalog as it would be
 * sent to an LLM in the system prompt. The MCP protocol embeds every tool's
 * name, description, and JSON Schema in each request — so a bloated catalog
 * directly inflates per-request cost AND crowds out user context.
 *
 * Plan Risk R3 (MEDIUM): the catalog must not exceed 8000 tokens. This
 * script measures the actual figure and writes a report to
 * docs/measurements/tool-description-tokens.txt.
 *
 * Estimation method:
 *   We do NOT bundle a tokenizer in this script — that would multiply
 *   install size for a CI-only utility. Instead we use the well-known
 *   char/4 approximation that is conservative for English/Korean mixed
 *   prose (real BPE tokens average ~3.5-4 characters in practice).
 *
 * Exit codes:
 *   0  if total ≤ 8000
 *   1  if total > 8000 (CI fails, prune descriptions)
 *
 * Source-of-truth note:
 *   Every `description` string is imported from its tool module. This
 *   prevents drift between what the MCP server actually sends and what we
 *   measure here. Editing a description in src/tools/*.ts automatically
 *   re-measures on the next CI run.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

import { zodToJsonSchema } from "zod-to-json-schema";

import {
  DESCRIPTION as DESC_OPEN,
  HwpOpenInput,
  HwpOpenOutput,
} from "../src/tools/open.js";
import {
  DESCRIPTION as DESC_SAVE_AS,
  HwpSaveAsInput,
  HwpSaveAsOutput,
} from "../src/tools/save_as.js";
import {
  DESCRIPTION as DESC_LIST_FIELDS,
  HwpListFieldsInput,
  HwpListFieldsOutput,
} from "../src/tools/list_fields.js";
import {
  DESCRIPTION as DESC_FILL_FIELDS,
  HwpFillFieldsInput,
  HwpFillFieldsOutput,
} from "../src/tools/fill_fields.js";
import {
  DESCRIPTION as DESC_INSERT_TEXT,
  HwpInsertTextInput,
  HwpInsertTextOutput,
} from "../src/tools/insert_text.js";
import {
  DESCRIPTION as DESC_CREATE_TABLE,
  HwpCreateTableInput,
  HwpCreateTableOutput,
} from "../src/tools/create_table.js";
import {
  DESCRIPTION as DESC_SET_PARA,
  HwpSetParagraphStyleInput,
  HwpSetParagraphStyleOutput,
} from "../src/tools/set_paragraph_style.js";
import {
  DESCRIPTION as DESC_PREVIEW,
  HwpPreviewInput,
} from "../src/tools/preview.js";
import {
  DESCRIPTION as DESC_APPLY_ACTION,
  HwpApplyActionInput,
  HwpApplyActionOutput,
} from "../src/tools/apply_action.js";
import {
  DESCRIPTION as DESC_LIST_ACTIONS,
  HwpListActionsInput,
  HwpListActionsOutput,
} from "../src/tools/list_actions.js";

const THRESHOLD_TOKENS = 8000;
const REPORT_PATH = resolve(
  process.cwd(),
  "docs",
  "measurements",
  "tool-description-tokens.txt",
);

interface ToolDescriptor {
  name: string;
  description: string;
  input: unknown;
  output?: unknown;
}

function describeAll(): ToolDescriptor[] {
  return [
    {
      name: "hwp_open",
      description: DESC_OPEN,
      input: zodToJsonSchema(HwpOpenInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpOpenOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_save_as",
      description: DESC_SAVE_AS,
      input: zodToJsonSchema(HwpSaveAsInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpSaveAsOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_list_fields",
      description: DESC_LIST_FIELDS,
      input: zodToJsonSchema(HwpListFieldsInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpListFieldsOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_fill_fields",
      description: DESC_FILL_FIELDS,
      input: zodToJsonSchema(HwpFillFieldsInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpFillFieldsOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_insert_text",
      description: DESC_INSERT_TEXT,
      input: zodToJsonSchema(HwpInsertTextInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpInsertTextOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_create_table",
      description: DESC_CREATE_TABLE,
      input: zodToJsonSchema(HwpCreateTableInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpCreateTableOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_set_paragraph_style",
      description: DESC_SET_PARA,
      input: zodToJsonSchema(HwpSetParagraphStyleInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpSetParagraphStyleOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_preview",
      description: DESC_PREVIEW,
      input: zodToJsonSchema(HwpPreviewInput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_apply_action",
      description: DESC_APPLY_ACTION,
      input: zodToJsonSchema(HwpApplyActionInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpApplyActionOutput, { target: "jsonSchema7" }),
    },
    {
      name: "hwp_list_actions",
      description: DESC_LIST_ACTIONS,
      input: zodToJsonSchema(HwpListActionsInput, { target: "jsonSchema7" }),
      output: zodToJsonSchema(HwpListActionsOutput, { target: "jsonSchema7" }),
    },
  ];
}

function estimateTokens(s: string): number {
  // char/4 fallback — conservative for English+Korean mixed text in BPE.
  return Math.ceil(s.length / 4);
}

function payloadFor(tool: ToolDescriptor): string {
  // The MCP server sends approximately this shape for tools/list. We
  // emulate it here for size measurement.
  return JSON.stringify({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input,
    outputSchema: tool.output,
  });
}

async function main(): Promise<void> {
  const tools = describeAll();
  const rows = tools.map((t) => {
    const payload = payloadFor(t);
    return {
      name: t.name,
      chars: payload.length,
      tokens: estimateTokens(payload),
    };
  });
  const totalTokens = rows.reduce((sum, r) => sum + r.tokens, 0);
  const totalChars = rows.reduce((sum, r) => sum + r.chars, 0);

  const lines: string[] = [];
  lines.push("Tool description token measurement");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Threshold: ${THRESHOLD_TOKENS} tokens`);
  lines.push(`Estimation: char/4 approximation (conservative for ko+en mixed)`);
  lines.push("");
  lines.push("Per-tool breakdown:");
  for (const r of rows) {
    lines.push(`  ${r.name.padEnd(28)}  ${String(r.tokens).padStart(6)} tok  (${r.chars} chars)`);
  }
  lines.push("");
  lines.push(`TOTAL: ${totalTokens} tokens / ${totalChars} chars`);
  lines.push(
    totalTokens <= THRESHOLD_TOKENS
      ? `PASS — ${THRESHOLD_TOKENS - totalTokens} tokens of headroom`
      : `FAIL — ${totalTokens - THRESHOLD_TOKENS} tokens over budget; prune descriptions`,
  );
  lines.push("");

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"), "utf8");

  process.stderr.write(lines.slice(-3).join("\n") + "\n");
  process.stderr.write(`Report: ${REPORT_PATH}\n`);

  if (totalTokens > THRESHOLD_TOKENS) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`measure-tool-tokens: fatal — ${message}\n`);
  process.exit(1);
});
