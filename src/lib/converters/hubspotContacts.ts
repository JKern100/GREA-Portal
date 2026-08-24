/**
 * PHL HubSpot → GREA Portal contacts converter.
 *
 * Turns a raw HubSpot contact export into a file matching the portal's
 * contacts import template. Written from Philadelphia's actual exports
 * (Affordable + Student Housing, Aug 2026); see
 * `docs/OFFICE_DATA_ONBOARDING.md` for the wider context.
 *
 * Deliberately a pure function over strings: the same input always produces
 * the same output, it can be unit-tested, and the browser can run it without
 * the file ever leaving the admin's machine.
 *
 * Handles the quirks observed in the real exports:
 *   - "(No value)" placeholder text in every column
 *   - the "First Name Last Name" column being unreliable (some rows contain
 *     the literal text "Contact Name"), so names are always rebuilt from the
 *     First/Last columns
 *   - placeholder companies (N/A, none, ".") and emails typed into Company
 *   - mojibake from a bad encoding round-trip (Sothebyâ€™s)
 *   - contact phone/email withheld per the first-stage sharing guidelines
 */

import { TEMPLATE_HEADERS } from "@/lib/contacts/import-schema";
import { SECTOR_OPTIONS } from "@/lib/types";

export interface ConvertOptions {
  /** Contact owner name → portal login email. */
  brokerEmails: Record<string, string>;
  dropTestRecords: boolean;
  /** Drop rows where the contact IS the owner (someone filed themselves). */
  dropSelfRecords: boolean;
  dropDuplicates: boolean;
  /** Keep the HubSpot Code taxonomy in the Note column rather than losing it. */
  preserveCodesInNote: boolean;
}

export interface DroppedRow {
  row: number;
  name: string;
  reason: string;
}

export interface ConvertResult {
  csv: string;
  rows: string[][];
  sourceRows: number;
  outputRows: number;
  dropped: DroppedRow[];
  warnings: string[];
  /** Distinct "Contact owner" values found, for the broker-email mapping UI. */
  owners: string[];
}

const NO_VALUE = /^\(no value\)$/i;
/** Company values that mean "no company", not a real company name. */
const PLACEHOLDER_COMPANY = /^(n\/?a|none|na|not registed|nil|null|\.|-|—|_)$/i;
const TEST_RECORD = /^(fdsa|dsnb|dracos|asdf|qwerty|test|sjmsjkd)\b/i;
/**
 * Companies that indicate the contact is a GREA/Ariel colleague. These are
 * only ever *flagged for review*, never dropped: a colleague can legitimately
 * be a contact (a referral source, a co-broker), so deciding whether the
 * record belongs is the office's call, not this tool's.
 */
const INTERNAL_COMPANY = /^(grea|ariel property advisors)$/i;
const FALLBACK_COMPANY = "Individual";

/** Strip HubSpot's "(No value)" placeholder and normalise whitespace. */
function clean(v: string | undefined): string {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return NO_VALUE.test(s) ? "" : s;
}

/**
 * Repair the common UTF-8-read-as-Latin-1 sequences seen in these exports
 * (e.g. Sothebyâ€™s → Sotheby's). Only the sequences actually observed are
 * rewritten; anything else is left alone and reported instead of guessed at.
 */
function fixMojibake(s: string): string {
  return s
    .replace(/â€™/g, "’")
    .replace(/â€˜/g, "‘")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€"/g, "—")
    .replace(/â€"/g, "–");
}

/** Map HubSpot category codes onto the portal's fixed sector list. */
function sectorsFromCodes(codes: string[]): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    if (/student housing/i.test(code)) out.add("Student Housing");
    else if (/affordable|senior/i.test(code)) out.add("Affordable Housing");
  }
  if (out.size === 0) out.add("General");
  // Guard against drift if SECTOR_OPTIONS ever changes.
  return [...out].filter((s) => (SECTOR_OPTIONS as readonly string[]).includes(s));
}

/** Only unambiguous code→tag matches; the rest are preserved in the Note. */
function tagsFromCodes(codes: string[]): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    if (/lender/i.test(code)) out.add("Lender");
  }
  return [...out];
}

/** Default broker email from an owner name, matching the observed pattern. */
export function defaultBrokerEmail(ownerName: string): string {
  const parts = ownerName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";
  return `${parts[0]}.${parts[parts.length - 1]}@grea.com`;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/** Distinct Contact owner values, for building the email-mapping UI. */
export function extractOwners(csvText: string, parse: ParseFn): string[] {
  const { rows, index } = readSheet(csvText, parse);
  const col = index["contact owner"];
  if (col === undefined) return [];
  const seen = new Set<string>();
  for (const r of rows) {
    const v = clean(r[col]);
    if (v) seen.add(v);
  }
  return [...seen].sort();
}

type ParseFn = (text: string) => string[][];

interface Sheet {
  rows: string[][];
  index: Record<string, number>;
}

/** Header-name → column-index lookup, tolerant of case and stray spaces. */
function readSheet(csvText: string, parse: ParseFn): Sheet {
  const all = parse(csvText);
  if (all.length === 0) return { rows: [], index: {} };
  const header = all[0].map((h) => (h ?? "").trim().toLowerCase());
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h && !(h in index)) index[h] = i;
  });
  return { rows: all.slice(1), index };
}

