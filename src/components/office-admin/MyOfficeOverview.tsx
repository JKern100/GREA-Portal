"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UsersTable, { PendingResetMeta, UsersTableAuthMeta } from "@/components/admin/UsersTable";
import type { Office, Profile } from "@/lib/types";

interface Props {
  office: Office;
  members: Profile[];
  currentUserId: string;
  authMeta: Record<string, UsersTableAuthMeta>;
  pendingResets?: Record<string, PendingResetMeta>;
}

export default function MyOfficeOverview({ office, members, currentUserId, authMeta, pendingResets }: Props) {
  const router = useRouter();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
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
      body: JSON.stringify({ email, name: inviteName.trim() || undefined })
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
      const el = document.getElementById("office-invite-link-input") as HTMLInputElement | null;
      el?.select();
    }
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
        {inviteResult ? (
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
                  Copy this link and send it to the broker through Slack, email, or however you reach them. It
                  signs them in as a broker in <strong>{office.code}</strong> and lets them set a password. Links
                  expire after 24 hours and can only be used once — generate a fresh one if needed.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id="office-invite-link-input"
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
                The user was created, but no invite link came back from Supabase. Check the project&apos;s Auth
                settings.
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 10 }}>
            New brokers join <strong>{office.code}</strong>. After you click Send Invite, copy the sign-in link
            that appears and share it with them.
          </p>
        )}
      </div>

      <UsersTable
        profiles={members}
        offices={[office]}
        authMeta={authMeta}
        pendingResets={pendingResets}
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
