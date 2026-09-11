import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, getRealProfile } from "@/lib/data";
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
 * Who may call it (docs/SPECS_IMPORT_MAPPER.md §1, §11):
 *   - an office admin, for their own office only — the office comes from
 *     their profile and any officeId in the body is ignored. This mirrors the
 *     manual upload route, including that a superadmin impersonating an
 *     office admin acts as that admin.
 *   - a real (non-impersonating) superadmin, for any office they name.
 *
 * This route is deliberately thin: mapping semantics live in `applyMapping`,
 * and every validation rule lives in `runImport`. A mapped file is therefore
 * validated identically to a hand-prepared one.
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const isSuperadmin = profile.role === "superadmin";
  const isOfficeAdmin = profile.role === "office_admin" && !!profile.office_id;
  if (!isSuperadmin && !isOfficeAdmin) {
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
  // Office scoping is derived from who is calling, never trusted from the body
  // for an office admin.
  const officeId = isSuperadmin ? body.officeId?.trim() : profile.office_id ?? undefined;
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
    actorId: profile.id,
    actorName: profile.name ?? "",
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
