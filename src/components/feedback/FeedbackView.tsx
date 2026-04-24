"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  FeedbackCategory,
  FeedbackComment,
  FeedbackItem,
  FeedbackStatus,
  Profile
} from "@/lib/types";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@/lib/types";

interface Props {
  profile: Profile;
  initialItems: FeedbackItem[];
  profiles: Profile[];
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

export default function FeedbackView({ profile, initialItems, profiles }: Props) {
  const [items, setItems] = useState<FeedbackItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("open");
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | "all">("all");

  const profileById = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const isAdmin = profile.role === "office_admin" || profile.role === "superadmin";

  // Auto-open submit when navigated from "Report issue" with ?submit=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("submit") === "1") setShowSubmit(true);
  }, []);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      return true;
    });
  }, [items, statusFilter, categoryFilter]);

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
        <button className="btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowSubmit(true)}>
          + Submit Feedback
        </button>
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
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray-500)" }}>
            Showing {filtered.length} of {items.length}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.2fr" : "1fr", gap: 14, alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Submitter</th>
                <th>Assigned</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr
                  key={i.id}
                  style={{
                    cursor: "pointer",
                    background: selectedId === i.id ? "var(--gray-50)" : undefined
                  }}
                  onClick={() => setSelectedId(i.id)}
                >
                  <td>
                    <strong>{i.title}</strong>
                  </td>
                  <td>
                    <Badge color={categoryColor(i.category)}>{i.category}</Badge>
                  </td>
                  <td>
                    <Badge color={statusColor(i.status)}>{i.status.replace("_", " ")}</Badge>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)", padding: 20, fontSize: 13 }}>
                    No feedback matches your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <FeedbackDetail
            key={selected.id}
            item={selected}
            profile={profile}
            profiles={profiles}
            isAdmin={isAdmin}
            onClose={() => setSelectedId(null)}
            onChange={upsertLocal}
          />
        )}
      </div>

      {showSubmit && (
        <SubmitModal
          profile={profile}
          onClose={() => setShowSubmit(false)}
          onCreated={(item) => {
            setItems((prev) => [item, ...prev]);
            setSelectedId(item.id);
            setShowSubmit(false);
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
  isAdmin,
  onClose,
  onChange
}: {
  item: FeedbackItem;
  profile: Profile;
  profiles: Profile[];
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
    const { data, error } = await supabase
      .from("feedback_comments")
      .insert({ item_id: item.id, author_id: profile.id, body })
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
          </div>
          <h3 style={{ fontSize: 16, color: "var(--navy)", marginTop: 4 }}>{item.title}</h3>
          <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>
            Submitted{" "}
            {item.submitted_by && profileById[item.submitted_by]
              ? `by ${profileById[item.submitted_by].name || profileById[item.submitted_by].email}`
              : ""}{" "}
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

function SubmitModal({
  profile,
  onClose,
  onCreated
}: {
  profile: Profile;
  onClose: () => void;
  onCreated: (item: FeedbackItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [contextUrl, setContextUrl] = useState<string | null>(null);
  const [relatedContactId, setRelatedContactId] = useState<string | null>(null);
  const [relatedDealId, setRelatedDealId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("title");
    if (t) setTitle(t);
    setContextUrl(params.get("context_url"));
    setRelatedContactId(params.get("contact"));
    setRelatedDealId(params.get("deal"));
  }, []);

  async function submit() {
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("feedback_items")
      .insert({
        title: title.trim(),
        body: body.trim(),
        category,
        submitted_by: profile.id,
        context_url: contextUrl,
        related_contact_id: relatedContactId,
        related_deal_id: relatedDealId
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data) onCreated(data as FeedbackItem);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 560 }}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2 style={{ fontSize: 18, color: "var(--navy)" }}>Submit Feedback</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 14 }}>
          Describe the bug, question, or suggestion. Your office admin (and Ariel) will see it.
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label className="form-label">Category</label>
            <select
              className="form-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            >
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Title *</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div>
            <label className="form-label">Details</label>
            <textarea
              className="form-input"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Steps to reproduce, what you expected vs. what happened, any context…"
              style={{ resize: "vertical" }}
            />
          </div>
          {contextUrl && (
            <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
              Attached context: <code>{contextUrl}</code>
            </div>
          )}
          {err && <div style={{ color: "#dc2626", fontSize: 12 }}>{err}</div>}
          <button className="btn-primary" onClick={submit} disabled={saving} style={{ justifyContent: "center" }}>
            {saving ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
