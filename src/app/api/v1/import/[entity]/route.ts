import { NextResponse } from "next/server";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { authenticateApiKey, loadShareContactDetails } from "@/lib/import/apiKeys";
import { runImport, type ImportEntity } from "@/lib/import/core";
import { rateLimit } from "@/lib/rateLimit";
import { TEMPLATE_COLUMNS as CONTACT_COLUMNS } from "@/lib/contacts/import-schema";
import { TEMPLATE_COLUMNS as DEAL_COLUMNS } from "@/lib/deals/import-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matching the manual upload

/**
 * POST /api/v1/import/contacts
 * POST /api/v1/import/deals
 *
 * Replace-per-sync: each call wholesale replaces the office's data for that
 * entity. There is deliberately no `mode` parameter — an append mode on an
 * automated schedule duplicates the dataset on every run, which is the exact
 * trap the manual-upload docs warn against. Offices needing add-on use the UI.
 *
 * Accepts `text/csv` (the same template as the manual upload, including its
 * header aliases) or `application/json` as `{ "rows": [ { … } ] }`.
 * `?dry_run=1` validates and reports without writing.
 *
 * See docs/SPECS_IMPORT_API.md.
 */
export async function POST(request: Request, { params }: { params: { entity: string } }) {
  const entityParam = params.entity;
  if (entityParam !== "contacts" && entityParam !== "deals") {
    return NextResponse.json(
      { ok: false, error: `Unknown entity "${entityParam}". Use /api/v1/import/contacts or /api/v1/import/deals.` },
      { status: 404 }
    );
  }
  const entity: ImportEntity = entityParam;

  const auth = await authenticateApiKey(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.failure.error }, { status: auth.failure.status });
  }
  const { officeId, officeCode, keyId, label } = auth.key;

  const dryRun = new URL(request.url).searchParams.get("dry_run") === "1";

  // Per-key limit. Dry-runs are cheap and encouraged, so they cost less.
  const cost = dryRun ? 1 : 5;
  for (let i = 0; i < cost; i++) {
    if (!rateLimit(`api-import:${keyId}`, 50, 60 * 60 * 1000)) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded for this API key. Imports are limited to roughly 10 per hour." },
        { status: 429 }
      );
    }
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const body = await request.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload exceeds the 5 MB limit." }, { status: 413 });
  }

  // Both formats are normalised to the same header+rows sheet, so they hit
  // byte-identical validation.
  let rows: string[][];
  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
    }
    const list = (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(list)) {
      return NextResponse.json(
        { ok: false, error: 'JSON body must be an object with a "rows" array, e.g. { "rows": [ { … } ] }.' },
        { status: 400 }
      );
    }
    const columns = entity === "contacts" ? CONTACT_COLUMNS : DEAL_COLUMNS;
    const keys = columns.map((c) => c.key);
    const header = columns.map((c) => c.header);
    rows = [
      header,
      ...list.map((item) => {
        const obj = (item ?? {}) as Record<string, unknown>;
        return keys.map((k) => {
          const v = obj[k];
          if (v === undefined || v === null) return "";
          if (Array.isArray(v)) return v.join("; ");
          if (typeof v === "boolean") return v ? "true" : "false";
          return String(v);
        });
      })
    ];
  } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    rows = Papa.parse<string[]>(body, { skipEmptyLines: "greedy" }).data;
  } else {
    return NextResponse.json(
      { ok: false, error: 'Unsupported Content-Type. Use "text/csv" or "application/json".' },
      { status: 415 }
    );
  }

  const result = await runImport({
    entity,
    officeId,
    // API imports aren't attributable to a person, only to a key. Leaving the
    // profile reference null keeps the audit honest rather than crediting
    // whoever happened to create the key.
    actorId: null,
    actorName: label ? `API key: ${label}` : "API key",
    rows,
    mode: "replace",
    fileName: label || "api",
    dryRun,
    source: "api",
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
      office: officeCode,
      entity,
      received: result.received,
      imported: result.inserted,
      deleted: result.deleted,
      skipped: result.skipped,
      skippedRows: result.skippedRows,
      warnings: result.warnings,
      ...(result.strippedFields ? { strippedFields: result.strippedFields } : {}),
      ...(result.error ? { error: result.error } : {})
    },
    { status: result.status }
  );
}
