"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  officeCode: string | null;
}

export default function AppHeader({ profile, officeCode }: Props) {
  const pathname = usePathname();

  const tabs = [
    { href: "/network", label: "Network" },
    { href: "/contacts", label: "Contacts" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/mailing-list", label: "Mailing List" },
    { href: "/feedback", label: "Feedback" }
  ];
  if (profile.role === "office_admin") {
    tabs.push({ href: "/my-office", label: "My Office" });
  }
  if (profile.role === "superadmin") {
    tabs.push({ href: "/admin", label: "Admin" });
  }

  return (
    <>
      <header
        style={{
          background: "var(--navy)",
          color: "white",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)"
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/grea-logo.svg" alt="GREA" style={{ height: 30, width: "auto" }} />
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>Portal</div>
              <div style={{ fontSize: 11, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 1, marginTop: 1 }}>
                Cross-Office Collaboration Tool
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
              <div style={{ fontWeight: 600, color: "white" }}>{profile.name || profile.email}</div>
              <div>
                {officeCode ? <span style={{ color: "var(--gold)" }}>{officeCode}</span> : ""}
                {officeCode && profile.role !== "broker" ? " · " : ""}
                {profile.role !== "broker" && <span style={{ textTransform: "capitalize" }}>{profile.role.replace("_", " ")}</span>}
              </div>
            </div>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                style={{
                  background: "transparent",
                  border: "1px solid var(--gold)",
                  color: "var(--gold)",
                  padding: "7px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <nav
        style={{
          background: "white",
          borderBottom: "2px solid var(--gray-200)",
          position: "sticky",
          top: 74,
          zIndex: 99
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex" }}>
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  padding: "14px 22px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  color: active ? "var(--navy)" : "var(--gray-500)",
                  borderBottom: active ? "3px solid var(--gold)" : "3px solid transparent",
                  marginBottom: -2
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
