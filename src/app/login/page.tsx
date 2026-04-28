"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "forgot";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/contacts";
  const wasDeactivated = search.get("inactive") === "1";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  // Auth providers (Supabase, etc.) put errors in the URL hash on a failed
  // redirect — e.g. an expired invite link. Surface those once on mount so
  // the user isn't left staring at a plain login form wondering why they
  // can't get in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("error")) return;
    const params = new URLSearchParams(hash.slice(1));
    const desc = params.get("error_description");
    if (desc) {
      setError(
        `${decodeURIComponent(desc.replace(/\+/g, " "))} — ask the person who invited you for a fresh link.`
      );
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // The endpoint always returns 200, even for unknown emails, so we
      // can't distinguish "we notified your admin" from "no such user".
      // We show the same confirmation either way (no email enumeration).
      await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setForgotSent(false);
  }

  return (
    <div className="card" style={{ maxWidth: 420, width: "100%" }}>
      <img
        src="/grea-logo-navy.svg"
        alt="GREA"
        style={{ height: 36, width: "auto", marginBottom: 10 }}
      />
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>GREA Portal</div>
      <p style={{ color: "var(--gray-500)", fontSize: 13, marginTop: 2, marginBottom: 20 }}>
        {mode === "signin" ? "Sign in to your account" : "Reset your password"}
      </p>

      {wasDeactivated && (
        <div
          style={{
            background: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fde68a",
            padding: 10,
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 14
          }}
        >
          This account has been deactivated. Contact your office admin or a superadmin to
          regain access.
        </div>
      )}

      {mode === "signin" && (
        <>
          <form onSubmit={handleSignIn} style={{ display: "grid", gap: 12 }}>
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: "center", marginTop: 4 }}>
              {loading ? "…" : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              style={{ color: "var(--navy)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Forgot your password?
            </button>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: 12,
              background: "var(--gray-50)",
              border: "1px solid var(--gray-200)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--gray-600)",
              lineHeight: 1.5
            }}
          >
            Access to the GREA Portal is by invitation only. If you need an account, ask
            your office admin or a superadmin to send you an invite link.
          </div>
        </>
      )}

      {mode === "forgot" && (
        <>
          {!forgotSent ? (
            <form onSubmit={handleForgot} style={{ display: "grid", gap: 12 }}>
              <p style={{ fontSize: 13, color: "var(--gray-600)", margin: 0, marginBottom: 4 }}>
                Enter your email and we&apos;ll notify your office admin to send you a one-time
                reset link.
              </p>
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && (
                <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: "center", marginTop: 4 }}>
                {loading ? "…" : "Notify my admin"}
              </button>
            </form>
          ) : (
            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #86efac",
                padding: 12,
                borderRadius: 6,
                fontSize: 13,
                lineHeight: 1.5
              }}
            >
              <strong>Request received.</strong> If <em>{email}</em> is on the portal, your office
              admin or a superadmin has been notified and will send you a reset link shortly.
            </div>
          )}

          <div style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
            <button
              type="button"
              onClick={() => switchMode("signin")}
              style={{ color: "var(--navy)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Back to sign in
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--navy)" }}>
      <Suspense fallback={<div style={{ color: "white" }}>Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
