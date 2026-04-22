"use client";

import { useMemo, useState } from "react";
import type { ContactRecord } from "@/lib/types";

interface Props {
  contacts: ContactRecord[];
  office: string;
  onClose: () => void;
}

type SortField = "contact_name" | "account_name" | "broker_name_snapshot" | "tags" | "sectors" | "date_added" | "listing";

function cls(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-");
}

export default function MyOfficeModal({ contacts, office, onClose }: Props) {
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("contact_name");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = contacts;
    if (q) {
      list = list.filter(
        (c) =>
          c.contact_name.toLowerCase().includes(q) ||
          c.account_name.toLowerCase().includes(q) ||
          (c.broker_name_snapshot || "").toLowerCase().includes(q) ||
          (c.note || "").toLowerCase().includes(q) ||
          (c.listing || "").toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          (c.sectors || []).some((s) => s.toLowerCase().includes(q))
      );
    }
    const sorted = [...list].sort((a, b) => {
      let va: string, vb: string;
      if (sortField === "tags") {
        va = (a.tags || []).join(",");
        vb = (b.tags || []).join(",");
      } else if (sortField === "sectors") {
        va = (a.sectors || []).join(",");
        vb = (b.sectors || []).join(",");
      } else {
        va = ((a as unknown as Record<string, unknown>)[sortField] ?? "") as string;
        vb = ((b as unknown as Record<string, unknown>)[sortField] ?? "") as string;
      }
      const res = va.toLowerCase().localeCompare(vb.toLowerCase());
      return sortAsc ? res : -res;
    });
    return sorted;
  }, [contacts, filter, sortField, sortAsc]);

  function setSort(f: SortField) {
    if (f === sortField) setSortAsc(!sortAsc);
    else {
      setSortField(f);
      setSortAsc(true);
    }
  }

  function arrow(f: SortField) {
    if (f !== sortField) return "";
    return sortAsc ? "▲" : "▼";
  }

  function exportCSV() {
    const headers = ["Contact", "Account", "Broker", "Phone", "Tags", "Sectors", "Date Added", "Note", "Listing"];
    const rows = filtered.map((c) => [
      c.contact_name,
      c.account_name,
      c.broker_name_snapshot || "",
      c.broker_phone_snapshot || "",
      (c.tags || []).join("; "),
      (c.sectors || []).join("; "),
      c.date_added,
      c.note || "",
      c.listing || ""
    ]);
    const csv = [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${office || "contacts"}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 960 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, color: "var(--navy)" }}>{office} Contacts</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 14 }}>
          All contacts contributed by the {office} office
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input
            className="form-input"
            placeholder="Filter contacts…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-gold" onClick={exportCSV}>Export CSV</button>
        </div>

        <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 10 }}>
          Showing {filtered.length} of {contacts.length}
        </div>

        <div style={{ maxHeight: "60vh", overflow: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => setSort("contact_name")}>Contact {arrow("contact_name")}</th>
                <th onClick={() => setSort("account_name")}>Account {arrow("account_name")}</th>
                <th onClick={() => setSort("broker_name_snapshot")}>Broker {arrow("broker_name_snapshot")}</th>
                <th onClick={() => setSort("tags")}>Tags {arrow("tags")}</th>
                <th onClick={() => setSort("sectors")}>Sectors {arrow("sectors")}</th>
                <th onClick={() => setSort("date_added")}>Added {arrow("date_added")}</th>
                <th onClick={() => setSort("listing")}>Listing {arrow("listing")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--gray-400)" }}>
                    No contacts match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.contact_name}</strong></td>
                    <td>{c.account_name}</td>
                    <td>
                      {c.broker_name_snapshot}
                      <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{c.broker_phone_snapshot}</div>
                    </td>
                    <td>
                      {(c.tags || []).map((t) => (
                        <span key={t} className={`contact-tag tag-${cls(t)}`} style={{ marginRight: 4 }}>
                          {t}
                        </span>
                      ))}
                    </td>
                    <td>
                      {(c.sectors || []).map((s) => (
                        <span key={s} className={`sector-badge sector-${cls(s)}`} style={{ marginRight: 4 }}>
                          {s}
                        </span>
                      ))}
                    </td>
                    <td>{c.date_added}</td>
                    <td>{c.listing || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
