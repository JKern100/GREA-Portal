"use client";

import { useCallback, useEffect, useState } from "react";
import type { Office } from "@/lib/types";

interface ApiKeyRow {
  id: string;
  office_id: string;
  key_suffix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  offices?: { code?: string; name?: string } | null;
}

/**
 * Superadmin screen for issuing and revoking the per-office import API keys.
 * The plaintext key is returned by the server exactly once, on creation, and
 * is held here only until the admin dismisses it.
 */
export default function ApiKeysAdmin({ offices }: { offices: Office[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [officeId, setOfficeId] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; office: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/api-keys");
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load API keys.");
      return;
    }
    setKeys(body.keys ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!officeId) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ officeId, label })
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(body.error ?? "Could not create key.");
      return;
    }
    const office = offices.find((o) => o.id === officeId);
    setNewKey({ key: body.key, office: office?.code ?? "" });
    setLabel("");
    void load();
  }

  async function revoke(id: string, office: string) {
    if (!confirm(`Revoke this key for ${office}? Any sync using it will start failing immediately.`)) return;
    const res = await fetch("/api/admin/api-keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not revoke key.");
      return;
    }
    void load();
  }

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

  return (
    <div>
      <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Import API keys</h2>
      <p style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 4, marginBottom: 18, maxWidth: 720 }}>
        One key per office, used to push Contacts and Pipeline data to the import API. A key can only
        ever write to its own office. The key is shown once when created and cannot be retrieved
        afterwards — if one is lost or exposed, revoke it and issue a new one.
      </p>

      {newKey && (
        <div className="card" style={{ marginBottom: 14, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>
            New key for {newKey.office} — copy it now, it won&apos;t be shown again
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              readOnly
              value={newKey.key}
              onFocus={(e) => e.currentTarget.select()}
              className="form-input"
              style={{ flex: 1, minWidth: 280, fontFamily: "monospace", fontSize: 12 }}
            />
            <button
              className="btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={async () => {
                await navigator.clipboard.writeText(newKey.key);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              className="btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => setNewKey(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Issue a key</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Office</label>
            <select
              className="form-input"
              style={{ width: 200 }}
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
            >
              <option value="">Select…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="form-label">Label (optional)</label>
            <input
              className="form-input"
              placeholder="e.g. Nightly HubSpot sync"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={create} disabled={!officeId || creating}>
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 14, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: 13, color: "#991b1b" }}>{error}</div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Office</th>
              <th>Label</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16, color: "var(--gray-500)", fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && keys.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16, color: "var(--gray-500)", fontSize: 13 }}>
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} style={k.revoked_at ? { opacity: 0.55 } : undefined}>
                <td style={{ fontWeight: 600 }}>{k.offices?.code ?? "—"}</td>
                <td style={{ fontSize: 13 }}>{k.label || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--gray-600)" }}>
                  grea_live_…{k.key_suffix}
                </td>
                <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{fmt(k.created_at)}</td>
                <td style={{ fontSize: 12, color: k.last_used_at ? "var(--gray-500)" : "var(--gray-400)" }}>
                  {k.last_used_at ? fmt(k.last_used_at) : "never"}
                </td>
                <td>
                  {k.revoked_at ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#991b1b" }}>REVOKED</span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>ACTIVE</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {!k.revoked_at && (
                    <button
                      className="btn-outline"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => revoke(k.id, k.offices?.code ?? "this office")}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
