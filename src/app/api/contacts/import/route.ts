import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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

/**
 * Read file bytes into a 2D string array (header row + data rows), regardless
 * of whether the upload is CSV or XLSX. We work in strings throughout so date
 * / boolean parsing stays in `parseRow`.
 */
async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isXlsx) {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    if (!firstSheet) return [];
    const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: ""
    });
    return rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
  }

  // CSV / TSV — let Papa handle quoting / escaping.
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
  const today = new Date().toISOString().slice(0, 10);

  for (const r of parsedRows) {
    const errs = [...r.errors];
    let broker_id: string | null = null;
    let broker_name_snapshot = "";
    let broker_phone_snapshot = "";

    if (r.broker_email) {
      const broker = brokerByEmail.get(r.broker_email);
      if (!broker) {
        errs.push(`broker_email "${r.broker_email}" does not match any member of your office`);
      } else {
        broker_id = broker.id;
        broker_name_snapshot = broker.name;
        broker_phone_snapshot = broker.phone ?? "";
      }
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

  // Audit trail. Failure here should not roll back the import — log only.
  await admin.from("contact_imports").insert({
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
