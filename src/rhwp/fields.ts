/**
 * Shared helpers for Field API JSON parsing.
 *
 * Both `hwp_list_fields` and `hwp_fill_fields` need to parse the JSON array
 * returned by `HwpDocument.getFieldList()`. Before this module existed the
 * parsing + Array-check + typed error were duplicated across both tool
 * handlers. Centralizing keeps the BAD_FIELD_JSON error shape identical and
 * gives Sprint 2+ tools (e.g. a future hwp_get_field) one entry point.
 */

import { RhwpError } from "./errors.js";
import type { HwpDocumentLike, RhwpFieldEntry } from "./types.js";
import { wrapPanic } from "./errors.js";

/**
 * Call `doc.getFieldList()` and decode the JSON into `RhwpFieldEntry[]`.
 *
 * Throws `RhwpError(category='field', code='BAD_FIELD_JSON')` if rhwp
 * returns something that isn't a JSON array — that case shouldn't happen
 * against rhwp 0.7.x but the typed error makes diagnosis painless if a
 * future rhwp release changes the shape.
 */
export async function getFieldEntries(doc: HwpDocumentLike): Promise<RhwpFieldEntry[]> {
  const raw = await wrapPanic("field", () => doc.getFieldList());

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new RhwpError({
      category: "field",
      code: "BAD_FIELD_JSON",
      message: `rhwp getFieldList returned non-JSON: ${e instanceof Error ? e.message : String(e)}`,
      cause: e,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new RhwpError({
      category: "field",
      code: "BAD_FIELD_JSON",
      message: `rhwp getFieldList expected an array, got ${typeof parsed}`,
    });
  }

  return parsed as RhwpFieldEntry[];
}
