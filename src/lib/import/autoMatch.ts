/**
 * Auto-matching for the Import Mapper: given the headers of an office's own
 * export, guess which of our template columns each one feeds.
 *
 * Pure and dependency-light so it can run in the browser as soon as a file is
 * parsed, with no round trip. See `docs/SPECS_IMPORT_MAPPER.md` §3.
 *
 * Three tiers, first hit wins:
 *   1. exact    — the schema already recognises the header (or the raw key)
 *   2. alias    — a curated real-world synonym (headerAliases.ts)
 *   3. fuzzy    — Fuse.js, shown to the admin as a *suggestion* to eyeball
 *
 * A suggestion is never silently trusted: the UI renders "suggested" matches
 * differently and shows sample values, because the cost of a wrong match is
 * an entire column of data landing in the wrong field.
 */

import Fuse from "fuse.js";
import * as contactsSchema from "@/lib/contacts/import-schema";
import * as dealsSchema from "@/lib/deals/import-schema";
import { aliasesFor } from "@/lib/import/headerAliases";

export type MatchStatus = "matched" | "suggested" | "unmapped";

export interface FieldMapping {
  /** Header text from the office's file. */
  source?: string;
  /** Two headers joined with a space (first/last name splits). */
  concat?: [string, string];
  status: MatchStatus;
}

/** targetKey -> mapping */
export type MappingState = Record<string, FieldMapping>;

/**
 * Fuse threshold. 0 = exact only, 1 = matches anything. 0.3 accepts genuine
 * typos ("Cmpany" -> "Company") while rejecting merely similar-looking but
 * unrelated headers ("Country" -> "County"). Tuned against the real PHL and
 * NYC exports listed in docs/OFFICE_DATA_ONBOARDING.md.
 */
const FUZZY_THRESHOLD = 0.3;

interface Candidate {
  key: string;
  /** Every string that should match this key: header, key, and aliases. */
  term: string;
}

function schemaFor(entity: "contacts" | "deals") {
  return entity === "contacts" ? contactsSchema : dealsSchema;
}

/**
 * Build the searchable term list. Each (key, term) pair is a separate Fuse
 * document so a hit on any alias scores that key.
 */
function candidatesFor(entity: "contacts" | "deals"): Candidate[] {
  const schema = schemaFor(entity);
  const aliases = aliasesFor(entity);
  const out: Candidate[] = [];
  for (const col of schema.TEMPLATE_COLUMNS) {
    out.push({ key: col.key, term: col.header });
    out.push({ key: col.key, term: col.key.replace(/_/g, " ") });
    for (const a of aliases[col.key] ?? []) out.push({ key: col.key, term: a });
  }
  return out;
}

/**
 * Exact match against the schema's own header table — the same normalisation
 * the importer uses, so anything `mapHeaders` would accept is tier 1 here.
 */
function exactKeyFor(entity: "contacts" | "deals", header: string): string | undefined {
  const schema = schemaFor(entity);
  const { headerToKey } = schema.mapHeaders([header]);
  return headerToKey[0];
}

function aliasKeyFor(entity: "contacts" | "deals", header: string): string | undefined {
  const schema = schemaFor(entity);
  const norm = schema.normaliseHeader(header);
  const aliases = aliasesFor(entity);
  for (const [key, list] of Object.entries(aliases)) {
    if (list.some((a) => schema.normaliseHeader(a) === norm)) return key;
  }
  return undefined;
}

/**
 * Detect the "first name / last name" pair that HubSpot-style exports use in
 * place of a single name column. Only applied when nothing better matched the
 * name field, since a file with a real full-name column should use it.
 */
function findNameSplit(
  entity: "contacts" | "deals",
  headers: string[]
): [string, string] | undefined {
  if (entity !== "contacts") return undefined;
  const schema = schemaFor(entity);
  const norm = (h: string) => schema.normaliseHeader(h);
  const first = headers.find((h) => ["first_name", "firstname", "given_name"].includes(norm(h)));
  const last = headers.find((h) => ["last_name", "lastname", "surname", "family_name"].includes(norm(h)));
  return first && last ? [first, last] : undefined;
}

/**
 * Produce an initial mapping for every template column.
 *
 * Guarantees:
 *   - a source header is never assigned to two different targets
 *   - every template column appears in the result (unmapped if nothing fits)
 */
export function autoMatch(headers: string[], entity: "contacts" | "deals"): MappingState {
  const schema = schemaFor(entity);
  const usable = headers.filter((h) => h != null && String(h).trim().length > 0);
  const mapping: MappingState = {};
  const claimed = new Set<string>();

  for (const col of schema.TEMPLATE_COLUMNS) mapping[col.key] = { status: "unmapped" };

  // Tier 1 + 2: deterministic. Run over headers so the file's own order breaks
  // ties when two headers map to one key (first one wins, rest stay free).
  for (const header of usable) {
    if (claimed.has(header)) continue;
    const key = exactKeyFor(entity, header) ?? aliasKeyFor(entity, header);
    if (key && mapping[key] && mapping[key].status === "unmapped") {
      mapping[key] = { source: header, status: "matched" };
      claimed.add(header);
    }
  }

  // First/last name split, only if the name field is still empty.
  const nameKey = "contact_name";
  if (mapping[nameKey] && mapping[nameKey].status === "unmapped") {
    const split = findNameSplit(entity, usable);
    if (split && !claimed.has(split[0]) && !claimed.has(split[1])) {
      mapping[nameKey] = { concat: split, status: "matched" };
      claimed.add(split[0]);
      claimed.add(split[1]);
    }
  }

  // Tier 3: fuzzy. Score every remaining header against every remaining
  // target, then assign greedily best-first so the strongest pairing wins.
  const remainingTargets = schema.TEMPLATE_COLUMNS.filter((c) => mapping[c.key].status === "unmapped");
  const remainingHeaders = usable.filter((h) => !claimed.has(h));

  if (remainingTargets.length > 0 && remainingHeaders.length > 0) {
    const pool = candidatesFor(entity).filter((c) => remainingTargets.some((t) => t.key === c.key));
    const fuse = new Fuse(pool, {
      keys: ["term"],
      threshold: FUZZY_THRESHOLD,
      includeScore: true,
      ignoreLocation: true
    });

    const scored: Array<{ header: string; key: string; score: number }> = [];
    for (const header of remainingHeaders) {
      const hit = fuse.search(header)[0];
      if (hit && typeof hit.score === "number") {
        scored.push({ header, key: hit.item.key, score: hit.score });
      }
    }
    scored.sort((a, b) => a.score - b.score);

    for (const s of scored) {
      if (claimed.has(s.header)) continue;
      if (mapping[s.key].status !== "unmapped") continue;
      mapping[s.key] = { source: s.header, status: "suggested" };
      claimed.add(s.header);
    }
  }

  return mapping;
}

/** Headers in the file that no target is using — shown as "will be ignored". */
export function unusedHeaders(headers: string[], mapping: MappingState): string[] {
  const used = new Set<string>();
  for (const m of Object.values(mapping)) {
    if (m.source) used.add(m.source);
    if (m.concat) m.concat.forEach((h) => used.add(h));
  }
  return headers.filter((h) => h && String(h).trim().length > 0 && !used.has(h));
}

/** Template columns that are required but still have no source column. */
export function missingRequired(mapping: MappingState, entity: "contacts" | "deals"): string[] {
  const schema = schemaFor(entity);
  return schema.TEMPLATE_COLUMNS.filter(
    (c) => c.required && mapping[c.key]?.status === "unmapped"
  ).map((c) => c.header);
}
