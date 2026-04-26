import Link from "next/link";
import { redirect } from "next/navigation";
import { listOffices, requireOfficeAdminOrSuperadmin } from "@/lib/data";

// Admin-only management tools for the office.
const adminTabs = [
  { href: "/my-office", label: "Office Members" },
  { href: "/feedback", label: "Feedback" }
];

// Sections that mirror the public top-nav, scoped to this admin's office.
// Same visual pattern as the Super Admin sidebar's "Across the Portal"
// card — these are the surfaces every authenticated user has, just with
// office-admin powers over their own slice.
const sharedTabs = [
  { href: "/my-office/contacts", label: "Contacts" },
  { href: "/my-office/deals", label: "Pipeline" }
];

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 10,
  padding: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
};

const headerStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--gray-500)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 10
};

const linkStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 13,
  color: "var(--gray-700)",
  textDecoration: "none"
};

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
  if (!office) redirect("/contacts");

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: "var(--navy)" }}>
          My Office — {office.code}{" "}
          <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>({office.name})</span>
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28, alignItems: "start" }}>
        <aside style={{ position: "sticky", top: 140, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>Office Admin</div>
            <nav style={{ display: "grid", gap: 2 }}>
              {adminTabs.map((t) => (
                <Link key={t.href} href={t.href} style={linkStyle}>
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>

          <div style={cardStyle}>
            <div style={headerStyle}>Across the Portal</div>
            <nav style={{ display: "grid", gap: 2 }}>
              {sharedTabs.map((t) => (
                <Link key={t.href} href={t.href} style={linkStyle}>
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
