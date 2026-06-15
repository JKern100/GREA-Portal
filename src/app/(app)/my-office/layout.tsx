import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import MobileAdminHint from "@/components/admin/MobileAdminHint";
import { listOffices, requireOfficeAdminOrSuperadmin } from "@/lib/data";

export default async function MyOfficeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireOfficeAdminOrSuperadmin();

  // Superadmins manage via /admin/*, not /my-office.
  if (profile.role === "superadmin") redirect("/admin/offices");

  if (!profile.office_id) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 20, color: "var(--navy)" }}>My Office</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 8 }}>
          You are not assigned to an office yet. Please contact a superadmin to be assigned.
        </p>
      </div>
    );
  }

  const offices = await listOffices();
  const office = offices.find((o) => o.id === profile.office_id);
  if (!office) redirect("/pipeline");

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: "var(--navy)" }}>
          My Office — {office.code}{" "}
          <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>({office.name})</span>
        </h2>
      </div>

      <MobileAdminHint />
      <AdminShell mode="office_admin">{children}</AdminShell>
    </div>
  );
}
