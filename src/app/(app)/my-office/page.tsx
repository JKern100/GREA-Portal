import MyOfficeOverview from "@/components/office-admin/MyOfficeOverview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listOffices, requireOfficeAdminOrSuperadmin } from "@/lib/data";
import type { Office, Profile } from "@/lib/types";

export default async function MyOfficePage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  // Layout handles superadmin redirect + missing-office cases.
  if (!profile.office_id) return null;

  const offices = await listOffices();
  const office = offices.find((o) => o.id === profile.office_id) as Office;

  const supabase = createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("office_id", profile.office_id)
    .order("name");

  // Auth-side metadata so the table can show registration status next to
  // each row. Service-role only — listUsers() isn't on the anon client.
  const authMeta: Record<
    string,
    { last_sign_in_at: string | null; email_confirmed_at: string | null; invited_at: string | null }
  > = {};
  try {
    const admin = createAdminClient();
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
    // Service role unavailable — table renders without status pills.
  }

  return (
    <MyOfficeOverview
      office={office}
      members={(members as Profile[]) ?? []}
      currentUserId={profile.id}
      authMeta={authMeta}
    />
  );
}
