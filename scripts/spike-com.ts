/**
 * scripts/spike-com.ts — interactive-desktop validation of the host-runtime
 * (automation) engine.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ RUN THIS ONLY ON AN INTERACTIVE WINDOWS DESKTOP.                        │
 * │                                                                           │
 * │ This script creates a LIVE Hangul word-processor automation object.       │
 * │ Instantiating that object BLOCKS in a non-interactive context (CI, a      │
 * │ headless shell, an agent session) — it waits forever for a desktop that   │
 * │ isn't there. Do NOT run it from automation. Run it yourself, at your      │
 * │ keyboard, on a machine with the word processor installed.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Prerequisites:
 *   1. The Hangul word processor is installed on this Windows desktop.
 *   2. `pip install pyhwpx` (the optional automation wrapper).
 *   3. A Python interpreter on PATH (or set RHWP_PYTHON to its path).
 *   4. RHWP_COM=1 (opt-in) — the engine is off otherwise.
 *
 * What it does (a minimal smoke of the real object model):
 *   handshake (ping) → create a blank document → release + quit the helper.
 * It does NOT register the permissive security module unless you also set
 * RHWP_COM_REGISTER_MODULE=1 (off by default; relaxes a safety prompt).
 *
 * Run:
 *   RHWP_COM=1 npm run spike:com
 *   # or, with an explicit interpreter:
 *   RHWP_COM=1 RHWP_PYTHON=py npm run spike:com
 */

import { ComHelperBridge } from "../src/rhwp/engine/com-helper-bridge.js";
import { isComOptedIn } from "../src/rhwp/engine/capabilities.js";

async function main(): Promise<void> {
  if (!isComOptedIn()) {
    process.stderr.write(
      "spike:com refused — set RHWP_COM=1 to opt in. This script drives a LIVE " +
        "automation object and must only run on an interactive desktop.\n",
    );
    process.exit(2);
  }

  process.stderr.write(
    "spike:com — about to instantiate the LIVE host automation object.\n" +
      "If you are NOT at an interactive Windows desktop, press Ctrl+C now.\n",
  );

  const bridge = new ComHelperBridge();
  try {
    process.stderr.write("→ handshake (ping)…\n");
    const ping = await bridge.command("ping", {}, 10_000);
    process.stderr.write(`  ping: ${JSON.stringify(ping)}\n`);

    process.stderr.write("→ create_blank (creates the live object)…\n");
    const created = await bridge.command("create_blank", {}, 60_000);
    process.stderr.write(`  create_blank: ${JSON.stringify(created)}\n`);

    process.stderr.write("✓ spike succeeded — the host runtime is drivable.\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`✗ spike failed: ${message}\n`);
    process.exitCode = 1;
  } finally {
    process.stderr.write("→ disposing helper (quit + reap)…\n");
    await bridge.dispose();
  }
}

void main();
