import { NextResponse } from "next/server";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHeaders, parseRow, type ParsedRow } from "@/lib/contacts/import-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImportMode = "replace" | "add_on";

interface SkippedRow {
  row: number;
  errors: string[];
  preview: Record<string, string>;
}

interface ImportResponse {
  ok: boolean;
  mode: ImportMode;
  inserted: number;
  deleted: number;
  skipped: number;
  skippedRows: SkippedRow[];
  fileWarnings?: string[];
  error?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 10_000; // data rows, excluding the header

/**
 * Read CSV file bytes into a 2D string array (header row + data rows). We work
 * in strings throughout so date / boolean parsing stays in `parseRow`.
 *
 * CSV only: .xlsx/.xls uploads are rejected up front by the route handler so
 * we never feed an untrusted spreadsheet to the SheetJS parser (see the
 * dependency note in docs/PHASE1_AUDIT.md).
 */
async function readSheet(file: File): Promise<string[][]> {
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return parsed.data;
}

/**
 * Bulk import contacts.
 *
 * Form fields:
 *   - file:  CSV or XLSX file matching the template.
 *   - mode:  "replace" | "add_on".
 *
 * Replace mode deletes ALL existing contacts in the admin's office (including
 * confidential ones) before inserting. Add-on mode appends only.
 *
 * Authorisation: effective profile must be office_admin (which covers
 * superadmins impersonating an office admin) AND must have an office_id.
 */
export async function POST(request: Request): Promise<NextResponse<ImportResponse>> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { ok: false, mode: "add_on", inserted: 0, deleted: 0, skipped: 0, skippedRows: [], error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (profile.role !== "office_admin") {
    return NextResponse.json(
      {
        ok: false,
        mode: "add_on",
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: "Only office admins can import contacts. Superadmins must impersonate an office admin to import."
      },
      { status: 403 }
    );
  }
  if (!profile.office_id) {
    return NextResponse.json(
      { ok: false, mode: "add_on", inserted: 0, deleted: 0, skipped: 0, skippedRows: [], error: "You are not assigned to an office." },
      { status: 400 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const modeRaw = form.get("mode");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, mode: "add_on", inserted: 0, deleted: 0, skipped: 0, skippedRows: [], error: "Missing file." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, mode: "add_on", inserted: 0, deleted: 0, skipped: 0, skippedRows: [], error: "File exceeds 5 MB limit." },
      { status: 400 }
    );
  }
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json(
      {
        ok: false,
        mode: "add_on",
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: "Excel uploads aren't supported. Please upload a CSV file — use the Download CSV template button, or Save As → CSV from Excel."
      },
      { status: 400 }
    );
  }
  const mode: ImportMode = modeRaw === "replace" ? "replace" : "add_on";

