import ContactsView from "@/components/contacts/ContactsView";
import { listContacts, listOffices, requireProfile } from "@/lib/data";

export default async function ContactsPage() {
  const [profile, offices, contacts] = await Promise.all([
    requireProfile(),
    listOffices(),
    listContacts()
  ]);

  // "Hide" toggle: hidden contacts never appear in the cross-office search.
  const visibleContacts = contacts.filter((c) => !c.is_confidential);

  return <ContactsView profile={profile} offices={offices} initialContacts={visibleContacts} />;
}
