import AdminShell from "@/components/AdminShell";
import MobileAdminHint from "@/components/admin/MobileAdminHint";
import { requireSuperadmin } from "@/lib/data";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return (
    <>
      <MobileAdminHint />
      <AdminShell mode="superadmin">{children}</AdminShell>
    </>
  );
}
