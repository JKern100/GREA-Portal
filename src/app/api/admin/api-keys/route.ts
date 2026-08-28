import { NextResponse } from "next/server";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey, hashApiKey, keySuffix } from "@/lib/import/apiKeys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Superadmin management of the per-office import API keys.
 *
 * Checks the REAL profile, not the effective one, so a superadmin who is
 * impersonating an office admin cannot mint keys while impersonating.
 */
async function requireSuperadmin() {
  const real = await getRealProfile();
  if (!real || real.role !== "superadmin") return null;
  return real;
}

/** List keys (never the key itself — only its non-secret suffix). */
export async function GET() {
  const real = await requireSuperadmin();
  if (!real) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, office_id, key_suffix, label, created_at, last_used_at, revoked_at, offices ( code, name )")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, keys: data ?? [] });
}

/**
 * Issue a key for an office. The plaintext is returned exactly once — only its
 * hash is stored, so it cannot be recovered later.
 */
export async function POST(request: Request) {
  const real = await requireSuperadmin();
  if (!real) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { officeId?: string; label?: string };
  const officeId = body.officeId?.trim();
  if (!officeId) return NextResponse.json({ error: "officeId is required." }, { status: 400 });

  const key = generateApiKey();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      office_id: officeId,
      key_hash: hashApiKey(key),
      key_suffix: keySuffix(key),
      label: body.label?.trim() || "",
      created_by: real.id
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id: data.id,
    // Shown once, never retrievable again.
    key
  });
}

/** Revoke a key. Rows are kept so the audit trail stays intact. */
export async function DELETE(request: Request) {
  const real = await requireSuperadmin();
  if (!real) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
