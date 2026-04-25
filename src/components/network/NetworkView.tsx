"use client";

import { useMemo, useState } from "react";
import type { ContactRecord, DealRecord, Office, Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  offices: Office[];
  contacts: ContactRecord[];
  deals: DealRecord[];
}

interface OfficeStats {
  office: Office;
  contactCount: number;
  listingCount: number;
  dealCount: number;
  pipelineValue: number;
  daysSinceUpdate: number | null;
  freshness: "current" | "due" | "stale" | "unknown";
  freshnessColor: string;
  freshnessLabel: string;
  sectors: string[];
  newestContact: string | null;
  oldestContact: string | null;
  avgContactCadenceDays: number | null;
}

function freshnessFor(days: number | null): { tone: OfficeStats["freshness"]; color: string; label: string } {
  if (days == null) return { tone: "unknown", color: "var(--gray-400)", label: "No data" };
  if (days <= 30) return { tone: "current", color: "#16a34a", label: "Current" };
  if (days <= 60) return { tone: "due", color: "#ea580c", label: "Due for update" };
  return { tone: "stale", color: "#dc2626", label: "Stale" };
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        border: "1px solid var(--gray-200)"
      }}
    >
      <div style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function FreshnessRing({ days }: { days: number | null }) {
  // Treat future-dated last_updated (negative days) as fresh.
  const safeDays = days == null ? null : Math.max(0, days);
  // Map 0..90 days onto 0..360°. Empty ring at 0d (current), fills as it ages.
  const cap = 90;
  const pct = safeDays == null ? 1 : Math.min(1, safeDays / cap);
  const { color, label } = freshnessFor(safeDays);
  const size = 52;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * pct;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--gray-200)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{safeDays == null ? "—" : safeDays}</div>
          <div style={{ fontSize: 8, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 }}>
            {safeDays == null ? "" : "days"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  );
}

