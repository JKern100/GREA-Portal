"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MailingListEntry, Office, Profile } from "@/lib/types";
import MailingListImportModal from "./MailingListImportModal";

interface Props {
  profile: Profile;
  offices: Office[];
  initialEntries: MailingListEntry[];
  /**
   * When true, expose Upload / Export / per-row Delete affordances. The
   * public /mailing-list page passes false (read-only); the Super Admin
   * /admin/mailing-list page passes true. Either way the API still does
   * its own role check.
   */
  manage?: boolean;
}

export default function MailingListView({ profile, offices, initialEntries, manage = false }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [officeFilter, setOfficeFilter] = useState<string>("");
  const [showOptedOut, setShowOptedOut] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // After a bulk import the modal calls router.refresh(), which produces a
  // fresh `initialEntries` prop. Sync it down so the table updates without a
  // full page reload.
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const canManage = manage && profile.role === "superadmin";

  async function deleteEntry(id: string, name: string) {
    if (!confirm(`Delete "${name}" from the mailing list?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("mailing_list_entries").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

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
      if (!showOptedOut && e.opted_out) return false;
      if (sectorFilter && !e.sectors.includes(sectorFilter)) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (officeFilter && e.source_office_id !== officeFilter) return false;
      if (!q) return true;
      const hay = [
        e.name,
        e.email ?? "",
        e.organization ?? "",
        e.title ?? "",
        e.city ?? "",
        e.state ?? "",
        e.notes ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, sectorFilter, tagFilter, officeFilter, showOptedOut]);

  function exportCsv() {
    const headers = [
      "Name",
      "Email",
      "Organization",
      "Title",
      "Phone",
      "Opted-Out",
      "Last Registered",
      "Address",
      "City",
      "State",
      "ZIP",
      "Country",
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
      e.opted_out ? "Yes" : "No",
      e.last_registration_date ? e.last_registration_date.slice(0, 10) : "",
      e.address ?? "",
      e.city ?? "",
      e.state ?? "",
      e.zip ?? "",
      e.country ?? "",
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
        <h2 style={{ fontSize: 20, color: "var(--navy)" }}>
          {canManage ? "Mailing List" : "Community Mailing List"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
          {canManage
            ? "Manage the shared national list — upload new entries, export, or remove individual rows. Filter by sector, tag, or office."
            : "A shared, national list of community contacts. Filter by sector, tag, or office."}
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
          {canManage && (
            <>
              <button className="btn-outline" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="btn-primary" onClick={() => setShowImport(true)}>
                Upload list
              </button>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 10, display: "flex", gap: 14, alignItems: "center" }}>
          <span>
            Showing {filtered.length} of {entries.length}
          </span>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showOptedOut}
              onChange={(e) => setShowOptedOut(e.target.checked)}
            />
            Show opted-out
          </label>
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
              <th>Location</th>
              <th>Source</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              // Combine city + state into one cell. Fall back gracefully if
              // either is missing — we don't want to render lone commas.
              const locParts = [e.city, e.state].filter(Boolean) as string[];
              const location = locParts.length ? locParts.join(", ") : "—";
              return (
                <tr key={e.id} style={e.opted_out ? { background: "#fafafa", opacity: 0.7 } : undefined}>
                  <td style={{ fontWeight: 600, color: "var(--navy)" }}>
                    {e.name || "—"}
                    {e.opted_out && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          padding: "1px 7px",
                          borderRadius: 10,
                          background: "#fee2e2",
                          color: "#991b1b"
                        }}
                      >
                        Opted out
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {e.email ? <a href={`mailto:${e.email}`}>{e.email}</a> : "—"}
                  </td>
                  <td>{e.organization || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{e.title || "—"}</td>
                  <td style={{ fontSize: 12 }}>{location}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {(e.source_office_id && officeById[e.source_office_id]?.code) || "—"}
                  </td>
                  {canManage && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn-outline"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => deleteEntry(e.id, e.name || e.email || "this entry")}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ textAlign: "center", color: "var(--gray-500)", padding: 20, fontSize: 13 }}>
                  No entries match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showImport && (
        <MailingListImportModal
          profile={profile}
          offices={offices}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
