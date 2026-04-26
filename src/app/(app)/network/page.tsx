import NetworkView from "@/components/network/NetworkView";
import { listContacts, listDeals, listOffices, requireProfile } from "@/lib/data";
import { loadNetworkFreshness } from "@/lib/settings.server";

export default async function NetworkPage() {
  const [profile, offices, contacts, deals, freshness] = await Promise.all([
    requireProfile(),
    listOffices(),
    listContacts(),
    listDeals(),
    loadNetworkFreshness()
  ]);

  // Hidden records don't count toward cross-office Network stats.
  const visibleContacts = contacts.filter((c) => !c.is_confidential);
  const visibleDeals = deals.filter((d) => !d.is_confidential);

  return (
    <NetworkView
      profile={profile}
      offices={offices}
      contacts={visibleContacts}
      deals={visibleDeals}
      freshness={freshness}
    />
  );
}
