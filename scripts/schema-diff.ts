/**
 * schema-diff.ts
 *
 * CI guard for public-API stability (plan Principle 3). Compares the live
 * zod-derived tool schemas to the committed `schemas/snapshot.json` and
 * exits with code 1 if they differ, UNLESS CHANGELOG.md's Unreleased
 * section mentions every affected tool name.
 *
 * Usage:
 *   npm run schema:diff           # exits 0 on match, 1 on uncoordinated diff
 *   tsx scripts/schema-diff.ts    # equivalent
 *
 * Behaviour:
 *   - Loads schemas/snapshot.json
 *   - Recomputes live schemas via the shared scripts/_shared/schemas.ts
 *     (the same source schema-snapshot.ts uses)
 *   - Performs a deep equal comparison per tool
 *   - For any diff, checks whether the tool name appears in CHANGELOG.md's
 *     ## [Unreleased] section. If yes, the diff is acknowledged and the
 *     script exits 0 with a warning. If no, the script prints the offending
 *     tools and exits 1.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { liveSchemas } from "./_shared/schemas.js";

interface SnapshotShape {
  version: string;
  tools: Record<string, unknown>;
}

const REPO_ROOT = process.cwd();
const SNAPSHOT_PATH = resolve(REPO_ROOT, "schemas", "snapshot.json");
const CHANGELOG_PATH = resolve(REPO_ROOT, "CHANGELOG.md");

/**
 * Stable canonical JSON serialisation — sorts object keys so the diff is
 * insensitive to property ordering.
 */
function canon(value: unknown): string {
  return JSON.stringify(value, function replacer(_key, v) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

async function loadSnapshot(): Promise<SnapshotShape> {
  const text = await readFile(SNAPSHOT_PATH, "utf8");
  return JSON.parse(text) as SnapshotShape;
}

async function readChangelogUnreleased(): Promise<string> {
  try {
    const text = await readFile(CHANGELOG_PATH, "utf8");
    // Pull the Unreleased section: from "## [Unreleased]" or "## Unreleased"
    // until the next "## " heading OR the end of the file.
    //
    // NOTE: JS regex does NOT support the `\Z` end-of-string anchor — it is
    // treated as a literal `Z`. We use a `(?![\s\S])` negative lookahead
    // instead, which matches only at end-of-string and pairs cleanly with
    // the `^##\s` alternative for "next ## heading".
    const match = text.match(
      /^##\s*\[?Unreleased\]?[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m,
    );
    return match && match[1] !== undefined ? match[1] : "";
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const snapshot = await loadSnapshot();
  const live = liveSchemas();

  const liveNames = new Set(Object.keys(live));
  const snapshotNames = new Set(Object.keys(snapshot.tools));

  const added = [...liveNames].filter((n) => !snapshotNames.has(n));
  const removed = [...snapshotNames].filter((n) => !liveNames.has(n));

  const changed: string[] = [];
  for (const name of liveNames) {
    if (!snapshotNames.has(name)) continue;
    const liveCanon = canon(live[name]);
    const snapCanon = canon(snapshot.tools[name]);
    if (liveCanon !== snapCanon) {
      changed.push(name);
    }
  }

  const affected = [...added, ...removed, ...changed];
  if (affected.length === 0) {
    process.stderr.write("schema-diff: clean (no drift)\n");
    process.exit(0);
  }

  const unreleased = await readChangelogUnreleased();
  const unmentioned = affected.filter((name) => !unreleased.includes(name));

  if (unmentioned.length === 0) {
    process.stderr.write(
      `schema-diff: drift acknowledged in CHANGELOG (${affected.join(", ")})\n`,
    );
    process.exit(0);
  }

  process.stderr.write("schema-diff: UNCOORDINATED DRIFT — refusing merge.\n");
  if (added.length) process.stderr.write(`  added:   ${added.join(", ")}\n`);
  if (removed.length) process.stderr.write(`  removed: ${removed.join(", ")}\n`);
  if (changed.length) process.stderr.write(`  changed: ${changed.join(", ")}\n`);
  process.stderr.write(
    `  Fix: add an Unreleased section entry to CHANGELOG.md mentioning each tool ` +
      `by name (${unmentioned.join(", ")}), then regenerate via ` +
      `\`npm run schema:snapshot\` and commit both files.\n`,
  );
  process.exit(1);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`schema-diff: fatal — ${message}\n`);
  process.exit(1);
});
