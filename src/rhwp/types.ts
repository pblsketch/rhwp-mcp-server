/**
 * Minimal typed surface of @rhwp/core 0.7.x as used by Sprint 1.
 *
 * The full d.ts ships 260+ methods on HwpDocument — we declare only the
 * subset Sprint 1 wires into MCP tools. This keeps `unknown` out of the
 * tool handlers without locking us into the rhwp generated types (which
 * would couple us to its version bumps for surface-area unrelated to the
 * 4 Form Filling tools).
 *
 * Field API JSON shapes are quoted verbatim from
 * docs/measurements/rhwp-field-api.md and the rhwp.d.ts docstrings:
 *   - `getFieldList()` → JSON array of RhwpFieldEntry
 *   - `getFieldValueByName(name)` → JSON `{ok, fieldId, value}`
 *   - `setFieldValueByName(name, value)` → JSON `{ok, fieldId, oldValue, newValue}`
 */

export interface HwpDocumentLike {
  /** "hwp" or "hwpx" — original file format detected at load time. */
  getSourceFormat(): string;
  /** Total page count of the loaded document. */
  pageCount(): number;
  /** Returns JSON-encoded `RhwpFieldEntry[]`. */
  getFieldList(): string;
  /** Returns JSON `{ok, fieldId, value}`. */
  getFieldValueByName(name: string): string;
  /** Returns JSON `{ok, fieldId, oldValue, newValue}`. */
  setFieldValueByName(name: string, value: string): string;
  /** Serialize to HWP 5.0 binary. */
  exportHwp(): Uint8Array;
  /** Serialize to HWPX (OWPML ZIP). */
  exportHwpx(): Uint8Array;
  /** wasm-bindgen finaliser; safe to call multiple times. */
  free?(): void;
  /** Same as free() — the explicit-resource-management bridge. */
  [Symbol.dispose]?(): void;
}

/**
 * Constructor signature of `new HwpDocument(bytes)` from rhwp.d.ts.
 * We don't import HwpDocument directly — we narrow `@rhwp/core` to this
 * subset at the loader boundary so tools see a stable type.
 */
export interface HwpDocumentCtor {
  new (data: Uint8Array): HwpDocumentLike;
}

/** Minimal module-surface we touch in Sprint 1. */
export interface RhwpModuleLike {
  HwpDocument: HwpDocumentCtor & {
    /** Embedded blank template — used by tests/setup/fixture.ts. */
    createEmpty(): HwpDocumentLike;
  };
  version(): string;
}

/** Per-entry shape returned by HwpDocument.getFieldList() (JSON). */
export interface RhwpFieldEntry {
  fieldId: number;
  fieldType: string;
  name: string;
  guide?: string;
  command?: string;
  value?: string;
  location?: unknown;
}

/** Per-call shape returned by HwpDocument.setFieldValueByName() (JSON). */
export interface RhwpSetFieldResult {
  ok: boolean;
  fieldId?: number;
  oldValue?: string;
  newValue?: string;
  /** Some failure paths include a message; preserved for diagnostics. */
  message?: string;
}
