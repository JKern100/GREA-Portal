import Link from "next/link";
import { requireSuperadmin } from "@/lib/data";

// Admin-only management tools.
const adminTabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/offices", label: "Offices" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/feedback", label: "Feedback" }
];

// Sections that mirror the public top-nav. Every authenticated user sees
// view-only versions; here a superadmin gets the management surface for
// the same data. Surfaced in their own card so the role boundary is
// visually obvious.
const sharedTabs = [
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/deals", label: "Pipeline" },
  { href: "/admin/mailing-list", label: "Mailing List" }
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28, alignItems: "start" }}>
      <aside style={{ position: "sticky", top: 140, display: "grid", gap: 14 }}>
        <div style={cardStyle}>
          <div style={headerStyle}>Super Admin</div>
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
  );
}
