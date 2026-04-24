"use client";

import { useMemo, useState } from "react";
import type { MailingListEntry, Office, Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  offices: Office[];
  initialEntries: MailingListEntry[];
}

export default function MailingListView({ offices, initialEntries }: Props) {
  const [entries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [officeFilter, setOfficeFilter] = useState<string>("");

  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  const sectorOptions = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => e.sectors.forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [entries]);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => e.tags.forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (sectorFilter && !e.sectors.includes(sectorFilter)) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (officeFilter && e.source_office_id !== officeFilter) return false;
      if (!q) return true;
      const hay = [
        e.name,
        e.email ?? "",
        e.organization ?? "",
        e.title ?? "",
        e.notes ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, sectorFilter, tagFilter, officeFilter]);

  function exportCsv() {
    const headers = [
      "Name",
      "Email",
      "Organization",
      "Title",
      "Phone",
      "Sectors",
      "Tags",
      "Notes",
      "Source Office"
    ];
    const rows = filtered.map((e) => [
      e.name,
      e.email ?? "",
      e.organization ?? "",
      e.title ?? "",
      e.phone ?? "",
      e.sectors.join("; "),
      e.tags.join("; "),
      e.notes ?? "",
      (e.source_office_id && officeById[e.source_office_id]?.code) || ""
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grea_mailing_list.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Community Mailing List</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
          A shared, national list of community contacts. Filter by sector, tag, or office. Maintained by office admins via uploads.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="form-label">Search</label>
            <input
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email, organization, notes…"
            />
          </div>
          <div>
            <label className="form-label">Sector</label>
            <select
              className="form-input"
              style={{ width: 180 }}
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              <option value="">All sectors</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Tag</label>
            <select
              className="form-input"
              style={{ width: 160 }}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Source office</label>
            <select
              className="form-input"
              style={{ width: 140 }}
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value)}
            >
              <option value="">All offices</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-outline" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 10 }}>
          Showing {filtered.length} of {entries.length}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Title</th>
              <th>Sectors</th>
              <th>Tags</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, color: "var(--navy)" }}>{e.name || "—"}</td>
                <td style={{ fontSize: 12 }}>
                  {e.email ? <a href={`mailto:${e.email}`}>{e.email}</a> : "—"}
                </td>
                <td>{e.organization || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{e.title || "—"}</td>
                <td style={{ fontSize: 12 }}>{e.sectors.join(", ") || "—"}</td>
                <td style={{ fontSize: 12 }}>{e.tags.join(", ") || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                  {(e.source_office_id && officeById[e.source_office_id]?.code) || "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: 20, fontSize: 13 }}>
                  No entries match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
