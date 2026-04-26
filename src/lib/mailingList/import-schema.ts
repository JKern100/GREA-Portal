/**
 * Shared definition of the Mailing List import/export template.
 * Used by:
 *   - the template download route (`/api/mailing-list/template`)
 *   - the upload parser & server action
 *   - the import modal preview
 */

import { guessCountry, normaliseUsState } from "./states";

export interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  hint: string;
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "full_name", header: "Full Name", required: true, hint: "Required. 'Last, First' or 'First Last' both work." },
  { key: "company_name", header: "Company Name", required: true, hint: "Required. Organisation the contact represents." },
  { key: "email", header: "Email Address", required: true, hint: "Required. mailto: prefixes and markdown wrappers are stripped." },
  { key: "title", header: "Title", required: false, hint: "Optional." },
  { key: "phone", header: "Phone", required: false, hint: "Optional." },
  { key: "opted_out", header: "Opted-Out", required: false, hint: "Optional. Yes/No or true/false. Defaults to No." },
  {
    key: "last_registration_date",
    header: "Last Registration Date",
    required: false,
    hint: "Optional. YYYY-MM-DD or M/D/YYYY HH:MM."
  },
  { key: "address", header: "Work Address", required: false, hint: "Optional. Multi-line is OK; quote the cell if it contains commas." },
  { key: "city", header: "Work City", required: false, hint: "Optional." },
  { key: "state", header: "Work State", required: false, hint: "Optional. Full name or 2-letter code; non-US values are kept verbatim." },
  { key: "zip", header: "Work ZIP", required: false, hint: "Optional. 5-digit, ZIP+4, or non-US postal code." },
  { key: "country", header: "Country", required: false, hint: "Optional. Defaults to US (CA inferred from province / postal code)." },
  { key: "sectors", header: "Sectors", required: false, hint: "Optional. Semicolon-separated, e.g. 'Multifamily; General'." },
  { key: "tags", header: "Tags", required: false, hint: "Optional. Semicolon-separated." },
  { key: "notes", header: "Notes", required: false, hint: "Optional free-text note." }
];

export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);

export const TEMPLATE_SAMPLE_ROW: string[] = [
  "Doe, Jane",
  "Acme Industrial",
  "jane@acme.com",
  "President",
  "(212) 555-0100",
  "No",
  "2025-11-01",
  "100 Main Street\nSuite 350",
  "New York",
  "NY",
  "10001",
  "US",
  "Multifamily; General",
  "Client; Active",
  "Met at conference"
];

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  full_name: string;
  company_name: string;
  email: string;
  title: string | null;
  phone: string | null;
  opted_out: boolean;
  last_registration_date: string | null; // ISO 8601 timestamp
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  sectors: string[];
  tags: string[];
  notes: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (["true", "yes", "y", "1", "opted out", "opted-out"].includes(lower)) return { value: true };
  if (["false", "no", "n", "0", ""].includes(lower)) return { value: false };
  return { value: false, error: `Invalid yes/no value "${s}"` };
}

/**
 * Strip mailto: prefixes and markdown link wrappers, then lowercase. Handles
 * the common shapes seen in the wild:
 *   "[a@b.com](mailto:a@b.com)" → "a@b.com"
 *   "mailto:a@b.com"            → "a@b.com"
 *   "  A@B.COM "                → "a@b.com"
 */
export function cleanEmail(raw: unknown): string | null {
  const s = nullable(raw);
  if (!s) return null;
  // Pull out anything after the LAST "mailto:" — that handles both bare
  // "mailto:a@b.com" and "[…](mailto:a@b.com)" without a separate regex.
  let v = s;
  const i = v.toLowerCase().lastIndexOf("mailto:");
  if (i >= 0) v = v.slice(i + "mailto:".length);
  // Strip trailing markdown bracket / paren if we got the wrapper form.
  v = v.replace(/[)\]>\s]+$/g, "").replace(/^[<\s]+/, "");
  return v.trim().toLowerCase();
}

/**
 * Accept YYYY-MM-DD, ISO timestamps, and the M/D/YYYY [H:MM] shape Excel
 * commonly emits. Returns ISO string or null.
 */
function parseDate(raw: unknown): { value: string | null; error?: string } {
  const s = nullable(raw);
  if (!s) return { value: null };

  // YYYY-MM-DD or full ISO — Date can parse these directly.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { value: d.toISOString() };
  }

  // M/D/YYYY [H:MM[:SS]] — common Excel format.
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const [, mo, da, yr, hh, mm, ss] = m;
    const d = new Date(
      Date.UTC(
        Number(yr),
        Number(mo) - 1,
        Number(da),
        hh ? Number(hh) : 0,
        mm ? Number(mm) : 0,
        ss ? Number(ss) : 0
      )
    );
    if (!isNaN(d.getTime())) return { value: d.toISOString() };
  }

  return { value: null, error: `Could not parse date "${s}"` };
}

