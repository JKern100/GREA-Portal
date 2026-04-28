import UsersAdmin from "@/components/admin/UsersAdmin";
import type { PendingResetMeta } from "@/components/admin/UsersTable";
import { getRealProfile, listOffices, listProfiles } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const [profiles, offices, realProfile] = await Promise.all([
    listProfiles(),
    listOffices(),
    getRealProfile()
  ]);

  // Pull auth-side metadata so we can show registration status next to
  // each row: has the user actually signed in, or are they still sitting
  // on an unused invite. Service-role admin client is required —
  // listUsers() is not available on the anon client.
  const admin = createAdminClient();
  const authMeta: Record<
    string,
    { last_sign_in_at: string | null; email_confirmed_at: string | null; invited_at: string | null }
  > = {};
  try {
    // Pagination: in the unlikely event of >1000 users, walk pages.
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data) break;
      for (const u of data.users) {
        authMeta[u.id] = {
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          invited_at: u.invited_at ?? null
        };
      }
      if (data.users.length < 1000) break;
      page++;
    }
  } catch {
    // Service role missing or auth.admin unavailable — surface empty meta
    // and the client renders "—" for status. The rest of the page works.
  }

  // Pending password-reset requests so the table can flag the affected
  // rows. RLS on password_reset_requests already restricts a non-super
  // user, but this page is /admin/* so the caller is always a superadmin.
  const supabase = createClient();
  const { data: prr } = await supabase
    .from("password_reset_requests")
    .select("user_id, requested_at")
    .is("resolved_at", null)
    .order("requested_at", { ascending: false });

  const pendingResets: Record<string, PendingResetMeta> = {};
  for (const r of (prr as Array<{ user_id: string | null; requested_at: string }> | null) ?? []) {
    if (!r.user_id) continue;
    // The query is ordered most-recent-first; only keep the first hit per user.
    if (!pendingResets[r.user_id]) pendingResets[r.user_id] = { requested_at: r.requested_at };
  }

  return (
    <UsersAdmin
      profiles={profiles}
      offices={offices}
      realProfileId={realProfile?.id ?? ""}
      authMeta={authMeta}
      pendingResets={pendingResets}
    />
  );
}