  let rows: string[][];
  try {
    rows = await readSheet(file);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: `Could not read file: ${(err as Error).message}`
      },
      { status: 400 }
    );
  }

  if (rows.length < 1) {
    return NextResponse.json(
      { ok: false, mode, inserted: 0, deleted: 0, skipped: 0, skippedRows: [], error: "File is empty." },
      { status: 400 }
    );
  }
  if (rows.length - 1 > MAX_ROWS) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: `File has too many rows (${rows.length - 1}). The limit is ${MAX_ROWS.toLocaleString()} per import — split the file and upload in batches.`
      },
      { status: 400 }
    );
  }

  const headerRow = rows[0];
  const { headerToKey, unknownHeaders, missingRequired } = mapHeaders(headerRow);

  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: `Missing required column(s): ${missingRequired.join(", ")}. Re-download the template if needed.`
      },
      { status: 400 }
    );
  }

  const fileWarnings: string[] = [];
  if (unknownHeaders.length > 0) {
    fileWarnings.push(`Ignoring unknown column(s): ${unknownHeaders.join(", ")}`);
  }

  // Parse data rows into ParsedRow objects.
  const parsedRows: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const dataRow = rows[i];
    // Skip wholly-empty rows (common with CSV trailing newline / xlsx blanks).
    if (dataRow.every((c) => String(c ?? "").trim().length === 0)) continue;

    const raw: Record<string, string> = {};
    for (const [colIdx, key] of Object.entries(headerToKey)) {
      raw[key] = dataRow[Number(colIdx)] ?? "";
    }
    parsedRows.push(parseRow(i, raw));
  }

  // Resolve broker_email → broker_id for the admin's office. Unknown emails
  // become per-row errors; the contact is still skipped (per "skip and report").
  const admin = createAdminClient();
  const { data: officeBrokers, error: brokerErr } = await admin
    .from("profiles")
    .select("id, name, phone, email, role, is_active")
    .eq("office_id", profile.office_id);

  if (brokerErr) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        inserted: 0,
        deleted: 0,
        skipped: 0,
        skippedRows: [],
        error: `Could not load office members: ${brokerErr.message}`
      },
      { status: 500 }
    );
  }

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
  // broker_email values that don't (yet) match a registered office member.
  // These rows still import (unassigned) — we surface an aggregate warning.
  const unmatchedBrokerEmails = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  for (const r of parsedRows) {
    const errs = [...r.errors];
    let broker_id: string | null = null;
    let broker_name_snapshot = "";
    let broker_phone_snapshot = "";

    const matchedBroker = r.broker_email ? brokerByEmail.get(r.broker_email) : undefined;
    if (matchedBroker) {
      // Email matched a registered office member — link to their account and
      // snapshot their current name/phone.
      broker_id = matchedBroker.id;
      broker_name_snapshot = matchedBroker.name;
      broker_phone_snapshot = matchedBroker.phone ?? "";
    } else {
      // No account (broker not invited yet, or no email given). Don't drop the
      // row — import it unassigned and display the broker name/phone from the
      // file so ownership still shows. It links automatically on a later import
      // once the broker is a registered user with that email.
      broker_name_snapshot = r.broker_name ?? "";
      broker_phone_snapshot = r.broker_phone ?? "";
      if (r.broker_email) unmatchedBrokerEmails.add(r.broker_email);
    }

    if (errs.length > 0) {
      skippedRows.push({
        row: r.rowNumber,
        errors: errs,
        preview: {
          contact_name: r.contact_name,
          account_name: r.account_name,
          broker_email: r.broker_email ?? ""
        }
      });
      continue;
    }

    validInserts.push({
      office_id: profile.office_id,
      contact_name: r.contact_name,
      account_name: r.account_name,
      broker_id,
      broker_name_snapshot,
      broker_phone_snapshot,
      contact_phone: r.contact_phone,
      contact_email: r.contact_email,
      relationship_status: r.relationship_status,
      relationship_strength: r.relationship_strength,
      listing: r.listing,
      note: r.note,
      tags: r.tags,
      sectors: r.sectors,
      date_added: today,
      last_contact_date: r.last_contact_date,
      is_confidential: r.is_confidential,
      created_by: profile.id
    });
  }

  if (unmatchedBrokerEmails.size > 0) {
    const list = Array.from(unmatchedBrokerEmails).slice(0, 5).join(", ");
    const more = unmatchedBrokerEmails.size > 5 ? `, +${unmatchedBrokerEmails.size - 5} more` : "";
    fileWarnings.push(
      `${unmatchedBrokerEmails.size} broker email(s) aren't registered users yet (${list}${more}). Those contacts were imported unassigned, showing the Broker Name from the file. Re-import after inviting the broker to link them.`
    );
  }

  // Refuse replace when the upload yielded no valid rows. Otherwise an
  // all-bad file would wipe the existing contacts and leave the office
  // empty. Admins who actually want to clear the table can use the
  // "Delete all" action on the contacts page.
  if (mode === "replace" && validInserts.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        inserted: 0,
        deleted: 0,
        skipped: skippedRows.length,
        skippedRows,
        error:
          "Replace blocked: the upload contains no valid rows, so running it would wipe your existing contacts and leave the table empty. Fix the file or use the Delete all action explicitly."
      },
      { status: 400 }
    );
  }

  // Replace mode: delete all existing contacts for this office (including
  // confidential per spec) before inserting the new set.
  let deleted = 0;
  if (mode === "replace") {
    const { count, error: countErr } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("office_id", profile.office_id);
    if (countErr) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          inserted: 0,
          deleted: 0,
          skipped: skippedRows.length,
          skippedRows,
          error: `Could not count existing contacts: ${countErr.message}`
        },
        { status: 500 }
      );
    }
    deleted = count ?? 0;

    const { error: delErr } = await admin
      .from("contacts")
      .delete()
      .eq("office_id", profile.office_id);
    if (delErr) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          inserted: 0,
          deleted: 0,
          skipped: skippedRows.length,
          skippedRows,
          error: `Could not delete existing contacts: ${delErr.message}`
        },
        { status: 500 }
      );
    }
  }

  let inserted = 0;
  if (validInserts.length > 0) {
    // Chunk inserts so very large uploads don't exceed Supabase's payload cap.
    const CHUNK = 500;
    for (let i = 0; i < validInserts.length; i += CHUNK) {
      const slice = validInserts.slice(i, i + CHUNK);
      const { data, error: insErr } = await admin.from("contacts").insert(slice).select("id");
      if (insErr) {
        return NextResponse.json(
          {
            ok: false,
            mode,
            inserted,
            deleted,
            skipped: skippedRows.length,
            skippedRows,
            error: `Insert failed at row chunk starting ${i + 1}: ${insErr.message}`
          },
          { status: 500 }
        );
      }
      inserted += data?.length ?? 0;
    }
  }

  // Audit trail. Failure here should not roll back the import — log only so
  // ops can spot a missing migration without breaking the user-visible flow.
  const { error: auditErr } = await admin.from("contact_imports").insert({
    office_id: profile.office_id,
    imported_by: profile.id,
    imported_by_name: profile.name ?? "",
    mode,
    file_name: file.name,
    inserted_count: inserted,
    deleted_count: deleted,
    skipped_count: skippedRows.length,
    skipped_rows: skippedRows
  });
  if (auditErr) {
    console.error("[contacts/import] audit insert failed:", auditErr.message);
  }

  // Bust caches that depend on contacts.
  revalidatePath("/contacts");
  revalidatePath("/my-office/contacts");
  revalidatePath("/network");

  return NextResponse.json({
    ok: true,
    mode,
    inserted,
    deleted,
    skipped: skippedRows.length,
    skippedRows,
    fileWarnings: fileWarnings.length ? fileWarnings : undefined
  });
}
