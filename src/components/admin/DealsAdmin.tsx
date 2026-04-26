"use client";

import { useMemo, useState } from "react";
import { revalidateVisibilityCaches } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { officeBadgeStyle } from "@/lib/officeColor";
import type { DealRecord, DealStage, Office } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";

interface Props {
  deals: DealRecord[];
  offices: Office[];
}

function formatValue(v: number | null) {
  if (!v) return "—";
  return "$" + v.toLocaleString();
}

export default function DealsAdmin({ deals: initial, offices }: Props) {
  const [deals, setDeals] = useState(initial);
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");

  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (officeFilter && d.office_id !== officeFilter) return false;
      if (!q) return true;
      return (
        d.deal_name.toLowerCase().includes(q) ||
        (d.seller_name || "").toLowerCase().includes(q) ||
        (d.buyer_name || "").toLowerCase().includes(q) ||
        (d.property_type || "").toLowerCase().includes(q)
      );
    });
  }, [deals, search, officeFilter]);

  async function updateStage(id: string, stage: DealStage) {
    const supabase = createClient();
    const { data, error } = await supabase.from("deals").update({ stage }).eq("id", id).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setDeals((prev) => prev.map((d) => (d.id === id ? (data as DealRecord) : d)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this deal?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setDeals((prev) => prev.filter((d) => d.id !== id));
  }

  async function toggleConfidential(id: string, next: boolean) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .update({ is_confidential: next })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setDeals((prev) => prev.map((d) => (d.id === id ? (data as DealRecord) : d)));
    await revalidateVisibilityCaches();
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Deals</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Full admin view of every deal in the pipeline.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="form-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <select className="form-input" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All offices</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Deal</th>
              <th>Type</th>
              <th>Seller / Buyer</th>
              <th>Office</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Broker</th>
              <th>Hide</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const office = officeById[d.office_id];
              return (
                <tr key={d.id}>
                  <td>
                    <strong>{d.deal_name}</strong>
                    {d.property_address && <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{d.property_address}</div>}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{d.property_type || "—"}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>
                      <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>S:</span> {d.seller_name || "—"}
                    </div>
                    <div>
                      <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>B:</span> {d.buyer_name || "—"}
                    </div>
                  </td>
                  <td>{office && <span className={`office-badge ${office.code.toLowerCase()}`} style={officeBadgeStyle(office)}>{office.code}</span>}</td>
                  <td>
                    <select
                      className="form-input"
                      style={{ padding: "3px 6px", fontSize: 12 }}
                      value={d.stage}
                      onChange={(e) => updateStage(d.id, e.target.value as DealStage)}
                    >
                      {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{formatValue(d.deal_value)}</td>
                  <td style={{ fontSize: 12 }}>{d.assigned_broker_name}</td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={d.is_confidential}
                      onChange={(e) => toggleConfidential(d.id, e.target.checked)}
                    />
                  </td>
                  <td><button className="btn-danger" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => remove(d.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