export function convertHubspotContacts(
  csvText: string,
  opts: ConvertOptions,
  parse: ParseFn
): ConvertResult {
  const { rows, index } = readSheet(csvText, parse);
  const warnings: string[] = [];
  const dropped: DroppedRow[] = [];
  const owners = new Set<string>();

  const col = (name: string) => index[name];
  const get = (r: string[], name: string) => {
    const i = col(name);
    return i === undefined ? "" : clean(fixMojibake(r[i] ?? ""));
  };

  const required = ["first name", "last name", "contact owner"];
  const missing = required.filter((h) => col(h) === undefined);
  if (missing.length) {
    warnings.push(
      `This doesn't look like a HubSpot contact export — missing column(s): ${missing.join(", ")}.`
    );
    return { csv: "", rows: [], sourceRows: rows.length, outputRows: 0, dropped, warnings, owners: [] };
  }

  const internalStaff: string[] = [];
  let emailsInCompany = 0;
  let placeholderCompanies = 0;
  let mojibakeFixed = 0;
  let phonesDropped = 0;
  const seenKeys = new Set<string>();
  const out: string[][] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 2; // 1-based, +1 for the header row
    if (r.every((c) => !clean(c))) return; // wholly blank line

    // Names are always rebuilt from First/Last: the combined
    // "First Name Last Name" column is unreliable in these exports.
    const first = get(r, "first name");
    const last = get(r, "last name");
    const contactName = `${first} ${last}`.replace(/\s+/g, " ").trim();

    const owner = get(r, "contact owner");
    if (owner) owners.add(owner);

    if (!contactName) {
      dropped.push({ row: rowNum, name: "(blank)", reason: "No first or last name — Contact Name is required" });
      return;
    }
    if (opts.dropTestRecords && (TEST_RECORD.test(contactName) || /^first last$/i.test(contactName))) {
      dropped.push({ row: rowNum, name: contactName, reason: "Looks like a test record" });
      return;
    }

    // Company
    let company = get(r, "company name");
    if (/@/.test(company)) {
      emailsInCompany++;
      company = "";
    }
    if (company && PLACEHOLDER_COMPANY.test(company)) {
      placeholderCompanies++;
      company = "";
    }
    // A colleague listed as a contact is worth a look, but it is not
    // automatically wrong — flag it and let the office judge.
    if (company && INTERNAL_COMPANY.test(company)) {
      internalStaff.push(`${contactName} (${company})`);
    }
    if (!company) company = FALLBACK_COMPANY;

    // Someone filing themselves as their own contact is unambiguously a
    // stray record, and is caught on that basis rather than on employer.
    if (opts.dropSelfRecords && owner && contactName.toLowerCase() === owner.toLowerCase()) {
      dropped.push({ row: rowNum, name: contactName, reason: "Contact is the same person as the contact owner" });
      return;
    }

    if (opts.dropDuplicates) {
      const key = `${contactName.toLowerCase()}|${company.toLowerCase()}`;
      if (seenKeys.has(key)) {
        dropped.push({ row: rowNum, name: contactName, reason: "Duplicate of an earlier row" });
        return;
      }
      seenKeys.add(key);
    }

    const rawCodes = get(r, "code");
    const codes = rawCodes.split(";").map((c) => c.trim()).filter(Boolean);

    if (col("company name") !== undefined && /â€/.test(r[col("company name")] ?? "")) mojibakeFixed++;
    if (get(r, "phone number")) phonesDropped++;

    const brokerEmail = opts.brokerEmails[owner] ?? "";

    out.push([
      contactName,                                              // Contact Name
      company,                                                  // Account / Company
      brokerEmail,                                              // Broker Email
      owner,                                                    // Broker Name
      "",                                                       // Broker Phone
      "",                                                       // Phone  (withheld)
      "",                                                       // Email  (withheld)
      "",                                                       // Relationship Status
      "",                                                       // Relationship Strength
      get(r, "property listing"),                               // Listing
      opts.preserveCodesInNote && codes.length ? `HubSpot codes: ${codes.join("; ")}` : "",
      tagsFromCodes(codes).join("; "),                          // Tags
      sectorsFromCodes(codes).join("; "),                       // Sectors
      get(r, "last activity date"),                             // Last Contact Date
      "FALSE"                                                   // Confidential
    ]);
  });

  // Reporting — surface what was silently changed, never hide it.
  const unmapped = [...owners].filter((o) => !opts.brokerEmails[o]);
  if (unmapped.length) {
    warnings.push(
      `No portal email set for: ${unmapped.join(", ")}. Those rows will fail on import — Broker Email is required.`
    );
  }
  if (internalStaff.length) {
    warnings.push(
      `${internalStaff.length} contact(s) list a GREA/Ariel company and may be colleagues rather than clients — kept in, worth a look: ${internalStaff.join("; ")}.`
    );
  }
  if (placeholderCompanies) {
    warnings.push(`${placeholderCompanies} placeholder company value(s) (N/A, none, ".") replaced with "${FALLBACK_COMPANY}".`);
  }
  if (emailsInCompany) {
    warnings.push(`${emailsInCompany} row(s) had an email address in the Company field — replaced with "${FALLBACK_COMPANY}". Worth fixing in HubSpot.`);
  }
  const blankCompanies = out.filter((r) => r[1] === FALLBACK_COMPANY).length;
  if (blankCompanies) {
    warnings.push(`${blankCompanies} of ${out.length} contact(s) have no company in HubSpot and were set to "${FALLBACK_COMPANY}".`);
  }
  if (mojibakeFixed) warnings.push(`Repaired garbled characters in ${mojibakeFixed} company name(s).`);
  if (phonesDropped) {
    warnings.push(`${phonesDropped} contact phone number(s) were removed, per the current name-and-company-only sharing guidelines.`);
  }

  const csv = [TEMPLATE_HEADERS, ...out].map((r) => r.map(csvCell).join(",")).join("\n");

  return {
    csv,
    rows: out,
    sourceRows: rows.filter((r) => r.some((c) => clean(c))).length,
    outputRows: out.length,
    dropped,
    warnings,
    owners: [...owners].sort()
  };
}
