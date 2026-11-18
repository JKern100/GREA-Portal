/**
 * Stable deal key — how the portal recognises "the same deal" across uploads.
 *
 * PREPARED, NOT YET WIRED IN. Nothing imports this module. It exists so the
 * matching rules can be tested ahead of the deal-notes project
 * (docs/SPECS_DEAL_NOTES_AND_CONTACT_LINK.md, Part A). Do not connect it to
 * the import core until that project is approved.
 *
 * Why a key at all: every upload deletes an office's deals and inserts new
 * rows with new UUIDs, so nothing that must persist can reference `deals.id`.
 * Notes reference `(office_id, deal_key)` instead, and each upload recomputes
 * the same key from the same inputs.
 *
 * The rule (keep the SQL twin in the 0026 migration identical):
 *   usable external id  ->  "id:" + lower(trim(id))
 *   otherwise           ->  "nk:" + norm(deal_name) + "|" + norm(address)
 *   norm(s)             =   lowercase, keep only a-z and 0-9
 *
 * `norm` is deliberately ASCII-only so the JavaScript and Postgres versions
 * cannot disagree about Unicode case-folding.
 */

export interface DealKeyInput {
  external_id?: string | null;
  deal_name: string | null;
  property_address?: string | null;
}

/** Lowercase and strip everything except a-z and 0-9. */
export function normKeyPart(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Spreadsheets silently turn long numeric IDs into scientific notation
 * ("1.23457E+11"), destroying them. Seen on 91% of one real HubSpot export.
 * Such a value is the same for many different records, so it must never be
 * used as an identity.
 */
const SCIENTIFIC_NOTATION = /^\d+(\.\d+)?e\+?\d+$/i;

export function isUsableExternalId(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim();
  if (!v) return false;
  if (SCIENTIFIC_NOTATION.test(v)) return false;
  return true;
}

/**
 * Key for a single deal, or null when there is nothing to build one from
 * (no usable id and a name that normalises to nothing).
 */
export function dealKey(input: DealKeyInput): string | null {
  if (isUsableExternalId(input.external_id)) {
    return `id:${(input.external_id as string).trim().toLowerCase()}`;
  }
  const name = normKeyPart(input.deal_name);
  if (!name) return null;
  return `nk:${name}|${normKeyPart(input.property_address)}`;
}

/** The name-and-address key regardless of any id — used when adopting ids. */
export function naturalKey(input: DealKeyInput): string | null {
  return dealKey({ ...input, external_id: null });
}

export interface AssignedKeys {
  /** One entry per input row, in order. */
  keys: Array<string | null>;
  warnings: string[];
}

/**
 * Keys for a whole file. Differs from mapping `dealKey` over the rows in two
 * ways that only make sense with the full file in view:
 *   - an external id shared by more than one row is not an identity, so those
 *     rows fall back to name + address (with a warning)
 *   - rows that end up sharing a key are reported, because their notes would
 *     be shared too
 */
export function assignDealKeys(rows: DealKeyInput[]): AssignedKeys {
  const warnings: string[] = [];

  const idCounts = new Map<string, number>();
  let damaged = 0;
  for (const r of rows) {
    const raw = (r.external_id ?? "").trim();
    if (!raw) continue;
    if (!isUsableExternalId(raw)) {
      damaged++;
      continue;
    }
    const k = raw.toLowerCase();
    idCounts.set(k, (idCounts.get(k) ?? 0) + 1);
  }

  const repeatedIds = [...idCounts.entries()].filter(([, n]) => n > 1);
  const repeated = new Set(repeatedIds.map(([k]) => k));

  if (damaged > 0) {
    warnings.push(
      `${damaged} Deal ID value(s) look damaged by a spreadsheet (for example 1.23E+11) and were ignored. Those deals are matched by name and address instead. Export the ID column as text to fix this.`
    );
  }
  if (repeatedIds.length > 0) {
    const sample = repeatedIds.slice(0, 3).map(([k]) => k).join(", ");
    warnings.push(
      `${repeatedIds.length} Deal ID value(s) appear on more than one row (${sample}${repeatedIds.length > 3 ? ", …" : ""}), so they can't identify a deal. Those rows are matched by name and address instead.`
    );
  }

  const keys = rows.map((r) => {
    const raw = (r.external_id ?? "").trim().toLowerCase();
    const idOk = isUsableExternalId(r.external_id) && !repeated.has(raw);
    return dealKey(idOk ? r : { ...r, external_id: null });
  });

  const byKey = new Map<string, string[]>();
  rows.forEach((r, i) => {
    const k = keys[i];
    if (!k) return;
    const list = byKey.get(k) ?? [];
    list.push(r.deal_name ?? "");
    byKey.set(k, list);
  });
  const collisions = [...byKey.values()].filter((names) => names.length > 1);
  if (collisions.length > 0) {
    const sample = collisions
      .slice(0, 3)
      .map((names) => `"${names[0]}" ×${names.length}`)
      .join(", ");
    warnings.push(
      `${collisions.length} group(s) of deals have the same name and address (${sample}${collisions.length > 3 ? ", …" : ""}). The portal can't tell them apart, so any notes would appear on all of them.`
    );
  }

  return { keys, warnings };
}
