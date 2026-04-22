"use client";

import type { ContactRecord, Office } from "@/lib/types";

interface Props {
  contacts: ContactRecord[];
  offices: Office[];
  onClose: () => void;
}

export default function StatsModal({ contacts, offices, onClose }: Props) {
  const stats = offices
    .map((o) => ({
      office: o.code,
      name: o.name,
      lastUpdated: o.last_updated,
      count: contacts.filter((c) => c.office_id === o.id).length
    }))
    .sort((a, b) => b.count - a.count);

  const maxCount = Math.max(1, ...stats.map((s) => s.count));
  const total = stats.reduce((s, x) => s + x.count, 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 560 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, color: "var(--navy)" }}>Network Stats</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>
          Contact contributions across all GREA offices
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "var(--gray-500)", padding: "8px 0", borderBottom: "2px solid var(--gray-200)" }}>
                Office
              </th>
              <th style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "var(--gray-500)", padding: "8px 0", borderBottom: "2px solid var(--gray-200)" }}>
                Last Updated
              </th>
              <th style={{ textAlign: "right", fontSize: 11, textTransform: "uppercase", color: "var(--gray-500)", padding: "8px 0", borderBottom: "2px solid var(--gray-200)" }}>
                #
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const daysSince = s.lastUpdated
                ? Math.floor((Date.now() - new Date(s.lastUpdated).getTime()) / 86400000)
                : 999;
              const color = daysSince <= 30 ? "#2e7d32" : daysSince <= 60 ? "#e65100" : "#c62828";
              const label = daysSince <= 30 ? "Current" : daysSince <= 60 ? "Due for update" : "Stale";
              return (
                <tr key={s.office}>
                  <td style={{ padding: "12px 0", borderBottom: "1px solid var(--gray-100)", fontSize: 14 }}>
                    <strong>{s.office}</strong>
                    <div className="stats-bar"><div className="stats-bar-fill" style={{ width: `${(s.count / maxCount) * 100}%` }} /></div>
                  </td>
                  <td style={{ padding: "12px 0", borderBottom: "1px solid var(--gray-100)", fontSize: 13, color }}>
                    {s.lastUpdated ?? "—"}
                    <br />
                    <span style={{ fontSize: 11 }}>{label}</span>
                  </td>
                  <td style={{ padding: "12px 0", borderBottom: "1px solid var(--gray-100)", textAlign: "right", fontWeight: 700, fontSize: 14 }}>
                    {s.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "2px solid var(--gray-200)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
          <span>Total Contacts</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  );
}
