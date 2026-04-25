import Link from "next/link";
import { requireSuperadmin } from "@/lib/data";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/offices", label: "Offices" },
  { href: "/admin/teams", label: "Specialty Teams" },
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/feedback", label: "Feedback" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28, alignItems: "start" }}>
      <aside
        style={{
          position: "sticky",
          top: 140,
          background: "white",
          borderRadius: 10,
          padding: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          Superadmin
        </div>
        <nav style={{ display: "grid", gap: 2 }}>
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--gray-700)",
                textDecoration: "none"
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
