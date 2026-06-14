"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { revalidateVisibilityCaches } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import type { ContactRecord, Office } from "@/lib/types";

interface Props {
  contacts: ContactRecord[];
  offices: Office[];
}

function cls(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-");
}

export default function ContactsAdmin({ contacts: initial, offices }: Props) {
  const [contacts, setContacts] = useState(initial);
  const [filter, setFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return contacts.filter((c) => {
      if (officeFilter && c.office_id !== officeFilter) return false;
      if (!q) return true;
      return (
        c.contact_name.toLowerCase().includes(q) ||
        c.account_name.toLowerCase().includes(q) ||
        (c.broker_name_snapshot || "").toLowerCase().includes(q)
      );
    });
  }, [contacts, filter, officeFilter]);

  const visibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const visibleSelectedCount = useMemo(
    () => visibleIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0),
    [visibleIds, selected]
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

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
    if (!confirm(`Delete ${ids.length} contact${ids.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("contacts").delete().in("id", ids);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
    clearSelection();
  }

  async function bulkSetHidden(value: boolean) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .update({ is_confidential: value })
      .in("id", ids)
      .select();
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      const map = new Map((data as ContactRecord[]).map((c) => [c.id, c]));
      setContacts((prev) => prev.map((c) => map.get(c.id) ?? c));
    }
    clearSelection();
    await revalidateVisibilityCaches();
  }

  async function remove(id: string) {
    if (!confirm("Delete this contact?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  async function updateOffice(id: string, officeId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.from("contacts").update({ office_id: officeId }).eq("id", id).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setContacts((prev) => prev.map((c) => (c.id === id ? (data as ContactRecord) : c)));
  }

  async function toggleConfidential(id: string, next: boolean) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .update({ is_confidential: next })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setContacts((prev) => prev.map((c) => (c.id === id ? (data as ContactRecord) : c)));
    await revalidateVisibilityCaches();
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Contacts</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        All contacts across offices. Reassign offices or remove stale entries.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="form-input" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <select className="form-input" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All offices</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 8 }}>Showing {filtered.length} of {contacts.length}</div>

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
              <th>Contact</th>
              <th>Office</th>
              <th>Broker</th>
              <th>Labels</th>
              <th aria-label="Actions" style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const menuOpen = openMenuId === c.id;
              return (
                <tr key={c.id}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => toggleRow(c.id, e.target.checked)}
                      aria-label={`Select ${c.contact_name}`}
                    />
                  </td>
                  <td style={{ minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <strong>{c.contact_name}</strong>
                      {c.is_confidential && (
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
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.account_name}</div>
                  </td>
                  <td>
                    <select
                      className="form-input"
                      style={{ padding: "4px 6px", fontSize: 12, width: 90 }}
                      value={c.office_id}
                      onChange={(e) => updateOffice(c.id, e.target.value)}
                    >
                      {offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
                    </select>
                  </td>
                  <td style={{ fontSize: 12, minWidth: 140 }}>
                    <div>{c.broker_name_snapshot}</div>
                    <div style={{ color: "var(--gray-400)" }}>{c.broker_phone_snapshot}</div>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(c.tags || []).map((t) => (
                        <span key={t} className={`contact-tag tag-${cls(t)}`}>{t}</span>
                      ))}
                      {(c.sectors || []).map((s) => (
                        <span key={s} className={`sector-badge sector-${cls(s)}`}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ position: "relative", textAlign: "right", width: 40 }}>
                    <button
                      type="button"
                      className="kebab-btn"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label={`Actions for ${c.contact_name}`}
                      onClick={() => setOpenMenuId(menuOpen ? null : c.id)}
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
                          <div
                            style={{
                              padding: "6px 12px 8px",
                              fontSize: 11,
                              color: "var(--gray-500)",
                              borderBottom: "1px solid var(--gray-100)",
                              marginBottom: 4
                            }}
                          >
                            Added {c.date_added}
                          </div>
                          <button
                            role="menuitem"
                            className="kebab-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              toggleConfidential(c.id, !c.is_confidential);
                            }}
                          >
                            {c.is_confidential ? "Unhide" : "Hide from other offices"}
                          </button>
                          <div className="kebab-sep" />
                          <button
                            role="menuitem"
                            className="kebab-item kebab-item-danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              remove(c.id);
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
