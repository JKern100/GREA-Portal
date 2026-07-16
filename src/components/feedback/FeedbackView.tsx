"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { officeBadgeStyle } from "@/lib/officeColor";
import SubmitFeedbackModal from "@/components/feedback/SubmitFeedbackModal";
import type {
  FeedbackCategory,
  FeedbackComment,
  FeedbackItem,
  FeedbackStatus,
  Office,
  Profile
} from "@/lib/types";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@/lib/types";

interface Props {
  profile: Profile;
  initialItems: FeedbackItem[];
  profiles: Profile[];
  offices: Office[];
}

function statusColor(s: FeedbackStatus) {
  switch (s) {
    case "open":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "in_progress":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "resolved":
      return { bg: "#d1fae5", fg: "#065f46" };
    case "closed":
      return { bg: "#e5e7eb", fg: "#4b5563" };
  }
}

function categoryColor(c: FeedbackCategory) {
  switch (c) {
    case "bug":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "suggestion":
      return { bg: "#e0e7ff", fg: "#3730a3" };
    case "question":
      return { bg: "#f3e8ff", fg: "#6b21a8" };
    case "other":
      return { bg: "#f3f4f6", fg: "#4b5563" };
  }
}

function Badge({ children, color }: { children: React.ReactNode; color: { bg: string; fg: string } }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        background: color.bg,
        color: color.fg
      }}
    >
      {children}
    </span>
  );
}

function OfficeChip({ office }: { office: Office | null }) {
  // A ticket has no office when its submitter is a superadmin or an
  // unassigned user (office is derived from the submitter's profile). Render
  // an explicit muted pill rather than nothing, so the office is never
  // ambiguously blank in the list.
  if (!office) {
    return (
      <span
        title="No office — submitted by a superadmin or a user with no office assigned"
        style={{
          flexShrink: 0,
          padding: "4px 10px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          whiteSpace: "nowrap",
          background: "var(--gray-100)",
          color: "var(--gray-500)"
        }}
      >
        No office
      </span>
    );
  }
  // The .office-badge CSS class only colours nyc/nj/dc/atl. Guarantee a
  // visible chip for any other office by falling back to an inline style when
  // it has no stored colour and an unrecognised code.
  const known = ["nyc", "nj", "dc", "atl"].includes(office.code.toLowerCase());
  const style = office.color
    ? officeBadgeStyle(office, { flexShrink: 0 })
    : known
      ? { flexShrink: 0 }
      : { flexShrink: 0, background: "var(--gray-100)", color: "var(--navy)" };
  return (
    <span className={`office-badge ${office.code.toLowerCase()}`} style={style}>
      {office.code}
    </span>
  );
}

