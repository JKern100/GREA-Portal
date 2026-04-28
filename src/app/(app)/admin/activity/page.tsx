import AdminActivity from "@/components/admin/AdminActivity";
import { listProfiles } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { LoginEvent } from "@/lib/types";

export default async function AdminActivityPage() {
  const supabase = createClient();

  const [profiles, eventsRes] = await Promise.all([
    listProfiles(),
    supabase
      .from("login_events")
      .select("*")
      .order("signed_in_at", { ascending: false })
      .limit(2000)
  ]);

  const events = (eventsRes.data as LoginEvent[]) ?? [];

  return <AdminActivity events={events} profiles={profiles} />;
}
