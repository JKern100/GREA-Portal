"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UsersTable, { UsersTableAuthMeta } from "@/components/admin/UsersTable";
import type { Office, Profile } from "@/lib/types";

interface Props {
  office: Office;
  members: Profile[];
  currentUserId: string;
  authMeta: Record<string, UsersTableAuthMeta>;
}

export default function MyOfficeOverview({ office, members, currentUserId, authMeta }: Props) {
  const router = useRouter();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

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
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Invite Broker</div>
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

      <UsersTable
        profiles={members}
        offices={[office]}
        authMeta={authMeta}
        currentUserId={currentUserId}
        permissions={{
          canEditOffice: false,
          canEditRole: false,
          canImpersonate: true,
          canDelete: false
        }}
      />
    </div>
  );
}
