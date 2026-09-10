import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { runImport, type ImportEntity, type ImportMode } from "@/lib/import/core";
import { loadShareContactDetails } from "@/lib/import/apiKeys";
import { applyMapping, MappingError, type SubmittedMapping } from "@/lib/import/applyMapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matching the manual upload and API

/**
 * Import Mapper — reshape an office's own export into our template and run it
 * through the shared import core.
 *
 * Phase A is superadmin-only (see docs/SPECS_IMPORT_MAPPER.md §1). The real
 * profile is checked, not the effective one, so a superadmin impersonating an
 * office admin cannot import through this route while impersonating.
 *
 * This route is deliberately thin: mapping semantics live in `applyMapping`,
 * and every validation rule lives in `runImport`. A mapped file is therefore
 * validated identically to a hand-prepared one.
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real || real.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload exceeds the 5 MB limit." }, { status: 413 });
  }

  let body: {
    entity?: string;
    officeId?: string;
    mode?: string;
    dryRun?: boolean;
    fileName?: string;
    mapping?: SubmittedMapping;
    rows?: string[][];
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  const entity = body.entity === "deals" ? "deals" : body.entity === "contacts" ? "contacts" : null;
  if (!entity) {
    return NextResponse.json({ ok: false, error: 'entity must be "contacts" or "deals".' }, { status: 400 });
  }
  const officeId = body.officeId?.trim();
  if (!officeId) {
    return NextResponse.json({ ok: false, error: "Choose an office." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length < 1) {
    return NextResponse.json({ ok: false, error: "No file data received." }, { status: 400 });
  }
  if (!body.mapping || typeof body.mapping !== "object") {
    return NextResponse.json({ ok: false, error: "No column mapping received." }, { status: 400 });
  }

  const mode: ImportMode = body.mode === "replace" ? "replace" : "add_on";
  const dryRun = body.dryRun !== false; // default to the safe path
  const fileName = (body.fileName ?? "mapped-import.csv").slice(0, 200);

  let mapped;
  try {
    mapped = applyMapping(body.rows, body.mapping, entity as ImportEntity);
  } catch (err) {
    const message = err instanceof MappingError ? err.message : `Could not apply the mapping: ${(err as Error).message}`;
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }

  const admin = createAdminClient();

  // How many records the office holds today, so the preview can state the
  // impact of a replace before anything is written.
  const { count: currentCount } = await admin
    .from(entity === "contacts" ? "contacts" : "deals")
    .select("id", { count: "exact", head: true })
    .eq("office_id", officeId);

  const result = await runImport({
    entity: entity as ImportEntity,
    officeId,
    actorId: real.id,
    actorName: real.name ?? "",
    rows: mapped.rows,
    mode,
    fileName: `${fileName} (via mapper)`,
    dryRun,
    source: "ui",
    shareContactDetails: await loadShareContactDetails()
  });

  if (result.ok && !dryRun) {
    revalidatePath(entity === "contacts" ? "/contacts" : "/pipeline");
    revalidatePath(entity === "contacts" ? "/my-office/contacts" : "/my-office/deals");
    revalidatePath("/network");
  }

  return NextResponse.json(
    {
      ok: result.ok,
      dryRun,
      mode,
      entity,
      received: result.received,
      inserted: result.inserted,
      deleted: result.deleted,
      skipped: result.skipped,
      skippedRows: result.skippedRows,
      warnings: result.warnings,
      ignoredHeaders: mapped.ignoredHeaders,
      currentCount: currentCount ?? 0,
      ...(result.strippedFields ? { strippedFields: result.strippedFields } : {}),
      ...(result.error ? { error: result.error } : {})
    },
    { status: result.status }
  );
}