export default function NetworkView({ offices, contacts, deals }: Props) {
  const [hoveredOfficeId, setHoveredOfficeId] = useState<string | null>(null);

  const stats = useMemo<OfficeStats[]>(() => {
    return offices
      .map((o) => {
        const officeContacts = contacts.filter((c) => c.office_id === o.id);
        const officeDeals = deals.filter((d) => d.office_id === o.id);

        const sectorSet = new Set<string>();
        officeContacts.forEach((c) => c.sectors?.forEach((s) => sectorSet.add(s)));
        officeDeals.forEach((d) => d.sectors?.forEach((s) => sectorSet.add(s)));

        const dates = officeContacts
          .map((c) => c.date_added)
          .filter(Boolean)
          .sort();
        const newest = dates[dates.length - 1] ?? null;
        const oldest = dates[0] ?? null;

        let avgCadence: number | null = null;
        if (dates.length >= 2) {
          const first = new Date(dates[0]).getTime();
          const last = new Date(dates[dates.length - 1]).getTime();
          const span = (last - first) / 86400000;
          avgCadence = Math.round(span / Math.max(1, dates.length - 1));
        }

        const daysSinceUpdate = o.last_updated
          ? Math.floor((Date.now() - new Date(o.last_updated).getTime()) / 86400000)
          : null;
        const f = freshnessFor(daysSinceUpdate);

        return {
          office: o,
          contactCount: officeContacts.length,
          listingCount: officeContacts.filter((c) => !!c.listing).length,
          dealCount: officeDeals.length,
          pipelineValue: officeDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0),
          daysSinceUpdate,
          freshness: f.tone,
          freshnessColor: f.color,
          freshnessLabel: f.label,
          sectors: Array.from(sectorSet).sort(),
          newestContact: newest,
          oldestContact: oldest,
          avgContactCadenceDays: avgCadence
        } as OfficeStats;
      })
      .sort((a, b) => b.contactCount - a.contactCount);
  }, [offices, contacts, deals]);

  const totals = useMemo(() => {
    const totalContacts = stats.reduce((s, x) => s + x.contactCount, 0);
    const totalListings = stats.reduce((s, x) => s + x.listingCount, 0);
    const totalDeals = stats.reduce((s, x) => s + x.dealCount, 0);
    const totalValue = stats.reduce((s, x) => s + x.pipelineValue, 0);
    return { totalContacts, totalListings, totalDeals, totalValue };
  }, [stats]);

  const maxContact = Math.max(1, ...stats.map((s) => s.contactCount));

  function fmtMoney(v: number) {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 22, color: "var(--navy)" }}>GREA Network</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
          Cross-office activity at a glance — contacts, deals, and how fresh each office&apos;s data is.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 22
        }}
      >
        <StatTile label="Offices" value={stats.length} />
        <StatTile label="Total Contacts" value={totals.totalContacts.toLocaleString()} />
        <StatTile label="Active Listings" value={totals.totalListings.toLocaleString()} sub="contacts with a listing" />
        <StatTile label="Pipeline" value={totals.totalDeals.toLocaleString()} sub={fmtMoney(totals.totalValue) + " total value"} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14
        }}
      >
        {stats.map((s) => {
          const isHover = hoveredOfficeId === s.office.id;
          const sharePct = (s.contactCount / maxContact) * 100;
          return (
            <div
              key={s.office.id}
              onMouseEnter={() => setHoveredOfficeId(s.office.id)}
              onMouseLeave={() => setHoveredOfficeId(null)}
              style={{
                background: "white",
                borderRadius: 12,
                padding: "16px 18px",
                boxShadow: isHover ? "0 4px 20px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
                border: "1px solid var(--gray-200)",
                borderTop: `4px solid ${s.freshnessColor}`,
                transition: "box-shadow 0.15s, transform 0.15s",
                transform: isHover ? "translateY(-2px)" : "none"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`office-badge ${s.office.code.toLowerCase()}`} style={{ fontSize: 13, padding: "3px 10px" }}>
                      {s.office.code}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--gray-600)" }}>{s.office.name}</span>
                  </div>
                </div>
                <FreshnessRing days={s.daysSinceUpdate} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.contactCount}</div>
                  <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                    Contacts
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.listingCount}</div>
                  <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                    Listings
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.dealCount}</div>
                  <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                    Deals · {fmtMoney(s.pipelineValue)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  height: 6,
                  background: "var(--gray-100)",
                  borderRadius: 3,
                  marginTop: 14,
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${sharePct}%`,
                    background: "var(--gold)",
                    borderRadius: 3,
                    transition: "width 0.3s"
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: "var(--gray-500)", marginTop: 4 }}>
                {sharePct.toFixed(0)}% of largest office&apos;s contact base
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--gray-100)",
                  fontSize: 11,
                  color: "var(--gray-600)"
                }}
              >
                <div>
                  <div style={{ color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                    Last refreshed
                  </div>
                  <div style={{ color: s.freshnessColor, fontWeight: 600 }}>
                    {s.office.last_updated ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                    Avg cadence
                  </div>
                  <div>
                    {s.avgContactCadenceDays != null
                      ? `${s.avgContactCadenceDays}d between contacts`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                    Newest contact
                  </div>
                  <div>{s.newestContact ?? "—"}</div>
                </div>
                <div>
                  <div style={{ color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                    Oldest contact
                  </div>
                  <div>{s.oldestContact ?? "—"}</div>
                </div>
              </div>

              {s.sectors.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {s.sectors.slice(0, 6).map((sec) => (
                    <span
                      key={sec}
                      className={`sector-badge sector-${sec.toLowerCase().replace(/\s+/g, "-")}`}
                      style={{ fontSize: 10, padding: "2px 7px" }}
                    >
                      {sec}
                    </span>
                  ))}
                  {s.sectors.length > 6 && (
                    <span style={{ fontSize: 10, color: "var(--gray-500)" }}>+{s.sectors.length - 6} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stats.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--gray-500)" }}>
          No offices yet. A superadmin can add offices in <strong>Admin → Offices</strong>.
        </div>
      )}
    </div>
  );
}
