/**
 * Reshape an office's own export into our template, using the mapping the
 * admin confirmed in the Import Mapper.
 *
 * This is the ONLY place mapping semantics live. The route is a thin wrapper
 * and `runImport` is untouched, so a mapped file is validated by exactly the
 * same rules as a hand-prepared one. See `docs/SPECS_IMPORT_MAPPER.md` §4.
 *
 * Pure: no I/O, no database, no framework. Safe to unit test and to reuse if
 * saved mappings (Phase B) are ever built.
 */

import * as contactsSchema from "@/lib/contacts/import-schema";
import * as dealsSchema from "@/lib/deals/import-schema";

export interface MappingEntry {
  /** Header text in the source file. */
  source?: string;
  /** Two source headers joined with a single space. */
  concat?: [string, string];
}

/** targetKey -> where its value comes from. Unmapped targets may be omitted. */
export type SubmittedMapping = Record<string, MappingEntry>;

export interface ApplyMappingResult {
  /** Header row (template order) followed by the mapped data rows. */
  rows: string[][];
  /** Source headers no target consumed. Reported, never silently dropped. */
  ignoredHeaders: string[];
}

export class MappingError extends Error {}

function schemaFor(entity: "contacts" | "deals") {
  return entity === "contacts" ? contactsSchema : dealsSchema;
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  return v == null ? "" : String(v);
}

/**
 * @param sheet Raw parsed CSV including its header row.
 * @param mapping Confirmed target -> source mapping.
 * @param entity Which template to emit.
 *
 * Emits every template column in `TEMPLATE_COLUMNS` order, blank where
 * unmapped, so the importer's own `mapHeaders` sees a complete template and
 * its required-column check still applies as the backstop.
 */
export function applyMapping(
  sheet: string[][],
  mapping: SubmittedMapping,
  entity: "contacts" | "deals"
): ApplyMappingResult {
  if (!Array.isArray(sheet) || sheet.length < 1) {
    throw new MappingError("File is empty.");
  }

  const schema = schemaFor(entity);
  const sourceHeaders = (sheet[0] ?? []).map((h) => (h == null ? "" : String(h)));

  // Header text -> column index. First occurrence wins; a duplicated header in
  // the source is ambiguous and the later one is unreachable, which we surface
  // rather than resolving arbitrarily.
  const indexOf = new Map<string, number>();
  const duplicates: string[] = [];
  sourceHeaders.forEach((h, i) => {
    const t = h.trim();
    if (!t) return;
    if (indexOf.has(t)) duplicates.push(t);
    else indexOf.set(t, i);
  });

  const targetKeys = schema.TEMPLATE_COLUMNS.map((c) => c.key);
  const used = new Set<string>();
  const claimedBy = new Map<string, string>();

  // Validate the mapping before touching any data.
  for (const [key, entry] of Object.entries(mapping)) {
    if (!entry) continue;
    if (!targetKeys.includes(key)) {
      throw new MappingError(`Unknown target field "${key}".`);
    }
    if (entry.source && entry.concat) {
      throw new MappingError(`Field "${key}" has both a single column and a combined pair.`);
    }
    const sources = entry.concat ?? (entry.source ? [entry.source] : []);
    for (const s of sources) {
      if (!indexOf.has(s.trim())) {
        throw new MappingError(`Column "${s}" is not in the uploaded file.`);
      }
      if (used.has(s.trim())) {
        throw new MappingError(
          `Column "${s}" is mapped to both "${claimedBy.get(s.trim())}" and "${key}". Each column can only be used once.`
        );
      }
      used.add(s.trim());
      claimedBy.set(s.trim(), key);
    }
  }

  if (duplicates.length > 0) {
    const dupUsed = duplicates.filter((d) => used.has(d));
    if (dupUsed.length > 0) {
      throw new MappingError(
        `Your file has more than one column named ${dupUsed.map((d) => `"${d}"`).join(", ")}. Rename them so each is distinct, then upload again.`
      );
    }
  }

  const header = schema.TEMPLATE_COLUMNS.map((c) => c.header);
  const out: string[][] = [header];

  for (let r = 1; r < sheet.length; r++) {
    const src = sheet[r] ?? [];
    // Skip wholly blank lines, matching the importer's own behaviour.
    if (src.every((c) => String(c ?? "").trim().length === 0)) continue;

    out.push(
      schema.TEMPLATE_COLUMNS.map((col) => {
        const entry = mapping[col.key];
        if (!entry) return "";
        if (entry.concat) {
          const [a, b] = entry.concat;
          return [cell(src, indexOf.get(a.trim())).trim(), cell(src, indexOf.get(b.trim())).trim()]
            .filter(Boolean)
            .join(" ");
        }
        if (entry.source) return cell(src, indexOf.get(entry.source.trim()));
        return "";
      })
    );
  }

  const ignoredHeaders = sourceHeaders.filter((h) => h.trim() && !used.has(h.trim()));

  return { rows: out, ignoredHeaders };
}
