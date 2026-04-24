import MyOfficeOverview from "@/components/office-admin/MyOfficeOverview";
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

  return (
    <MyOfficeOverview
      office={office}
      members={(members as Profile[]) ?? []}
      currentUserId={profile.id}
    />
  );
}
