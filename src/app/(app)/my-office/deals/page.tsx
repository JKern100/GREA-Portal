import MyOfficeDeals from "@/components/office-admin/MyOfficeDeals";
import { createClient } from "@/lib/supabase/server";
import { requireOfficeAdminOrSuperadmin } from "@/lib/data";
import type { DealRecord } from "@/lib/types";

export default async function MyOfficeDealsPage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  if (!profile.office_id) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("office_id", profile.office_id)
    .order("deal_name");

  return <MyOfficeDeals deals={(data as DealRecord[]) ?? []} />;
}
