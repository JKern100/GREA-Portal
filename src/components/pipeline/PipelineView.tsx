"use client";

import { useMemo, useState } from "react";
import type { DealRecord, DealStage, Office, Profile, SpecialtyTeam } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";
import DealDetailModal from "./DealDetailModal";

interface Props {
  profile: Profile;
  offices: Office[];
  initialDeals: DealRecord[];
  teams: SpecialtyTeam[];
}

type SortField = "deal_name" | "contact_name" | "office" | "stage" | "deal_value" | "assigned_broker_name";

function formatValue(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

export default function PipelineView({ profile, offices, initialDeals, teams }: Props) {
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

  const filtered = useMemo(() => {
    let list = [...deals];
    if (stageFilter) list = list.filter((d) => d.stage === stageFilter);
    if (officeFilter) list = list.filter((d) => d.office_id === officeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.deal_name.toLowerCase().includes(q) ||
          (d.contact_name || "").toLowerCase().includes(q) ||
          (d.account_name || "").toLowerCase().includes(q) ||
          (d.property_address || "").toLowerCase().includes(q) ||
          (d.assigned_broker_name || "").toLowerCase().includes(q)
      );
    }
    const order: Record<DealStage, number> = { Lead: 0, Listing: 1, Contract: 2, Closed: 3 };
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
  }, [deals, stageFilter, officeFilter, search, sortField, sortAsc, officeById]);

  const stageCounts = useMemo(() => {
    const counts: Record<DealStage, { count: number; value: number }> = {
      Lead: { count: 0, value: 0 },
      Listing: { count: 0, value: 0 },
      Contract: { count: 0, value: 0 },
      Closed: { count: 0, value: 0 }
    };
    deals.forEach((d) => {
      counts[d.stage].count++;
      counts[d.stage].value += d.deal_value || 0;
    });
    return counts;
  }, [deals]);

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

  const totalPipelineValue = deals.reduce((s, d) => s + (d.deal_value || 0), 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Deal Pipeline</h2>
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
            {deals.length} deals · {formatValue(totalPipelineValue)} total pipeline
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
            <span style={{ fontSize: 11, color: "var(--gray-400)" }}>{formatValue(stageCounts[s].value)}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => setSort("deal_name")}>Deal{arrow("deal_name")}</th>
              <th onClick={() => setSort("contact_name")}>Contact / Account{arrow("contact_name")}</th>
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
                <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--gray-400)" }}>
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
                    <td>
                      {d.contact_name || "—"}
                      {d.account_name && (
                        <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{d.account_name}</div>
                      )}
                    </td>
                    <td>
                      {office ? <span className={`office-badge ${office.code.toLowerCase()}`}>{office.code}</span> : "—"}
                    </td>
                    <td>
                      <span className={`stage-badge ${stageClass}`}>{d.stage}</span>{" "}
                      {d.sub_status && <span className={`substatus-${d.sub_status.toLowerCase()}`}>{d.sub_status}</span>}
                      {d.is_confidential && (
                        <span
                          title="Confidential"
                          style={{
                            marginLeft: 6,
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            background: "#fee2e2",
                            color: "#991b1b",
                            border: "1px solid #fecaca"
                          }}
                        >
                          Confidential
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatValue(d.deal_value)}</td>
                    <td>{d.assigned_broker_name || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn-outline" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setDetailId(d.id)}>
                        View
                      </button>
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
          teams={teams}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}
