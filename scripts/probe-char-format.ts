/**
 * scripts/probe-char-format.ts
 *
 * Sprint 2.7 — verify the runtime signature of HwpDocument.applyCharFormat
 * before wiring it into hwp_insert_text.
 *
 * Goal: confirm that rhwp/core 0.7.13 accepts a props_json with the keys
 * {fontSize, bold, italic, underline, textColor, fontFamily} and returns
 * ok:true. Also confirm the pt × 100 → fontSize HWPUNIT convention.
 *
 * Writes findings to docs/measurements/rhwp-char-format.md.
 *
 * Run: npx tsx scripts/probe-char-format.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { warmRhwp } from "../src/rhwp/loader.js";
import type { RhwpModuleLike } from "../src/rhwp/types.js";

const REPORT_PATH = resolve(
  process.cwd(),
  "docs",
  "measurements",
  "rhwp-char-format.md",
);

interface ProbeAttempt {
  label: string;
  props: Record<string, unknown>;
  rawReturn: string | null;
  parsed: unknown;
  error: string | null;
}

async function probe(): Promise<void> {
  const mod = (await warmRhwp()) as RhwpModuleLike;
  const doc = mod.HwpDocument.createEmpty();
  (doc as unknown as { createBlankDocument(): string }).createBlankDocument();

  // Insert a known short string so we can target a non-empty range.
  const TEXT = "abcdef";
  doc.insertText(0, 0, 0, TEXT);

  const callApply = (
    propsJson: string,
  ): { raw: string | null; error: string | null } => {
    try {
      const raw = (
        doc as unknown as {
          applyCharFormat(
            s: number,
            pa: number,
            so: number,
            eo: number,
            j: string,
          ): string;
        }
      ).applyCharFormat(0, 0, 0, TEXT.length, propsJson);
      return { raw, error: null };
    } catch (e) {
      return {
        raw: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  const attempts: ProbeAttempt[] = [];

  const CANDIDATES: { label: string; props: Record<string, unknown> }[] = [
    {
      label: "fontSize only (1200 = 12pt × 100)",
      props: { fontSize: 1200 },
    },
    {
      label: "bold + textColor (#1A1A1A)",
      props: { bold: true, textColor: "#1A1A1A" },
    },
    {
      label: "full set: fontSize, bold, italic, underline, textColor, fontFamily",
      props: {
        fontSize: 1400,
        bold: true,
        italic: false,
        underline: true,
        textColor: "#FF0000",
        fontFamily: "함초롬바탕",
      },
    },
    {
      label: "empty props {}",
      props: {},
    },
  ];

  for (const c of CANDIDATES) {
    const propsJson = JSON.stringify(c.props);
    const { raw, error } = callApply(propsJson);
    let parsed: unknown = null;
    if (raw !== null && raw.length > 0) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    attempts.push({
      label: c.label,
      props: c.props,
      rawReturn: raw,
      parsed,
      error,
    });
  }

  await writeReport(mod, attempts);

  if (typeof doc.free === "function") {
    try {
      doc.free();
    } catch {
      /* ignore */
    }
  }
}

async function writeReport(
  mod: RhwpModuleLike,
  attempts: ProbeAttempt[],
): Promise<void> {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const lines: string[] = [];
  lines.push("# rhwp applyCharFormat Probe Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`rhwp/core version: ${mod.version()}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(
    "Confirm the runtime signature of `HwpDocument.applyCharFormat` so that",
  );
  lines.push(
    "Sprint 2.7 can chain it after `insertText` in `hwp_insert_text` without",
  );
  lines.push("relying on undocumented assumptions about the props JSON shape.");
  lines.push("");
  lines.push("## Method signature (from catalog)");
  lines.push("");
  lines.push(
    "`applyCharFormat(section_idx, para_idx, start_offset, end_offset, props_json) → string`",
  );
  lines.push("");
  lines.push("## Probe attempts");
  lines.push("");
  for (const a of attempts) {
    lines.push(`### ${a.label}`);
    lines.push("");
    lines.push("Props sent:");
    lines.push("```json");
    lines.push(JSON.stringify(a.props, null, 2));
    lines.push("```");
    if (a.error !== null) {
      lines.push("");
      lines.push(`**Threw:** \`${a.error}\``);
    } else {
      lines.push("");
      lines.push("Raw return:");
      lines.push("```");
      lines.push(a.rawReturn ?? "(empty string)");
      lines.push("```");
      if (a.parsed !== null) {
        lines.push("");
        lines.push("Parsed return:");
        lines.push("```json");
        lines.push(JSON.stringify(a.parsed, null, 2));
        lines.push("```");
      }
    }
    lines.push("");
  }
  await writeFile(REPORT_PATH, lines.join("\n"), "utf8");
  process.stderr.write(
    `probe-char-format: ${attempts.length} attempts → ${REPORT_PATH}\n`,
  );
}

probe().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`probe-char-format: fatal — ${message}\n`);
  process.exit(1);
});
