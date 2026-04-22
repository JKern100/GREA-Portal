"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Office, Profile, UserRole } from "@/lib/types";

interface Props {
  profiles: Profile[];
  offices: Office[];
}

const ROLES: UserRole[] = ["broker", "office_admin", "superadmin"];

export default function UsersAdmin({ profiles: initial, offices }: Props) {
  const [profiles, setProfiles] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function updateProfile(id: string, patch: Partial<Profile>) {
    setSaving(id);
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select().single();
    setSaving(null);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      setProfiles((prev) => prev.map((p) => (p.id === id ? (data as Profile) : p)));
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Users</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Assign offices and roles. Users are created by signing up at /login — new accounts default to <strong>broker</strong>.
      </p>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Office</th>
              <th>Role</th>
              <th>Title</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    className="form-input"
                    style={{ padding: "4px 8px", fontSize: 13 }}
                    defaultValue={p.name}
                    onBlur={(e) => e.target.value !== p.name && updateProfile(p.id, { name: e.target.value })}
                  />
                </td>
                <td style={{ color: "var(--gray-500)", fontSize: 12 }}>{p.email}</td>
                <td>
                  <select
                    className="form-input"
                    style={{ padding: "4px 8px", fontSize: 13, width: 120 }}
                    value={p.office_id ?? ""}
                    onChange={(e) => updateProfile(p.id, { office_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="form-input"
                    style={{ padding: "4px 8px", fontSize: 13, width: 140 }}
                    value={p.role}
                    onChange={(e) => updateProfile(p.id, { role: e.target.value as UserRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="form-input"
                    style={{ padding: "4px 8px", fontSize: 13 }}
                    defaultValue={p.title ?? ""}
                    onBlur={(e) => e.target.value !== (p.title ?? "") && updateProfile(p.id, { title: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.is_active}
                    onChange={(e) => updateProfile(p.id, { is_active: e.target.checked })}
                  />
                  {saving === p.id && <span style={{ marginLeft: 6, color: "var(--gray-400)", fontSize: 11 }}>saving…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
