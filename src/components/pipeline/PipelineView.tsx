"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DealRecord, DealStage, Office, Profile } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";
import { officeBadgeStyle } from "@/lib/officeColor";
import DealDetailModal from "./DealDetailModal";

interface Props {
  profile: Profile;
  offices: Office[];
  initialDeals: DealRecord[];
  profiles: Profile[];
}

type SortField = "deal_name" | "seller_name" | "office" | "stage" | "deal_value" | "assigned_broker_name";

function formatValue(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

export default function PipelineView({ profile, offices, initialDeals, profiles }: Props) {
  const [deals] = useState<DealRecord[]>(initialDeals);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [officeFilter, setOfficeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("stage");
  const [sortAsc, setSortAsc] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  // Pipeline scope = everything matching office + search filters, regardless
  // of the active stage tab. The per-stage pills and the header total both
  // read from this so they update with office/search but stay useful as a
  // stage switcher (otherwise selecting "Lead" would zero out the other pills).
  const scoped = useMemo(() => {
    let list = deals;
    if (officeFilter) list = list.filter((d) => d.office_id === officeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.deal_name.toLowerCase().includes(q) ||
          (d.seller_name || "").toLowerCase().includes(q) ||
          (d.buyer_name || "").toLowerCase().includes(q) ||
          (d.property_type || "").toLowerCase().includes(q) ||
          (d.property_address || "").toLowerCase().includes(q) ||
          (d.assigned_broker_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [deals, officeFilter, search]);

  const filtered = useMemo(() => {
    let list = stageFilter ? scoped.filter((d) => d.stage === stageFilter) : [...scoped];
    const order: Record<DealStage, number> = { Lead: 0, Listing: 1, Contract: 2, Closed: 3 };
    list = [...list];
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortField === "stage") {
        va = order[a.stage];
        vb = order[b.stage];
      } else if (sortField === "deal_value") {
        va = a.deal_value || 0;
        vb = b.deal_value || 0;
      } else if (sortField === "office") {
        va = officeById[a.office_id]?.code || "";
        vb = officeById[b.office_id]?.code || "";
      } else {
        va = ((a as unknown as Record<string, unknown>)[sortField] ?? "").toString().toLowerCase();
        vb = ((b as unknown as Record<string, unknown>)[sortField] ?? "").toString().toLowerCase();
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [scoped, stageFilter, sortField, sortAsc, officeById]);

  const stageCounts = useMemo(() => {
    const counts: Record<DealStage, { count: number; value: number }> = {
      Lead: { count: 0, value: 0 },
      Listing: { count: 0, value: 0 },
      Contract: { count: 0, value: 0 },
      Closed: { count: 0, value: 0 }
    };
    scoped.forEach((d) => {
      counts[d.stage].count++;
      counts[d.stage].value += d.deal_value || 0;
    });
    return counts;
  }, [scoped]);

  function setSort(f: SortField) {
    if (f === sortField) setSortAsc(!sortAsc);
    else {
      setSortField(f);
      setSortAsc(true);
    }
  }

  function arrow(f: SortField) {
    return f === sortField ? (sortAsc ? " ▲" : " ▼") : "";
  }

  const scopedTotal = scoped.reduce((s, d) => s + (d.deal_value || 0), 0);
  const isScoped = !!officeFilter || !!search.trim();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Deal Pipeline</h2>
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
            {scoped.length} deals · {formatValue(scopedTotal)} {isScoped ? "matching pipeline" : "total pipeline"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="form-input" style={{ width: "auto" }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All Stages</option>
          {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input" style={{ width: "auto" }} value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
          <option value="">All Offices</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
        </select>
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Search deals…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {DEAL_STAGES.map((s) => (
          <div key={s} className="pill-badge">
            {s} <span className="count">{stageCounts[s].count}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-700)" }}>
              {formatValue(stageCounts[s].value)}
            </span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => setSort("deal_name")}>Deal{arrow("deal_name")}</th>
              <th>Type</th>
              <th onClick={() => setSort("seller_name")}>Seller / Buyer{arrow("seller_name")}</th>
              <th onClick={() => setSort("office")}>Office{arrow("office")}</th>
              <th onClick={() => setSort("stage")}>Stage{arrow("stage")}</th>
              <th onClick={() => setSort("deal_value")}>Value{arrow("deal_value")}</th>
              <th onClick={() => setSort("assigned_broker_name")}>Broker{arrow("assigned_broker_name")}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--gray-400)" }}>
                  No deals match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const office = officeById[d.office_id];
                const stageClass =
                  d.stage === "Closed" && d.sub_status === "Lost"
                    ? "stage-closed-lost"
                    : `stage-${d.stage.toLowerCase()}`;
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.deal_name}</strong>
                      {d.property_address && (
                        <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{d.property_address}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{d.property_type || "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      <div>
                        <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>S:</span>{" "}
                        {d.seller_name || "—"}
                      </div>
                      <div>
                        <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>B:</span>{" "}
                        {d.buyer_name || "—"}
                      </div>
                    </td>
                    <td>
                      {office ? <span className={`office-badge ${office.code.toLowerCase()}`} style={officeBadgeStyle(office)}>{office.code}</span> : "—"}
                    </td>
                    <td>
                      <span className={`stage-badge ${stageClass}`}>{d.stage}</span>{" "}
                      {d.sub_status && <span className={`substatus-${d.sub_status.toLowerCase()}`}>{d.sub_status}</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatValue(d.deal_value)}</td>
                    <td>{d.assigned_broker_name || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn-outline" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setDetailId(d.id)}>
                        View
                      </button>{" "}
                      <Link
                        href={`/feedback?submit=1&deal=${d.id}&context_url=/pipeline&title=${encodeURIComponent("Issue with deal: " + d.deal_name)}`}
                        className="btn-outline"
                        style={{ padding: "3px 10px", fontSize: 11, textDecoration: "none" }}
                        title="Report an issue with this deal"
                      >
                        Report
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {detailId && (
        <DealDetailModal
          dealId={detailId}
          offices={offices}
          profiles={profiles}
          profile={profile}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}
