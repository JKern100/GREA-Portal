import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public endpoint for "Forgot password?" on /login.
 *
 * Records a row in `password_reset_requests` so admins see a badge on
 * the matching user's row and can issue a reset link via the existing
 * /api/reset-password flow. We deliberately avoid Supabase SMTP — this
 * is the same admin-mediated pattern as the invite flow.
 *
 * Behaviour:
 *   - Always returns 200 OK regardless of whether the email matched a
 *     real account, so the response can't be used to enumerate which
 *     emails exist on the portal.
 *   - If the email matches, we resolve it to a user_id so the request
 *     shows up scoped to the right office for office admins.
 *   - If there's already an unresolved request for this email in the
 *     last hour, we no-op rather than stack duplicates. Hourly window
 *     is enough to absorb a confused user clicking twice without
 *     letting the table grow unbounded under spam.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!email || !email.includes("@")) {
    // Even for malformed input we return success — same reason as the
    // success-on-unknown-email rule. The form already validates client-side.
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_active")
    // ilike with no wildcards is case-insensitive equality. Supabase Auth
    // lowercases emails on insert, but profiles seeded outside the auth
    // flow (manual SQL, dashboard) might be mixed case — match defensively
    // so a forgot-password request doesn't silently miss.
    .ilike("email", email)
    .maybeSingle();

  // Don't accept requests for unknown or deactivated accounts. Both fail
  // silently to avoid leaking which emails exist or which are disabled.
  if (!profile || profile.is_active === false) {
    return NextResponse.json({ ok: true });
  }

  // De-duplicate: if there's already an unresolved request for this user
  // in the last hour, skip the insert. Multiple clicks from the same
  // forgetful user shouldn't litter the admin's view.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("password_reset_requests")
    .select("id")
    .eq("user_id", profile.id)
    .is("resolved_at", null)
    .gte("requested_at", oneHourAgo)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true });
  }

  await admin.from("password_reset_requests").insert({
    user_id: profile.id,
    email
  });

  return NextResponse.json({ ok: true });
}
