/**
 * Shared definition of the Contacts import/export template.
 * Used by:
 *   - the template download route (`/api/contacts/template`)
 *   - the upload parser & server action
 *   - the import modal preview
 *
 * Keep column order stable — admins paste the same template back.
 */

export interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  hint: string;
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "contact_name", header: "Contact Name", required: true, hint: "Required. Full name of the contact." },
  { key: "account_name", header: "Account / Company", required: true, hint: "Required. Company or account the contact belongs to." },
  { key: "broker_email", header: "Broker Email", required: false, hint: "Optional. Email of the broker in your office to assign. Leave blank for unassigned." },
  { key: "contact_phone", header: "Phone", required: false, hint: "Optional." },
  { key: "contact_email", header: "Email", required: false, hint: "Optional." },
  { key: "relationship_status", header: "Relationship Status", required: false, hint: "Optional. e.g. Active, Prospect, Former." },
  { key: "listing", header: "Listing", required: false, hint: "Optional. Associated listing or property." },
  { key: "note", header: "Note", required: false, hint: "Optional free-text note." },
  { key: "tags", header: "Tags", required: false, hint: "Optional. Semicolon-separated, e.g. 'Client; Active'." },
  { key: "sectors", header: "Sectors", required: false, hint: "Optional. Semicolon-separated, e.g. 'Multifamily; General'." },
  { key: "last_contact_date", header: "Last Contact Date", required: false, hint: "Optional. YYYY-MM-DD." },
  { key: "is_confidential", header: "Confidential", required: false, hint: "Optional. true / false. Defaults to false." }
];

export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);

/** Sample row included in the downloaded template for reference. */
export const TEMPLATE_SAMPLE_ROW: string[] = [
  "Jane Doe",
  "Acme Industrial",
  "broker@grea.com",
  "(212) 555-0100",
  "jane@acme.com",
  "Active",
  "123 Main St",
  "Met at conference",
  "Client; Active",
  "Multifamily; General",
  "2025-11-01",
  "false"
];

export interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  raw: Record<string, string>;
  errors: string[];
  contact_name: string;
  account_name: string;
  broker_email: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  relationship_status: string | null;
  listing: string | null;
  note: string | null;
  tags: string[];
  sectors: string[];
  last_contact_date: string | null;
  is_confidential: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nullable(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function splitList(v: unknown): string[] {
  const s = nullable(v);
  if (!s) return [];
  return s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseBool(v: unknown): { value: boolean; error?: string } {
  const s = nullable(v);
  if (!s) return { value: false };
  const lower = s.toLowerCase();
  if (["true", "yes", "y", "1"].includes(lower)) return { value: true };
  if (["false", "no", "n", "0"].includes(lower)) return { value: false };
  return { value: false, error: `Invalid boolean "${s}" — use true/false.` };
}

/**
 * Normalise a header string for matching ("Contact Name " → "contact_name").
 * Accepts both the human header ("Contact Name") and the underlying key
 * ("contact_name") so admins can rename headers slightly without breaking.
 */
export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const HEADER_TO_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of TEMPLATE_COLUMNS) {
    m[normaliseHeader(c.header)] = c.key;
    m[normaliseHeader(c.key)] = c.key;
  }
  return m;
})();

export function mapHeaders(rawHeaders: string[]): {
  headerToKey: Record<number, string>;
  unknownHeaders: string[];
  missingRequired: string[];
} {
  const headerToKey: Record<number, string> = {};
  const unknownHeaders: string[] = [];
  const seen = new Set<string>();

  rawHeaders.forEach((h, i) => {
    const key = HEADER_TO_KEY[normaliseHeader(h)];
    if (key) {
      headerToKey[i] = key;
      seen.add(key);
    } else if (h.trim().length > 0) {
      unknownHeaders.push(h);
    }
  });

  const missingRequired = TEMPLATE_COLUMNS.filter((c) => c.required && !seen.has(c.key)).map((c) => c.header);
  return { headerToKey, unknownHeaders, missingRequired };
}

/**
 * Validate and coerce a single raw row keyed by template `key`.
 * Returns a ParsedRow with `errors` populated for any per-row problems.
 */
export function parseRow(rowNumber: number, raw: Record<string, string>): ParsedRow {
  const errors: string[] = [];

  const contact_name = nullable(raw.contact_name) ?? "";
  if (!contact_name) errors.push("contact_name is required");

  const account_name = nullable(raw.account_name) ?? "";
  if (!account_name) errors.push("account_name is required");

  const broker_email = nullable(raw.broker_email)?.toLowerCase() ?? null;

  const last = nullable(raw.last_contact_date);
  let last_contact_date: string | null = null;
  if (last) {
    if (!DATE_RE.test(last)) {
      errors.push(`last_contact_date "${last}" is not in YYYY-MM-DD format`);
    } else {
      last_contact_date = last;
    }
  }

  const conf = parseBool(raw.is_confidential);
  if (conf.error) errors.push(conf.error);

  return {
    rowNumber,
    raw,
    errors,
    contact_name,
    account_name,
    broker_email,
    contact_phone: nullable(raw.contact_phone),
    contact_email: nullable(raw.contact_email),
    relationship_status: nullable(raw.relationship_status),
    listing: nullable(raw.listing),
    note: nullable(raw.note),
    tags: splitList(raw.tags),
    sectors: splitList(raw.sectors),
    last_contact_date,
    is_confidential: conf.value
  };
}
