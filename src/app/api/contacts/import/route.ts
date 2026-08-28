import { NextResponse } from "next/server";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data";
import { runImport, type ImportMode } from "@/lib/import/core";
import { loadShareContactDetails } from "@/lib/import/apiKeys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Bulk import contacts from the My Office upload dialog.
 *
 * Validation, the replace/insert behaviour and the audit trail all live in
 * `@/lib/import/core` so this route and the v1 API cannot drift apart — a file
 * that imports here imports identically through the API.
 *
 * CSV only: .xlsx uploads are rejected up front so we never feed an untrusted
 * spreadsheet to the SheetJS parser (see docs/PHASE1_AUDIT.md, H-3).
 *
 * Authorisation: effective profile must be office_admin (which covers a
 * superadmin impersonating one) AND must have an office_id.
 */
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "office_admin") {
    return NextResponse.json(
      { ok: false, error: "Only office admins can import contacts. Superadmins must impersonate an office admin to import." },
      { status: 403 }
    );
  }
  if (!profile.office_id) {
    return NextResponse.json({ ok: false, error: "You are not assigned to an office." }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const modeRaw = form.get("mode");
  const mode: ImportMode = modeRaw === "replace" ? "replace" : "add_on";

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, mode, error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, mode, error: "File exceeds 5 MB limit." }, { status: 400 });
  }
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        error:
          "Excel uploads aren't supported. Please upload a CSV file — use the Download CSV template button, or Save As → CSV from Excel."
      },
      { status: 400 }
    );
  }

  let rows: string[][];
  try {
    rows = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" }).data;
  } catch (err) {
    return NextResponse.json(
      { ok: false, mode, error: `Could not read file: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const result = await runImport({
    entity: "contacts",
    officeId: profile.office_id,
    actorId: profile.id,
    actorName: profile.name ?? "",
    rows,
    mode,
    fileName: file.name,
    dryRun: false,
    source: "ui",
    shareContactDetails: await loadShareContactDetails()
  });

  if (result.ok) {
    revalidatePath("/contacts");
    revalidatePath("/my-office/contacts");
    revalidatePath("/network");
  }

  // Response shape is unchanged from before the shared-core refactor so the
  // existing import modal keeps working without changes.
  return NextResponse.json(
    {
      ok: result.ok,
      mode,
      inserted: result.inserted,
      deleted: result.deleted,
      skipped: result.skipped,
      skippedRows: result.skippedRows,
      fileWarnings: result.warnings.length ? result.warnings : undefined,
      ...(result.error ? { error: result.error } : {})
    },
    { status: result.status }
  );
}
