"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Office, Profile } from "@/lib/types";

interface Props {
  office: Office;
  members: Profile[];
  currentUserId: string;
}

export default function MyOfficeAdmin({ office: initialOffice, members: initialMembers, currentUserId }: Props) {
  const router = useRouter();
  const [office, setOffice] = useState(initialOffice);
  const [members, setMembers] = useState(initialMembers);

  const [toggling, setToggling] = useState(false);
  const [toggleErr, setToggleErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

  async function toggleCanAddContacts(next: boolean) {
    setToggling(true);
    setToggleErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("offices")
      .update({ can_add_contacts: next })
      .eq("id", office.id)
      .select()
      .single();
    setToggling(false);
    if (error) {
      setToggleErr(error.message);
      return;
    }
    if (data) setOffice(data as Office);
  }

  async function sendInvite() {
    setInviteErr(null);
    setInviteOk(null);
    const email = inviteEmail.trim();
    if (!email) {
      setInviteErr("Email is required.");
      return;
    }
    setInviting(true);
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name: inviteName.trim() || undefined })
    });
    setInviting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteErr(body.error ?? "Failed to send invite.");
      return;
    }
    setInviteOk(`Invite sent to ${email}.`);
    setInviteEmail("");
    setInviteName("");
    router.refresh();
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>
        My Office — {office.code} <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>({office.name})</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Manage your office&apos;s settings and invite brokers to the portal.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
          Office Permissions
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={office.can_add_contacts}
            disabled={toggling}
            onChange={(e) => toggleCanAddContacts(e.target.checked)}
          />
          <span>
            <strong>Brokers can add contacts</strong>
            <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
              When disabled, only you (and superadmins) can add new contacts for this office.
            </div>
          </span>
        </label>
        {toggleErr && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{toggleErr}</div>}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
          Invite Broker
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="form-label">Email *</label>
            <input
              className="form-input"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="broker@example.com"
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Jane Broker"
            />
          </div>
          <button className="btn-primary" onClick={sendInvite} disabled={inviting}>
            {inviting ? "Sending…" : "Send Invite"}
          </button>
        </div>
        {inviteErr && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{inviteErr}</div>}
        {inviteOk && <div style={{ color: "#15803d", fontSize: 12, marginTop: 8 }}>{inviteOk}</div>}
        <p style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 10 }}>
          Invited users receive an email with a sign-in link and join as brokers in <strong>{office.code}</strong>.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          Office Members ({members.length})
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name || "—"}</td>
                <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                  {m.email}
                  {m.id === currentUserId && (
                    <span style={{ marginLeft: 6, color: "var(--gold)", fontWeight: 600 }}>(you)</span>
                  )}
                </td>
                <td style={{ textTransform: "capitalize" }}>{m.role.replace("_", " ")}</td>
                <td>{m.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                  No members yet. Invite brokers above to populate your office.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
