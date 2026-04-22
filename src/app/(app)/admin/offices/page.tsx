import OfficesAdmin from "@/components/admin/OfficesAdmin";
import { listOffices } from "@/lib/data";

export default async function AdminOfficesPage() {
  const offices = await listOffices();
  return <OfficesAdmin offices={offices} />;
}
