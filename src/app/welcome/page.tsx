"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "loading" | "set-password" | "saving" | "done" | "error";

function parseHashError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("error")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const desc = params.get("error_description");
  if (!desc) return "Invite link is invalid or has expired.";
  return decodeURIComponent(desc.replace(/\+/g, " "));
}

function WelcomeContent() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pwd, setPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const hashError = parseHashError();
    if (hashError) {
      setErrorMsg(hashError);
      setPhase("error");
      return;
    }

    const supabase = createClient();
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Supabase's /auth/v1/verify endpoint redirects here with
    // #access_token=...&refresh_token=... (implicit flow). The browser
    // client created by @supabase/ssr defaults to PKCE, whose URL
    // detection looks for ?code=...&state=... and ignores the hash —
    // so we extract the tokens ourselves and seed the session
    // explicitly. This decouples /welcome from the client's flowType.
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ data, error }) => {
            if (error || !data.session?.user) {
              setErrorMsg(
                error?.message ??
                  "This invite link is invalid or has already been used. Ask the person who invited you for a fresh one."
              );
              setPhase("error");
              return;
            }
            // Strip the hash so a refresh doesn't try to re-consume the
            // (now-used) tokens.
            window.history.replaceState(null, "", window.location.pathname);
            setEmail(data.session.user.email ?? null);
            setPhase("set-password");
          })
          .catch((err: unknown) => {
            setErrorMsg(err instanceof Error ? err.message : "Couldn't verify your invite link.");
            setPhase("error");
          });
        return;
      }
    }

    // No tokens in the hash — maybe the user is already signed in and
    // navigated back to /welcome. Honor that; otherwise show the error.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null);
        setPhase("set-password");
        return;
      }
      setErrorMsg(
        "This invite link is invalid or has already been used. Ask the person who invited you for a fresh one."
      );
      setPhase("error");
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (pwd.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (pwd !== confirmPwd) {
      setErrorMsg("Passwords don't match.");
      return;
    }
    setPhase("saving");
    const supabase = createClient();
    const updates: { password: string; data?: { name: string } } = { password: pwd };
    if (name.trim()) updates.data = { name: name.trim() };
    const { error } = await supabase.auth.updateUser(updates);
    if (error) {
      setErrorMsg(error.message);
      setPhase("set-password");
      return;
    }
    setPhase("done");
    setTimeout(() => {
      router.push("/contacts");
      router.refresh();
    }, 800);
  }

  return (
    <div className="card" style={{ maxWidth: 460, width: "100%" }}>
      <img src="/grea-logo-navy.svg" alt="GREA" style={{ height: 36, width: "auto", marginBottom: 10 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Welcome to the GREA Portal</div>

      {phase === "loading" && (
        <p style={{ color: "var(--gray-500)", fontSize: 13, marginTop: 12 }}>Verifying your invite…</p>
      )}

      {phase === "error" && (
        <>
          <p style={{ color: "var(--gray-700)", fontSize: 13, marginTop: 8, marginBottom: 14 }}>
            We couldn&apos;t verify your invite link.
          </p>
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 14
            }}
          >
            {errorMsg}
          </div>
          <p style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 14 }}>
            Invite links expire after about an hour and can only be used once. Ask the person who invited you to send a fresh link.
          </p>
          <a
            href="/login"
            className="btn-outline"
            style={{ display: "inline-flex", padding: "8px 14px", fontSize: 13, textDecoration: "none" }}
          >
            Back to sign in
          </a>
        </>
      )}

      {(phase === "set-password" || phase === "saving") && (
        <>
          <p style={{ color: "var(--gray-500)", fontSize: 13, marginTop: 4, marginBottom: 16 }}>
            {email ? <>Signed in as <strong>{email}</strong>. Set a password to finish.</> : "Set a password to finish."}
          </p>
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <div>
              <label className="form-label">Your name (optional)</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                disabled={phase === "saving"}
              />
            </div>
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
                disabled={phase === "saving"}
              />
            </div>
            <div>
              <label className="form-label">Confirm password</label>
              <input
                type="password"
                className="form-input"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={phase === "saving"}
              />
            </div>
            {errorMsg && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13 }}>
                {errorMsg}
              </div>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={phase === "saving"}
              style={{ justifyContent: "center", marginTop: 4 }}
            >
              {phase === "saving" ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        </>
      )}

      {phase === "done" && (
        <p style={{ color: "#15803d", fontSize: 13, marginTop: 14 }}>
          Password set. Taking you in…
        </p>
      )}
    </div>
  );
}

export default function WelcomePage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--navy)" }}
    >
      <Suspense fallback={<div style={{ color: "white" }}>Loading…</div>}>
        <WelcomeContent />
      </Suspense>
    </div>
  );
}
