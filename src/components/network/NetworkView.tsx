"use client";

import { useMemo, useState } from "react";
import { officeBadgeStyle } from "@/lib/officeColor";
import {
  DEFAULT_NETWORK_FRESHNESS,
  type FreshnessThresholds,
  type NetworkFreshnessSettings
} from "@/lib/settings";
import type { ContactRecord, DealRecord, DealStage, Office, Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  offices: Office[];
  contacts: ContactRecord[];
  deals: DealRecord[];
  freshness?: NetworkFreshnessSettings;
}

type NetworkView = "contacts" | "pipeline";

const ACTIVE_STAGES: DealStage[] = ["Lead", "Listing", "Contract"];

interface OfficeStats {
  office: Office;
  // contacts side
  contactCount: number;
  listingCount: number;
  newestContact: string | null;
  oldestContact: string | null;
  avgContactCadenceDays: number | null;
  daysSinceNewestContact: number | null;
  // deals side
  dealCount: number;
  activeDealCount: number;
  closedDealCount: number;
  pipelineValue: number; // total of all deal values (active + closed)
  activeValue: number;
  closedValue: number;
  newestDeal: string | null;
  avgDealValue: number | null;
  daysSinceNewestDeal: number | null;
}

type FreshnessTone = "current" | "due" | "stale" | "unknown";

function freshnessFor(
  days: number | null,
  thresholds: FreshnessThresholds
): { tone: FreshnessTone; color: string; label: string } {
  if (days == null) return { tone: "unknown", color: "var(--gray-400)", label: "No data" };
  if (days <= thresholds.current) return { tone: "current", color: "#16a34a", label: "Current" };
  if (days <= thresholds.due) return { tone: "due", color: "#ea580c", label: "Due for update" };
  return { tone: "stale", color: "#dc2626", label: "Stale" };
}

// Days since the most recent date in `dates` (max), as of now. Negative
// values (future-dated rows) are treated as 0 so the ring shows fresh.
function daysSinceMostRecent(dates: (string | null | undefined)[]): number | null {
  let maxMs: number | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) continue;
    if (maxMs === null || t > maxMs) maxMs = t;
  }
  if (maxMs === null) return null;
  return Math.max(0, Math.floor((Date.now() - maxMs) / 86400000));
}

function StatTile({
  label,
  value,
  sub,
  icon
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        border: "1px solid var(--gray-200)",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "rgba(33,142,194,0.10)",
          color: "var(--navy)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
          {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "var(--navy)", marginTop: 2, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

function OfficeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20c0-2.5 2-4.5 4.5-4.5" />
    </svg>
  );
}

function ListingIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="6" />
      <line x1="16" y1="20" x2="16" y2="13" />
      <path d="M3 4l4 4 5-5 5 5 4-4" />
    </svg>
  );
}

