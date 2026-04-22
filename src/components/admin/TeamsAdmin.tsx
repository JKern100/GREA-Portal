"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SpecialtyTeam } from "@/lib/types";

interface Membership {
  team_id: string;
  profile_id: string;
}

interface Props {
  teams: SpecialtyTeam[];
  profiles: Profile[];
  memberships: Membership[];
}

export default function TeamsAdmin({ teams: initialTeams, profiles, memberships: initialMem }: Props) {
  const [teams, setTeams] = useState(initialTeams);
  const [memberships, setMemberships] = useState(initialMem);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#1a6fb5");

  async function addTeam() {
    if (!newName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("specialty_teams")
      .insert({ name: newName.trim(), description: newDesc.trim(), color: newColor })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      setTeams((prev) => [...prev, data as SpecialtyTeam]);
      setNewName("");
      setNewDesc("");
    }
  }

  async function updateTeam(id: string, patch: Partial<SpecialtyTeam>) {
    const supabase = createClient();
    const { data, error } = await supabase.from("specialty_teams").update(patch).eq("id", id).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setTeams((prev) => prev.map((t) => (t.id === id ? (data as SpecialtyTeam) : t)));
  }

  async function deleteTeam(id: string) {
    if (!confirm("Delete this specialty team?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("specialty_teams").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setTeams((prev) => prev.filter((t) => t.id !== id));
    setMemberships((prev) => prev.filter((m) => m.team_id !== id));
  }

  async function toggleMember(teamId: string, profileId: string, checked: boolean) {
    const supabase = createClient();
    if (checked) {
      const { error } = await supabase.from("specialty_team_members").insert({ team_id: teamId, profile_id: profileId });
      if (error) {
        alert(error.message);
        return;
      }
      setMemberships((prev) => [...prev, { team_id: teamId, profile_id: profileId }]);
    } else {
      const { error } = await supabase
        .from("specialty_team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("profile_id", profileId);
      if (error) {
        alert(error.message);
        return;
      }
      setMemberships((prev) => prev.filter((m) => !(m.team_id === teamId && m.profile_id === profileId)));
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Specialty Teams</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Cross-office groups (e.g., Capital Services, Affordable Housing) shown on deal-detail pages.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Add Team</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 110px auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Color</label>
            <input type="color" className="form-input" style={{ padding: 2, height: 36 }} value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={addTeam}>Add</button>
        </div>
      </div>

      {teams.map((t) => (
        <div key={t.id} className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${t.color}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 110px auto auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label className="form-label">Name</label>
              <input
                className="form-input"
                defaultValue={t.name}
                onBlur={(e) => e.target.value !== t.name && updateTeam(t.id, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Description</label>
              <input
                className="form-input"
                defaultValue={t.description}
                onBlur={(e) => e.target.value !== t.description && updateTeam(t.id, { description: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Color</label>
              <input
                type="color"
                className="form-input"
                style={{ padding: 2, height: 36 }}
                defaultValue={t.color}
                onBlur={(e) => e.target.value !== t.color && updateTeam(t.id, { color: e.target.value })}
              />
            </div>
            <button className="btn-danger" onClick={() => deleteTeam(t.id)}>Delete</button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>Members</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {profiles.map((p) => {
                const checked = memberships.some((m) => m.team_id === t.id && m.profile_id === p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 20,
                      border: "1px solid " + (checked ? t.color : "var(--gray-300)"),
                      background: checked ? `${t.color}15` : "white",
                      fontSize: 12,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleMember(t.id, p.id, e.target.checked)}
                      style={{ margin: 0 }}
                    />
                    {p.name || p.email}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
