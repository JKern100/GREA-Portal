import NetworkView from "@/components/network/NetworkView";
import { listContacts, listDeals, listOffices, requireProfile } from "@/lib/data";

export default async function NetworkPage() {
  const [profile, offices, contacts, deals] = await Promise.all([
    requireProfile(),
    listOffices(),
    listContacts(),
    listDeals()
  ]);
  return <NetworkView profile={profile} offices={offices} contacts={contacts} deals={deals} />;
}
