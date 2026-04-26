import SettingsAdmin from "@/components/admin/SettingsAdmin";
import { loadNetworkFreshness } from "@/lib/settings.server";

export default async function AdminSettingsPage() {
  const freshness = await loadNetworkFreshness();
  return <SettingsAdmin initialFreshness={freshness} />;
}
