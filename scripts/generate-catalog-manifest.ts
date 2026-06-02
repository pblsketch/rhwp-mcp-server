/**
 * scripts/generate-catalog-manifest.ts
 *
 * Regenerate `src/rhwp/catalog-manifest.json` from the in-source ACTIONS
 * catalog (`src/rhwp/actions.ts`) and the @rhwp/core version pinned in
 * package.json.
 *
 * Used as a build-time and CI-time check (catalog-drift.yml compares the
 * committed manifest against a fresh regeneration to detect catalog drift
 * without a manifest bump).
 *
 * Run via `npm run generate:catalog-manifest` or directly with tsx.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zodToJsonSchema } from "zod-to-json-schema";

import { ACTIONS, validateCatalog } from "../src/rhwp/actions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
  dependencies: Record<string, string>;
};

const rawDep = pkg.dependencies?.["@rhwp/core"] ?? "";
// Strip ^/~/= prefixes — we want the bare semver.
const rhwpCoreVersion = rawDep.replace(/^[\^~>=<]+/, "");
if (!rhwpCoreVersion) {
  throw new Error(
    "package.json has no @rhwp/core dependency — cannot pin catalog manifest",
  );
}

const validation = validateCatalog();
if (!validation.ok) {
  throw new Error(`catalog validation failed:\n  ${validation.errors.join("\n  ")}`);
}

const manifest = {
  rhwpCoreVersion,
  generatedAt: new Date().toISOString(),
  actionCount: ACTIONS.length,
  actions: ACTIONS.map((a) => ({
    name: a.name,
    category: a.category,
    description: a.description,
    params_schema: zodToJsonSchema(a.paramsSchema, { target: "jsonSchema7" }),
  })),
};

const outPath = join(repoRoot, "src", "rhwp", "catalog-manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
process.stdout.write(
  `catalog-manifest: wrote ${manifest.actionCount} actions, pinned to @rhwp/core ${rhwpCoreVersion}\n`,
);
