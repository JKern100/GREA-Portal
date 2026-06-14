"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
        (d.property_type || "").toLowerCase().includes(q) ||
        (d.assigned_broker_name || "").toLowerCase().includes(q) ||
        (d.property_address || "").toLowerCase().includes(q)
      );
    });
  }, [deals, search, officeFilter]);

  const visibleIds = useMemo(() => filtered.map((d) => d.id), [filtered]);
  const visibleSelectedCount = useMemo(
    () => visibleIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0),
    [visibleIds, selected]
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  // Header checkbox needs `indeterminate` set imperatively — React doesn't
  // expose it as a controlled prop.
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} deal${ids.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("deals").delete().in("id", ids);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setDeals((prev) => prev.filter((d) => !selected.has(d.id)));
    clearSelection();
  }

  async function bulkSetHidden(value: boolean) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .update({ is_confidential: value })
      .in("id", ids)
      .select();
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      const map = new Map((data as DealRecord[]).map((d) => [d.id, d]));
      setDeals((prev) => prev.map((d) => map.get(d.id) ?? d));
    }
    clearSelection();
    await revalidateVisibilityCaches();
  }

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

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            marginBottom: 10,
            background: "var(--gray-100)",
            borderRadius: 6,
            fontSize: 13
          }}
        >
          <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
          <button className="btn-outline" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => bulkSetHidden(true)} disabled={busy}>
            Hide
          </button>
          <button className="btn-outline" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => bulkSetHidden(false)} disabled={busy}>
            Unhide
          </button>
          <button className="btn-danger" style={{ padding: "3px 10px", fontSize: 12 }} onClick={bulkDelete} disabled={busy}>
            Delete
          </button>
          <button className="btn-outline" style={{ padding: "3px 10px", fontSize: 12, marginLeft: "auto" }} onClick={clearSelection} disabled={busy}>
            Clear
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "visible" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 32, textAlign: "center" }}>
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  aria-label="Select all visible"
                />
              </th>
              <th>Deal</th>
              <th>Parties</th>
              <th style={{ width: 60 }}>Office</th>
              <th style={{ width: 130 }}>Stage</th>
              <th>Value</th>
              <th>Broker</th>
              <th aria-label="Actions" style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const office = officeById[d.office_id];
              const menuOpen = openMenuId === d.id;
              return (
                <tr key={d.id}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={(e) => toggleRow(d.id, e.target.checked)}
                      aria-label={`Select ${d.deal_name}`}
                    />
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <strong>{d.deal_name}</strong>
                      {d.is_confidential && (
                        <span
                          title="Hidden from offices other than the owning office."
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            padding: "1px 6px",
                            borderRadius: 10,
                            background: "var(--gray-200)",
                            color: "var(--gray-600)"
                          }}
                        >
                          Hidden
                        </span>
                      )}
                    </div>
                    {d.property_address && <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{d.property_address}</div>}
                    {d.property_type && <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{d.property_type}</div>}
                  </td>
                  <td style={{ fontSize: 12, minWidth: 150 }}>
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
                  <td style={{ whiteSpace: "nowrap" }}>{formatValue(d.deal_value)}</td>
                  <td style={{ fontSize: 12, minWidth: 120 }}>{d.assigned_broker_name}</td>
                  <td style={{ position: "relative", textAlign: "right", width: 40 }}>
                    <button
                      type="button"
                      className="kebab-btn"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label={`Actions for ${d.deal_name}`}
                      onClick={() => setOpenMenuId(menuOpen ? null : d.id)}
                    >
                      ⋯
                    </button>
                    {menuOpen && (
                      <>
                        <div
                          onClick={() => setOpenMenuId(null)}
                          style={{ position: "fixed", inset: 0, zIndex: 30 }}
                        />
                        <div role="menu" className="kebab-menu">
                          <button
                            role="menuitem"
                            className="kebab-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              toggleConfidential(d.id, !d.is_confidential);
                            }}
                          >
                            {d.is_confidential ? "Unhide" : "Hide from other offices"}
                          </button>
                          <div className="kebab-sep" />
                          <button
                            role="menuitem"
                            className="kebab-item kebab-item-danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              remove(d.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
