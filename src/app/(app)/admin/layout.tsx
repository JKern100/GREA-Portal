import AdminSidebar from "@/components/AdminSidebar";
import { requireSuperadmin } from "@/lib/data";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
      <AdminSidebar mode="superadmin" />
      <div>{children}</div>
    </div>
  );
}
