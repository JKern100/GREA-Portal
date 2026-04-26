import { NextResponse } from "next/server";
import { getRealProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Delete a user. Hard removal — gone from auth.users and (via cascade)
 * from public.profiles. Their contacts/deals stay; the broker_id and
 * created_by FKs are `on delete set null`, so those rows just become
 * unassigned rather than disappearing.
 *
 * Guarded so it can't:
 *   - be called by anyone other than a superadmin
 *   - delete the caller themselves (use the active toggle for that)
 *   - delete the last remaining superadmin (would lock everyone out
 *     of /admin/*)
 *
 * Body: { userId: string }
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (real.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId?.trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (userId === real.id) {
    return NextResponse.json(
      { error: "You can't delete your own account. Use the Active toggle to disable it instead." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // If we're about to remove a superadmin, make sure at least one other
  // superadmin remains afterwards.
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, name, email")
    .eq("id", userId)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === "superadmin") {
    const { count, error: countErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "Can't delete the last superadmin — promote another user to superadmin first."
        },
        { status: 400 }
      );
    }
  }

  // Deletes the auth.users row. profiles.id has `on delete cascade` against
  // auth.users, so the profile row goes with it.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: { id: userId, name: target.name, email: target.email }
  });
}
