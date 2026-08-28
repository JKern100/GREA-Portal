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
 * Bulk import pipeline (deals) from the My Office upload dialog.
 *
 * Shares `@/lib/import/core` with the contacts route and the v1 API so all
 * three enforce exactly the same rules. See the contacts route for the
 * rationale on CSV-only uploads.
 */
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "office_admin") {
    return NextResponse.json(
      { ok: false, error: "Only office admins can import pipeline. Superadmins must impersonate an office admin to import." },
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
    entity: "deals",
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
    revalidatePath("/pipeline");
    revalidatePath("/my-office/deals");
    revalidatePath("/network");
  }

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
