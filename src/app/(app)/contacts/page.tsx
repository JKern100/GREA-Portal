import ContactsView from "@/components/contacts/ContactsView";
import { listContacts, listOffices, listProfiles, requireProfile } from "@/lib/data";

export default async function ContactsPage() {
  const [profile, offices, contacts, profiles] = await Promise.all([
    requireProfile(),
    listOffices(),
    listContacts(),
    listProfiles()
  ]);

  // "Hide" toggle: hidden contacts never appear in the cross-office search.
  const visibleContacts = contacts.filter((c) => !c.is_confidential);

  return (
    <ContactsView
      profile={profile}
      offices={offices}
      initialContacts={visibleContacts}
      profiles={profiles}
    />
  );
}
