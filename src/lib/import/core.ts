/**
 * Shared import core — the single code path for bringing Contacts or Pipeline
 * data into an office, used by BOTH the manual upload routes and the v1 API.
 *
 * The point of the shared core (see docs/SPECS_IMPORT_API.md §1) is that a
 * file which imports through the UI imports identically through the API. If a
 * validation rule lives in one path and not the other, offices get different
 * answers depending on how they submitted the same file.
 *
 * Server-only: uses the service-role client to write.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import * as contactsSchema from "@/lib/contacts/import-schema";
import * as dealsSchema from "@/lib/deals/import-schema";

export type ImportEntity = "contacts" | "deals";
export type ImportMode = "replace" | "add_on";

export interface SkippedRow {
  row: number;
  errors: string[];
  preview: Record<string, string>;
}

export interface ImportCoreInput {
  entity: ImportEntity;
  officeId: string;
  /** Profile id credited with the import; null for a key with no linked user. */
  actorId: string | null;
  actorName: string;
  /** Raw sheet including the header row. */
  rows: string[][];
  mode: ImportMode;
  fileName: string;
  /** Validate and report without writing anything. */
  dryRun: boolean;
  source: "ui" | "api";
  /** When false, contact phone/email are blanked before insert. */
  shareContactDetails: boolean;
}

export interface ImportCoreResult {
  ok: boolean;
  /** HTTP status the caller should return. */
  status: number;
  error?: string;
  received: number;
  inserted: number;
  deleted: number;
  skipped: number;
  skippedRows: SkippedRow[];
  warnings: string[];
  strippedFields?: Record<string, number>;
}

const MAX_ROWS = 10_000;
const CHUNK = 500;

/**
 * The fields the core needs from either schema's `parseRow` output. Both
 * contacts and deals rows carry these; entity-specific columns are read via
 * the index signature and narrowed at the point of use.
 */
type AnyParsedRow = {
  rowNumber: number;
  errors: string[];
  broker_email: string | null;
  broker_name: string | null;
  [key: string]: unknown;
};

function fail(status: number, error: string, partial: Partial<ImportCoreResult> = {}): ImportCoreResult {
  return {
    ok: false,
    status,
    error,
    received: 0,
    inserted: 0,
    deleted: 0,
    skipped: 0,
    skippedRows: [],
    warnings: [],
    ...partial
  };
}