/**
 * Detect "City, ST" or "City, State Name" and split. Returns the cleaned
 * city plus an extracted state (if any). Leaves both alone if no comma
 * pattern matches.
 */
function splitCityState(rawCity: string | null): { city: string | null; extractedState: string | null } {
  if (!rawCity) return { city: null, extractedState: null };
  const m = /^(.*?),\s*([A-Za-z .]{2,})\s*(?:\d{5}(?:-\d{4})?)?$/.exec(rawCity.trim());
  if (!m) return { city: rawCity, extractedState: null };
  return { city: m[1].trim(), extractedState: m[2].trim() };
}

const ZIP_US_RE = /^\d{5}(-\d{4})?$/;
const ZIP_CA_RE = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;

function normaliseZip(raw: string | null, country: string): { zip: string | null; error?: string } {
  if (!raw) return { zip: null };
  const s = raw.trim();
  if (country === "US") {
    // Pad obvious 4-digit Northeast values that lost a leading zero in Excel.
    if (/^\d{4}$/.test(s)) return { zip: "0" + s };
    if (ZIP_US_RE.test(s)) return { zip: s };
    return { zip: s, error: `ZIP "${s}" is not in 5-digit or ZIP+4 format` };
  }
  if (country === "CA") {
    if (ZIP_CA_RE.test(s)) return { zip: s.toUpperCase() };
    return { zip: s, error: `Postal code "${s}" doesn't match Canadian format` };
  }
  return { zip: s }; // unknown country — accept whatever
}

export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const HEADER_TO_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of TEMPLATE_COLUMNS) {
    m[normaliseHeader(c.header)] = c.key;
    m[normaliseHeader(c.key)] = c.key;
  }
  // Tolerate common alternate header spellings seen in the source data.
  m["organization"] = "company_name";
  m["company"] = "company_name";
  m["full_name"] = "full_name";
  m["work_zip"] = "zip";
  m["work_state"] = "state";
  m["work_city"] = "city";
  m["work_address"] = "address";
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

export function parseRow(rowNumber: number, raw: Record<string, string>): ParsedRow {
  const errors: string[] = [];

  const full_name = nullable(raw.full_name) ?? "";
  if (!full_name) errors.push("full_name is required");

  const company_name = nullable(raw.company_name) ?? "";
  if (!company_name) errors.push("company_name is required");

  const email = cleanEmail(raw.email) ?? "";
  if (!email) {
    errors.push("email is required");
  } else if (!EMAIL_RE.test(email)) {
    errors.push(`email "${email}" is not a valid address`);
  }

  const opt = parseBool(raw.opted_out);
  if (opt.error) errors.push(opt.error);

  const dt = parseDate(raw.last_registration_date);
  if (dt.error) errors.push(dt.error);

  // City field may carry an embedded state ("Dallas, Texas") — split it out
  // but prefer an explicitly-provided state column if both are present.
  const cityRaw = nullable(raw.city);
  const stateRaw = nullable(raw.state);
  const { city: cityClean, extractedState } = splitCityState(cityRaw);
  const stateInput = stateRaw ?? extractedState;

  // Country: explicit value first, otherwise infer from state / zip below.
  const explicitCountry = nullable(raw.country);
  const zipInput = nullable(raw.zip);

  let country = explicitCountry ? explicitCountry.toUpperCase() : guessCountry(stateInput, zipInput);
  if (country === "USA") country = "US";
  if (country === "CAN" || country === "CANADA") country = "CA";

  let stateOut: string | null = stateInput;
  if (country === "US") {
    const norm = normaliseUsState(stateInput);
    if (stateInput && !norm) {
      errors.push(`state "${stateInput}" is not a recognised US state`);
    }
    stateOut = norm ?? stateInput;
  }

  const z = normaliseZip(zipInput, country);
  if (z.error) errors.push(z.error);

  return {
    rowNumber,
    raw,
    errors,
    full_name,
    company_name,
    email,
    title: nullable(raw.title),
    phone: nullable(raw.phone),
    opted_out: opt.value,
    last_registration_date: dt.value,
    address: nullable(raw.address),
    city: cityClean,
    state: stateOut,
    zip: z.zip,
    country,
    sectors: splitList(raw.sectors),
    tags: splitList(raw.tags),
    notes: nullable(raw.notes)
  };
}
