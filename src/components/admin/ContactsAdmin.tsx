"use client";

import { useMemo, useState } from "react";
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

  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

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

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Account</th>
              <th>Office</th>
              <th>Broker</th>
              <th>Tags</th>
              <th>Sectors</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const office = officeById[c.office_id];
              return (
                <tr key={c.id}>
                  <td><strong>{c.contact_name}</strong></td>
                  <td>{c.account_name}</td>
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
                  <td style={{ fontSize: 12 }}>
                    {c.broker_name_snapshot}
                    <div style={{ color: "var(--gray-400)" }}>{c.broker_phone_snapshot}</div>
                  </td>
                  <td>
                    {(c.tags || []).map((t) => (
                      <span key={t} className={`contact-tag tag-${cls(t)}`} style={{ marginRight: 4 }}>{t}</span>
                    ))}
                  </td>
                  <td>
                    {(c.sectors || []).map((s) => (
                      <span key={s} className={`sector-badge sector-${cls(s)}`} style={{ marginRight: 4 }}>{s}</span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>{c.date_added}</td>
                  <td><button className="btn-danger" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => remove(c.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
