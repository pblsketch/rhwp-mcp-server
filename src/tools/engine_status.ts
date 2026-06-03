import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { engineCapabilities } from "../rhwp/engine/capabilities.js";

// Read-only capability probe. Surfaces which document engines are usable on
// the current host so a client can reason about fidelity and fallback before
// driving any document operation. The probe is light (platform + known
// registration presence) and never throws — unavailable engines report a
// structured status, not an error.

export const HwpEngineStatusInput = z.object({}).strict();

const EngineStatusEnum = z.enum([
  "AVAILABLE",
  "NOT_INSTALLED",
  "NOT_REGISTERED",
  "VERSION_MISMATCH",
  "UNAVAILABLE",
]);

export const HwpEngineStatusOutput = z
  .object({
    engines: z.array(
      z
        .object({
          name: z.string(),
          status: EngineStatusEnum,
          version: z.string().optional(),
          detail: z.string().optional(),
        })
        .strict(),
    ),
    active: z.string(),
    fallback_reason: z.string().optional(),
  })
  .strict();

export const DESCRIPTION =
  "Report which document engines are usable on this host. Returns one entry " +
  "per engine (name, status, optional version + detail), the 'active' engine " +
  "that automatic selection resolves to right now, and a 'fallback_reason' " +
  "when the preferred engine is unavailable. The bundled WASM engine is always " +
  "AVAILABLE; the host-runtime engine is reported AVAILABLE only when its " +
  "automation surface is detected on Windows, otherwise NOT_INSTALLED / " +
  "NOT_REGISTERED / UNAVAILABLE. Read-only — does not open or mutate any document.";

export interface HwpEngineStatusResultEntry {
  name: string;
  status: z.infer<typeof EngineStatusEnum>;
  version?: string;
  detail?: string;
}

export interface HwpEngineStatusResult {
  [k: string]: unknown;
  engines: HwpEngineStatusResultEntry[];
  active: string;
  fallback_reason?: string;
}

export async function executeHwpEngineStatus(): Promise<HwpEngineStatusResult> {
  const report = await engineCapabilities();
  // The capability report is already the public shape; copy through so the
  // tool owns its return type independent of the rhwp-layer type.
  const result: HwpEngineStatusResult = {
    engines: report.engines.map((e) => {
      const entry: HwpEngineStatusResultEntry = {
        name: e.name,
        status: e.status,
      };
      if (e.version !== undefined) entry.version = e.version;
      if (e.detail !== undefined) entry.detail = e.detail;
      return entry;
    }),
    active: report.active,
  };
  if (report.fallback_reason !== undefined) {
    result.fallback_reason = report.fallback_reason;
  }
  return result;
}

export function registerHwpEngineStatus(server: McpServer): void {
  server.registerTool(
    "hwp_engine_status",
    {
      title: "Report document engine capabilities",
      description: DESCRIPTION,
      inputSchema: HwpEngineStatusInput.shape,
      outputSchema: HwpEngineStatusOutput.shape,
    },
    async () => {
      const result = await executeHwpEngineStatus();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
