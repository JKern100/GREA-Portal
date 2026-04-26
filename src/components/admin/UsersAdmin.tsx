"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SECTOR_OPTIONS } from "@/lib/types";
import type { Office, Profile, UserRole } from "@/lib/types";

interface Props {
  profiles: Profile[];
  offices: Office[];
  realProfileId: string;
}

const ROLES: UserRole[] = ["broker", "office_admin", "superadmin"];

export default function UsersAdmin({ profiles: initial, offices, realProfileId }: Props) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("broker");
  const [inviteOfficeId, setInviteOfficeId] = useState<string>("");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; url: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  async function sendInvite() {
    setInviteErr(null);
    setInviteResult(null);
    setCopied(false);
    const email = inviteEmail.trim();
    if (!email) {
      setInviteErr("Email is required.");
      return;
    }
    setInviting(true);
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        name: inviteName.trim() || undefined,
        role: inviteRole,
        officeId: inviteOfficeId || null
      })
    });
    setInviting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteErr(body.error ?? "Failed to create invite.");
      return;
    }
    setInviteResult({ email, url: body.inviteUrl ?? null });
    setInviteEmail("");
    setInviteName("");
    router.refresh();
  }

  async function copyInviteLink() {
    if (!inviteResult?.url) return;
    try {
      await navigator.clipboard.writeText(inviteResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard can fail in non-secure contexts; fall back to
      // selecting the input so the admin can copy manually.
      const el = document.getElementById("invite-link-input") as HTMLInputElement | null;
      el?.select();
    }
  }

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

  async function impersonate(id: string) {
    setImpersonating(id);
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: id })
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error || "Failed to impersonate");
      setImpersonating(null);
      return;
    }
    router.push("/contacts");
    router.refresh();
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Users</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Assign offices and roles, or invite users directly below. Click <strong>Impersonate</strong> to see the app as that
        user; a banner will appear at the top of every page and a Stop button returns you to your own view.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Invite User</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">Email *</label>
            <input
              className="form-input"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select
              className="form-input"
              style={{ width: 150 }}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Office</label>
            <select
              className="form-input"
              style={{ width: 140 }}
              value={inviteOfficeId}
              onChange={(e) => setInviteOfficeId(e.target.value)}
            >
              <option value="">—</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={sendInvite} disabled={inviting}>
            {inviting ? "Creating…" : "Create Invite"}
          </button>
        </div>
        {inviteErr && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{inviteErr}</div>}
        {inviteResult && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              fontSize: 13
            }}
          >
            <div style={{ color: "#065f46", fontWeight: 600, marginBottom: 6 }}>
              Invite created for {inviteResult.email}
            </div>
            {inviteResult.url ? (
              <>
                <div style={{ fontSize: 12, color: "var(--gray-700)", marginBottom: 8 }}>
                  Share this link through Slack, email, or however you reach them. It signs them in and lets them set a password. Links expire after about an hour and can only be used once — generate a fresh one if needed.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id="invite-link-input"
                    readOnly
                    value={inviteResult.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="form-input"
                    style={{ flex: 1, fontSize: 12, fontFamily: "monospace" }}
                  />
                  <button
                    className="btn-outline"
                    style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                    onClick={copyInviteLink}
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                The user was created, but no invite link came back from Supabase. Check the project&apos;s Auth settings.
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Office</th>
              <th>Role</th>
              <th>Title</th>
              <th>Specialties</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isSelf = p.id === realProfileId;
              return (
                <tr key={p.id}>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: 13 }}
                      defaultValue={p.name}
                      onBlur={(e) => e.target.value !== p.name && updateProfile(p.id, { name: e.target.value })}
                    />
                  </td>
                  <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                    {p.email}
                    {isSelf && <span style={{ marginLeft: 6, color: "var(--gold)", fontWeight: 600 }}>(you)</span>}
                  </td>
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 220 }}>
                      {SECTOR_OPTIONS.map((s) => {
                        const checked = (p.specialties ?? []).includes(s);
                        return (
                          <label
                            key={s}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 7px",
                              borderRadius: 12,
                              border: "1px solid " + (checked ? "var(--navy)" : "var(--gray-300)"),
                              background: checked ? "var(--navy)" : "white",
                              color: checked ? "white" : "var(--gray-700)",
                              fontSize: 11,
                              cursor: "pointer"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...(p.specialties ?? []), s]))
                                  : (p.specialties ?? []).filter((x) => x !== s);
                                updateProfile(p.id, { specialties: next });
                              }}
                              style={{ display: "none" }}
                            />
                            {s}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      onChange={(e) => updateProfile(p.id, { is_active: e.target.checked })}
                    />
                    {saving === p.id && <span style={{ marginLeft: 6, color: "var(--gray-400)", fontSize: 11 }}>saving…</span>}
                  </td>
                  <td>
                    {!isSelf && (
                      <button
                        className="btn-outline"
                        style={{ padding: "3px 10px", fontSize: 11 }}
                        disabled={impersonating === p.id}
                        onClick={() => impersonate(p.id)}
                      >
                        {impersonating === p.id ? "…" : "Impersonate"}
                      </button>
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
