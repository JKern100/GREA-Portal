import OfficesAdmin from "@/components/admin/OfficesAdmin";
import { listOffices } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOfficesPage() {
  const supabase = createClient();
  const [offices, contactsRes, dealsRes] = await Promise.all([
    listOffices(),
    supabase.from("contacts").select("office_id"),
    supabase.from("deals").select("office_id")
  ]);

  // Count contacts and deals per office so the admin can see what's at
  // stake before deleting (and so we can disable Delete when the office
  // is non-empty).
  const contactCount: Record<string, number> = {};
  (contactsRes.data ?? []).forEach((c: { office_id: string | null }) => {
    if (c.office_id) contactCount[c.office_id] = (contactCount[c.office_id] ?? 0) + 1;
  });
  const dealCount: Record<string, number> = {};
  (dealsRes.data ?? []).forEach((d: { office_id: string | null }) => {
    if (d.office_id) dealCount[d.office_id] = (dealCount[d.office_id] ?? 0) + 1;
  });

  return (
    <OfficesAdmin offices={offices} contactCount={contactCount} dealCount={dealCount} />
  );
}
