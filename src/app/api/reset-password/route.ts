import { NextResponse } from "next/server";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generate a password-recovery link for an existing user and return
 * the URL. Mirrors /api/invite-user — we deliberately use
 * `admin.auth.admin.generateLink({ type: 'recovery' })` rather than
 * `auth.resetPasswordForEmail()` so the critical path doesn't depend
 * on Supabase SMTP. The inviting admin gets the URL back and shares
 * it through whatever channel they actually use (Slack, email, etc.).
 *
 * Authorisation:
 *   - Superadmin: may reset any user's password.
 *   - Office admin: may reset only members of their own office.
 *
 * Body: { userId: string }
 * Returns: { ok, email, resetUrl }
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
    .select("id, email, office_id, is_active, is_protected")
    .eq("id", userId)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target || !target.email) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Protected (owner) accounts can't be password-reset by another admin —
  // otherwise a co-equal superadmin could issue a recovery link and seize
  // the account. The service-role client bypasses RLS, so guard here.
  if (target.is_protected && target.id !== real.id) {
    return NextResponse.json(
      { error: "This account is protected — only its owner can reset its password." },
      { status: 403 }
    );
  }
  // A deactivated account is bounced to /login on every request, so issuing a
  // reset link would just hand them a token that resets their password without
  // restoring access. Reactivate first.
  if (target.is_active === false) {
    return NextResponse.json(
      { error: "This account is deactivated. Reactivate it before issuing a reset link." },
      { status: 400 }
    );
  }

  // Office admins are scoped to members of their own office. Superadmins
  // can reset anyone, including other superadmins.
  if (real.role === "office_admin") {
    if (!real.office_id) {
      return NextResponse.json(
        { error: "You must be assigned to an office before resetting passwords." },
        { status: 400 }
      );
    }
    if (target.office_id !== real.office_id) {
      return NextResponse.json(
        { error: "You can only reset passwords for members of your own office." },
        { status: 403 }
      );
    }
  }

  // Land the recovery flow on /welcome — same page that handles invite
  // tokens. It consumes access/refresh tokens from the URL hash and
  // prompts the user to set a new password.
  const redirectTo = new URL("/welcome", request.url).toString();

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
    options: { redirectTo }
  });

  if (linkErr || !linkData) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Failed to create reset link." },
      { status: 400 }
    );
  }

  // If the user (or someone on their behalf) had asked for a reset via the
  // public /forgot-password flow, mark every open request resolved so the
  // pending badge clears across all admin surfaces.
  await admin
    .from("password_reset_requests")
    .update({ resolved_at: new Date().toISOString(), resolved_by: real.id })
    .eq("user_id", target.id)
    .is("resolved_at", null);

  // Click-to-verify link to our /welcome page (see invite-user for the
  // rationale): the token is only consumed when the user clicks, so email
  // link-scanners can't burn it on a GET.
  const props = linkData.properties;
  const welcome = new URL("/welcome", request.url);
  let resetUrl: string | null = props?.action_link ?? null;
  if (props?.hashed_token && props?.verification_type) {
    welcome.searchParams.set("token_hash", props.hashed_token);
    welcome.searchParams.set("type", props.verification_type);
    resetUrl = welcome.toString();
  }

  return NextResponse.json({
    ok: true,
    email: target.email,
    resetUrl
  });
}
