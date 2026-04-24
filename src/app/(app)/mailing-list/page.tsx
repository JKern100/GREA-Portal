import MailingListView from "@/components/mailing-list/MailingListView";
import { listMailingListEntries, listOffices, requireProfile } from "@/lib/data";

export default async function MailingListPage() {
  const [profile, offices, entries] = await Promise.all([
    requireProfile(),
    listOffices(),
    listMailingListEntries()
  ]);

  return <MailingListView profile={profile} offices={offices} initialEntries={entries} />;
}
