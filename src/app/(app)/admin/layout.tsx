import AdminSidebar from "@/components/AdminSidebar";
import MobileAdminHint from "@/components/admin/MobileAdminHint";
import { requireSuperadmin } from "@/lib/data";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return (
    <>
      <MobileAdminHint />
      <div className="admin-grid">
        <AdminSidebar mode="superadmin" />
        <div>{children}</div>
      </div>
    </>
  );
}
