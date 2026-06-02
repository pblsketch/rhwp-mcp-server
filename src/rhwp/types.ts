/**
 * Minimal typed surface of @rhwp/core 0.7.x as used by Sprint 1 and Sprint 2.
 *
 * The full d.ts ships 260+ methods on HwpDocument — we declare only the
 * subset our tools actually call. This keeps `unknown` out of the tool
 * handlers without locking us into the rhwp generated types (which would
 * couple us to its version bumps for surface-area unrelated to our tools).
 *
 * Field API JSON shapes are quoted verbatim from
 * docs/measurements/rhwp-field-api.md and the rhwp.d.ts docstrings:
 *   - `getFieldList()` → JSON array of RhwpFieldEntry
 *   - `getFieldValueByName(name)` → JSON `{ok, fieldId, value}`
 *   - `setFieldValueByName(name, value)` → JSON `{ok, fieldId, oldValue, newValue}`
 *
 * Sprint 2 widens the surface with the Authoring methods (insertText,
 * createTable, applyParaFormat, insertTextInCell, searchAllText). The
 * catalog (src/rhwp/actions.ts) reaches further via an index signature so
 * `hwp_apply_action` can dispatch any rhwp method by name without each one
 * needing to be re-declared here.
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
  /** Sprint 2: insert UTF-8 text at coordinates. Returns rhwp JSON. */
  insertText(section_idx: number, para_idx: number, char_offset: number, text: string): string;
  /** Sprint 2: insert text into an existing table cell. Returns rhwp JSON. */
  insertTextInCell(
    section_idx: number,
    parent_para_idx: number,
    control_idx: number,
    cell_idx: number,
    cell_para_idx: number,
    char_offset: number,
    text: string,
  ): string;
  /** Sprint 2: create a table at coordinates. Returns rhwp JSON containing control_idx. */
  createTable(
    section_idx: number,
    para_idx: number,
    char_offset: number,
    row_count: number,
    col_count: number,
  ): string;
  /** Sprint 2: apply paragraph-format JSON. Returns rhwp JSON. */
  applyParaFormat(sec_idx: number, para_idx: number, props_json: string): string;
  /** Sprint 2: search across the whole document. Returns rhwp JSON. */
  searchAllText(query: string, case_sensitive: boolean, include_cells: boolean): string;
  /** wasm-bindgen finaliser; safe to call multiple times. */
  free?(): void;
  /** Same as free() — the explicit-resource-management bridge. */
  [Symbol.dispose]?(): void;
  /**
   * Catch-all index so `hwp_apply_action` can dispatch catalog actions by
   * method name without each one being re-declared on this interface. The
   * catalog itself validates params via zod before reaching this signature.
   */
  [method: string]: unknown;
}

/**
 * Constructor signature of `new HwpDocument(bytes)` from rhwp.d.ts.
 * We don't import HwpDocument directly — we narrow `@rhwp/core` to this
 * subset at the loader boundary so tools see a stable type.
 */
export interface HwpDocumentCtor {
  new (data: Uint8Array): HwpDocumentLike;
}

/** Minimal module-surface we touch in Sprint 1+. */
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

/**
 * Generic shape of rhwp Authoring action returns. Most actions return a
 * JSON string with at least an `ok` flag. We accept anything JSON-parseable
 * here — the per-tool handler decides which fields to surface.
 */
export interface RhwpActionResult {
  ok?: boolean;
  message?: string;
  [k: string]: unknown;
}
