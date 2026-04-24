"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DealRecord } from "@/lib/types";

interface Props {
  deals: DealRecord[];
}

function formatValue(v: number | null) {
  if (!v) return "—";
  return "$" + v.toLocaleString();
}

export default function MyOfficeDeals({ deals: initial }: Props) {
  const [deals, setDeals] = useState(initial);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.deal_name.toLowerCase().includes(q) ||
        (d.seller_name || "").toLowerCase().includes(q) ||
        (d.buyer_name || "").toLowerCase().includes(q) ||
        (d.property_type || "").toLowerCase().includes(q) ||
        (d.assigned_broker_name || "").toLowerCase().includes(q)
    );
  }, [deals, query]);

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
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Office Deals ({deals.length})</div>
        <input
          className="form-input"
          style={{ marginLeft: "auto", width: 240 }}
          placeholder="Filter deals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Type</th>
            <th>Seller / Buyer</th>
            <th>Stage</th>
            <th>Value</th>
            <th>Broker</th>
            <th style={{ textAlign: "center" }}>Confidential</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <tr key={d.id}>
              <td><strong>{d.deal_name}</strong></td>
              <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{d.property_type || "—"}</td>
              <td style={{ fontSize: 12 }}>
                <div>
                  <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>S:</span>{" "}
                  {d.seller_name || "—"}
                </div>
                <div>
                  <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>B:</span>{" "}
                  {d.buyer_name || "—"}
                </div>
              </td>
              <td>
                <span className={`stage-badge stage-${d.stage.toLowerCase()}`}>{d.stage}</span>
              </td>
              <td style={{ fontWeight: 600 }}>{formatValue(d.deal_value)}</td>
              <td style={{ fontSize: 12 }}>{d.assigned_broker_name || "—"}</td>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={d.is_confidential}
                  onChange={(e) => toggleConfidential(d.id, e.target.checked)}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                No deals match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
