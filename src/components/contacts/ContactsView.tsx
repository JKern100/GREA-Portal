"use client";

import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import SubmitFeedbackModal from "@/components/feedback/SubmitFeedbackModal";
import { officeBadgeStyle } from "@/lib/officeColor";
import type { ContactRecord, Office, Profile } from "@/lib/types";
import { useIsAndroid, useIsIOS, useIsMobile } from "@/lib/useIsMobile";

interface Props {
  profile: Profile;
  offices: Office[];
  initialContacts: ContactRecord[];
  profiles: Profile[];
}

type SearchType = "all" | "contact" | "account";
type GroupBy = "contact" | "company";

interface OfficeGroupEntry {
  office: string;
  officeId: string;
  contactId: string;
  /** The contact person's name on this specific record. Same across all
   * entries of a Contact-mode group, but distinct per entry in Company mode. */
  contactName: string;
  brokerName: string;
  brokerPhone: string;
  brokerEmail: string | null;
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

export default function ContactsView({ profile, offices, initialContacts, profiles }: Props) {
  const isMobile = useIsMobile();
  const isIOS = useIsIOS();
  const isAndroid = useIsAndroid();
  const [contacts] = useState<ContactRecord[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("contact");
  const [lastQuery, setLastQuery] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [sectorFilters, setSectorFilters] = useState<string[]>([]);
  const [sharingFilter, setSharingFilter] = useState<"all" | "shared">("all");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // Report modal — opened in-place over the Contacts page so the user
  // doesn't lose their search/scroll position.
  const [reportFor, setReportFor] = useState<{ contactId: string; title: string } | null>(null);


  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  // Broker email lookup. ContactRecord doesn't snapshot broker email
  // (only name and phone), so we resolve it at render time from the
  // profiles list keyed by broker_id. Falls back to null when the
  // contact has no assigned broker, or when the broker's profile is
  // gone.
  const brokerEmailById = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      if (p.email) m[p.id] = p.email;
    });
    return m;
  }, [profiles]);

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

  // `modeOverride` lets the Group-by toggle re-run the current query under the
  // new grouping without waiting for the async setGroupBy to settle.
  function runSearch(modeOverride?: GroupBy) {
    const mode = modeOverride ?? groupBy;
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
        contactName: item.contact_name,
        brokerName: item.broker_name_snapshot || "",
        brokerPhone: item.broker_phone_snapshot || "",
        brokerEmail: (item.broker_id && brokerEmailById[item.broker_id]) || null,
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
        if (mode === "company") {
          // Group by company (account name) alone. A company legitimately has
          // many contacts, possibly several in the same office — so, unlike
          // Contact mode, we do NOT dedupe by office here.
          const acctFuse = new Fuse([{ n: g.accountName }], { keys: ["n"], threshold, ignoreLocation: true });
          if (acctFuse.search(item.account_name).length > 0) {
            g.offices.push(entry);
            if ((r.score ?? 1) < g.score) g.score = r.score ?? 1;
            merged = true;
            break;
          }
        } else {
          // Contact mode: same person = same contact name AND account name.
          // One entry per office (dedupe) so a person shows once per office.
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

  function changeGroupBy(next: GroupBy) {
    if (next === groupBy) return;
    setGroupBy(next);
    // Re-run the already-searched query under the new grouping so the toggle
    // feels live; no-op if nothing has been searched yet.
    if (groups !== null) runSearch(next);
  }

  // Distinct offices in a group — the honest "how many offices touch this"
  // count. In Company mode g.offices can hold several contacts from one
  // office, so length alone would overstate cross-office reach.
  function distinctOfficeCount(g: Group): number {
    return new Set(g.offices.map((o) => o.officeId)).size;
  }

  const filteredGroups = useMemo(() => {
    if (!groups) return null;
    return groups.filter((g) => {
      if (sharingFilter === "shared" && distinctOfficeCount(g) < 2) return false;
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
  }, [groups, tagFilters, sectorFilters, sharingFilter]);

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
            style={{ flex: 1, minWidth: isMobile ? 0 : 260, fontSize: 16, padding: "12px 16px" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Enter a contact name or account name…"
            autoComplete="off"
          />
          <button
            className="btn-primary"
            style={{ padding: "12px 22px", ...(isMobile ? { width: "100%" } : {}) }}
            onClick={() => runSearch()}
          >
            Search
          </button>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--gray-500)", marginRight: 2 }}>Group by:</span>
            {([
              ["contact", "Contact"],
              ["company", "Company"]
            ] as [GroupBy, string][]).map(([v, label]) => (
            <label
              key={v}
              title={
                v === "company"
                  ? "Group results by company — see every contact you have at a company, across all offices"
                  : "Group results by person — see which offices share a contact"
              }
              style={{
                padding: "6px 12px",
                border: "1px solid var(--gray-200)",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
                background: groupBy === v ? "var(--gold)" : "white",
                color: groupBy === v ? "var(--navy)" : "var(--gray-600)",
                fontWeight: groupBy === v ? 700 : 400
              }}
            >
              <input
                type="radio"
                name="groupby"
                value={v}
                checked={groupBy === v}
                onChange={() => changeGroupBy(v)}
                style={{ display: "none" }}
              />
              {label}
            </label>
            ))}
          </div>
        </div>
      </section>

      {groups !== null && (
        <>
          <div style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 14, padding: "0 4px" }}>
            Found <strong>{filteredGroups?.length ?? 0}</strong> match{(filteredGroups?.length ?? 0) === 1 ? "" : "es"}{" "}
            {(filteredGroups?.length ?? 0) !== groups.length && (
              <span style={{ color: "var(--gray-400)" }}>(of {groups.length})</span>
            )}{" "}
            for <strong>&quot;{lastQuery}&quot;</strong>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--gray-500)", marginRight: 4 }}>Show:</span>
            <button
              className={`chip ${sharingFilter === "all" ? "active" : ""}`}
              onClick={() => setSharingFilter("all")}
            >
              All contacts
            </button>
            <button
              className={`chip ${sharingFilter === "shared" ? "active" : ""}`}
              onClick={() => setSharingFilter("shared")}
              title="Only contacts owned by more than one office"
            >
              Shared only
            </button>
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

          {(filteredGroups?.length ?? 0) === 0 ? (
            groups.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>No matches for &quot;{lastQuery}&quot;</h3>
                <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Try a different spelling or search by account.</p>
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>No contacts match the active filters</h3>
                <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
                  {groups.length} contact{groups.length === 1 ? "" : "s"} matched &quot;{lastQuery}&quot;, but none survive the
                  current chips. Switch back to <strong>All contacts</strong> or clear sector/tag filters above.
                </p>
              </div>
            )
          ) : (
            <div>
              {filteredGroups!.map((g, i) => {
              const officeCount = distinctOfficeCount(g);
              const multi = officeCount > 1;
              const allSectors = Array.from(new Set(g.offices.flatMap((o) => o.sectors)));
              // Distinct office badges for the header (Company mode can hold
              // several contacts from the same office; show each office once).
              const headerOffices = Array.from(
                new Map(g.offices.map((o) => [o.officeId, o])).values()
              );
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
                      {groupBy === "company" ? (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>{g.accountName}</div>
                          <div style={{ fontSize: 14, color: "var(--gray-600)" }}>
                            {g.offices.length} contact{g.offices.length === 1 ? "" : "s"}
                            {multi && ` · ${officeCount} offices`}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>{g.contactName}</div>
                          <div style={{ fontSize: 14, color: "var(--gray-600)" }}>{g.accountName}</div>
                        </>
                      )}
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
                      {headerOffices.map((o) => (
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
                      ★ {groupBy === "company" ? "Cross-office company" : "Cross-office relationship"} — present in{" "}
                      {officeCount} offices
                    </div>
                  )}
                  {expanded[i] && (
                    <div style={{ borderTop: "1px solid var(--gray-100)" }}>
                      {g.offices.map((o, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            alignItems: isMobile ? "stretch" : "center",
                            padding: isMobile ? "12px 14px" : "14px 24px",
                            borderBottom: idx < g.offices.length - 1 ? "1px solid var(--gray-100)" : "none",
                            gap: isMobile ? 8 : 10
                          }}
                        >
                          <div
                            style={{
                              width: isMobile ? "auto" : 44,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "var(--gray-500)"
                            }}
                          >
                            {o.office}
                          </div>
                          <div style={{ flex: 1 }}>
                            {groupBy === "company" && (
                              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", marginBottom: 3 }}>
                                {o.contactName || "—"}
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-400)" }}>
                                GREA broker:
                              </span>
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
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-400)", marginRight: 4 }}>
                                  Broker phone:
                                </span>
                                <a href={`tel:${o.brokerPhone}`} style={{ color: "var(--navy)", textDecoration: "none" }}>
                                  {o.brokerPhone}
                                </a>
                              </div>
                            )}
                            {o.contactPhone && (
                              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-400)", marginRight: 4 }}>
                                  Contact phone:
                                </span>
                                <a href={`tel:${o.contactPhone}`} style={{ color: "var(--navy)" }}>
                                  {o.contactPhone}
                                </a>
                              </div>
                            )}
                            {o.contactEmail && (
                              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-400)", marginRight: 4 }}>
                                  Contact email:
                                </span>
                                <a href={`mailto:${o.contactEmail}`} style={{ color: "var(--navy)" }}>
                                  {o.contactEmail}
                                </a>
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
                          {(() => {
                            const subject = "GREA Contact Inquiry: " + o.contactName + " at " + g.accountName;
                            const body =
                              "Hi " + o.brokerName + ",\r\n\r\nI see you manage " + o.contactName + " at " + g.accountName + ". I'd like to discuss a potential opportunity — could we connect?\r\n\r\nBest regards";
                            const to = o.brokerEmail || "";
                            const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            // Gmail's web compose URL works on desktop, but
                            // on mobile both iOS and Android deeplink it to
                            // the native Gmail app, which silently drops
                            // the ?su= and ?body= params. The fix is
                            // platform-specific:
                            //   iOS: googlegmail:///co?to=&subject=&body=
                            //   Android: Chrome intent:// URL invoking
                            //     android.intent.action.SENDTO on Gmail's
                            //     mailto: handler with SUBJECT/TEXT/EMAIL
                            //     extras.
                            //   Desktop: the regular mail.google.com URL.
                            let gmail: string;
                            if (isIOS) {
                              gmail = `googlegmail:///co?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            } else if (isAndroid) {
                              // Previous attempts:
                              //   1. ACTION_SEND + type=text/plain → Chrome
                              //      bounced to Play Store (the SEND
                              //      activity isn't BROWSABLE).
                              //   2. SENDTO + scheme=mailto via intent://
                              //      with the email in the authority
                              //      position → subject/body filled but
                              //      To: stayed empty. The // makes Chrome
                              //      reconstruct the data URI as
                              //      `mailto://addr?…` and Android's
                              //      MailTo.parse() requires the canonical
                              //      `mailto:addr?…` (no //) to extract the
                              //      recipient.
                              //
                              // Use the slash-less form with the email in
                              // the URI's path position. Drop the EMAIL
                              // extra — Gmail's mailto handler reads the
                              // recipient straight from the data URI, and
                              // the EMAIL extra was being ignored anyway.
                              const enc = (s: string) => encodeURIComponent(s);
                              const fallback = mailto;
                              gmail =
                                `intent:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}` +
                                `#Intent` +
                                `;action=android.intent.action.SENDTO` +
                                `;scheme=mailto` +
                                `;package=com.google.android.gm` +
                                `;S.android.intent.extra.SUBJECT=${enc(subject)}` +
                                `;S.android.intent.extra.TEXT=${enc(body)}` +
                                `;S.browser_fallback_url=${enc(fallback)}` +
                                `;end`;
                            } else {
                              // fs=1 forces the full-screen compose pane
                              // so the user lands on the message instead of
                              // the inbox.
                              gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            }
                            const reportClick = () =>
                              setReportFor({
                                contactId: o.contactId,
                                title: `Issue with contact: ${o.contactName} (${o.office})`
                              });
                            if (isMobile) {
                              // Mobile: full-width row of equal-flex
                              // buttons. On Android we drop the Gmail
                              // button entirely — Chrome's intent URL
                              // machinery can't produce a clean
                              // mailto:addr?... data URI (the // sneaks
                              // back in regardless of input form), and
                              // Gmail's recipient parser silently rejects
                              // mailto://addr?... so the To: field stays
                              // empty. Mailto via the Email button opens
                              // whatever mail app the user has set as
                              // their Android default (which they can
                              // change to Gmail in Settings → Apps →
                              // Default apps if they want).
                              const btnStyle = {
                                padding: "8px 8px",
                                fontSize: 12,
                                flex: 1,
                                textAlign: "center" as const
                              };
                              const mailLabel = isAndroid ? "Email" : "Outlook";
                              const mailTitle = isAndroid
                                ? "Opens your default mail app (set in Android Settings → Apps → Default apps)"
                                : "Open in your default mail client";
                              return (
                                <div style={{ display: "flex", gap: 6, width: "100%", marginTop: 4 }}>
                                  <a
                                    className="btn-outline"
                                    style={btnStyle}
                                    href={mailto}
                                    title={mailTitle}
                                  >
                                    {mailLabel}
                                  </a>
                                  {!isAndroid && (
                                    <a
                                      className="btn-outline"
                                      style={btnStyle}
                                      href={gmail}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Open a Gmail compose window in a new tab"
                                    >
                                      Gmail
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-outline"
                                    style={btnStyle}
                                    onClick={reportClick}
                                    title="Report an issue with this contact"
                                  >
                                    Report
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <>
                                <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                                  <span style={{ fontSize: 11, color: "var(--gray-500)" }}>Intro:</span>
                                  <a
                                    className="btn-outline"
                                    style={{ padding: "4px 10px", fontSize: 11 }}
                                    href={mailto}
                                    title="Open in your default mail client (e.g. Outlook)"
                                  >
                                    Outlook
                                  </a>
                                  <a
                                    className="btn-outline"
                                    style={{ padding: "4px 10px", fontSize: 11 }}
                                    href={gmail}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open a Gmail compose window in a new tab"
                                  >
                                    Gmail
                                  </a>
                                </div>
                                <button
                                  type="button"
                                  className="btn-outline"
                                  style={{ padding: "4px 10px", fontSize: 11 }}
                                  onClick={reportClick}
                                  title="Report an issue with this contact"
                                >
                                  Report
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
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
