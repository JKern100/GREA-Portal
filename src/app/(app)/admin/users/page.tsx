import UsersAdmin from "@/components/admin/UsersAdmin";
import { listOffices, listProfiles } from "@/lib/data";

export default async function AdminUsersPage() {
  const [profiles, offices] = await Promise.all([listProfiles(), listOffices()]);
  return <UsersAdmin profiles={profiles} offices={offices} />;
}
