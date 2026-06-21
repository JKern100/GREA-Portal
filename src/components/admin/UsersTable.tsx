"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnlineIds } from "@/lib/presence";
import { SECTOR_OPTIONS } from "@/lib/types";
import type { Office, Profile, UserRole } from "@/lib/types";

export interface UsersTableAuthMeta {
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  invited_at: string | null;
}

export interface UsersTablePermissions {
  /** Show the office <select>. Off for office admin (their office is implicit). */
  canEditOffice: boolean;
  /** Show the role <select>. Off for office admin (can't promote). */
  canEditRole: boolean;
  /** Show the Impersonate button. Server enforces office-admin scope. */
  canImpersonate: boolean;
  /** Show the Delete button. Currently superadmin-only. */
  canDelete: boolean;
}

export interface PendingResetMeta {
  /** Most recent unresolved request timestamp for this user. */
  requested_at: string;
}

interface Props {
  profiles: Profile[];
  offices: Office[];
  authMeta: Record<string, UsersTableAuthMeta>;
  /**
   * Map keyed by user id of currently-unresolved password-reset requests
   * (initiated by the user via /login → "Forgot password?"). Renders a
   * "Reset requested" badge on the row so the admin knows to act.
   */
  pendingResets?: Record<string, PendingResetMeta>;
  /** The real signed-in user's id — used for "you" tag and self-guards. */
  currentUserId: string;
  permissions: UsersTablePermissions;
}

const ROLES: UserRole[] = ["broker", "office_admin", "superadmin"];

const SECTOR_CLASS: Record<string, string> = {
  Multifamily: "sector-multifamily",
  "Affordable Housing": "sector-affordable-housing",
  "Student Housing": "sector-student-housing",
  "Capital Services": "sector-capital-services",
  General: "sector-general"
};

const STATUS_BADGE_BASE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  padding: "2px 8px",
  borderRadius: 10,
  whiteSpace: "nowrap"
};
const STATUS_BADGE: Record<"registered" | "pending" | "reset", CSSProperties> = {
  registered: { ...STATUS_BADGE_BASE, background: "#dcfce7", color: "#166534" },
  pending: { ...STATUS_BADGE_BASE, background: "#fef3c7", color: "#92400e" },
  reset: { ...STATUS_BADGE_BASE, background: "#ffe4e6", color: "#9f1239" }
};

function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? e.slice(0, 2).toUpperCase() : "?";
}

interface LinkResult {
  email: string;
  /** For invite/reset this is a URL; for "password" it's the temp password. */
  url: string | null;
  mode: "invite" | "reset" | "password";
}

