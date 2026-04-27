"use client";

import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import SubmitFeedbackModal from "@/components/feedback/SubmitFeedbackModal";
import { officeBadgeStyle } from "@/lib/officeColor";
import type { ContactRecord, Office, Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  offices: Office[];
  initialContacts: ContactRecord[];
}

type SearchType = "all" | "contact" | "account";

interface OfficeGroupEntry {
  office: string;
  officeId: string;
  contactId: string;
  brokerName: string;
  brokerPhone: string;
  contactPhone: string | null;
  contactEmail: string | null;
  relationshipStatus: string | null;
  lastContactDate: string | null;
  listing: string | null;
  note: string | null;
  tags: string[];
  sectors: string[];
  dateAdded: string;
}

interface Group {
  contactName: string;
  accountName: string;
  score: number;
  offices: OfficeGroupEntry[];
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

function cls(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-");
}

export default function ContactsView({ profile, offices, initialContacts }: Props) {
  const [contacts] = useState<ContactRecord[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [lastQuery, setLastQuery] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [sectorFilters, setSectorFilters] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // Report modal — opened in-place over the Contacts page so the user
  // doesn't lose their search/scroll position.
  const [reportFor, setReportFor] = useState<{ contactId: string; title: string } | null>(null);


  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  const fuseAll = useMemo(
    () =>
      new Fuse(contacts, {
        keys: [
          { name: "contact_name", weight: 0.5 },
          { name: "account_name", weight: 0.5 }
        ],
        threshold: 0.35,
        distance: 100,
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2
      }),
    [contacts]
  );

  const fuseContact = useMemo(
    () =>
      new Fuse(contacts, {
        keys: [{ name: "contact_name", weight: 1 }],
        threshold: 0.35,
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2
      }),
    [contacts]
  );

  const fuseAccount = useMemo(
    () =>
      new Fuse(contacts, {
        keys: [{ name: "account_name", weight: 1 }],
        threshold: 0.35,
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2
      }),
    [contacts]
  );

  function runSearch() {
    const q = query.trim();
    if (!q) return;
    const fuse = searchType === "contact" ? fuseContact : searchType === "account" ? fuseAccount : fuseAll;
    const results = fuse.search(q);

    const threshold = 0.3;
    const out: Group[] = [];
    results.forEach((r) => {
      const item = r.item;
      const officeCode = officeById[item.office_id]?.code ?? "—";
      const entry: OfficeGroupEntry = {
        office: officeCode,
        officeId: item.office_id,
        contactId: item.id,
        brokerName: item.broker_name_snapshot || "",
        brokerPhone: item.broker_phone_snapshot || "",
        contactPhone: item.contact_phone,
        contactEmail: item.contact_email,
        relationshipStatus: item.relationship_status,
        lastContactDate: item.last_contact_date,
        listing: item.listing,
        note: item.note,
        tags: item.tags || [],
        sectors: item.sectors || [],
        dateAdded: item.date_added
      };

      let merged = false;
      for (const g of out) {
        if (g.offices.some((o) => o.officeId === item.office_id)) continue;
        const nameFuse = new Fuse([{ n: g.contactName }], { keys: ["n"], threshold, ignoreLocation: true });
        const acctFuse = new Fuse([{ n: g.accountName }], { keys: ["n"], threshold, ignoreLocation: true });
        if (
          nameFuse.search(item.contact_name).length > 0 &&
          acctFuse.search(item.account_name).length > 0
        ) {
          g.offices.push(entry);
          if ((r.score ?? 1) < g.score) g.score = r.score ?? 1;
          merged = true;
          break;
        }
      }
      if (!merged) {
        out.push({
          contactName: item.contact_name,
          accountName: item.account_name,
          score: r.score ?? 1,
          offices: [entry]
        });
      }
    });

    out.sort((a, b) => a.score - b.score);
    setGroups(out);
    setLastQuery(q);
    setExpanded({});
  }

  const filteredGroups = useMemo(() => {
    if (!groups) return null;
    if (tagFilters.length === 0 && sectorFilters.length === 0) return groups;
    return groups.filter((g) => {
      if (tagFilters.length > 0) {
        const m = g.offices.some((o) => o.tags.some((t) => tagFilters.includes(t)));
        if (!m) return false;
      }
      if (sectorFilters.length > 0) {
        const m = g.offices.some((o) => o.sectors.some((s) => sectorFilters.includes(s)));
        if (!m) return false;
      }
      return true;
    });
  }, [groups, tagFilters, sectorFilters]);

  const availableTags = useMemo(() => {
    if (!groups) return [] as string[];
    const s = new Set<string>();
    groups.forEach((g) => g.offices.forEach((o) => o.tags.forEach((t) => s.add(t))));
    return Array.from(s).sort();
  }, [groups]);

  const availableSectors = useMemo(() => {
    if (!groups) return [] as string[];
    const s = new Set<string>();
    groups.forEach((g) => g.offices.forEach((o) => o.sectors.forEach((x) => s.add(x))));
    return Array.from(s).sort();
  }, [groups]);

  function toggleTag(t: string) {
    setTagFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function toggleSector(s: string) {
    setSectorFilters((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ fontSize: 14, marginBottom: 10 }}>
          Search across all GREA offices
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 260, fontSize: 16, padding: "12px 16px" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Enter a contact name or account name…"
            autoComplete="off"
          />
          <button className="btn-primary" style={{ padding: "12px 22px" }} onClick={runSearch}>
            Search
          </button>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          {([
            ["all", "All Fields"],
            ["contact", "Contact Name"],
            ["account", "Account Name"]
          ] as [SearchType, string][]).map(([v, label]) => (
            <label
              key={v}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--gray-200)",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
                background: searchType === v ? "var(--navy)" : "white",
                color: searchType === v ? "white" : "var(--gray-600)"
              }}
            >
              <input
                type="radio"
                name="stype"
                value={v}
                checked={searchType === v}
                onChange={() => setSearchType(v)}
                style={{ display: "none" }}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {groups === null ? null : (filteredGroups?.length ?? 0) === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>😐</div>
          <h3 style={{ fontSize: 16 }}>No matches for &quot;{lastQuery}&quot;</h3>
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Try a different spelling or search by account.</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 14, padding: "0 4px" }}>
            Found <strong>{filteredGroups?.length}</strong> match{filteredGroups?.length === 1 ? "" : "es"} for{" "}
            <strong>&quot;{lastQuery}&quot;</strong>
          </div>

          {availableSectors.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--gray-500)", marginRight: 4 }}>Sector:</span>
              {availableSectors.map((s) => (
                <button
                  key={s}
                  className={`chip gold ${sectorFilters.includes(s) ? "active" : ""}`}
                  onClick={() => toggleSector(s)}
                >
                  {s}
                </button>
              ))}
              {sectorFilters.length > 0 && (
                <button
                  onClick={() => setSectorFilters([])}
                  style={{ fontSize: 11, color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {availableTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--gray-500)", marginRight: 4 }}>Filter by tag:</span>
              {availableTags.map((t) => (
                <button key={t} className={`chip ${tagFilters.includes(t) ? "active" : ""}`} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
              {tagFilters.length > 0 && (
                <button
                  onClick={() => setTagFilters([])}
                  style={{ fontSize: 11, color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div>
            {filteredGroups!.map((g, i) => {
              const multi = g.offices.length > 1;
              const allSectors = Array.from(new Set(g.offices.flatMap((o) => o.sectors)));
              return (
                <div key={i} className="card" style={{ padding: 0, marginBottom: 12 }}>
                  <div
                    onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
                    style={{
                      padding: "18px 24px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      cursor: "pointer"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>{g.contactName}</div>
                      <div style={{ fontSize: 14, color: "var(--gray-600)" }}>{g.accountName}</div>
                      {allSectors.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {allSectors.map((s) => (
                            <span key={s} className={`sector-badge sector-${cls(s)}`}>
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {g.offices.map((o) => (
                        <span
                          key={o.officeId}
                          className={`office-badge ${o.office.toLowerCase()}`}
                          style={officeBadgeStyle(officeById[o.officeId])}
                        >
                          {o.office}
                        </span>
                      ))}
                      <span style={{ color: "var(--gray-400)", marginLeft: 4 }}>
                        {expanded[i] ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>
                  {multi && (
                    <div style={{ padding: "0 24px 10px", fontSize: 12, color: "var(--gold)", fontWeight: 600 }}>
                      ★ Cross-office relationship — present in {g.offices.length} offices
                    </div>
                  )}
                  {expanded[i] && (
                    <div style={{ borderTop: "1px solid var(--gray-100)" }}>
                      {g.offices.map((o, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "14px 24px",
                            borderBottom: idx < g.offices.length - 1 ? "1px solid var(--gray-100)" : "none",
                            gap: 10
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "var(--gray-500)"
                            }}
                          >
                            {o.office}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-800)" }}>{o.brokerName || "—"}</div>
                              {o.relationshipStatus && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    padding: "1px 7px",
                                    borderRadius: 10,
                                    background: "var(--gray-100)",
                                    color: "var(--gray-700)"
                                  }}
                                >
                                  {o.relationshipStatus}
                                </span>
                              )}
                            </div>
                            {o.brokerPhone && (
                              <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                                <a href={`tel:${o.brokerPhone}`} style={{ color: "var(--navy)", textDecoration: "none" }}>
                                  {o.brokerPhone}
                                </a>
                              </div>
                            )}
                            {(o.contactEmail || o.contactPhone) && (
                              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {o.contactEmail && (
                                  <a href={`mailto:${o.contactEmail}`} style={{ color: "var(--navy)" }}>
                                    {o.contactEmail}
                                  </a>
                                )}
                                {o.contactPhone && (
                                  <a href={`tel:${o.contactPhone}`} style={{ color: "var(--navy)" }}>
                                    {o.contactPhone}
                                  </a>
                                )}
                              </div>
                            )}
                            {o.tags.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                                {o.tags.map((t) => (
                                  <span key={t} className={`contact-tag tag-${cls(t)}`}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {o.note && <div style={{ fontSize: 12, color: "var(--gray-600)", marginTop: 4, fontStyle: "italic" }}>{o.note}</div>}
                            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>
                              Added: {o.dateAdded}
                              {o.lastContactDate && <span> · Last contact: {o.lastContactDate}</span>}
                            </div>
                          </div>
                          {o.listing && (
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--gold)",
                                background: "#fdf8ec",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontWeight: 600
                              }}
                            >
                              {o.listing}
                            </span>
                          )}
                          {multi && (
                            <a
                              className="btn-outline"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              href={`mailto:?subject=${encodeURIComponent(
                                "GREA Contact Inquiry: " + g.contactName + " at " + g.accountName
                              )}&body=${encodeURIComponent(
                                "Hi " + o.brokerName + ",\r\n\r\nI see you manage " + g.contactName + " at " + g.accountName + ". I'd like to discuss a potential opportunity — could we connect?\r\n\r\nBest regards"
                              )}`}
                            >
                              Request Intro
                            </a>
                          )}
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() =>
                              setReportFor({
                                contactId: o.contactId,
                                title: `Issue with contact: ${g.contactName} (${o.office})`
                              })
                            }
                            title="Report an issue with this contact"
                          >
                            Report
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {reportFor && (
        <SubmitFeedbackModal
          profile={profile}
          onClose={() => setReportFor(null)}
          initialTitle={reportFor.title}
          contextUrl="/contacts"
          relatedContactId={reportFor.contactId}
        />
      )}
    </>
  );
}
