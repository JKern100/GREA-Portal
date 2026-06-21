import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Set a user's password directly and return a temporary password for the
 * admin to share out-of-band. This is the scanner-proof onboarding path:
 * corporate email link-scanners (SafeLinks/Mimecast) routinely open the
 * one-time invite/recovery links to scan them, consuming them before the
 * user can — so link-based onboarding can fail repeatedly. Setting a
 * password directly sidesteps links entirely.
 *
 * Authorisation mirrors /api/reset-password:
 *   - Superadmin: any user.
 *   - Office admin: members of their own office only.
 * Protected (owner) accounts can only be changed by themselves.
 *
 * Body: { userId: string }
 * Returns: { ok, email, password }
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (real.role !== "superadmin" && real.role !== "office_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId?.trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, email, office_id, is_protected")
    .eq("id", userId)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target || !target.email) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Protected (owner) accounts can't have their password set by another admin.
  if (target.is_protected && target.id !== real.id) {
    return NextResponse.json(
      { error: "This account is protected — only its owner can change its password." },
      { status: 403 }
    );
  }

  // Office admins are scoped to members of their own office.
  if (real.role === "office_admin") {
    if (!real.office_id) {
      return NextResponse.json(
        { error: "You must be assigned to an office before setting passwords." },
        { status: 400 }
      );
    }
    if (target.office_id !== real.office_id) {
      return NextResponse.json(
        { error: "You can only set passwords for members of your own office." },
        { status: 403 }
      );
    }
  }

  // Strong random temporary password. base64url avoids ambiguous characters
  // from breaking copy/paste; the trailing "Aa9" guarantees mixed case + a
  // digit in case a password policy is enabled on the project.
  const tempPassword = randomBytes(12).toString("base64url") + "Aa9";

  // email_confirm:true so the account is immediately usable even if the
  // project requires email confirmation (these accounts often never finished
  // the confirmation step).
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    email_confirm: true
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  // NOTE: we deliberately do NOT set onboarded_at here. An admin handing out
  // a temporary password isn't the user completing registration — they still
  // need to sign in and set their own password (via /account or /welcome),
  // which is what stamps onboarded_at. So the badge stays "Pending" until the
  // user actually takes ownership. We do clear any open reset requests.
  await admin
    .from("password_reset_requests")
    .update({ resolved_at: new Date().toISOString(), resolved_by: real.id })
    .eq("user_id", userId)
    .is("resolved_at", null);

  return NextResponse.json({ ok: true, email: target.email, password: tempPassword });
}
