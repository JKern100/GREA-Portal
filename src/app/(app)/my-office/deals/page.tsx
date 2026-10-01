import MyOfficeDeals from "@/components/office-admin/MyOfficeDeals";
import { createClient } from "@/lib/supabase/server";
import { requireOfficeAdminOrSuperadmin } from "@/lib/data";
import { fetchAll } from "@/lib/fetchAll";
import type { DealRecord } from "@/lib/types";

export default async function MyOfficeDealsPage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  if (!profile.office_id) return null;

  const supabase = createClient();
  const officeId = profile.office_id;
  const { data } = await fetchAll<DealRecord>((from, to) =>
    supabase
      .from("deals")
      .select("*")
      .eq("office_id", officeId)
      .order("deal_name")
      .order("id")
      .range(from, to)
  );

  return <MyOfficeDeals deals={data} officeId={officeId} />;
}
