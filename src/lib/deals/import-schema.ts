/**
 * Shared definition of the Pipeline (Deals) import/export template.
 * Used by:
 *   - the template download route (`/api/deals/template`)
 *   - the upload parser & server action
 *   - the import modal preview
 *
 * Mirrors the structure of `contacts/import-schema.ts`. Office is implicit
 * (always the admin's own office) so it is not part of the template.
 */

import { DEAL_STAGES, type DealStage } from "@/lib/types";

export interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  hint: string;
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "deal_name", header: "Deal Name", required: true, hint: "Required. Short name for the deal." },
  { key: "property_address", header: "Address", required: false, hint: "Optional. Property address." },
  { key: "property_type", header: "Property Type", required: false, hint: "Optional. e.g. Multifamily, Mixed-Use." },
  { key: "deal_value", header: "Amount ($)", required: false, hint: "Optional. Numeric, e.g. 12500000 or 12,500,000." },
  { key: "stage", header: "Stage", required: true, hint: `Required. One of: ${DEAL_STAGES.join(", ")}.` },
  { key: "broker_email", header: "Broker Email", required: false, hint: "Optional. Email of the broker in your office to assign. Leave blank for unassigned." },
  { key: "seller_name", header: "Seller", required: false, hint: "Optional." },
  { key: "buyer_name", header: "Buyer", required: false, hint: "Optional." },
  { key: "sectors", header: "Sectors", required: false, hint: "Optional. Semicolon-separated, e.g. 'Multifamily; General'." },
  { key: "om_link", header: "OM Link", required: false, hint: "Optional. URL to the offering memorandum." },
  { key: "date_added", header: "Date Added", required: true, hint: "Required. YYYY-MM-DD." },
  { key: "notes", header: "Notes", required: false, hint: "Optional free-text notes." },
  { key: "is_confidential", header: "Confidential", required: false, hint: "Optional. true / false. Defaults to false." }
];

export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);

/** Sample row included in the downloaded template for reference. */
export const TEMPLATE_SAMPLE_ROW: string[] = [
  "125 W 72nd St Portfolio",
  "125 W 72nd St, New York, NY",
  "Multifamily",
  "12500000",
  "Listing",
  "broker@grea.com",
  "Goldberg Family Trust",
  "Chen Properties Group",
  "Multifamily",
  "https://drive.google.com/file/d/example-om/view",
  "2026-01-10",
  "Exclusive listing — 48-unit walkup, UWS",
  "false"
];

export interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  raw: Record<string, string>;
  errors: string[];
  deal_name: string;
  property_address: string;
  property_type: string | null;
  deal_value: number | null;
  stage: DealStage;
  broker_email: string | null;
  seller_name: string | null;
  buyer_name: string | null;
  sectors: string[];
  om_link: string | null;
  date_added: string;
  notes: string | null;
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

function parseAmount(v: unknown): { value: number | null; error?: string } {
  const s = nullable(v);
  if (!s) return { value: null };
  // Strip $ , and surrounding whitespace; allow plain integers / decimals.
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return { value: null };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { value: null, error: `Invalid amount "${s}" — use a non-negative number, e.g. 12500000.` };
  }
  return { value: n };
}

const STAGE_BY_LOWER: Record<string, DealStage> = (() => {
  const m: Record<string, DealStage> = {};
  for (const s of DEAL_STAGES) m[s.toLowerCase()] = s;
  return m;
})();

function parseStage(v: unknown): { value: DealStage; error?: string } {
  const s = nullable(v);
  if (!s) return { value: "Lead", error: "stage is required" };
  const matched = STAGE_BY_LOWER[s.toLowerCase()];
  if (!matched) {
    return { value: "Lead", error: `Invalid stage "${s}" — must be one of ${DEAL_STAGES.join(", ")}.` };
  }
  return { value: matched };
}

/**
 * Normalise a header string for matching ("Deal Name " → "deal_name").
 * Accepts both the human header ("Deal Name") and the underlying key
 * ("deal_name") so admins can rename headers slightly without breaking.
 *
 * Also tolerates the "Amount ($)" header by stripping non-alphanumerics.
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
  // Aliases for headers that appear with extra punctuation in the wild
  // (e.g. the "GREA Standard Data Format" CSV uses "Deal Name *").
  m[normaliseHeader("Deal Name *")] = "deal_name";
  m[normaliseHeader("Property Type *")] = "property_type";
  m[normaliseHeader("Stage *")] = "stage";
  m[normaliseHeader("Date Added *")] = "date_added";
  m[normaliseHeader("Amount")] = "deal_value";
  m[normaliseHeader("amount_$")] = "deal_value";
  m[normaliseHeader("Broker")] = "broker_email";
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

  const deal_name = nullable(raw.deal_name) ?? "";
  if (!deal_name) errors.push("deal_name is required");

  const stageRes = parseStage(raw.stage);
  if (stageRes.error) errors.push(stageRes.error);

  const date = nullable(raw.date_added);
  let date_added = "";
  if (!date) {
    errors.push("date_added is required");
  } else if (!DATE_RE.test(date)) {
    errors.push(`date_added "${date}" is not in YYYY-MM-DD format`);
  } else {
    date_added = date;
  }

  const amount = parseAmount(raw.deal_value);
  if (amount.error) errors.push(amount.error);

  const broker_email = nullable(raw.broker_email)?.toLowerCase() ?? null;

  const conf = parseBool(raw.is_confidential);
  if (conf.error) errors.push(conf.error);

  return {
    rowNumber,
    raw,
    errors,
    deal_name,
    property_address: nullable(raw.property_address) ?? "",
    property_type: nullable(raw.property_type),
    deal_value: amount.value,
    stage: stageRes.value,
    broker_email,
    seller_name: nullable(raw.seller_name),
    buyer_name: nullable(raw.buyer_name),
    sectors: splitList(raw.sectors),
    om_link: nullable(raw.om_link),
    date_added,
    notes: nullable(raw.notes),
    is_confidential: conf.value
  };
}
