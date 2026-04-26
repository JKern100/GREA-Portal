import MailingListView from "@/components/mailing-list/MailingListView";
import { listMailingListEntries, listOffices, requireSuperadmin } from "@/lib/data";

export default async function AdminMailingListPage() {
  const [profile, offices, entries] = await Promise.all([
    requireSuperadmin(),
    listOffices(),
    listMailingListEntries()
  ]);

  return (
    <MailingListView profile={profile} offices={offices} initialEntries={entries} manage />
  );
}
