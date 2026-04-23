import UsersAdmin from "@/components/admin/UsersAdmin";
import { getRealProfile, listOffices, listProfiles } from "@/lib/data";

export default async function AdminUsersPage() {
  const [profiles, offices, realProfile] = await Promise.all([
    listProfiles(),
    listOffices(),
    getRealProfile()
  ]);
  return <UsersAdmin profiles={profiles} offices={offices} realProfileId={realProfile?.id ?? ""} />;
}
