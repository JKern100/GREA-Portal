import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHeaders, parseRow, type ParsedRow } from "@/lib/mailingList/import-schema";

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

const MAX_BYTES = 5 * 1024 * 1024;

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

  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return parsed.data;
}

function err(
  status: number,
  body: Partial<ImportResponse> & { error: string; mode: ImportMode }
): NextResponse<ImportResponse> {
  return NextResponse.json(
    {
      ok: false,
      inserted: 0,
      deleted: 0,
      skipped: 0,
      skippedRows: [],
      ...body
    },
    { status }
  );
}

/**
 * Bulk import mailing-list entries.
 *
 * Form fields:
 *   - file:  CSV or XLSX file matching the template.
 *   - mode:  "replace" | "add_on".
 *
 * Superadmin only. Office admins are not permitted to upload — mailing
 * list management lives entirely under the Super Admin section.
 *
 * The superadmin can:
 *   - Target a specific office (target_office_id=<uuid>) or "global"
 *     (target_office_id=global → source_office_id stamped null on inserts).
 *   - Use the nuclear `replace_all` flag to wipe EVERY entry across all
 *     offices before inserting. Honoured only when mode=replace.
 *
 * Add-on mode appends. New rows get `target_office_id` stamped on
 * `source_office_id` (or null for global).
 */
export async function POST(request: Request): Promise<NextResponse<ImportResponse>> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return err(401, { mode: "add_on", error: "Unauthorized" });

    if (profile.role !== "superadmin") {
      return err(403, {
        mode: "add_on",
        error: "Only superadmins can import the mailing list."
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    const modeRaw = form.get("mode");
    const targetRaw = form.get("target_office_id");
    const replaceAllRaw = form.get("replace_all");

    if (!(file instanceof File)) return err(400, { mode: "add_on", error: "Missing file." });
    if (file.size > MAX_BYTES) return err(400, { mode: "add_on", error: "File exceeds 5 MB limit." });
    const mode: ImportMode = modeRaw === "replace" ? "replace" : "add_on";

    // Resolve where new rows get tagged and what the "replace" scope means.
    let targetOfficeId: string | null;
    if (typeof targetRaw === "string" && targetRaw.length > 0 && targetRaw !== "global") {
      targetOfficeId = targetRaw;
    } else {
      targetOfficeId = null; // "global" or omitted
    }
    const replaceAll = replaceAllRaw === "true" && mode === "replace";

    let rows: string[][];
    try {
      rows = await readSheet(file);
    } catch (e) {
      return err(400, { mode, error: `Could not read file: ${(e as Error).message}` });
    }

    if (rows.length < 1) return err(400, { mode, error: "File is empty." });

    const headerRow = rows[0];
    const { headerToKey, unknownHeaders, missingRequired } = mapHeaders(headerRow);

    if (missingRequired.length > 0) {
      return err(400, {
        mode,
        error: `Missing required column(s): ${missingRequired.join(", ")}. Re-download the template if needed.`
      });
    }

    const fileWarnings: string[] = [];
    if (unknownHeaders.length > 0) {
      fileWarnings.push(`Ignoring unknown column(s): ${unknownHeaders.join(", ")}`);
    }

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

    const validInserts: Array<Record<string, unknown>> = [];
    const skippedRows: SkippedRow[] = [];

    // De-duplicate by email within the file itself — a re-uploaded export
    // can otherwise create N copies of the same person.
    const seenEmails = new Set<string>();

    for (const r of parsedRows) {
      const errs = [...r.errors];

      if (errs.length === 0 && seenEmails.has(r.email)) {
        errs.push(`duplicate email "${r.email}" earlier in the file`);
      }

      if (errs.length > 0) {
        skippedRows.push({
          row: r.rowNumber,
          errors: errs,
          preview: { full_name: r.full_name, email: r.email, company_name: r.company_name }
        });
        continue;
      }

      seenEmails.add(r.email);
      validInserts.push({
        name: r.full_name,
        email: r.email,
        organization: r.company_name,
        title: r.title,
        phone: r.phone,
        opted_out: r.opted_out,
        last_registration_date: r.last_registration_date,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        country: r.country,
        sectors: r.sectors,
        tags: r.tags,
        notes: r.notes,
        source_office_id: targetOfficeId,
        created_by: profile.id
      });
    }

    const admin = createAdminClient();

    let deleted = 0;
    if (mode === "replace") {
      const countQuery = admin
        .from("mailing_list_entries")
        .select("id", { count: "exact", head: true });
      const scopedCount = replaceAll
        ? countQuery
        : targetOfficeId === null
          ? countQuery.is("source_office_id", null)
          : countQuery.eq("source_office_id", targetOfficeId);

      const { count, error: countErr } = await scopedCount;
      if (countErr) {
        return err(500, {
          mode,
          skipped: skippedRows.length,
          skippedRows,
          error: `Could not count existing entries: ${countErr.message}`
        });
      }
      deleted = count ?? 0;

      // Supabase delete() requires a filter. Use `id is not null` as a
      // catch-all for the wipe-everything case so we don't trip the safety
      // guard against unbounded deletes.
      const delBase = admin.from("mailing_list_entries").delete();
      const scopedDel = replaceAll
        ? delBase.not("id", "is", null)
        : targetOfficeId === null
          ? delBase.is("source_office_id", null)
          : delBase.eq("source_office_id", targetOfficeId);

      const { error: delErr } = await scopedDel;
      if (delErr) {
        return err(500, {
          mode,
          skipped: skippedRows.length,
          skippedRows,
          error: `Could not delete existing entries: ${delErr.message}`
        });
      }
    }

    let inserted = 0;
    if (validInserts.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < validInserts.length; i += CHUNK) {
        const slice = validInserts.slice(i, i + CHUNK);
        const { data, error: insErr } = await admin
          .from("mailing_list_entries")
          .insert(slice)
          .select("id");
        if (insErr) {
          return err(500, {
            mode,
            inserted,
            deleted,
            skipped: skippedRows.length,
            skippedRows,
            error: `Insert failed at chunk starting row ${i + 1}: ${insErr.message}`
          });
        }
        inserted += data?.length ?? 0;
      }
    }

    const { error: auditErr } = await admin.from("mailing_list_imports").insert({
      source_office_id: targetOfficeId,
      imported_by: profile.id,
      imported_by_name: profile.name ?? "",
      mode: replaceAll ? "replace" : mode,
      file_name: file.name + (replaceAll ? " [REPLACE_ALL]" : ""),
      inserted_count: inserted,
      deleted_count: deleted,
      skipped_count: skippedRows.length,
      skipped_rows: skippedRows
    });
    if (auditErr) {
      console.error("[mailing-list/import] audit insert failed:", auditErr.message);
    }

    revalidatePath("/mailing-list");

    return NextResponse.json({
      ok: true,
      mode,
      inserted,
      deleted,
      skipped: skippedRows.length,
      skippedRows,
      fileWarnings: fileWarnings.length ? fileWarnings : undefined
    });
  } catch (e) {
    const ex = e as Error;
    console.error("[mailing-list/import] unhandled:", ex?.stack || ex);
    return err(500, { mode: "add_on", error: `Import failed: ${ex?.message || "unknown error"}` });
  }
}
