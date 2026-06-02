/**
 * Sprint 2 — rhwp Authoring action catalog.
 *
 * This is the SOURCE OF TRUTH for `hwp_apply_action` / `hwp_list_actions`.
 * Each entry binds:
 *   - a stable `name` that matches the corresponding HwpDocument method,
 *   - a `category` for filtering,
 *   - a `description` users (and LLMs) see in hwp_list_actions output,
 *   - a `paramsSchema` (zod) for input validation, and
 *   - an `invoke(doc, params)` that calls the underlying rhwp method and
 *     returns its JSON string return value.
 *
 * The catalog is intentionally a CURATED subset of the ~260 HwpDocument
 * methods — exposing every single Rust panic surface to LLMs would be
 * irresponsible. New entries should:
 *   1. Have a verifiable use case (form filling, simple authoring, headers/
 *      footers, etc. — not low-level layout introspection).
 *   2. Use only public rhwp 0.7.13 method names confirmed against the d.ts.
 *   3. Add a focused description so hwp_list_actions output stays useful.
 *
 * `src/rhwp/catalog-manifest.json` is a serialized snapshot of this catalog
 * pinned to a specific @rhwp/core version. Regenerate via
 * `npm run generate:catalog-manifest` (scripts/generate-catalog-manifest.ts).
 *
 * Pure module — importing has no side effects.
 */

import { z } from "zod";

import type { HwpDocumentLike } from "./types.js";

export const ACTION_CATEGORIES = [
  "text",
  "table",
  "paragraph",
  "header_footer",
  "page",
  "field",
  "image",
  "math",
  "other",
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export interface ActionDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  category: ActionCategory;
  description: string;
  paramsSchema: S;
  /**
   * Calls the rhwp method on `doc` and returns its raw return value.
   *
   * Params is the OUTPUT type of the zod schema (after `.default()` is
   * applied), so defaulted fields are always non-undefined here.
   *
   * Most rhwp authoring methods return a JSON string; some (e.g.
   * pageCount, getSourceFormat) return a primitive. The dispatcher in
   * hwp_apply_action handles both cases — `invoke` simply forwards.
   */
  invoke(doc: HwpDocumentLike, params: z.output<S>): string | number | boolean;
}

// ---- shared sub-schemas --------------------------------------------------

const Coord = z
  .object({
    section_idx: z.number().int().nonnegative(),
    para_idx: z.number().int().nonnegative(),
    char_offset: z.number().int().nonnegative(),
  })
  .strict();

const CellCoord = z
  .object({
    section_idx: z.number().int().nonnegative(),
    parent_para_idx: z.number().int().nonnegative(),
    control_idx: z.number().int().nonnegative(),
    cell_idx: z.number().int().nonnegative(),
    cell_para_idx: z.number().int().nonnegative(),
  })
  .strict();

const ControlCoord = z
  .object({
    section_idx: z.number().int().nonnegative(),
    parent_para_idx: z.number().int().nonnegative(),
    control_idx: z.number().int().nonnegative(),
  })
  .strict();

// Helpers reduce per-entry boilerplate without hiding the method shape.
function action<S extends z.ZodTypeAny>(def: ActionDef<S>): ActionDef<S> {
  return def;
}

// ---- catalog -------------------------------------------------------------