export default function UsersTable({
  profiles: initial,
  offices,
  authMeta,
  pendingResets,
  currentUserId,
  permissions
}: Props) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [settingPw, setSettingPw] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // Read live presence from the shared store updated by PresenceBeacon.
  // We can't open our own channel here — Supabase returns the same
  // channel by name and would reject a second .on("presence") call.
  const onlineIds = useOnlineIds();
  const effectiveOnlineIds = new Set(onlineIds);
  if (currentUserId) effectiveOnlineIds.add(currentUserId);
  const onlineCount = profiles.reduce(
    (n, p) => (effectiveOnlineIds.has(p.id) ? n + 1 : n),
    0
  );

  async function updateProfile(id: string, patch: Partial<Profile>) {
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
    setLinkResult(null);
    setLinkCopied(false);
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
    setLinkResult({ email: p.email, url: body.inviteUrl ?? null, mode: "invite" });
  }

  async function sendResetLink(p: Profile) {
    setLinkResult(null);
    setLinkCopied(false);
    setResetting(p.id);
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: p.id })
    });
    setResetting(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? "Failed to create a reset link.");
      return;
    }
    setLinkResult({ email: p.email, url: body.resetUrl ?? null, mode: "reset" });
    // The endpoint clears any open password_reset_requests for this user;
    // refresh so the "Reset requested" badge disappears from the row.
    router.refresh();
  }

  async function setDirectPassword(p: Profile) {
    if (
      !confirm(
        `Set a temporary password for ${p.name || p.email}? This bypasses email links — you'll get a password to share with them directly, and they can change it after signing in.`
      )
    ) {
      return;
    }
    setLinkResult(null);
    setLinkCopied(false);
    setSettingPw(p.id);
    const res = await fetch("/api/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: p.id })
    });
    setSettingPw(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? "Failed to set a password.");
      return;
    }
    setLinkResult({ email: p.email, url: body.password ?? null, mode: "password" });
    router.refresh();
  }

  async function copyLink() {
    if (!linkResult?.url) return;
    try {
      await navigator.clipboard.writeText(linkResult.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      const el = document.getElementById("link-result-input") as HTMLInputElement | null;
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
    router.push("/pipeline");
    router.refresh();
  }

  const detailsProfile = detailsId ? profiles.find((p) => p.id === detailsId) ?? null : null;

  return (
    <>
      {linkResult && (
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
              {linkResult.mode === "reset"
                ? `Password reset link for ${linkResult.email}`
                : linkResult.mode === "password"
                  ? `Temporary password for ${linkResult.email}`
                  : `Fresh invite link for ${linkResult.email}`}
            </div>
            <button
              type="button"
              onClick={() => setLinkResult(null)}
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
          {linkResult.url ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="link-result-input"
                  readOnly
                  value={linkResult.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="form-input"
                  style={{ flex: 1, fontSize: 12, fontFamily: "monospace" }}
                />
                <button
                  className="btn-outline"
                  style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                  onClick={copyLink}
                >
                  {linkCopied ? "Copied!" : linkResult.mode === "password" ? "Copy password" : "Copy link"}
                </button>
              </div>
              {linkResult.mode === "reset" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#065f46" }}>
                  Share this link with the user. It expires after 24 hours and can only be used once.
                </div>
              )}
              {linkResult.mode === "password" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#065f46" }}>
                  Share this password with the user privately (not over the same email that may scan links).
                  They can sign in with it right away and change it afterward.
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
              No URL came back from Supabase. Check the project&apos;s Auth settings.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "visible" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: "1px solid var(--gray-100)",
            fontSize: 12,
            color: "var(--gray-600)"
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#16a34a",
              boxShadow: "0 0 0 3px rgba(22,163,74,0.15)"
            }}
          />
          <span>
            <strong style={{ color: "var(--navy)" }}>{onlineCount} online</strong>
            <span style={{ color: "var(--gray-400)" }}> · {profiles.length} total</span>
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>User</th>
              {permissions.canEditOffice && <th>Office</th>}
              <th>Role</th>
              <th>Status</th>
              <th style={{ textAlign: "center" }}>Active</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isSelf = p.id === currentUserId;
              // A protected (owner) account can't be edited or acted on by
              // anyone else — mirror the server guards in the UI so other
              // admins don't see controls that would just error.
              const protectedLocked = p.is_protected && !isSelf;
              const meta = authMeta[p.id];
              // "Onboarded" = actually finished registering (set a password),
              // not merely had a verification link opened. This is the honest
              // signal for the status badge and the invite-vs-reset choice.
              const onboarded = !!p.onboarded_at;
              const isOnline = effectiveOnlineIds.has(p.id);
              const menuOpen = openMenuId === p.id;
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--navy)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {p.name || <span style={{ color: "var(--gray-400)", fontWeight: 400 }}>Add name</span>}
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            color: "var(--gray-600)"
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 220
                            }}
                          >
                            {p.email}
                          </span>
                          {isSelf && <span style={{ color: "var(--gold)", fontWeight: 600 }}>you</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  {permissions.canEditOffice && (
                    <td>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select
                          className="form-input"
                          style={{ padding: "4px 8px", fontSize: 13, width: 110 }}
                          value={p.office_id ?? ""}
                          disabled={protectedLocked}
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
                  )}
                  <td>
                    {permissions.canEditRole && !protectedLocked ? (
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
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--gray-700)", textTransform: "capitalize" }}>
                        {p.role.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {onboarded ? (
                        <span
                          title={
                            meta?.last_sign_in_at
                              ? `Last signed in ${new Date(meta.last_sign_in_at).toLocaleString()}`
                              : "Completed registration."
                          }
                          style={STATUS_BADGE.registered}
                        >
                          Registered
                        </span>
                      ) : (
                        <span
                          title={
                            meta?.invited_at
                              ? `Invited ${new Date(meta.invited_at).toLocaleString()} — hasn't signed in and set their own password yet.`
                              : "Hasn't signed in and set their own password yet."
                          }
                          style={STATUS_BADGE.pending}
                        >
                          Pending
                        </span>
                      )}
                      {p.is_protected && (
                        <span
                          title="Protected owner — can't be demoted, deactivated, deleted, reset, or impersonated by other admins."
                          style={{ ...STATUS_BADGE_BASE, background: "#e0e7ff", color: "#3730a3" }}
                        >
                          Protected
                        </span>
                      )}
                      {pendingResets?.[p.id] && (
                        <span
                          title={`Asked for a password reset on ${new Date(
                            pendingResets[p.id]!.requested_at
                          ).toLocaleString()}. Use the row menu → 'Reset password' to issue a one-time link.`}
                          style={STATUS_BADGE.reset}
                        >
                          Reset requested
                        </span>
                      )}
                      {saving === p.id && (
                        <span style={{ color: "var(--gray-400)", fontSize: 11 }}>saving…</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <label
                      className="toggle-switch"
                      title={
                        isSelf
                          ? "You can't deactivate your own account."
                          : protectedLocked
                            ? "This account is protected and can't be deactivated by another admin."
                            : p.is_active
                              ? "Active"
                              : "Inactive"
                      }
                      style={isSelf || protectedLocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={!!p.is_active}
                        disabled={isSelf || protectedLocked}
                        onChange={(e) => updateProfile(p.id, { is_active: e.target.checked })}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ position: "relative", textAlign: "right", width: 40 }}>
                    <button
                      type="button"
                      className="kebab-btn"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label="Row actions"
                      onClick={() => setOpenMenuId(menuOpen ? null : p.id)}
                    >
                      ⋯
                    </button>
                    {menuOpen && (
                      <>
                        <div
                          onClick={() => setOpenMenuId(null)}
                          style={{ position: "fixed", inset: 0, zIndex: 30 }}
                        />
                        <div role="menu" className="kebab-menu">
                          <button
                            role="menuitem"
                            className="kebab-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              setDetailsId(p.id);
                            }}
                          >
                            Edit details…
                          </button>
                          {!isSelf && !protectedLocked &&
                            (!onboarded ? (
                              <button
                                role="menuitem"
                                className="kebab-item"
                                disabled={resending === p.id}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  resendInvite(p);
                                }}
                              >
                                {resending === p.id ? "Working…" : "Copy invite link"}
                              </button>
                            ) : (
                              <button
                                role="menuitem"
                                className="kebab-item"
                                disabled={resetting === p.id || !p.is_active}
                                title={
                                  !p.is_active
                                    ? "Reactivate this user before issuing a password reset."
                                    : undefined
                                }
                                onClick={() => {
                                  setOpenMenuId(null);
                                  sendResetLink(p);
                                }}
                              >
                                {resetting === p.id ? "Working…" : "Reset password"}
                              </button>
                            ))}
                          {!isSelf && !protectedLocked && (
                            <button
                              role="menuitem"
                              className="kebab-item"
                              disabled={settingPw === p.id}
                              title="Set a password directly and share it with the user — bypasses email links (useful when link scanners consume invite/reset links)."
                              onClick={() => {
                                setOpenMenuId(null);
                                setDirectPassword(p);
                              }}
                            >
                              {settingPw === p.id ? "Working…" : "Set password directly"}
                            </button>
                          )}
                          {!isSelf && !protectedLocked && permissions.canImpersonate && (
                            <button
                              role="menuitem"
                              className="kebab-item"
                              disabled={impersonating === p.id || deleting === p.id}
                              onClick={() => {
                                setOpenMenuId(null);
                                impersonate(p.id);
                              }}
                            >
                              {impersonating === p.id ? "Working…" : "Impersonate"}
                            </button>
                          )}
                          {!isSelf && !protectedLocked && permissions.canDelete && (
                            <>
                              <div className="kebab-sep" />
                              <button
                                role="menuitem"
                                className="kebab-item kebab-item-danger"
                                disabled={deleting === p.id || impersonating === p.id}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  deleteUser(p);
                                }}
                              >
                                {deleting === p.id ? "Working…" : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailsProfile && (
        <div className="modal-overlay" onClick={() => setDetailsId(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" aria-label="Close" onClick={() => setDetailsId(null)}>
              ×
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--navy)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                {initialsFor(detailsProfile.name, detailsProfile.email)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>
                  {detailsProfile.name || "Unnamed user"}
                </div>
                <div style={{ fontSize: 12, color: "var(--gray-600)" }}>{detailsProfile.email}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Name</label>
              <input
                key={`name-${detailsProfile.id}`}
                className="form-input"
                defaultValue={detailsProfile.name ?? ""}
                placeholder="Add name"
                onBlur={(e) =>
                  e.target.value !== (detailsProfile.name ?? "") &&
                  updateProfile(detailsProfile.id, { name: e.target.value })
                }
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Title</label>
              <input
                key={`title-${detailsProfile.id}`}
                className="form-input"
                defaultValue={detailsProfile.title ?? ""}
                placeholder="—"
                onBlur={(e) =>
                  e.target.value !== (detailsProfile.title ?? "") &&
                  updateProfile(detailsProfile.id, { title: e.target.value })
                }
              />
            </div>

            <div>
              <label className="form-label">Specialties</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {SECTOR_OPTIONS.map((s) => {
                  const current = detailsProfile.specialties ?? [];
                  const checked = current.includes(s);
                  const sectorClass = SECTOR_CLASS[s] ?? "sector-general";
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const next = checked
                          ? current.filter((x) => x !== s)
                          : Array.from(new Set([...current, s]));
                        updateProfile(detailsProfile.id, { specialties: next });
                      }}
                      className={checked ? `sector-badge ${sectorClass}` : "sector-badge sector-unselected"}
                      style={{ cursor: "pointer", opacity: checked ? 1 : 0.55, transition: "opacity 0.12s" }}
                      aria-pressed={checked}
                      title={checked ? `Remove ${s}` : `Add ${s}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {saving === detailsProfile.id && (
              <div style={{ marginTop: 14, color: "var(--gray-400)", fontSize: 12 }}>saving…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
