import ContactsView from "@/components/contacts/ContactsView";
import { listContacts, listOffices, requireProfile } from "@/lib/data";

export default async function ContactsPage() {
  const [profile, offices, contacts] = await Promise.all([
    requireProfile(),
    listOffices(),
    listContacts()
  ]);

  return <ContactsView profile={profile} offices={offices} initialContacts={contacts} />;
}
