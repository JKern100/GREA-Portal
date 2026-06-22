"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

type Phase = "loading" | "confirm" | "set-password" | "saving" | "done" | "error";

// Shared guidance for a link that's already been consumed. The usual cause
// here is a corporate email security scanner (SafeLinks/Mimecast) opening the
// one-time link to scan it before the human clicks — which uses it up.
const USED_LINK_MSG =
  "This link has already been used. Some corporate email systems automatically open links to scan them, which can use up a one-time link before you click it. Ask for a fresh link and click it again.";
const EXPIRED_LINK_MSG =
  "This link has expired. Invite and reset links are only valid for a limited time — ask the person who invited you for a fresh one.";

function parseHashError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("error")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const code = params.get("error_code") ?? "";
  const desc = params.get("error_description") ?? "";
  if (code === "otp_expired" || /expired/i.test(desc)) return EXPIRED_LINK_MSG;
  if (code === "access_denied" || /invalid|used|consumed/i.test(desc)) return USED_LINK_MSG;
  if (!desc) return USED_LINK_MSG;
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
  // Token from a click-to-verify link, held until the user clicks the button.
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [otpType, setOtpType] = useState<EmailOtpType | null>(null);

  useEffect(() => {
    const hashError = parseHashError();
    if (hashError) {
      setErrorMsg(hashError);
      setPhase("error");
      return;
    }

    const supabase = createClient();
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Legacy implicit flow: Supabase's /verify endpoint redirects here with
    // #access_token=...&refresh_token=.... Kept for any older outstanding
    // links. New links use the click-to-verify query flow below.
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ data, error }) => {
            if (error || !data.session?.user) {
              setErrorMsg(error?.message ?? USED_LINK_MSG);
              setPhase("error");
              return;
            }
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

    // Click-to-verify flow: the token rides in the query string and is NOT
    // consumed on load. A scanner GET stops here harmlessly; the token is only
    // exchanged when the user clicks the button (confirmLink), so scanners
    // can't burn it.
    const q = new URLSearchParams(window.location.search);
    const th = q.get("token_hash");
    const ty = q.get("type");
    if (th && ty) {
      setTokenHash(th);
      setOtpType(ty as EmailOtpType);
      setPhase("confirm");
      return;
    }

    // No tokens at all — maybe already signed in (navigated back to /welcome).
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null);
        setPhase("set-password");
        return;
      }
      setErrorMsg(USED_LINK_MSG);
      setPhase("error");
    });
  }, []);

  async function confirmLink() {
    if (!tokenHash || !otpType) return;
    setErrorMsg("");
    setPhase("loading");
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType
    });
    if (error || !data.session?.user) {
      setErrorMsg(error?.message ?? USED_LINK_MSG);
      setPhase("error");
      return;
    }
    // Strip the token from the URL so a refresh can't try to re-use it.
    window.history.replaceState(null, "", window.location.pathname);
    setEmail(data.session.user.email ?? null);
    setPhase("set-password");
  }

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
    const { data: updated, error } = await supabase.auth.updateUser(updates);
    if (error) {
      setErrorMsg(error.message);
      setPhase("set-password");
      return;
    }
    // Stamp onboarding completion so the admin "Registered" badge reflects a
    // real, password-having account. Best effort.
    const uid = updated.user?.id;
    if (uid) {
      await supabase
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", uid);
    }
    setPhase("done");
    setTimeout(() => {
      router.push("/pipeline");
      router.refresh();
    }, 800);
  }

  return (
    <div className="card" style={{ maxWidth: 460, width: "100%" }}>
      <img src="/grea-logo-navy.svg" alt="GREA" style={{ height: 36, width: "auto", marginBottom: 10 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Welcome to the GREA Portal</div>

      {phase === "loading" && (
        <p style={{ color: "var(--gray-500)", fontSize: 13, marginTop: 12 }}>Verifying…</p>
      )}

      {phase === "confirm" && (
        <>
          <p style={{ color: "var(--gray-700)", fontSize: 13, marginTop: 8, marginBottom: 14 }}>
            You&apos;re almost there. Click below to finish setting up your account.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={confirmLink}
            style={{ justifyContent: "center" }}
          >
            Set up my account
          </button>
          <p style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 12 }}>
            This link can only be used once — click it when you&apos;re ready to set your password.
          </p>
        </>
      )}

      {phase === "error" && (
        <>
          <p style={{ color: "var(--gray-700)", fontSize: 13, marginTop: 8, marginBottom: 14 }}>
            We couldn&apos;t verify your link.
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
