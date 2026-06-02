/**
 * probe-rhwp-fields.ts
 *
 * Sprint 0 step 9 (Architect note N1) — resolves spec Open Q5.
 *
 * Goal: discover the ACTUAL export surface of @rhwp/core 0.7.x so the
 * Sprint 1 implementation of hwp_open / hwp_save_as / hwp_list_fields /
 * hwp_fill_fields targets real symbols, not the COM-style guesses in the
 * spec (GetFieldList / PutFieldText).
 *
 * The script:
 *   1. Dynamically imports @rhwp/core.
 *   2. Enumerates top-level exports + their typeof.
 *   3. For each function-typed export, dumps Function.prototype.toString
 *      (or signature shape if .length / .name available).
 *   4. Heuristically flags candidates that look like Field API:
 *      names containing /field/i, /getfield/i, /putfield/i, /fields/i, etc.
 *   5. Writes findings to docs/measurements/rhwp-field-api.md so the
 *      report is reviewable in the repo.
 *
 * Run AFTER `npm install`.
 *   npm run probe:fields
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";

const REPORT_PATH = resolve(
  process.cwd(),
  "docs",
  "measurements",
  "rhwp-field-api.md",
);

interface ExportEntry {
  name: string;
  typeof_: string;
  is_async: boolean;
  is_class: boolean;
  signature_hint: string;
  field_api_candidate: boolean;
}

const FIELD_PATTERNS: RegExp[] = [
  /field/i,
  /getfield/i,
  /putfield/i,
  /listfield/i,
  /set.*field/i,
  /form/i, // some libraries name form-field handling under "form"
];

function classifyExport(name: string, value: unknown): ExportEntry {
  const t = typeof value;
  const isAsync =
    t === "function" &&
    typeof (value as () => unknown) === "function" &&
    /^async/.test(((value as () => unknown).toString() || "").slice(0, 16));
  const isClass =
    t === "function" &&
    typeof (value as () => unknown) === "function" &&
    /^class\s/.test(((value as () => unknown).toString() || "").slice(0, 16));

  let sigHint = "";
  if (t === "function") {
    try {
      const src = (value as () => unknown).toString();
      // First 200 chars of source = enough to see signature.
      sigHint = src.slice(0, 200).replace(/\s+/g, " ");
    } catch {
      sigHint = "<function (toString denied)>";
    }
  } else if (t === "object" && value !== null) {
    sigHint = `<object with keys: ${Object.keys(value).slice(0, 10).join(", ")}>`;
  } else {
    sigHint = String(value).slice(0, 80);
  }

  const fieldApiCandidate = FIELD_PATTERNS.some((re) => re.test(name));

  return {
    name,
    typeof_: t,
    is_async: isAsync,
    is_class: isClass,
    signature_hint: sigHint,
    field_api_candidate: fieldApiCandidate,
  };
}

async function main(): Promise<void> {
  const t0 = performance.now();
  let mod: Record<string, unknown>;
  try {
    mod = (await import("@rhwp/core")) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeReport({
      loaded: false,
      load_error: msg,
      load_ms: Math.round(performance.now() - t0),
      exports: [],
      candidates: [],
      classes_with_methods: {},
    });
    process.stderr.write(`probe-rhwp-fields: import failed — ${msg}\n`);
    process.exit(1);
  }

  const loadMs = Math.round(performance.now() - t0);
  const exportNames = Object.keys(mod).sort();
  const entries = exportNames.map((n) => classifyExport(n, mod[n]));

  // For class-typed exports, also enumerate their prototype methods so we
  // can spot e.g. `Document.getFieldList()` patterns.
  const classMethods: Record<string, string[]> = {};
  for (const entry of entries) {
    if (entry.is_class) {
      try {
        const cls = mod[entry.name] as { prototype: object };
        const methods = Object.getOwnPropertyNames(cls.prototype).filter(
          (n) => n !== "constructor",
        );
        classMethods[entry.name] = methods.sort();
      } catch {
        classMethods[entry.name] = [];
      }
    }
  }

  const candidates = entries.filter((e) => e.field_api_candidate);
  // Also surface any method on any class whose name matches field patterns.
  for (const [clsName, methods] of Object.entries(classMethods)) {
    for (const m of methods) {
      if (FIELD_PATTERNS.some((re) => re.test(m))) {
        candidates.push({
          name: `${clsName}.prototype.${m}`,
          typeof_: "method",
          is_async: false,
          is_class: false,
          signature_hint: "(class method)",
          field_api_candidate: true,
        });
      }
    }
  }

  await writeReport({
    loaded: true,
    load_ms: loadMs,
    exports: entries,
    candidates,
    classes_with_methods: classMethods,
  });

  process.stderr.write(
    `probe-rhwp-fields: ${exportNames.length} exports, ${candidates.length} Field API candidates → ${REPORT_PATH}\n`,
  );
}

interface ReportData {
  loaded: boolean;
  load_error?: string;
  load_ms: number;
  exports: ExportEntry[];
  candidates: ExportEntry[];
  classes_with_methods: Record<string, string[]>;
}

async function writeReport(data: ReportData): Promise<void> {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const lines: string[] = [];
  lines.push("# rhwp Field API Probe Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Resolves: spec Open Q5 (Field API method-name confirmation)`);
  lines.push("");
  if (!data.loaded) {
    lines.push("## STATUS: LOAD FAILED");
    lines.push("");
    lines.push("```");
    lines.push(data.load_error ?? "(no error message)");
    lines.push("```");
    lines.push("");
    lines.push("**Action:** verify `npm install` succeeded and Node ≥ 20.");
  } else {
    lines.push(`## Load time: ${data.load_ms} ms`);
    lines.push("");
    lines.push("## Field API candidates");
    if (data.candidates.length === 0) {
      lines.push("");
      lines.push(
        "**No top-level export or class method matched Field API heuristics.** " +
          "This does NOT mean the Field API is missing — it may be exposed under " +
          "a non-obvious name. Review the full export list below and consult " +
          "https://edwardkim.github.io/rhwp/ for documented Field operations.",
      );
    } else {
      lines.push("");
      lines.push("| Name | typeof | sig hint |");
      lines.push("|------|--------|----------|");
      for (const c of data.candidates) {
        lines.push(`| \`${c.name}\` | ${c.typeof_} | \`${c.signature_hint.replace(/\|/g, "\\|")}\` |`);
      }
    }
    lines.push("");
    lines.push("## Full export listing");
    lines.push("");
    lines.push("| Name | typeof | async | class | sig hint |");
    lines.push("|------|--------|-------|-------|----------|");
    for (const e of data.exports) {
      lines.push(
        `| \`${e.name}\` | ${e.typeof_} | ${e.is_async ? "y" : ""} | ${e.is_class ? "y" : ""} | \`${e.signature_hint.replace(/\|/g, "\\|").slice(0, 120)}\` |`,
      );
    }
    lines.push("");
    const classNames = Object.keys(data.classes_with_methods);
    if (classNames.length > 0) {
      lines.push("## Class prototypes");
      for (const cn of classNames) {
        lines.push("");
        lines.push(`### \`${cn}\``);
        if (data.classes_with_methods[cn].length === 0) {
          lines.push("(no own methods on prototype)");
        } else {
          for (const m of data.classes_with_methods[cn]) {
            lines.push(`- \`${m}()\``);
          }
        }
      }
    }
  }
  lines.push("");
  await writeFile(REPORT_PATH, lines.join("\n"), "utf8");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`probe-rhwp-fields: fatal — ${message}\n`);
  process.exit(1);
});
