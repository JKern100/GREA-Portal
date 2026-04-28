"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

interface Props {
  /**
   * Which admin context to render. The two layouts use different tab
   * sets but the visual treatment is identical, so they share this
   * component.
   */
  mode: "superadmin" | "office_admin";
}

const SUPERADMIN_TABS: Tab[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/offices", label: "Offices" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/feedback", label: "Feedback" }
];

const SUPERADMIN_SHARED_TABS: Tab[] = [
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/deals", label: "Pipeline" },
  { href: "/admin/mailing-list", label: "Mailing List" }
];

const OFFICE_ADMIN_TABS: Tab[] = [
  { href: "/my-office", label: "Office Members" },
  { href: "/feedback", label: "Feedback" }
];

const OFFICE_ADMIN_SHARED_TABS: Tab[] = [
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

export default function AdminSidebar({ mode }: Props) {
  const pathname = usePathname();
  const isSuper = mode === "superadmin";
  const adminTabs = isSuper ? SUPERADMIN_TABS : OFFICE_ADMIN_TABS;
  const sharedTabs = isSuper ? SUPERADMIN_SHARED_TABS : OFFICE_ADMIN_SHARED_TABS;
  const sectionLabel = isSuper ? "Super Admin" : "Office Admin";

  const renderLink = (t: Tab) => {
    const active =
      pathname != null && (pathname === t.href || pathname.startsWith(t.href + "/"));
    return (
      <Link
        key={t.href}
        href={t.href}
        style={{
          padding: "8px 10px",
          borderRadius: 6,
          fontSize: 13,
          textDecoration: "none",
          color: active ? "var(--navy)" : "var(--gray-700)",
          background: active ? "var(--gray-100)" : "transparent",
          fontWeight: active ? 600 : 400
        }}
      >
        {t.label}
      </Link>
    );
  };

  return (
    <aside style={{ position: "sticky", top: 140, display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div style={headerStyle}>{sectionLabel}</div>
        <nav style={{ display: "grid", gap: 2 }}>{adminTabs.map(renderLink)}</nav>
      </div>
      <div style={cardStyle}>
        <div style={headerStyle}>Data</div>
        <nav style={{ display: "grid", gap: 2 }}>{sharedTabs.map(renderLink)}</nav>
      </div>
    </aside>
  );
}