function FreshnessRing({
  days,
  thresholds
}: {
  days: number | null;
  thresholds: FreshnessThresholds;
}) {
  // Negative-day inputs (future-dated rows) are coerced to fresh.
  const safeDays = days == null ? null : Math.max(0, days);
  // The arc fills as days approach a "fully stale" cap that scales with
  // the configured Due threshold — so the ring stays meaningful whether
  // the admin sets 3/10 or 60/120.
  const cap = Math.max(7, thresholds.due * 1.5);
  const pct = safeDays == null ? 1 : Math.min(1, safeDays / cap);
  const { color, label } = freshnessFor(safeDays, thresholds);
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

export default function NetworkView({ offices, contacts, deals, freshness }: Props) {
  // Fall back to baked-in defaults if the caller didn't pass settings —
  // shouldn't happen via the page but keeps the component robust.
  const thresholdsByView = freshness ?? DEFAULT_NETWORK_FRESHNESS;
  const [hoveredOfficeId, setHoveredOfficeId] = useState<string | null>(null);
  const [view, setView] = useState<NetworkView>("contacts");

  const stats = useMemo<OfficeStats[]>(() => {
    return offices.map((o) => {
      const officeContacts = contacts.filter((c) => c.office_id === o.id);
      const officeDeals = deals.filter((d) => d.office_id === o.id);

      const contactDates = officeContacts
        .map((c) => c.date_added)
        .filter(Boolean)
        .sort();
      const newestContact = contactDates[contactDates.length - 1] ?? null;
      const oldestContact = contactDates[0] ?? null;

      let avgCadence: number | null = null;
      if (contactDates.length >= 2) {
        const first = new Date(contactDates[0]).getTime();
        const last = new Date(contactDates[contactDates.length - 1]).getTime();
        const span = (last - first) / 86400000;
        avgCadence = Math.round(span / Math.max(1, contactDates.length - 1));
      }

      // Use date_added when present, fall back to created_at — date_added can
      // be null on legacy/imported deals.
      const dealDates = officeDeals
        .map((d) => d.date_added || d.created_at)
        .filter(Boolean)
        .sort();
      const newestDeal = dealDates[dealDates.length - 1] ?? null;

      const activeDeals = officeDeals.filter((d) => ACTIVE_STAGES.includes(d.stage));
      const closedDeals = officeDeals.filter((d) => d.stage === "Closed");
      const activeValue = activeDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
      const closedValue = closedDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
      const pipelineValue = officeDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
      const dealsWithValue = officeDeals.filter((d) => (d.deal_value ?? 0) > 0);
      const avgDealValue =
        dealsWithValue.length > 0
          ? Math.round(dealsWithValue.reduce((s, d) => s + (d.deal_value ?? 0), 0) / dealsWithValue.length)
          : null;

      // Freshness is derived from when records were uploaded to the portal
      // (`created_at`), not the user-entered `date_added`. The latter is a
      // free-text field on the import template and may be back- or
      // forward-dated relative to today; the ring is meant to answer "how
      // recently did this office push data into the portal?", which only
      // `created_at` answers reliably.
      const daysSinceNewestContact = daysSinceMostRecent(
        officeContacts.map((c) => c.created_at)
      );
      const daysSinceNewestDeal = daysSinceMostRecent(
        officeDeals.map((d) => d.created_at)
      );

      return {
        office: o,
        contactCount: officeContacts.length,
        listingCount: officeContacts.filter((c) => !!c.listing).length,
        newestContact,
        oldestContact,
        avgContactCadenceDays: avgCadence,
        daysSinceNewestContact,
        dealCount: officeDeals.length,
        activeDealCount: activeDeals.length,
        closedDealCount: closedDeals.length,
        pipelineValue,
        activeValue,
        closedValue,
        newestDeal,
        avgDealValue,
        daysSinceNewestDeal
      } as OfficeStats;
    });
  }, [offices, contacts, deals]);

  // Sort by whichever metric the active view emphasises so the most relevant
  // offices land at the top.
  // Sort alphabetically by office code so Contacts and Pipeline views show
  // the same office in the same slot — easier to scan side-by-side than a
  // size-ranked order that reshuffles when you flip views.
  const sortedStats = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => a.office.code.localeCompare(b.office.code));
    return arr;
  }, [stats]);

  const totals = useMemo(() => {
    const totalContacts = stats.reduce((s, x) => s + x.contactCount, 0);
    const totalListings = stats.reduce((s, x) => s + x.listingCount, 0);
    const totalDeals = stats.reduce((s, x) => s + x.dealCount, 0);
    const totalActive = stats.reduce((s, x) => s + x.activeDealCount, 0);
    const totalClosed = stats.reduce((s, x) => s + x.closedDealCount, 0);
    const totalValue = stats.reduce((s, x) => s + x.pipelineValue, 0);
    const totalActiveValue = stats.reduce((s, x) => s + x.activeValue, 0);
    const totalClosedValue = stats.reduce((s, x) => s + x.closedValue, 0);
    return {
      totalContacts,
      totalListings,
      totalDeals,
      totalActive,
      totalClosed,
      totalValue,
      totalActiveValue,
      totalClosedValue
    };
  }, [stats]);

  const maxContact = Math.max(1, ...stats.map((s) => s.contactCount));
  const maxPipeline = Math.max(1, ...stats.map((s) => s.pipelineValue));

  function fmtMoney(v: number) {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  }

  const toggleBtn = (key: NetworkView, label: string) => {
    const active = view === key;
    return (
      <button
        key={key}
        onClick={() => setView(key)}
        style={{
          padding: "6px 14px",
          fontSize: 13,
          fontWeight: 600,
          background: active ? "var(--navy)" : "white",
          color: active ? "white" : "var(--gray-700)",
          border: "1px solid var(--gray-300)",
          borderRadius: 6,
          cursor: "pointer"
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 22,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, color: "var(--navy)" }}>GREA Network</h2>
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
            Cross-office activity at a glance — {view === "pipeline" ? "deals" : "contacts"} and how fresh each office&apos;s data is.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {toggleBtn("contacts", "Contacts")}
          {toggleBtn("pipeline", "Pipeline")}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 22
        }}
      >
        <StatTile label="Offices" value={stats.length} icon={<OfficeIcon />} />
        {view === "contacts" ? (
          <>
            <StatTile label="Total Contacts" value={totals.totalContacts.toLocaleString()} icon={<ContactsIcon />} />
            <StatTile
              label="Active Listings"
              value={totals.totalListings.toLocaleString()}
              sub="contacts with a listing"
              icon={<ListingIcon />}
            />
            <StatTile
              label="Pipeline"
              value={totals.totalDeals.toLocaleString()}
              sub={fmtMoney(totals.totalValue) + " total value"}
              icon={<PipelineIcon />}
            />
          </>
        ) : (
          <>
            <StatTile label="Total Deals" value={totals.totalDeals.toLocaleString()} icon={<PipelineIcon />} />
            <StatTile
              label="Active Pipeline"
              value={totals.totalActive.toLocaleString()}
              sub={fmtMoney(totals.totalActiveValue) + " open"}
              icon={<ListingIcon />}
            />
            <StatTile
              label="Closed"
              value={totals.totalClosed.toLocaleString()}
              sub={fmtMoney(totals.totalClosedValue) + " closed value"}
              icon={<ContactsIcon />}
            />
          </>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14
        }}
      >
        {sortedStats.map((s) => {
          const isHover = hoveredOfficeId === s.office.id;
          const sharePct =
            view === "pipeline"
              ? (s.pipelineValue / maxPipeline) * 100
              : (s.contactCount / maxContact) * 100;
          const shareLabel =
            view === "pipeline"
              ? "of largest office's pipeline value"
              : "of largest office's contact base";
          // Freshness reflects the active view's data: days since the newest
          // contact in Contacts mode, days since the newest deal in Pipeline.
          // Each view has its own configurable thresholds (set in
          // /admin/settings).
          const days = view === "pipeline" ? s.daysSinceNewestDeal : s.daysSinceNewestContact;
          const thresholds = thresholdsByView[view];
          const fresh = freshnessFor(days, thresholds);
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
                borderTop: `4px solid ${fresh.color}`,
                transition: "box-shadow 0.15s, transform 0.15s",
                transform: isHover ? "translateY(-2px)" : "none"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      className={`office-badge ${s.office.code.toLowerCase()}`}
                      style={officeBadgeStyle(s.office, { fontSize: 13, padding: "3px 10px" })}
                    >
                      {s.office.code}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--gray-600)" }}>{s.office.name}</span>
                  </div>
                </div>
                <FreshnessRing days={days} thresholds={thresholds} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
                {view === "contacts" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.dealCount}</div>
                      <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                        Deals
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.activeDealCount}</div>
                      <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                        Active · {fmtMoney(s.activeValue)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.closedDealCount}</div>
                      <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>
                        Closed · {fmtMoney(s.closedValue)}
                      </div>
                    </div>
                  </>
                )}
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
                {sharePct.toFixed(0)}% {shareLabel}
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
                {view === "contacts" ? (
                  <>
                    <div>
                      <div style={{ color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                        Newest contact
                      </div>
                      <div>{s.newestContact ?? "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                        Avg cadence
                      </div>
                      <div>
                        {s.avgContactCadenceDays != null
                          ? `${s.avgContactCadenceDays}d between contacts`
                          : "—"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div style={{ color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                        Newest deal
                      </div>
                      <div>{s.newestDeal ? s.newestDeal.slice(0, 10) : "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, marginBottom: 2 }}>
                        Avg deal size
                      </div>
                      <div>{s.avgDealValue != null ? fmtMoney(s.avgDealValue) : "—"}</div>
                    </div>
                  </>
                )}
              </div>
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
