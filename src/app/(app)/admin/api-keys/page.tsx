import ApiKeysAdmin from "@/components/admin/ApiKeysAdmin";
import { listOffices } from "@/lib/data";

/**
 * Superadmin-only via the /admin layout's requireSuperadmin() guard.
 * See docs/SPECS_IMPORT_API.md for what these keys authorise.
 */
export default async function AdminApiKeysPage() {
  const offices = await listOffices();
  return <ApiKeysAdmin offices={offices} />;
}
