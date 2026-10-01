import OfficesAdmin from "@/components/admin/OfficesAdmin";
import { listOffices } from "@/lib/data";
import { fetchAll } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOfficesPage() {
  const supabase = createClient();
  // Paged: a plain select is capped at 1,000 rows, which would undercount
  // every office once the network holds more than that (see fetchAll.ts).
  const [offices, contactsRes, dealsRes] = await Promise.all([
    listOffices(),
    fetchAll<{ office_id: string | null }>((from, to) =>
      supabase.from("contacts").select("office_id").order("id", { ascending: true }).range(from, to)
    ),
    fetchAll<{ office_id: string | null }>((from, to) =>
      supabase.from("deals").select("office_id").order("id", { ascending: true }).range(from, to)
    )
  ]);

  // Count contacts and deals per office so the admin can see what's at
  // stake before deleting (and so we can disable Delete when the office
  // is non-empty).
  const contactCount: Record<string, number> = {};
  contactsRes.data.forEach((c) => {
    if (c.office_id) contactCount[c.office_id] = (contactCount[c.office_id] ?? 0) + 1;
  });
  const dealCount: Record<string, number> = {};
  dealsRes.data.forEach((d) => {
    if (d.office_id) dealCount[d.office_id] = (dealCount[d.office_id] ?? 0) + 1;
  });

  return (
    <OfficesAdmin offices={offices} contactCount={contactCount} dealCount={dealCount} />
  );
}
