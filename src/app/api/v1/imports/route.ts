import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/import/apiKeys";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/imports
 *
 * Recent import runs for the key's office, so an office's own script can
 * answer "did last night's sync land, and how many rows?" without a person
 * logging in. Counts only — no contact or deal data is returned.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiKey(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.failure.error }, { status: auth.failure.status });
  }

  const admin = createAdminClient();
  const select = "created_at, mode, file_name, inserted_count, deleted_count, skipped_count";

  const [contacts, deals] = await Promise.all([
    admin
      .from("contact_imports")
      .select(select)
      .eq("office_id", auth.key.officeId)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("deal_imports")
      .select(select)
      .eq("office_id", auth.key.officeId)
      .order("created_at", { ascending: false })
      .limit(25)
  ]);

  // deal_imports may not exist yet on a database that hasn't had migration
  // 0016 applied. Report that plainly rather than failing the whole call.
  const warnings: string[] = [];
  if (contacts.error) warnings.push(`Could not read contact import history: ${contacts.error.message}`);
  if (deals.error) warnings.push(`Could not read deal import history: ${deals.error.message}`);

  const shape = (rows: Record<string, unknown>[] | null, entity: string) =>
    (rows ?? []).map((r) => ({
      entity,
      at: r.created_at,
      mode: r.mode,
      source: r.file_name,
      imported: r.inserted_count,
      deleted: r.deleted_count,
      skipped: r.skipped_count
    }));

  const runs = [...shape(contacts.data, "contacts"), ...shape(deals.data, "deals")].sort(
    (a, b) => String(b.at).localeCompare(String(a.at))
  );

  return NextResponse.json({
    ok: true,
    office: auth.key.officeCode,
    runs,
    ...(warnings.length ? { warnings } : {})
  });
}