export async function runImport(input: ImportCoreInput): Promise<ImportCoreResult> {
  const {
    entity, officeId, actorId, actorName, rows, mode, fileName, dryRun, source, shareContactDetails
  } = input;

  const schema = entity === "contacts" ? contactsSchema : dealsSchema;

  if (rows.length < 1) return fail(400, "File is empty.");
  if (rows.length - 1 > MAX_ROWS) {
    return fail(
      413,
      `File has too many rows (${rows.length - 1}). The limit is ${MAX_ROWS.toLocaleString()} per import — split the file and upload in batches.`
    );
  }

  const { headerToKey, unknownHeaders, missingRequired } = schema.mapHeaders(rows[0]);
  if (missingRequired.length > 0) {
    return fail(422, `Missing required column(s): ${missingRequired.join(", ")}. Re-download the template if needed.`);
  }

  const warnings: string[] = [];
  if (unknownHeaders.length > 0) warnings.push(`Ignoring unknown column(s): ${unknownHeaders.join(", ")}`);

  // Parse + validate every data row. The two schemas return different row
  // shapes; this is the common surface the core relies on, with the
  // entity-specific fields read through the index signature below.
  const parsedRows: AnyParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const dataRow = rows[i];
    if (dataRow.every((c) => String(c ?? "").trim().length === 0)) continue;
    const raw: Record<string, string> = {};
    for (const [colIdx, key] of Object.entries(headerToKey)) raw[key] = dataRow[Number(colIdx)] ?? "";
    parsedRows.push(schema.parseRow(i, raw) as unknown as AnyParsedRow);
  }

  const admin = createAdminClient();

  // Resolve broker_email → a registered member of this office.
  const { data: officeBrokers, error: brokerErr } = await admin
    .from("profiles")
    .select("id, name, phone, email")
    .eq("office_id", officeId);
  if (brokerErr) return fail(500, `Could not load office members: ${brokerErr.message}`);

  const brokerByEmail = new Map<string, { id: string; name: string; phone: string | null }>();
  for (const b of officeBrokers ?? []) {
    if (b.email) {
      brokerByEmail.set(String(b.email).toLowerCase(), {
        id: String(b.id),
        name: String(b.name ?? ""),
        phone: (b.phone as string | null) ?? null
      });
    }
  }

  const validInserts: Array<Record<string, unknown>> = [];
  const skippedRows: SkippedRow[] = [];
  const unmatchedBrokerEmails = new Set<string>();
  const stripped: Record<string, number> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const row of parsedRows) {
    const errs = [...row.errors];

    const matched = row.broker_email ? brokerByEmail.get(row.broker_email) : undefined;
    if (!matched && row.broker_email) unmatchedBrokerEmails.add(row.broker_email);

    if (errs.length > 0) {
      skippedRows.push({
        row: row.rowNumber,
        errors: errs,
        preview:
          entity === "contacts"
            ? {
                contact_name: String(row.contact_name ?? ""),
                account_name: String(row.account_name ?? ""),
                broker_email: row.broker_email ?? ""
              }
            : {
                deal_name: String(row.deal_name ?? ""),
                stage: String(row.stage ?? ""),
                broker_email: row.broker_email ?? ""
              }
      });
      continue;
    }

    if (entity === "contacts") {
      // The sharing policy is enforced here, not at the edges, so the API and
      // the manual upload behave identically.
      let contactPhone = (row.contact_phone as string | null) ?? null;
      let contactEmail = (row.contact_email as string | null) ?? null;
      if (!shareContactDetails) {
        if (contactPhone) stripped.contact_phone = (stripped.contact_phone ?? 0) + 1;
        if (contactEmail) stripped.contact_email = (stripped.contact_email ?? 0) + 1;
        contactPhone = null;
        contactEmail = null;
      }
      validInserts.push({
        office_id: officeId,
        contact_name: row.contact_name,
        account_name: row.account_name,
        broker_id: matched?.id ?? null,
        broker_name_snapshot: matched ? matched.name : row.broker_name ?? "",
        broker_phone_snapshot: matched ? matched.phone ?? "" : (row.broker_phone as string | null) ?? "",
        contact_phone: contactPhone,
        contact_email: contactEmail,
        relationship_status: row.relationship_status,
        relationship_strength: row.relationship_strength,
        listing: row.listing,
        note: row.note,
        tags: row.tags,
        sectors: row.sectors,
        date_added: today,
        last_contact_date: row.last_contact_date,
        is_confidential: row.is_confidential,
        created_by: actorId
      });
    } else {
      validInserts.push({
        office_id: officeId,
        deal_name: row.deal_name,
        property_address: row.property_address,
        property_type: row.property_type,
        deal_value: row.deal_value,
        stage: row.stage,
        sub_status: row.sub_status,
        assigned_broker_id: matched?.id ?? null,
        assigned_broker_name: matched ? matched.name : row.broker_name ?? "",
        seller_name: row.seller_name,
        buyer_name: row.buyer_name,
        sectors: row.sectors,
        om_link: row.om_link,
        date_added: row.date_added,
        notes: row.notes,
        is_confidential: row.is_confidential,
        created_by: actorId
      });
    }
  }

  const noun = entity === "contacts" ? "contact" : "deal";

  if (unmatchedBrokerEmails.size > 0) {
    const list = Array.from(unmatchedBrokerEmails).slice(0, 5).join(", ");
    const more = unmatchedBrokerEmails.size > 5 ? `, +${unmatchedBrokerEmails.size - 5} more` : "";
    warnings.push(
      `${unmatchedBrokerEmails.size} broker email(s) aren't registered users yet (${list}${more}). Those ${noun}s were imported unassigned, showing the Broker Name from the file. Re-import after inviting the broker to link them.`
    );
  }
  if (stripped.contact_phone || stripped.contact_email) {
    const parts: string[] = [];
    if (stripped.contact_phone) parts.push(`${stripped.contact_phone} phone number(s)`);
    if (stripped.contact_email) parts.push(`${stripped.contact_email} email address(es)`);
    warnings.push(
      `Removed ${parts.join(" and ")} from contact records, per the current name-and-company-only sharing policy.`
    );
  }

  // An all-bad file must never wipe an office. Explicit deletion is available
  // via "Delete all" in My Office.
  if (mode === "replace" && validInserts.length === 0) {
    return fail(
      422,
      `Replace blocked: the upload contains no valid rows, so running it would wipe your existing ${noun}s and leave the table empty. Fix the file or use the Delete all action explicitly.`,
      { received: parsedRows.length, skipped: skippedRows.length, skippedRows, warnings }
    );
  }

  const base = {
    received: parsedRows.length,
    skipped: skippedRows.length,
    skippedRows,
    warnings,
    ...(Object.keys(stripped).length ? { strippedFields: stripped } : {})
  };

  if (dryRun) {
    return {
      ok: true,
      status: 200,
      inserted: 0,
      deleted: 0,
      ...base
    };
  }

  const table = entity === "contacts" ? "contacts" : "deals";

  let deleted = 0;
  if (mode === "replace") {
    const { count, error: countErr } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("office_id", officeId);
    if (countErr) return fail(500, `Could not count existing ${noun}s: ${countErr.message}`, base);
    deleted = count ?? 0;

    const { error: delErr } = await admin.from(table).delete().eq("office_id", officeId);
    if (delErr) return fail(500, `Could not delete existing ${noun}s: ${delErr.message}`, base);
  }

  let inserted = 0;
  for (let i = 0; i < validInserts.length; i += CHUNK) {
    const slice = validInserts.slice(i, i + CHUNK);
    const { data, error: insErr } = await admin.from(table).insert(slice).select("id");
    if (insErr) {
      return fail(500, `Insert failed at row chunk starting ${i + 1}: ${insErr.message}`, {
        ...base,
        inserted,
        deleted
      });
    }
    inserted += data?.length ?? 0;
  }

  // Audit. A failure here must not roll back a successful import — log only,
  // so a missing migration is visible to ops without breaking the user flow.
  const auditTable = entity === "contacts" ? "contact_imports" : "deal_imports";
  const { error: auditErr } = await admin.from(auditTable).insert({
    office_id: officeId,
    imported_by: actorId,
    imported_by_name: actorName,
    mode,
    file_name: source === "api" ? `${fileName || "api"} (API)` : fileName,
    inserted_count: inserted,
    deleted_count: deleted,
    skipped_count: skippedRows.length,
    skipped_rows: skippedRows
  });
  if (auditErr) console.error(`[import/${entity}] audit insert failed:`, auditErr.message);

  return { ok: true, status: 200, inserted, deleted, ...base };
}
