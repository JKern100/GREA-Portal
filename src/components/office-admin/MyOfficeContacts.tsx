"use client";

import { useEffect, useMemo, useState } from "react";
import { revalidateVisibilityCaches } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import type { ContactRecord } from "@/lib/types";
import ContactsImportModal from "./ContactsImportModal";

interface Props {
  contacts: ContactRecord[];
}

export default function MyOfficeContacts({ contacts: initial }: Props) {
  const [contacts, setContacts] = useState(initial);
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);

  // After a bulk import the modal calls router.refresh(), which re-runs the
  // server component and produces a fresh `initial` prop. Sync it down so the
  // table reflects the new data without requiring a full page reload.
  useEffect(() => {
    setContacts(initial);
  }, [initial]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.contact_name.toLowerCase().includes(q) ||
        c.account_name.toLowerCase().includes(q) ||
        (c.broker_name_snapshot || "").toLowerCase().includes(q) ||
        (c.contact_email || "").toLowerCase().includes(q)
    );
  }, [contacts, query]);

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
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Office Contacts ({contacts.length})</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <a className="btn-outline" href="/api/contacts/export?format=csv">
            Export CSV
          </a>
          <a className="btn-outline" href="/api/contacts/export?format=xlsx">
            Export Excel
          </a>
          <a className="btn-outline" href="/api/contacts/template?format=csv">
            Download template
          </a>
          <button className="btn-primary" onClick={() => setShowImport(true)}>
            Upload contacts
          </button>
          <input
            className="form-input"
            style={{ width: 240 }}
            placeholder="Filter contacts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Account</th>
            <th>Broker</th>
            <th>Added</th>
            <th style={{ textAlign: "center" }}>Hide</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.contact_name}</strong>
                {c.relationship_status && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      padding: "1px 7px",
                      borderRadius: 10,
                      background: "var(--gray-100)",
                      color: "var(--gray-700)"
                    }}
                  >
                    {c.relationship_status}
                  </span>
                )}
              </td>
              <td>{c.account_name}</td>
              <td style={{ fontSize: 12 }}>{c.broker_name_snapshot || "—"}</td>
              <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.date_added}</td>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={c.is_confidential}
                  onChange={(e) => toggleConfidential(c.id, e.target.checked)}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                No contacts match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showImport && <ContactsImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
