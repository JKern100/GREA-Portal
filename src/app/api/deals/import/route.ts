import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHeaders, parseRow, type ParsedRow } from "@/lib/deals/import-schema";

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
 * Bulk import deals (Pipeline).
 *
 * Form fields:
 *   - file:  CSV or XLSX file matching the template.
 *   - mode:  "replace" | "add_on".
 *
 * Replace mode deletes ALL existing deals in the admin's office (including
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
        error: "Only office admins can import pipeline. Superadmins must impersonate an office admin to import."
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
    if (dataRow.every((c) => String(c ?? "").trim().length === 0)) continue;

    const raw: Record<string, string> = {};
    for (const [colIdx, key] of Object.entries(headerToKey)) {
      raw[key] = dataRow[Number(colIdx)] ?? "";
    }
    parsedRows.push(parseRow(i, raw));
  }

  // Resolve broker_email → assigned_broker_id for the admin's office. Unknown
  // emails become per-row errors; the deal is still skipped.
  const admin = createAdminClient();
  const { data: officeBrokers, error: brokerErr } = await admin
    .from("profiles")
    .select("id, name, email, role, is_active")
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

  const brokerByEmail = new Map<string, { id: string; name: string }>();
  for (const b of officeBrokers ?? []) {
    if (b.email) {
      brokerByEmail.set(String(b.email).toLowerCase(), {
        id: String(b.id),
        name: String(b.name ?? "")
      });
    }
  }

  const validInserts: Array<Record<string, unknown>> = [];
  const skippedRows: SkippedRow[] = [];

  for (const r of parsedRows) {
    const errs = [...r.errors];
    let assigned_broker_id: string | null = null;
    let assigned_broker_name = "";

    if (r.broker_email) {
      const broker = brokerByEmail.get(r.broker_email);
      if (!broker) {
        errs.push(`broker_email "${r.broker_email}" does not match any member of your office`);
      } else {
        assigned_broker_id = broker.id;
        assigned_broker_name = broker.name;
      }
    }

    if (errs.length > 0) {
      skippedRows.push({
        row: r.rowNumber,
        errors: errs,
        preview: {
          deal_name: r.deal_name,
          stage: r.stage,
          broker_email: r.broker_email ?? ""
        }
      });
      continue;
    }

    validInserts.push({
      office_id: profile.office_id,
      deal_name: r.deal_name,
      property_address: r.property_address,
      property_type: r.property_type,
      deal_value: r.deal_value,
      stage: r.stage,
      assigned_broker_id,
      assigned_broker_name,
      seller_name: r.seller_name,
      buyer_name: r.buyer_name,
      sectors: r.sectors,
      om_link: r.om_link,
      date_added: r.date_added,
      notes: r.notes,
      is_confidential: r.is_confidential,
      created_by: profile.id
    });
  }

  // Refuse replace when the upload yielded no valid rows. Otherwise an
  // all-bad file would wipe the existing deals and leave the office
  // empty. Admins who actually want to clear the table can use the
  // "Delete all" action on the pipeline page.
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
          "Replace blocked: the upload contains no valid rows, so running it would wipe your existing pipeline and leave the table empty. Fix the file or use the Delete all action explicitly."
      },
      { status: 400 }
    );
  }

  // Replace mode: delete all existing deals for this office (including
  // confidential per spec) before inserting the new set.
  let deleted = 0;
  if (mode === "replace") {
    const { count, error: countErr } = await admin
      .from("deals")
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
          error: `Could not count existing deals: ${countErr.message}`
        },
        { status: 500 }
      );
    }
    deleted = count ?? 0;

    const { error: delErr } = await admin
      .from("deals")
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
          error: `Could not delete existing deals: ${delErr.message}`
        },
        { status: 500 }
      );
    }
  }

  let inserted = 0;
  if (validInserts.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < validInserts.length; i += CHUNK) {
      const slice = validInserts.slice(i, i + CHUNK);
      const { data, error: insErr } = await admin.from("deals").insert(slice).select("id");
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
  const { error: auditErr } = await admin.from("deal_imports").insert({
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
    console.error("[deals/import] audit insert failed:", auditErr.message);
  }

  // Bust caches that depend on deals.
  revalidatePath("/pipeline");
  revalidatePath("/my-office/deals");
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
