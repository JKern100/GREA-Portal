"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContactRecord, Office, Profile } from "@/lib/types";
import { TAG_OPTIONS, SECTOR_OPTIONS } from "@/lib/types";

interface Props {
  offices: Office[];
  profile: Profile;
  onClose: () => void;
  onCreated: (c: ContactRecord) => void;
}

export default function AddContactModal({ offices, profile, onClose, onCreated }: Props) {
  const [contactName, setContactName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [officeId, setOfficeId] = useState(profile.office_id ?? "");
  const [brokerName, setBrokerName] = useState(profile.name);
  const [brokerPhone, setBrokerPhone] = useState(profile.phone ?? "");
  const [dateAdded, setDateAdded] = useState(new Date().toISOString().split("T")[0]);
  const [listing, setListing] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleIn(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function save() {
    setErr(null);
    if (!contactName.trim() || !accountName.trim() || !officeId || !brokerName.trim()) {
      setErr("Contact, account, office, and broker are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        contact_name: contactName.trim(),
        account_name: accountName.trim(),
        office_id: officeId,
        broker_id: profile.id,
        broker_name_snapshot: brokerName.trim(),
        broker_phone_snapshot: brokerPhone.trim(),
        listing: listing.trim() || null,
        note: note.trim() || null,
        tags,
        sectors,
        date_added: dateAdded,
        created_by: profile.id
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onCreated(data as ContactRecord);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 640 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, color: "var(--navy)" }}>Add Contact</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>
          Add a new contact to your office&apos;s directory
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Contact Name *</label>
              <input className="form-input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Account / Company *</label>
              <input className="form-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Managing Broker *</label>
              <input className="form-input" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Broker Phone</label>
              <input className="form-input" value={brokerPhone} onChange={(e) => setBrokerPhone(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Office *</label>
              <select className="form-input" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                <option value="">Select office…</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Date Added</label>
              <input type="date" className="form-input" value={dateAdded} onChange={(e) => setDateAdded(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Current Listing</label>
              <input className="form-input" value={listing} onChange={(e) => setListing(e.target.value)} placeholder="e.g. 125 W 72nd St (optional)" />
            </div>
            <div>
              <label className="form-label">Note</label>
              <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Brief context (optional)" />
            </div>
          </div>

          <div>
            <label className="form-label">Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TAG_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip ${tags.includes(t) ? "active" : ""}`}
                  onClick={() => toggleIn(tags, setTags, t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Sectors</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SECTOR_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip gold ${sectors.includes(s) ? "active" : ""}`}
                  onClick={() => toggleIn(sectors, setSectors, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {err && <div style={{ color: "#dc2626", fontSize: 12 }}>{err}</div>}
          <button className="btn-primary" onClick={save} disabled={saving} style={{ justifyContent: "center" }}>
            {saving ? "Saving…" : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
