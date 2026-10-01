import MyOfficeContacts from "@/components/office-admin/MyOfficeContacts";
import { createClient } from "@/lib/supabase/server";
import { requireOfficeAdminOrSuperadmin } from "@/lib/data";
import { fetchAll } from "@/lib/fetchAll";
import type { ContactRecord } from "@/lib/types";

export default async function MyOfficeContactsPage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  if (!profile.office_id) return null;

  const supabase = createClient();
  const officeId = profile.office_id;
  const { data } = await fetchAll<ContactRecord>((from, to) =>
    supabase
      .from("contacts")
      .select("*")
      .eq("office_id", officeId)
      .order("contact_name")
      .order("id")
      .range(from, to)
  );

  return <MyOfficeContacts contacts={data} officeId={officeId} />;
}
