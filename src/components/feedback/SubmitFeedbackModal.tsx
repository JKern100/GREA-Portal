"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FEEDBACK_CATEGORIES } from "@/lib/types";
import type { FeedbackCategory, FeedbackItem, Profile } from "@/lib/types";

interface Props {
  profile: Profile;
  onClose: () => void;
  /** Optional callback fired after a successful insert, with the new row. */
  onCreated?: (item: FeedbackItem) => void;
  /** Pre-fill the title — typically used by Report buttons. */
  initialTitle?: string;
  /** Page the user was on when they clicked Report. Stored on the item. */
  contextUrl?: string | null;
  relatedContactId?: string | null;
  relatedDealId?: string | null;
}

export default function SubmitFeedbackModal({
  profile,
  onClose,
  onCreated,
  initialTitle,
  contextUrl = null,
  relatedContactId = null,
  relatedDealId = null
}: Props) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // RLS check on feedback_items_insert is `submitted_by = auth.uid()`,
    // which is the REAL signed-in user — not the impersonated profile. Use
    // the real id when impersonating so the policy allows the insert and
    // the audit trail correctly attributes the submission to the actual
    // person clicking Submit.
    const submittedBy = profile._impersonatedBy?.id ?? profile.id;
    const { data, error } = await supabase
      .from("feedback_items")
      .insert({
        title: title.trim(),
        body: body.trim(),
        category,
        submitted_by: submittedBy,
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
    if (data) {
      setDone(true);
      onCreated?.(data as FeedbackItem);
      // Brief success state, then close so the user sees the page they
      // were on rather than a stale modal.
      setTimeout(onClose, 900);
    }
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

        {done ? (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 6,
              padding: 14,
              fontSize: 13,
              color: "#065f46"
            }}
          >
            Thanks — feedback submitted.
          </div>
        ) : (
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
            <button
              className="btn-primary"
              onClick={submit}
              disabled={saving}
              style={{ justifyContent: "center" }}
            >
              {saving ? "Submitting…" : "Submit"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