export const ACTIONS: ActionDef[] = [
  // ---- text (7) -------------------------------------------------------
  action({
    name: "insertText",
    category: "text",
    description: "Insert UTF-8 text at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord.extend({ text: z.string() }).strict(),
    invoke: (doc, p) => doc.insertText(p.section_idx, p.para_idx, p.char_offset, p.text),
  }),
  action({
    name: "insertParagraph",
    category: "text",
    description: "Insert an empty paragraph at (section_idx, para_idx).",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        para_idx: z.number().int().nonnegative(),
      })
      .strict(),
    invoke: (doc, p) =>
      (doc as unknown as { insertParagraph(s: number, p: number): string }).insertParagraph(
        p.section_idx,
        p.para_idx,
      ),
  }),
  action({
    name: "deleteText",
    category: "text",
    description: "Delete `count` characters starting at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord.extend({ count: z.number().int().positive() }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          deleteText(s: number, pa: number, co: number, c: number): string;
        }
      ).deleteText(p.section_idx, p.para_idx, p.char_offset, p.count),
  }),
  action({
    name: "replaceText",
    category: "text",
    description:
      "Replace `length` characters starting at the coordinate with new_text. " +
      "Use replaceOne / replaceAll for query-driven replace.",
    paramsSchema: Coord.extend({
      length: z.number().int().nonnegative(),
      new_text: z.string(),
    }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          replaceText(s: number, pa: number, co: number, len: number, nt: string): string;
        }
      ).replaceText(p.section_idx, p.para_idx, p.char_offset, p.length, p.new_text),
  }),
  action({
    name: "replaceAll",
    category: "text",
    description: "Replace every match of `query` with `new_text` across the body.",
    paramsSchema: z
      .object({
        query: z.string().min(1),
        new_text: z.string(),
        case_sensitive: z.boolean().default(false),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          replaceAll(q: string, nt: string, cs: boolean): string;
        }
      ).replaceAll(p.query, p.new_text, p.case_sensitive),
  }),
  action({
    name: "searchAllText",
    category: "text",
    description: "Search the document for all occurrences of `query`. Returns JSON match list.",
    paramsSchema: z
      .object({
        query: z.string().min(1),
        case_sensitive: z.boolean().default(false),
        include_cells: z.boolean().default(true),
      })
      .strict(),
    invoke: (doc, p) => doc.searchAllText(p.query, p.case_sensitive, p.include_cells),
  }),
  action({
    name: "splitParagraph",
    category: "text",
    description: "Split the paragraph at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          splitParagraph(s: number, pa: number, co: number): string;
        }
      ).splitParagraph(p.section_idx, p.para_idx, p.char_offset),
  }),

  // ---- table (6) ------------------------------------------------------
  action({
    name: "createTable",
    category: "table",
    description: "Create a row_count × col_count table at the coordinate.",
    paramsSchema: Coord.extend({
      row_count: z.number().int().min(1).max(200),
      col_count: z.number().int().min(1).max(50),
    }).strict(),
    invoke: (doc, p) =>
      doc.createTable(p.section_idx, p.para_idx, p.char_offset, p.row_count, p.col_count),
  }),
  action({
    name: "insertTextInCell",
    category: "table",
    description: "Insert text into the specified cell (control_idx + cell_idx).",
    paramsSchema: CellCoord.extend({
      char_offset: z.number().int().nonnegative(),
      text: z.string(),
    }).strict(),
    invoke: (doc, p) =>
      doc.insertTextInCell(
        p.section_idx,
        p.parent_para_idx,
        p.control_idx,
        p.cell_idx,
        p.cell_para_idx,
        p.char_offset,
        p.text,
      ),
  }),
  action({
    name: "mergeTableCells",
    category: "table",
    description: "Merge the rectangular cell range (start_row,start_col) → (end_row,end_col).",
    paramsSchema: ControlCoord.extend({
      start_row: z.number().int().nonnegative(),
      start_col: z.number().int().nonnegative(),
      end_row: z.number().int().nonnegative(),
      end_col: z.number().int().nonnegative(),
    }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          mergeTableCells(
            s: number,
            pp: number,
            ci: number,
            sr: number,
            sc: number,
            er: number,
            ec: number,
          ): string;
        }
      ).mergeTableCells(
        p.section_idx,
        p.parent_para_idx,
        p.control_idx,
        p.start_row,
        p.start_col,
        p.end_row,
        p.end_col,
      ),
  }),
  action({
    name: "insertTableRow",
    category: "table",
    description: "Insert a row at row_idx. `below=true` inserts after, false inserts before.",
    paramsSchema: ControlCoord.extend({
      row_idx: z.number().int().nonnegative(),
      below: z.boolean().default(true),
    }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertTableRow(s: number, pp: number, ci: number, ri: number, b: boolean): string;
        }
      ).insertTableRow(p.section_idx, p.parent_para_idx, p.control_idx, p.row_idx, p.below),
  }),
  action({
    name: "insertTableColumn",
    category: "table",
    description: "Insert a column at col_idx. `right=true` inserts to the right, false to the left.",
    paramsSchema: ControlCoord.extend({
      col_idx: z.number().int().nonnegative(),
      right: z.boolean().default(true),
    }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertTableColumn(s: number, pp: number, ci: number, ci2: number, r: boolean): string;
        }
      ).insertTableColumn(p.section_idx, p.parent_para_idx, p.control_idx, p.col_idx, p.right),
  }),
  action({
    name: "deleteTableRow",
    category: "table",
    description: "Delete the row at row_idx.",
    paramsSchema: ControlCoord.extend({ row_idx: z.number().int().nonnegative() }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          deleteTableRow(s: number, pp: number, ci: number, r: number): string;
        }
      ).deleteTableRow(p.section_idx, p.parent_para_idx, p.control_idx, p.row_idx),
  }),

  // ---- paragraph (3) --------------------------------------------------
  action({
    name: "applyParaFormat",
    category: "paragraph",
    description:
      "Apply a paragraph-format JSON blob (alignment, indent, line-spacing) to (section_idx, para_idx).",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        para_idx: z.number().int().nonnegative(),
        props_json: z.string(),
      })
      .strict(),
    invoke: (doc, p) => doc.applyParaFormat(p.section_idx, p.para_idx, p.props_json),
  }),
  action({
    name: "applyStyle",
    category: "paragraph",
    description: "Apply a named style (by style_id) to the paragraph at (section_idx, para_idx).",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        para_idx: z.number().int().nonnegative(),
        style_id: z.number().int().nonnegative(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          applyStyle(s: number, pa: number, sid: number): string;
        }
      ).applyStyle(p.section_idx, p.para_idx, p.style_id),
  }),
  action({
    name: "applyCharFormat",
    category: "paragraph",
    description: "Apply char-format JSON (font, size, bold, …) to a character range.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        para_idx: z.number().int().nonnegative(),
        start_offset: z.number().int().nonnegative(),
        end_offset: z.number().int().nonnegative(),
        props_json: z.string(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          applyCharFormat(
            s: number,
            pa: number,
            so: number,
            eo: number,
            j: string,
          ): string;
        }
      ).applyCharFormat(p.section_idx, p.para_idx, p.start_offset, p.end_offset, p.props_json),
  }),

  // ---- header_footer (4) ----------------------------------------------
  action({
    name: "createHeaderFooter",
    category: "header_footer",
    description:
      "Create a header (is_header=true) or footer at section_idx. apply_to: 0=both, 1=even, 2=odd.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        is_header: z.boolean(),
        apply_to: z.number().int().min(0).max(2),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          createHeaderFooter(s: number, ih: boolean, at: number): string;
        }
      ).createHeaderFooter(p.section_idx, p.is_header, p.apply_to),
  }),
  action({
    name: "deleteHeaderFooter",
    category: "header_footer",
    description: "Delete the header (is_header=true) or footer for the apply_to scope.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        is_header: z.boolean(),
        apply_to: z.number().int().min(0).max(2),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          deleteHeaderFooter(s: number, ih: boolean, at: number): string;
        }
      ).deleteHeaderFooter(p.section_idx, p.is_header, p.apply_to),
  }),
  action({
    name: "insertTextInHeaderFooter",
    category: "header_footer",
    description: "Insert text inside a header/footer at (hf_para_idx, char_offset).",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        is_header: z.boolean(),
        apply_to: z.number().int().min(0).max(2),
        hf_para_idx: z.number().int().nonnegative(),
        char_offset: z.number().int().nonnegative(),
        text: z.string(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertTextInHeaderFooter(
            s: number,
            ih: boolean,
            at: number,
            hf: number,
            co: number,
            t: string,
          ): string;
        }
      ).insertTextInHeaderFooter(
        p.section_idx,
        p.is_header,
        p.apply_to,
        p.hf_para_idx,
        p.char_offset,
        p.text,
      ),
  }),
  action({
    name: "applyHfTemplate",
    category: "header_footer",
    description: "Apply a pre-defined header/footer template (template_id) to the apply_to scope.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        is_header: z.boolean(),
        apply_to: z.number().int().min(0).max(2),
        template_id: z.number().int().nonnegative(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          applyHfTemplate(s: number, ih: boolean, at: number, tid: number): string;
        }
      ).applyHfTemplate(p.section_idx, p.is_header, p.apply_to, p.template_id),
  }),

  // ---- page (3) -------------------------------------------------------
  action({
    name: "insertPageBreak",
    category: "page",
    description: "Insert a hard page break at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertPageBreak(s: number, pa: number, co: number): string;
        }
      ).insertPageBreak(p.section_idx, p.para_idx, p.char_offset),
  }),
  action({
    name: "insertColumnBreak",
    category: "page",
    description: "Insert a column break at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertColumnBreak(s: number, pa: number, co: number): string;
        }
      ).insertColumnBreak(p.section_idx, p.para_idx, p.char_offset),
  }),
  action({
    name: "setPageDef",
    category: "page",
    description:
      "Replace the section page-def (paper size, margins, orientation) with a JSON blob. " +
      "Use getPageDef beforehand to discover the current shape.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        json: z.string(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          setPageDef(s: number, j: string): string;
        }
      ).setPageDef(p.section_idx, p.json),
  }),

  // ---- field (5) ------------------------------------------------------
  action({
    name: "getFieldList",
    category: "field",
    description: "List all form fields in the document (same data as hwp_list_fields).",
    paramsSchema: z.object({}).strict(),
    invoke: (doc) => doc.getFieldList(),
  }),
  action({
    name: "getFieldValueByName",
    category: "field",
    description: "Read a single field's current value by name.",
    paramsSchema: z.object({ name: z.string().min(1) }).strict(),
    invoke: (doc, p) => doc.getFieldValueByName(p.name),
  }),
  action({
    name: "setFieldValueByName",
    category: "field",
    description: "Set a single field by name (same primitive used by hwp_fill_fields).",
    paramsSchema: z.object({ name: z.string().min(1), value: z.string() }).strict(),
    invoke: (doc, p) => doc.setFieldValueByName(p.name, p.value),
  }),
  action({
    name: "removeFieldAt",
    category: "field",
    description: "Remove the field at (section_idx, para_idx, char_offset).",
    paramsSchema: Coord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          removeFieldAt(s: number, pa: number, co: number): string;
        }
      ).removeFieldAt(p.section_idx, p.para_idx, p.char_offset),
  }),
  action({
    name: "insertFieldInHf",
    category: "field",
    description: "Insert a field of `field_type` inside a header/footer.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        is_header: z.boolean(),
        apply_to: z.number().int().min(0).max(2),
        hf_para_idx: z.number().int().nonnegative(),
        char_offset: z.number().int().nonnegative(),
        field_type: z.number().int().nonnegative(),
      })
      .strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertFieldInHf(
            s: number,
            ih: boolean,
            at: number,
            hf: number,
            co: number,
            ft: number,
          ): string;
        }
      ).insertFieldInHf(
        p.section_idx,
        p.is_header,
        p.apply_to,
        p.hf_para_idx,
        p.char_offset,
        p.field_type,
      ),
  }),

  // ---- image (2) ------------------------------------------------------
  action({
    name: "insertPicture",
    category: "image",
    description:
      "Insert a picture from raw bytes (image_data is base64 — decoded here). " +
      "width/height are in HWPUNIT, natural_*_px are pixel dimensions.",
    paramsSchema: z
      .object({
        section_idx: z.number().int().nonnegative(),
        para_idx: z.number().int().nonnegative(),
        char_offset: z.number().int().nonnegative(),
        image_data_base64: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        natural_width_px: z.number().int().positive(),
        natural_height_px: z.number().int().positive(),
        extension: z.string().min(1),
        description: z.string().default(""),
      })
      .strict(),
    invoke: (doc, p) => {
      const bytes = Uint8Array.from(Buffer.from(p.image_data_base64, "base64"));
      return (
        doc as unknown as {
          insertPicture(
            s: number,
            pa: number,
            co: number,
            data: Uint8Array,
            w: number,
            h: number,
            nw: number,
            nh: number,
            ext: string,
            desc: string,
          ): string;
        }
      ).insertPicture(
        p.section_idx,
        p.para_idx,
        p.char_offset,
        bytes,
        p.width,
        p.height,
        p.natural_width_px,
        p.natural_height_px,
        p.extension,
        p.description,
      );
    },
  }),
  action({
    name: "deletePictureControl",
    category: "image",
    description: "Delete a picture control identified by (section_idx, parent_para_idx, control_idx).",
    paramsSchema: ControlCoord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          deletePictureControl(s: number, pp: number, ci: number): string;
        }
      ).deletePictureControl(p.section_idx, p.parent_para_idx, p.control_idx),
  }),

  // ---- math (2) -------------------------------------------------------
  action({
    name: "insertEquation",
    category: "math",
    description:
      "Insert a math equation at (section_idx, para_idx, char_offset). `script` is HwpEqn syntax. " +
      "color is packed BGR (0=black).",
    paramsSchema: Coord.extend({
      script: z.string().min(1),
      font_size: z.number().positive(),
      color: z.number().int().nonnegative().default(0),
    }).strict(),
    invoke: (doc, p) =>
      (
        doc as unknown as {
          insertEquation(
            s: number,
            pa: number,
            co: number,
            sc: string,
            fs: number,
            c: number,
          ): string;
        }
      ).insertEquation(p.section_idx, p.para_idx, p.char_offset, p.script, p.font_size, p.color),
  }),
  action({
    name: "deleteEquationControl",
    category: "math",
    description: "Delete an equation control identified by (section_idx, parent_para_idx, control_idx).",
    paramsSchema: ControlCoord,
    invoke: (doc, p) =>
      (
        doc as unknown as {
          deleteEquationControl(s: number, pp: number, ci: number): string;
        }
      ).deleteEquationControl(p.section_idx, p.parent_para_idx, p.control_idx),
  }),

  // ---- other (3) ------------------------------------------------------
  action({
    name: "getDocumentInfo",
    category: "other",
    description: "Return high-level document metadata (sections, page count, format) as JSON.",
    paramsSchema: z.object({}).strict(),
    invoke: (doc) =>
      (doc as unknown as { getDocumentInfo(): string }).getDocumentInfo(),
  }),
  action({
    name: "getBookmarks",
    category: "other",
    description: "Return all bookmarks in the document as a JSON list.",
    paramsSchema: z.object({}).strict(),
    invoke: (doc) =>
      (doc as unknown as { getBookmarks(): string }).getBookmarks(),
  }),
  action({
    name: "exportHwpVerify",
    category: "other",
    description:
      "Round-trip the document through HWP 5.0 export and return a structural-equivalence " +
      "verification report. Used by Sprint 1.5 binary-identity gate.",
    paramsSchema: z.object({}).strict(),
    invoke: (doc) =>
      (doc as unknown as { exportHwpVerify(): string }).exportHwpVerify(),
  }),
];

// ---- lookups -------------------------------------------------------------

export function getActionByName(name: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.name === name);
}

export function listActions(category?: ActionCategory | "all"): ActionDef[] {
  if (!category || category === "all") return ACTIONS.slice();
  return ACTIONS.filter((a) => a.category === category);
}

/**
 * Sanity-check the catalog at import time of any TEST that explicitly wants
 * to verify invariants. Not auto-run because pure modules MUST NOT have
 * side effects — call from a test or the manifest generator.
 */
export function validateCatalog(): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const a of ACTIONS) {
    if (seen.has(a.name)) errors.push(`duplicate action name: ${a.name}`);
    seen.add(a.name);
    if (!ACTION_CATEGORIES.includes(a.category)) {
      errors.push(`${a.name}: unknown category ${a.category}`);
    }
    if (!a.description || a.description.length < 8) {
      errors.push(`${a.name}: description too short`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
