"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { officeBadgeStyle } from "@/lib/officeColor";
import type { DealRecord, DealStageHistory, Office, Profile } from "@/lib/types";

interface Props {
  dealId: string;
  offices: Office[];
  profiles: Profile[];
  onClose: () => void;
}

export default function DealDetailModal({ dealId, offices, profiles, onClose }: Props) {
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [history, setHistory] = useState<DealStageHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const [d, h] = await Promise.all([
        supabase.from("deals").select("*").eq("id", dealId).single(),
        supabase.from("deal_stage_history").select("*").eq("deal_id", dealId).order("occurred_on", { ascending: true })
      ]);
      if (d.data) setDeal(d.data as DealRecord);
      if (h.data) setHistory(h.data as DealStageHistory[]);
      setLoading(false);
    };
    load();
  }, [dealId]);

  const office = deal ? offices.find((o) => o.id === deal.office_id) : null;
  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  // Brokers across the firm whose declared specialties intersect with the
  // deal's sectors. Capital Services is always included even when the deal
  // doesn't tag it, since financing is relevant on every transaction.
  const specialists = useMemo(() => {
    if (!deal) return [];
    const wanted = new Set<string>(deal.sectors || []);
    wanted.add("Capital Services");
    const dealOffice = deal.office_id;
    return profiles
      .filter((p) => (p.specialties ?? []).some((s) => wanted.has(s)))
      .filter((p) => p.id !== deal.assigned_broker_id)
      .sort((a, b) => {
        // Same-office specialists first, then alphabetical by name.
        const aSame = a.office_id === dealOffice ? 0 : 1;
        const bSame = b.office_id === dealOffice ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [deal, profiles]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 680 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        {loading || !deal ? (
          <p style={{ color: "var(--gray-500)" }}>Loading…</p>
        ) : (
          <>
            <h2 style={{ fontSize: 18, color: "var(--navy)" }}>{deal.deal_name}</h2>
            <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 12 }}>{deal.property_address}</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "16px 0", padding: 16, background: "var(--gray-50)", borderRadius: 8 }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Seller</span>
                <div><strong>{deal.seller_name || "—"}</strong></div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Buyer</span>
                <div><strong>{deal.buyer_name || "—"}</strong></div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Property Type</span>
                <div><strong>{deal.property_type || "—"}</strong></div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Broker</span>
                <div><strong>{deal.assigned_broker_name || "—"}</strong></div>
                {office && <span className={`office-badge ${office.code.toLowerCase()}`} style={officeBadgeStyle(office)}>{office.code}</span>}
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Stage</span>
                <div>
                  <span className={`stage-badge ${deal.stage === "Closed" && deal.sub_status === "Lost" ? "stage-closed-lost" : "stage-" + deal.stage.toLowerCase()}`}>
                    {deal.stage}
                  </span>{" "}
                  {deal.sub_status && <span className={`substatus-${deal.sub_status.toLowerCase()}`}>{deal.sub_status}</span>}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase" }}>Value</span>
                <div><strong>{deal.deal_value ? "$" + deal.deal_value.toLocaleString() : "—"}</strong></div>
              </div>
            </div>

            {deal.om_link && (
              <div style={{ marginBottom: 14 }}>
                <a href={deal.om_link} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: "inline-flex", padding: "8px 14px", fontSize: 13 }}>
                  View Offering Memorandum
                </a>
              </div>
            )}

            {deal.notes && (
              <div style={{ padding: 10, background: "#fdf8ec", borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                <strong>Notes:</strong> {deal.notes}
              </div>
            )}

            <h3 style={{ fontSize: 14, color: "var(--navy)", marginBottom: 8 }}>Stage History</h3>
            <div style={{ borderLeft: "2px solid var(--gray-200)", marginLeft: 8, paddingLeft: 16, marginBottom: 18 }}>
              {history.map((h, i) => (
                <div key={h.id} style={{ marginBottom: 12, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: -22,
                      top: 2,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: i === history.length - 1 ? "var(--gold)" : "var(--gray-300)",
                      border: "2px solid white"
                    }}
                  />
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{h.occurred_on}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {h.stage}
                    {h.note && (
                      <>
                        {" — "}
                        <span style={{ fontWeight: 400, color: "var(--gray-600)" }}>{h.note}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {specialists.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, color: "var(--navy)", marginBottom: 10 }}>
                  Specialists to loop in
                </h3>
                <p style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 10 }}>
                  Brokers across GREA whose declared specialties match this deal&apos;s sectors.
                </p>
                <div style={{ display: "grid", gap: 6 }}>
                  {specialists.slice(0, 8).map((p) => {
                    const o = p.office_id ? officeById[p.office_id] : null;
                    const matched = (p.specialties ?? []).filter(
                      (s) => (deal.sectors || []).includes(s) || s === "Capital Services"
                    );
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          border: "1px solid var(--gray-200)",
                          borderRadius: 6,
                          fontSize: 12
                        }}
                      >
                        {o && (
                          <span
                            className={`office-badge ${o.code.toLowerCase()}`}
                            style={officeBadgeStyle(o, { fontSize: 10, padding: "2px 7px" })}
                          >
                            {o.code}
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "var(--navy)" }}>
                            {p.name || p.email}
                          </div>
                          <div style={{ color: "var(--gray-500)", fontSize: 11 }}>
                            {p.title || "—"} · {matched.join(", ")}
                          </div>
                        </div>
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            style={{ fontSize: 11, color: "var(--navy)", textDecoration: "underline" }}
                          >
                            {p.email}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
                {specialists.length > 8 && (
                  <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 6 }}>
                    + {specialists.length - 8} more
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
