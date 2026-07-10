"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/lib/useIsMobile";
import { useUnseenFeedback } from "@/lib/useUnseenFeedback";

interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  /**
   * Which admin context to render. The two layouts use different tab
   * sets but the visual treatment is identical, so they share this
   * component.
   */
  mode: "superadmin" | "office_admin";
  /**
   * Render as a narrow icon-only rail. Owned by AdminShell so the
   * preference persists across navigations.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Inline stroke icons keep this component dependency-free. Sized via
// the parent <svg> so the same path JSX renders at any scale.
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

const ICON = {
  overview: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  users: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14c2.8 0 5 2.2 5 5" />
    </svg>
  ),
  building: (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21v-3h4v3" />
    </svg>
  ),
  activity: (
    <svg {...iconProps}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
  feedback: (
    <svg {...iconProps}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" />
    </svg>
  ),
  contact: (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  ),
  pipeline: (
    <svg {...iconProps}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  ),
  mail: (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ),
  team: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14c2.8 0 5 2.2 5 5" />
    </svg>
  )
} as const;

const SUPERADMIN_TABS: Tab[] = [
  { href: "/admin", label: "Overview", icon: ICON.overview },
  { href: "/admin/users", label: "Users", icon: ICON.users },
  { href: "/admin/offices", label: "Offices", icon: ICON.building },
  { href: "/admin/activity", label: "Activity", icon: ICON.activity },
  { href: "/admin/settings", label: "Settings", icon: ICON.settings },
  { href: "/feedback", label: "Feedback", icon: ICON.feedback }
];

const SUPERADMIN_SHARED_TABS: Tab[] = [
  { href: "/admin/deals", label: "Pipeline", icon: ICON.pipeline },
  { href: "/admin/contacts", label: "Contacts", icon: ICON.contact },
  { href: "/admin/mailing-list", label: "Mailing List", icon: ICON.mail }
];

const OFFICE_ADMIN_TABS: Tab[] = [
  { href: "/my-office", label: "Office Members", icon: ICON.team },
  { href: "/feedback", label: "Feedback", icon: ICON.feedback }
];

const OFFICE_ADMIN_SHARED_TABS: Tab[] = [
  { href: "/my-office/deals", label: "Pipeline", icon: ICON.pipeline },
  { href: "/my-office/contacts", label: "Contacts", icon: ICON.contact }
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

const countBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  borderRadius: 9,
  background: "#dc2626",
  color: "white",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0
};

export default function AdminSidebar({ mode, collapsed = false, onToggleCollapse }: Props) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const unseenFeedback = useUnseenFeedback();
  const isSuper = mode === "superadmin";
  const adminTabs = isSuper ? SUPERADMIN_TABS : OFFICE_ADMIN_TABS;
  const sharedTabs = isSuper ? SUPERADMIN_SHARED_TABS : OFFICE_ADMIN_SHARED_TABS;
  const sectionLabel = isSuper ? "Super Admin" : "Office Admin";

  const renderLink = (t: Tab) => {
    const active =
      pathname != null && (pathname === t.href || pathname.startsWith(t.href + "/"));
    // Badge count for the Feedback tab only (unseen open feedback, S-8).
    const badge = t.href === "/feedback" ? unseenFeedback : 0;
    if (isMobile) {
      // Mobile chip-style tab. The desktop list-style padding/background
      // doesn't read well in a horizontal strip.
      return (
        <Link
          key={t.href}
          href={t.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            color: active ? "white" : "var(--gray-700)",
            background: active ? "var(--navy)" : "var(--gray-100)",
            whiteSpace: "nowrap",
            flexShrink: 0
          }}
        >
          {t.label}
          {badge > 0 && <span style={countBadgeStyle} aria-label={`${badge} new`}>{badge}</span>}
        </Link>
      );
    }
    if (collapsed) {
      return (
        <Link
          key={t.href}
          href={t.href}
          title={badge > 0 ? `${t.label} — ${badge} new` : t.label}
          aria-label={badge > 0 ? `${t.label}, ${badge} new` : t.label}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 6,
            textDecoration: "none",
            color: active ? "var(--navy)" : "var(--gray-600)",
            background: active ? "var(--gray-100)" : "transparent"
          }}
        >
          {t.icon}
          {badge > 0 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#dc2626",
                border: "1.5px solid white"
              }}
            />
          )}
        </Link>
      );
    }
    return (
      <Link
        key={t.href}
        href={t.href}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 6,
          fontSize: 13,
          textDecoration: "none",
          color: active ? "var(--navy)" : "var(--gray-700)",
          background: active ? "var(--gray-100)" : "transparent",
          fontWeight: active ? 600 : 400
        }}
      >
        <span>{t.label}</span>
        {badge > 0 && <span style={countBadgeStyle} aria-label={`${badge} new`}>{badge}</span>}
      </Link>
    );
  };

  const toggleButton = onToggleCollapse ? (
    <button
      type="button"
      onClick={onToggleCollapse}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: 6,
        border: "1px solid var(--gray-200)",
        background: "white",
        color: "var(--gray-600)",
        cursor: "pointer"
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  ) : null;

  if (isMobile) {
    // Horizontal scroll strip with both groups inlined. The two-section
    // visual treatment (Super Admin / Data) doesn't survive at narrow
    // widths; we keep the labels as a small section header instead.
    return (
      <nav
        aria-label={`${sectionLabel} navigation`}
        className="scroll-x-hide"
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "4px 2px",
          marginBottom: 4
        }}
      >
        {adminTabs.map(renderLink)}
        {sharedTabs.map(renderLink)}
      </nav>
    );
  }

  if (collapsed) {
    return (
      <aside style={{ position: "sticky", top: 140, display: "grid", gap: 10, justifyItems: "center" }}>
        <div style={{ ...cardStyle, padding: 6, display: "flex", justifyContent: "center" }}>
          {toggleButton}
        </div>
        <div style={{ ...cardStyle, padding: 6 }}>
          <nav
            aria-label={sectionLabel}
            style={{ display: "grid", gap: 2, justifyItems: "center" }}
          >
            {adminTabs.map(renderLink)}
          </nav>
        </div>
        <div style={{ ...cardStyle, padding: 6 }}>
          <nav aria-label="Data" style={{ display: "grid", gap: 2, justifyItems: "center" }}>
            {sharedTabs.map(renderLink)}
          </nav>
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ position: "sticky", top: 140, display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10
          }}
        >
          <div style={{ ...headerStyle, marginBottom: 0 }}>{sectionLabel}</div>
          {toggleButton}
        </div>
        <nav style={{ display: "grid", gap: 2 }}>{adminTabs.map(renderLink)}</nav>
      </div>
      <div style={cardStyle}>
        <div style={headerStyle}>Data</div>
        <nav style={{ display: "grid", gap: 2 }}>{sharedTabs.map(renderLink)}</nav>
      </div>
    </aside>
  );
}
