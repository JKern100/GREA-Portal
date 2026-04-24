import MyOfficeContacts from "@/components/office-admin/MyOfficeContacts";
import { createClient } from "@/lib/supabase/server";
import { requireOfficeAdminOrSuperadmin } from "@/lib/data";
import type { ContactRecord } from "@/lib/types";

export default async function MyOfficeContactsPage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  if (!profile.office_id) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("office_id", profile.office_id)
    .order("contact_name");

  return <MyOfficeContacts contacts={(data as ContactRecord[]) ?? []} />;
}
