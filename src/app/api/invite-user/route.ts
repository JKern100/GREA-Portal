import { NextResponse } from "next/server";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

/**
 * Invite a user by email.
 *
 * - Superadmin: may invite any role to any office.
 * - Office admin: may invite brokers only, and only to their own office.
 *
 * Body: { email: string; name?: string; role?: UserRole; officeId?: string | null }
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

  const admin = createAdminClient();

  const redirectTo = new URL("/login", request.url).toString();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: body.name ? { name: body.name } : undefined,
    redirectTo
  });

  if (inviteErr || !invited?.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? "Failed to send invite." },
      { status: 400 }
    );
  }

  // The handle_new_user trigger created a profile row with default role=broker.
  // Apply the chosen role + office.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role, office_id: officeId, name: body.name?.trim() || undefined })
    .eq("id", invited.user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: invited.user.id, email: invited.user.email, role, office_id: officeId }
  });
}
