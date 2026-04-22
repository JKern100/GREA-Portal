import ContactsAdmin from "@/components/admin/ContactsAdmin";
import { listContacts, listOffices } from "@/lib/data";

export default async function AdminContactsPage() {
  const [contacts, offices] = await Promise.all([listContacts(), listOffices()]);
  return <ContactsAdmin contacts={contacts} offices={offices} />;
}
