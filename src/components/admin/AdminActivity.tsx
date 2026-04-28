"use client";

import { useMemo, useState } from "react";
import type { LoginEvent, Profile } from "@/lib/types";

interface Props {
  events: LoginEvent[];
  profiles: Profile[];
}

function formatLocal(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function relative(ts: string, now: number): string {
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = now - t;
  if (diffMs < 0) return "in the future";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function AdminActivity({ events, profiles }: Props) {
  const [userFilter, setUserFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const now = Date.now();

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  // Per-user summary (one row per user with latest sign-in + total count).
  // Drives both the "Per user" view and the user-filter dropdown options.
  const perUser = useMemo(() => {
    const acc = new Map<string, { count: number; latest: string }>();
    for (const e of events) {
      const cur = acc.get(e.user_id);
      if (!cur) {
        acc.set(e.user_id, { count: 1, latest: e.signed_in_at });
      } else {
        cur.count += 1;
        if (e.signed_in_at > cur.latest) cur.latest = e.signed_in_at;
      }
    }
    const rows = profiles.map((p) => {
      const stats = acc.get(p.id);
      return {
        profile: p,
        count: stats?.count ?? 0,
        latest: stats?.latest ?? null
      };
    });
    rows.sort((a, b) => {
      if (!a.latest && !b.latest) return a.profile.name.localeCompare(b.profile.name);
      if (!a.latest) return 1;
      if (!b.latest) return -1;
      return b.latest.localeCompare(a.latest);
    });
    return rows;
  }, [events, profiles]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (userFilter && e.user_id !== userFilter) return false;
      if (!q) return true;
      const p = profileById.get(e.user_id);
      if (!p) return false;
      return (
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [events, userFilter, query, profileById]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Sign-in activity</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
          Every successful sign-in across the portal. Impersonation does not appear here — only real auth sessions.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
            Per user ({perUser.length})
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Total sign-ins</th>
              <th>Most recent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perUser.map((row) => (
              <tr key={row.profile.id}>
                <td><strong>{row.profile.name || "—"}</strong></td>
                <td style={{ fontSize: 12 }}>{row.profile.email}</td>
                <td style={{ fontSize: 12 }}>{row.profile.role}</td>
                <td>{row.count}</td>
                <td style={{ fontSize: 12 }}>
                  {row.latest ? (
                    <>
                      <div>{formatLocal(row.latest)}</div>
                      <div style={{ color: "var(--gray-500)", fontSize: 11 }}>{relative(row.latest, now)}</div>
                    </>
                  ) : (
                    <span style={{ color: "var(--gray-500)" }}>Never</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {row.count > 0 && (
                    <button
                      className="btn-outline"
                      style={{ fontSize: 12 }}
                      onClick={() => setUserFilter(row.profile.id)}
                    >
                      View history
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {perUser.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)", padding: 14 }}>
                  No users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
            History ({filteredEvents.length})
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="form-input"
              style={{ width: 240 }}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">All users</option>
              {perUser
                .filter((r) => r.count > 0)
                .map((r) => (
                  <option key={r.profile.id} value={r.profile.id}>
                    {r.profile.name || r.profile.email}
                  </option>
                ))}
            </select>
            <input
              className="form-input"
              style={{ width: 240 }}
              placeholder="Filter by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(userFilter || query) && (
              <button
                className="btn-outline"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setUserFilter("");
                  setQuery("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((e) => {
              const p = profileById.get(e.user_id);
              return (
                <tr key={e.id}>
                  <td style={{ fontSize: 12 }}>
                    <div>{formatLocal(e.signed_in_at)}</div>
                    <div style={{ color: "var(--gray-500)", fontSize: 11 }}>{relative(e.signed_in_at, now)}</div>
                  </td>
                  <td><strong>{p?.name || "—"}</strong></td>
                  <td style={{ fontSize: 12 }}>{p?.email ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{p?.role ?? "—"}</td>
                </tr>
              );
            })}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--gray-500)", padding: 14 }}>
                  No sign-ins match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
