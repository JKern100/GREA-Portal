"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SECTOR_OPTIONS } from "@/lib/types";
import type { Office, Profile, UserRole } from "@/lib/types";

interface AuthMeta {
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  invited_at: string | null;
}

interface Props {
  profiles: Profile[];
  offices: Office[];
  realProfileId: string;
  authMeta: Record<string, AuthMeta>;
}

const ROLES: UserRole[] = ["broker", "office_admin", "superadmin"];

const SECTOR_CLASS: Record<string, string> = {
  Multifamily: "sector-multifamily",
  "Affordable Housing": "sector-affordable-housing",
  "Student Housing": "sector-student-housing",
  "Capital Services": "sector-capital-services",
  General: "sector-general"
};

function initialsFor(name: string | null | undefined, email: string): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

interface ResendResult {
  email: string;
  url: string | null;
}

export default function UsersAdmin({ profiles: initial, offices, realProfileId, authMeta }: Props) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<ResendResult | null>(null);
  const [resendCopied, setResendCopied] = useState(false);

  // Realtime presence: subscribe to the same "users:online" channel the
  // PresenceBeacon broadcasts on, and keep a local Set of currently-tracked
  // user ids. Unsubscribe on unmount.
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("users:online");
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.values(state).forEach((arr) => {
          (arr as { user_id?: string }[]).forEach((p) => {
            if (p.user_id) ids.add(p.user_id);
          });
        });
        setOnlineIds(ids);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    if ((inviteRole === "broker" || inviteRole === "office_admin") && !inviteOfficeId) {
      setInviteErr(`Pick an office for the ${inviteRole.replace("_", " ")} you're inviting.`);
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
    // Brokers and office admins must have an office_id — without one, their
    // /contacts query is empty and /my-office bounces them. Block at save
    // time so the row can't end up in that state through a stray click.
    const current = profiles.find((p) => p.id === id);
    if (current) {
      const nextRole = (patch.role ?? current.role) as UserRole;
      const nextOfficeId =
        patch.office_id !== undefined ? patch.office_id : current.office_id;
      if ((nextRole === "broker" || nextRole === "office_admin") && !nextOfficeId) {
        alert(
          `${nextRole.replace("_", " ")}s must be assigned to an office. Pick an office before changing the role, or change the role to superadmin if no office applies.`
        );
        return;
      }
    }

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

  async function resendInvite(p: Profile) {
    setResendResult(null);
    setResendCopied(false);
    setResending(p.id);
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: p.email,
        name: p.name || undefined,
        role: p.role,
        officeId: p.office_id ?? null
      })
    });
    setResending(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? "Failed to create a fresh invite link.");
      return;
    }
    setResendResult({ email: p.email, url: body.inviteUrl ?? null });
  }

  async function copyResendLink() {
    if (!resendResult?.url) return;
    try {
      await navigator.clipboard.writeText(resendResult.url);
      setResendCopied(true);
      setTimeout(() => setResendCopied(false), 2000);
    } catch {
      const el = document.getElementById("resend-link-input") as HTMLInputElement | null;
      el?.select();
    }
  }

  async function deleteUser(p: Profile) {
    const label = p.name || p.email;
    if (
      !confirm(
        `Delete ${label}? They'll be removed from auth and the user table. Their contacts and deals stay but become unassigned. This can't be undone.`
      )
    ) {
      return;
    }
    setDeleting(p.id);
    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: p.id })
    });
    setDeleting(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error || "Failed to delete user");
      return;
    }
    setProfiles((prev) => prev.filter((x) => x.id !== p.id));
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

      {resendResult && (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: 12,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ color: "#065f46", fontWeight: 600, fontSize: 13 }}>
              Fresh invite link for {resendResult.email}
            </div>
            <button
              type="button"
              onClick={() => setResendResult(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "var(--gray-500)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {resendResult.url ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="resend-link-input"
                readOnly
                value={resendResult.url}
                onFocus={(e) => e.currentTarget.select()}
                className="form-input"
                style={{ flex: 1, fontSize: 12, fontFamily: "monospace" }}
              />
              <button
                className="btn-outline"
                style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                onClick={copyResendLink}
              >
                {resendCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
              No URL came back from Supabase. Check the project&apos;s Auth settings.
            </div>
          )}
        </div>
      )}

      <div className="card users-admin-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table users-admin-table">
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>User</th>
              <th>Office</th>
              <th>Role</th>
              <th>Title</th>
              <th>Specialties</th>
              <th style={{ textAlign: "center" }}>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isSelf = p.id === realProfileId;
              const meta = authMeta[p.id];
              const hasSignedIn = !!meta?.last_sign_in_at;
              const isOnline = onlineIds.has(p.id);
              const specialties = p.specialties ?? [];
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div
                          aria-hidden
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "var(--navy)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.3
                          }}
                        >
                          {initialsFor(p.name, p.email)}
                        </div>
                        <span
                          title={isOnline ? "Online now" : "Offline"}
                          aria-label={isOnline ? "Online now" : "Offline"}
                          style={{
                            position: "absolute",
                            bottom: -1,
                            right: -1,
                            width: 11,
                            height: 11,
                            borderRadius: "50%",
                            background: isOnline ? "#16a34a" : "var(--gray-400)",
                            border: "2px solid white"
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          className="form-input user-name-input"
                          style={{ padding: "4px 8px", fontSize: 13, fontWeight: 600, color: "var(--navy)" }}
                          defaultValue={p.name ?? ""}
                          placeholder="Add name"
                          onBlur={(e) => e.target.value !== (p.name ?? "") && updateProfile(p.id, { name: e.target.value })}
                        />
                        <div
                          style={{
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            fontSize: 12,
                            color: "var(--gray-600)"
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.email}
                          </span>
                          {isSelf && <span style={{ color: "var(--gold)", fontWeight: 600 }}>you</span>}
                          {hasSignedIn ? (
                            <span
                              title={`Last signed in ${new Date(meta!.last_sign_in_at!).toLocaleString()}`}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                                padding: "2px 8px",
                                borderRadius: 10,
                                background: "#dcfce7",
                                color: "#166534"
                              }}
                            >
                              Registered
                            </span>
                          ) : (
                            <span
                              title={
                                meta?.invited_at
                                  ? `Invited ${new Date(meta.invited_at).toLocaleString()} — hasn't signed in yet.`
                                  : "Hasn't signed in yet."
                              }
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                                padding: "2px 8px",
                                borderRadius: 10,
                                background: "#fef3c7",
                                color: "#92400e"
                              }}
                            >
                              Pending
                            </span>
                          )}
                          {saving === p.id && (
                            <span style={{ color: "var(--gray-400)", fontSize: 11 }}>saving…</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        className="form-input"
                        style={{ padding: "4px 8px", fontSize: 13, width: 110 }}
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
                      {!p.office_id && (p.role === "broker" || p.role === "office_admin") && (
                        <span
                          title="This user can't see contacts or use My Office without an assigned office."
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            padding: "2px 7px",
                            borderRadius: 10,
                            background: "#fee2e2",
                            color: "#991b1b",
                            whiteSpace: "nowrap"
                          }}
                        >
                          Needs office
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <select
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: 13, width: 130 }}
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
                      style={{ padding: "4px 8px", fontSize: 13, minWidth: 120 }}
                      defaultValue={p.title ?? ""}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== (p.title ?? "") && updateProfile(p.id, { title: e.target.value })}
                    />
                  </td>
                  <td style={{ minWidth: 240, maxWidth: 320 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {SECTOR_OPTIONS.map((s) => {
                        const checked = specialties.includes(s);
                        const sectorClass = SECTOR_CLASS[s] ?? "sector-general";
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? specialties.filter((x) => x !== s)
                                : Array.from(new Set([...specialties, s]));
                              updateProfile(p.id, { specialties: next });
                            }}
                            className={checked ? `sector-badge ${sectorClass}` : "sector-badge sector-unselected"}
                            style={{
                              cursor: "pointer",
                              opacity: checked ? 1 : 0.55,
                              transition: "opacity 0.12s"
                            }}
                            aria-pressed={checked}
                            title={checked ? `Remove ${s}` : `Add ${s}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <label className="toggle-switch" title={p.is_active ? "Active" : "Inactive"}>
                      <input
                        type="checkbox"
                        checked={p.is_active}
                        onChange={(e) => updateProfile(p.id, { is_active: e.target.checked })}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {!isSelf && (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {!hasSignedIn && (
                          <button
                            className="btn-outline"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            disabled={resending === p.id}
                            onClick={() => resendInvite(p)}
                            title="Generate a fresh invite link for this user"
                          >
                            {resending === p.id ? "…" : "Copy invite link"}
                          </button>
                        )}
                        <button
                          className="btn-outline"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          disabled={impersonating === p.id || deleting === p.id}
                          onClick={() => impersonate(p.id)}
                        >
                          {impersonating === p.id ? "…" : "Impersonate"}
                        </button>
                        <button
                          className="btn-danger"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          disabled={deleting === p.id || impersonating === p.id}
                          onClick={() => deleteUser(p)}
                          title="Permanently delete this user"
                        >
                          {deleting === p.id ? "…" : "Delete"}
                        </button>
                      </div>
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