export default function FeedbackView({ profile, initialItems, profiles, offices }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<FeedbackItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  // When the user arrived via "Report" on a contact/deal row, the submit
  // modal opens automatically and we remember where they came from so we
  // can send them back on close/submit. Null means they opened the modal
  // manually from the Feedback page itself — stay put on close.
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  // URL-driven prefill captured once on mount, when arriving via ?submit=1.
  const [prefill, setPrefill] = useState<{
    title?: string;
    contextUrl: string | null;
    contactId: string | null;
    dealId: string | null;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("open");
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "superadmin" | "other">("all");
  const [officeFilter, setOfficeFilter] = useState<string | "all">("all");

  const profileById = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const officeById = useMemo(() => {
    const m: Record<string, Office> = {};
    offices.forEach((o) => (m[o.id] = o));
    return m;
  }, [offices]);

  // A ticket's office is the office of whoever submitted it (resolved live
  // through their profile). Null for tickets whose submitter has no office or
  // whose account was deleted.
  const officeForItem = useCallback(
    (i: FeedbackItem): Office | null => {
      const oid = i.submitted_by ? profileById[i.submitted_by]?.office_id : null;
      return oid ? officeById[oid] ?? null : null;
    },
    [profileById, officeById]
  );

  // For the superadmin-only assignee filter: who counts as "super admin"?
  // Anyone whose profile.role === "superadmin". We resolve item.assigned_to
  // through this set to bucket items into "super admin" vs "other".
  const superadminIds = useMemo(() => {
    const s = new Set<string>();
    profiles.forEach((p) => {
      if (p.role === "superadmin") s.add(p.id);
    });
    return s;
  }, [profiles]);

  const isAdmin = profile.role === "office_admin" || profile.role === "superadmin";
  const isSuperadmin = profile.role === "superadmin";

  // Auto-open submit when navigated from "Report issue" with ?submit=1.
  // (Report buttons on contact/deal rows now open the modal in-place;
  // this path is kept for any older bookmarks or external links.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("submit") === "1") {
      setPrefill({
        title: params.get("title") ?? undefined,
        contextUrl: params.get("context_url"),
        contactId: params.get("contact"),
        dealId: params.get("deal")
      });
      setShowSubmit(true);
      setReturnUrl(params.get("context_url"));
    }
  }, []);

  function closeSubmitModal() {
    setShowSubmit(false);
    if (returnUrl) {
      const target = returnUrl;
      setReturnUrl(null);
      router.push(target);
    }
  }

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (officeFilter !== "all" && officeForItem(i)?.id !== officeFilter) return false;
      if (assigneeFilter !== "all") {
        // "superadmin" → assignee's profile is role=superadmin
        // "other"      → unassigned, or assigned to a non-superadmin
        const assignedToSuper = !!i.assigned_to && superadminIds.has(i.assigned_to);
        if (assigneeFilter === "superadmin" && !assignedToSuper) return false;
        if (assigneeFilter === "other" && assignedToSuper) return false;
      }
      return true;
    });
  }, [items, statusFilter, categoryFilter, officeFilter, assigneeFilter, superadminIds, officeForItem]);

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  function upsertLocal(item: FeedbackItem) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === item.id);
      if (i === -1) return [item, ...prev];
      const next = [...prev];
      next[i] = item;
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 20, color: "var(--navy)" }}>Feedback</h2>
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
            Bugs, questions, ideas — all go here. Office admins triage for their office; Ariel (superadmin) resolves everything else.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {isSuperadmin && (
            <a
              className="btn-outline"
              href="/api/feedback/export"
              title="Download all feedback tickets (with comments) as a CSV"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              Export CSV
            </a>
          )}
          <button className="btn-primary" onClick={() => setShowSubmit(true)}>
            + Submit Feedback
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Status</label>
            <select
              className="form-input"
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | "all")}
            >
              <option value="all">All</option>
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Category</label>
            <select
              className="form-input"
              style={{ width: 160 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as FeedbackCategory | "all")}
            >
              <option value="all">All</option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {isSuperadmin && offices.length > 1 && (
            <div>
              <label className="form-label">Office</label>
              <select
                className="form-input"
                style={{ width: 160 }}
                value={officeFilter}
                onChange={(e) => setOfficeFilter(e.target.value)}
              >
                <option value="all">All</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isSuperadmin && (
            <div>
              <label className="form-label">Assigned to</label>
              <select
                className="form-input"
                style={{ width: 160 }}
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value as "all" | "superadmin" | "other")}
              >
                <option value="all">All</option>
                <option value="superadmin">Super Admin</option>
                <option value="other">Other (incl. unassigned)</option>
              </select>
            </div>
          )}
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray-500)" }}>
            Showing {filtered.length} of {items.length}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "minmax(340px, 400px) 1fr" : "1fr",
          gap: 14,
          alignItems: "start"
        }}
      >
        {selected ? (
          // Compact card list: with the detail panel open the column is narrow,
          // so a multi-column table would scroll sideways and wrap titles. Each
          // card stacks its fields vertically and truncates the title instead.
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {filtered.map((i) => {
              const office = officeForItem(i);
              const isSel = selectedId === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderLeft: `3px solid ${isSel ? "var(--navy)" : "transparent"}`,
                    borderBottom: "1px solid var(--gray-100)",
                    background: isSel ? "var(--gray-50)" : "transparent",
                    padding: "10px 12px",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                    <OfficeChip office={office} />
                    <span
                      title={i.title}
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--navy)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {i.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge color={categoryColor(i.category)}>{i.category}</Badge>
                    <Badge color={statusColor(i.status)}>{i.status.replace("_", " ")}</Badge>
                    <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                      {i.submitted_by ? profileById[i.submitted_by]?.name || "—" : "—"} ·{" "}
                      {new Date(i.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--gray-500)", padding: 20, fontSize: 13 }}>
                No feedback matches your filters.
              </div>
            )}
          </div>
        ) : (
          // Full-width table when nothing is selected — room for every column.
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Office</th>
                  <th>Submitter</th>
                  <th>Assigned</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const office = officeForItem(i);
                  return (
                    <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(i.id)}>
                      <td>
                        <strong>{i.title}</strong>
                      </td>
                      <td>
                        <Badge color={categoryColor(i.category)}>{i.category}</Badge>
                      </td>
                      <td>
                        <Badge color={statusColor(i.status)}>{i.status.replace("_", " ")}</Badge>
                      </td>
                      <td>
                        <OfficeChip office={office} />
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {i.submitted_by ? profileById[i.submitted_by]?.name || "—" : "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {i.assigned_to ? profileById[i.assigned_to]?.name || "—" : <em style={{ color: "var(--gray-400)" }}>unassigned</em>}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {new Date(i.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: 20, fontSize: 13 }}>
                      No feedback matches your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <FeedbackDetail
            key={selected.id}
            item={selected}
            profile={profile}
            profiles={profiles}
            office={officeForItem(selected)}
            isAdmin={isAdmin}
            onClose={() => setSelectedId(null)}
            onChange={upsertLocal}
          />
        )}
      </div>

      {showSubmit && (
        <SubmitFeedbackModal
          profile={profile}
          onClose={closeSubmitModal}
          initialTitle={prefill?.title}
          contextUrl={prefill?.contextUrl ?? null}
          relatedContactId={prefill?.contactId ?? null}
          relatedDealId={prefill?.dealId ?? null}
          onCreated={(item) => {
            setItems((prev) => [item, ...prev]);
            // If they came from Report, closeSubmitModal handles redirect.
            // If they opened it manually, keep them on /feedback and
            // surface the new item in the side panel.
            if (!returnUrl) setSelectedId(item.id);
          }}
        />
      )}
    </div>
  );
}

function FeedbackDetail({
  item,
  profile,
  profiles,
  office,
  isAdmin,
  onClose,
  onChange
}: {
  item: FeedbackItem;
  profile: Profile;
  profiles: Profile[];
  office: Office | null;
  isAdmin: boolean;
  onClose: () => void;
  onChange: (item: FeedbackItem) => void;
}) {
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const profileById = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("feedback_comments")
        .select("*")
        .eq("item_id", item.id)
        .order("created_at", { ascending: true });
      setComments((data as FeedbackComment[]) ?? []);
      setLoading(false);
    })();
  }, [item.id]);

  const canEditMeta = isAdmin;

  async function updateField(patch: Partial<FeedbackItem>) {
    const supabase = createClient();
    const next = patch.status === "resolved" ? { ...patch, resolved_at: new Date().toISOString() } : patch;
    const { data, error } = await supabase
      .from("feedback_items")
      .update(next)
      .eq("id", item.id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) onChange(data as FeedbackItem);
  }

  async function postComment() {
    const body = newComment.trim();
    if (!body) return;
    setPosting(true);
    const supabase = createClient();
    // RLS check on feedback_comments_insert is `author_id = auth.uid()`,
    // which is the REAL signed-in user — not the impersonated profile. Use
    // the real id when impersonating so the policy allows the insert and
    // the audit trail correctly attributes the comment to the actual person.
    const authorId = profile._impersonatedBy?.id ?? profile.id;
    const { data, error } = await supabase
      .from("feedback_comments")
      .insert({ item_id: item.id, author_id: authorId, body })
      .select()
      .single();
    setPosting(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      setComments((prev) => [...prev, data as FeedbackComment]);
      setNewComment("");
    }
  }

  return (
    <div className="card" style={{ position: "sticky", top: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <Badge color={categoryColor(item.category)}>{item.category}</Badge>
            <Badge color={statusColor(item.status)}>{item.status.replace("_", " ")}</Badge>
            <OfficeChip office={office} />
          </div>
          <h3 style={{ fontSize: 16, color: "var(--navy)", marginTop: 4 }}>{item.title}</h3>
          <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>
            Submitted{" "}
            {item.submitted_by && profileById[item.submitted_by]
              ? `by ${profileById[item.submitted_by].name || profileById[item.submitted_by].email}`
              : ""}
            {office ? ` (${office.name})` : ""}{" "}
            on {new Date(item.created_at).toLocaleString()}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--gray-400)" }}>
          ×
        </button>
      </div>

      {item.body && (
        <div
          style={{
            fontSize: 13,
            marginTop: 12,
            padding: 10,
            background: "var(--gray-50)",
            borderRadius: 6,
            whiteSpace: "pre-wrap"
          }}
        >
          {item.body}
        </div>
      )}

      {item.context_url && (
        <div style={{ fontSize: 12, marginTop: 8, color: "var(--gray-500)" }}>
          Submitted from: <code style={{ fontSize: 11 }}>{item.context_url}</code>
        </div>
      )}

      {canEditMeta && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid var(--gray-200)" }}>
          <div>
            <label className="form-label">Status</label>
            <select
              className="form-input"
              style={{ padding: "4px 6px", fontSize: 12, width: 140 }}
              value={item.status}
              onChange={(e) => updateField({ status: e.target.value as FeedbackStatus })}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Category</label>
            <select
              className="form-input"
              style={{ padding: "4px 6px", fontSize: 12, width: 140 }}
              value={item.category}
              onChange={(e) => updateField({ category: e.target.value as FeedbackCategory })}
            >
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Assigned to</label>
            <select
              className="form-input"
              style={{ padding: "4px 6px", fontSize: 12, width: 180 }}
              value={item.assigned_to ?? ""}
              onChange={(e) => updateField({ assigned_to: e.target.value || null })}
            >
              <option value="">—</option>
              {profiles
                .filter((p) => p.role === "office_admin" || p.role === "superadmin")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email} ({p.role})
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      <h4 style={{ fontSize: 13, color: "var(--navy)", marginTop: 18, marginBottom: 8 }}>Comments</h4>
      <div style={{ display: "grid", gap: 8 }}>
        {loading && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>Loading…</div>}
        {!loading && comments.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--gray-400)", fontStyle: "italic" }}>No comments yet.</div>
        )}
        {comments.map((c) => {
          const author = c.author_id ? profileById[c.author_id] : null;
          return (
            <div key={c.id} style={{ border: "1px solid var(--gray-200)", borderRadius: 6, padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--gray-500)", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--navy)" }}>
                  {author ? author.name || author.email : "Unknown"}
                </span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <textarea
          className="form-input"
          rows={2}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          style={{ resize: "vertical" }}
        />
        <button
          className="btn-primary"
          style={{ marginTop: 6 }}
          onClick={postComment}
          disabled={posting || !newComment.trim()}
        >
          {posting ? "Posting…" : "Post Comment"}
        </button>
      </div>
    </div>
  );
}

