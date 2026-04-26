"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { legibleTextOn } from "@/lib/officeColor";
import type { Office } from "@/lib/types";

interface Props {
  offices: Office[];
}

export default function OfficesAdmin({ offices: initial }: Props) {
  const [offices, setOffices] = useState(initial);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addOffice() {
    setErr(null);
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("offices")
      .insert({ code: newCode.trim().toUpperCase(), name: newName.trim() })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data) {
      setOffices((prev) => [...prev, data as Office]);
      setNewCode("");
      setNewName("");
    }
  }

  async function updateOffice(id: string, patch: Partial<Office>) {
    const supabase = createClient();
    const { data, error } = await supabase.from("offices").update(patch).eq("id", id).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setOffices((prev) => prev.map((o) => (o.id === id ? (data as Office) : o)));
  }

  async function deleteOffice(id: string) {
    if (!confirm("Delete this office? Contacts & deals in this office will also be deleted.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("offices").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setOffices((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Offices</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Manage the list of GREA offices.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Add Office</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Code</label>
            <input className="form-input" style={{ width: 100 }} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="NYC" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New York City" />
          </div>
          <button className="btn-primary" onClick={addOffice} disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{err}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Color</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => {
              const previewBg = o.color || "#f1f3f5";
              const previewFg = o.color ? legibleTextOn(o.color) : "var(--gray-600)";
              return (
                <tr key={o.id}>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: 13, width: 90 }}
                      defaultValue={o.code}
                      onBlur={(e) => e.target.value !== o.code && updateOffice(o.id, { code: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: 13 }}
                      defaultValue={o.name}
                      onBlur={(e) => e.target.value !== o.name && updateOffice(o.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="color"
                        value={o.color ?? "#e3f2fd"}
                        onChange={(e) => updateOffice(o.id, { color: e.target.value })}
                        title="Pick badge colour"
                        style={{
                          width: 32,
                          height: 28,
                          padding: 0,
                          border: "1px solid var(--gray-300)",
                          borderRadius: 4,
                          cursor: "pointer",
                          background: "transparent"
                        }}
                      />
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          background: previewBg,
                          color: previewFg,
                          border: o.color ? "none" : "1px dashed var(--gray-300)"
                        }}
                      >
                        {o.code || "—"}
                      </span>
                      {o.color && (
                        <button
                          className="btn-outline"
                          style={{ padding: "2px 8px", fontSize: 10 }}
                          onClick={() => updateOffice(o.id, { color: null })}
                          title="Clear custom colour and use the default styling"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn-danger" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => deleteOffice(o.id)}>
                      Delete
                    </button>
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
