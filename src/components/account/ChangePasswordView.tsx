"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  /** The real signed-in user's email (shown for confirmation). */
  email: string;
  /**
   * True when a superadmin is viewing as someone else. Changing the
   * password here affects the REAL signed-in account, not the impersonated
   * one — surface that so it isn't surprising.
   */
  impersonating?: boolean;
}

export default function ChangePasswordView({ email, impersonating = false }: Props) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDone(false);
    if (pwd.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (pwd !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPwd("");
    setConfirm("");
    setDone(true);
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Account</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4, marginBottom: 18 }}>
        Signed in as <strong>{email}</strong>.
      </p>

      <div className="card">
        <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 4 }}>Change password</h3>
        <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 14 }}>
          Set a new password for your account. You&apos;ll stay signed in.
        </p>

        {impersonating && (
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              color: "#92400e",
              padding: 10,
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 14
            }}
          >
            You&apos;re currently viewing as another user. This changes the password for
            your own account ({email}), not theirs.
          </div>
        )}

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="form-label">New password</label>
            <input
              type="password"
              className="form-input"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>
          <div>
            <label className="form-label">Confirm new password</label>
            <input
              type="password"
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          {err && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13 }}>
              {err}
            </div>
          )}
          {done && (
            <div style={{ background: "#ecfdf5", color: "#065f46", padding: 10, borderRadius: 6, fontSize: 13 }}>
              Password updated. Use it next time you sign in.
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ justifyContent: "center", marginTop: 4 }}
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
