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
  /** Sprint 2.6: table row/col/cell counts. Returns JSON `{rowCount, colCount, cellCount}`. */
  getTableDimensions(section_idx: number, parent_para_idx: number, control_idx: number): string;
  /** Sprint 2.6: read text inside a table cell. Returns JSON. */
  getTextInCell(
    section_idx: number,
    parent_para_idx: number,
    control_idx: number,
    cell_idx: number,
    cell_para_idx: number,
    char_offset: number,
    count: number,
  ): string;
  /** Sprint 2.6: paragraph count in a section. */
  getParagraphCount(section_idx: number): number;
  /** Sprint 2.6: total section count. */
  getSectionCount(): number;
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

/**
 * Engine-neutral document handle.
 *
 * A `DocumentEngine` produces handles that the tool layer manipulates. To
 * preserve existing behaviour exactly, the handle exposes the synchronous
 * document surface (`HwpDocumentLike`) unchanged — every document-manipulation
 * and serialization call the tools already make (insertText, exportHwpx, …)
 * stays a direct synchronous call against the underlying handle. Only the
 * creation/serialization *boundary* (open/create/dispose) is asynchronous, so
 * that engines whose construction is inherently asynchronous can be plugged in
 * later without rewriting the document surface.
 *
 * `EngineDocument` is therefore an alias of `HwpDocumentLike` today: the
 * engine wraps a synchronous handle and hands it back as-is. Keeping the alias
 * (rather than collapsing usages to `HwpDocumentLike`) names the engine
 * boundary explicitly and leaves room to widen the handle later.
 */
export type EngineDocument = HwpDocumentLike;

/**
 * Engine-neutral document engine.
 *
 * The engine owns the creation and serialization boundary. Its methods are
 * asynchronous on purpose: the WASM engine resolves synchronously-produced
 * handles via `Promise.resolve`, while engines that must spin up an external
 * process to build a document can return a genuinely deferred handle without
 * changing this contract.
 *
 * - `openFromBytes` builds a document from already-loaded bytes. The optional
 *   `format` hint is advisory; engines may auto-detect the format from the
 *   byte signature.
 * - `createBlank` materialises an empty document from the engine's bundled
 *   blank template.
 * - `dispose` releases any engine-owned resources backing the handle. The
 *   lifetime contract is intentionally left provisional in this phase — the
 *   signature exists so callers have a neutral release path, while the precise
 *   semantics are deferred to a later decision.
 */
export interface DocumentEngine {
  /** Stable identifier for this engine implementation (e.g. "wasm"). */
  readonly name: string;
  /**
   * Whether this engine can actually service document operations right now.
   * `false` marks a capability *slot* — an engine that is reported in the
   * capability surface but whose document methods are not yet implemented (so
   * automatic selection must skip it and fall back to an operational engine).
   * Operational engines set this `true`.
   */
  readonly operational: boolean;
  /** Build a document handle from document bytes. */
  openFromBytes(bytes: Uint8Array, format?: "hwp" | "hwpx"): Promise<EngineDocument>;
  /** Build a blank document handle from the engine's bundled template. */
  createBlank(): Promise<EngineDocument>;
  /** Release engine-owned resources backing a handle. Best-effort. */
  dispose?(doc: EngineDocument): Promise<void>;
  /**
   * Read structural metadata for a table cell directly from the engine.
   *
   * This is the seam that lets an office-automation engine supply real cell
   * geometry (merge spans, covered cells) from the host runtime's object
   * model, where the WASM engine can only infer structure heuristically. The
   * WASM engine leaves this undefined so callers fall back to the heuristic
   * path in `tables.ts`; an operational automation engine implements it to
   * return authoritative spans.
   */
  getCellMetadata?(doc: EngineDocument, coords: CellCoords): Promise<CellMetadata>;
}

/** Address of a single table cell within a document. */
export interface CellCoords {
  section_idx: number;
  parent_para_idx: number;
  control_idx: number;
  cell_idx: number;
}

/** Structural metadata for a table cell, when an engine can supply it. */
export interface CellMetadata {
  /** Row span of this cell (1 when not merged vertically). */
  row_span: number;
  /** Column span of this cell (1 when not merged horizontally). */
  col_span: number;
  /** True when this cell position is covered by another cell's merge span. */
  covered: boolean;
}

/**
 * Status of a document engine after an environment capability probe.
 *
 * - `AVAILABLE`     — the engine can be used right now.
 * - `NOT_INSTALLED` — the underlying office runtime is absent on this host.
 * - `NOT_REGISTERED`— the runtime appears installed but its automation
 *                     surface (typelib / COM registration) is not registered.
 * - `VERSION_MISMATCH` — a runtime is registered but its version is outside
 *                     the range this engine supports.
 * - `UNAVAILABLE`   — the engine cannot be used and the precise reason could
 *                     not be determined (e.g. probe failed, or the platform
 *                     does not support this engine at all).
 */
export type EngineStatus =
  | "AVAILABLE"
  | "NOT_INSTALLED"
  | "NOT_REGISTERED"
  | "VERSION_MISMATCH"
  | "UNAVAILABLE";

/** Per-engine entry in an EngineCapabilityReport. */
export interface EngineCapabilityEntry {
  /** Stable engine identifier (e.g. "wasm", "com"). */
  name: string;
  /** Probe outcome for this engine. */
  status: EngineStatus;
  /** Detected version string, when one could be read. */
  version?: string;
  /** Human-readable detail explaining the status (probe evidence). */
  detail?: string;
}

/**
 * Structured capability report describing which document engines are usable
 * on the current host. Returned by `engineCapabilities()` and surfaced by the
 * `hwp_engine_status` tool.
 *
 * - `engines`        — one entry per known engine.
 * - `active`         — the engine name that `ensureEngine("auto")` would
 *                      resolve to right now (the first AVAILABLE engine in
 *                      preference order, falling back to "wasm").
 * - `fallback_reason`— present when the preferred engine was not AVAILABLE and
 *                      the active engine is therefore a fallback; explains why.
 */
export interface EngineCapabilityReport {
  engines: EngineCapabilityEntry[];
  active: string;
  fallback_reason?: string;
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
