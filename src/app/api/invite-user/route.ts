import { NextResponse } from "next/server";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

/**
 * Create an invitation for a user by email and return a shareable invite
 * link. We deliberately use admin.generateLink({ type: 'invite' }) instead
 * of inviteUserByEmail() so the critical path doesn't depend on whatever
 * SMTP state Supabase is in — the inviting admin gets the URL back and
 * shares it through whatever channel they actually use (Slack, email, etc.).
 *
 * Authorisation:
 *   - Superadmin: may invite any role to any office.
 *   - Office admin: may invite brokers only, locked to their own office.
 *
 * Body: { email: string; name?: string; role?: UserRole; officeId?: string | null }
 * Returns: { ok, user, inviteUrl }
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (real.role !== "superadmin" && real.role !== "office_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: UserRole;
    officeId?: string | null;
  };

  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const ALLOWED_ROLES: UserRole[] = ["broker", "office_admin", "superadmin"];
  if (body.role && !ALLOWED_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let role: UserRole;
  let officeId: string | null;

  if (real.role === "superadmin") {
    role = body.role ?? "broker";
    officeId = body.officeId ?? null;
  } else {
    // office_admin: locked to broker role + their own office
    if (!real.office_id) {
      return NextResponse.json(
        { error: "You must be assigned to an office before inviting users." },
        { status: 400 }
      );
    }
    role = "broker";
    officeId = real.office_id;
  }

  // Brokers and office_admins are scoped to a single office — without one,
  // their /contacts query is empty and /my-office redirects them away.
  // Superadmins legitimately have no office (they manage globally).
  if ((role === "broker" || role === "office_admin") && !officeId) {
    return NextResponse.json(
      { error: `Pick an office for the ${role.replace("_", " ")} you're inviting.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Land invitees on /welcome, not /login. /welcome accepts the auth
  // tokens from the Supabase verify redirect, prompts the new user to set
  // a password, and routes them into the app. /login is a sign-in form
  // expecting a password the new user doesn't have yet.
  const redirectTo = new URL("/welcome", request.url).toString();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo,
      data: body.name ? { name: body.name } : undefined
    }
  });

  if (linkErr || !linkData?.user) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Failed to create invite." },
      { status: 400 }
    );
  }

  // The handle_new_user trigger created a profile row with default role=broker.
  // Apply the chosen role + office.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role, office_id: officeId, name: body.name?.trim() || undefined })
    .eq("id", linkData.user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: linkData.user.id, email, role, office_id: officeId },
    inviteUrl: linkData.properties?.action_link ?? null
  });
}
