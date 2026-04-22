import DealsAdmin from "@/components/admin/DealsAdmin";
import { listDeals, listOffices } from "@/lib/data";

export default async function AdminDealsPage() {
  const [deals, offices] = await Promise.all([listDeals(), listOffices()]);
  return <DealsAdmin deals={deals} offices={offices} />;
}
