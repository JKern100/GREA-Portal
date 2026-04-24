"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/contacts";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        if (error) throw error;
        setInfo("Account created. Check your email if confirmation is required, then sign in.");
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, width: "100%" }}>
      <img
        src="/grea-logo.svg"
        alt="GREA"
        style={{ height: 36, width: "auto", marginBottom: 10, filter: "brightness(0)" }}
      />
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Contacts Portal</div>
      <p style={{ color: "var(--gray-500)", fontSize: 13, marginTop: 2, marginBottom: 20 }}>
        {mode === "signin" ? "Sign in to your account" : "Create a new account"}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        {mode === "signup" && (
          <div>
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
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
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ background: "#dcfce7", color: "#166534", padding: 10, borderRadius: 6, fontSize: 13 }}>
            {info}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: "center", marginTop: 4 }}>
          {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
      </form>

      <div style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
        {mode === "signin" ? (
          <span>
            No account?{" "}
            <button type="button" onClick={() => setMode("signup")} style={{ color: "var(--navy)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
              Create one
            </button>
          </span>
        ) : (
          <span>
            Already have an account?{" "}
            <button type="button" onClick={() => setMode("signin")} style={{ color: "var(--navy)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
              Sign in
            </button>
          </span>
        )}
      </div>
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
