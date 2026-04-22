"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DealRecord, DealStage, Office, Profile } from "@/lib/types";
import { DEAL_STAGES, SECTOR_OPTIONS } from "@/lib/types";

interface Props {
  profile: Profile;
  offices: Office[];
  onClose: () => void;
  onCreated: (d: DealRecord) => void;
}

export default function NewDealModal({ profile, offices, onClose, onCreated }: Props) {
  const [dealName, setDealName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [officeId, setOfficeId] = useState(profile.office_id ?? "");
  const [stage, setStage] = useState<DealStage>("Lead");
  const [dealValue, setDealValue] = useState("");
  const [broker, setBroker] = useState(profile.name);
  const [omLink, setOmLink] = useState("");
  const [notes, setNotes] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleSector(s: string) {
    setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function save() {
    setErr(null);
    if (!dealName.trim() || !officeId) {
      setErr("Deal Name and Office are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .insert({
        deal_name: dealName.trim(),
        property_address: address.trim(),
        contact_name: contactName.trim(),
        account_name: accountName.trim(),
        office_id: officeId,
        assigned_broker_id: profile.id,
        assigned_broker_name: broker.trim(),
        stage,
        deal_value: dealValue ? parseFloat(dealValue) : null,
        sectors,
        notes: notes.trim() || null,
        om_link: omLink.trim() || null,
        created_by: profile.id
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      setErr(error.message);
      return;
    }
    await supabase.from("deal_stage_history").insert({ deal_id: data!.id, stage, note: "Deal created" });
    setSaving(false);
    onCreated(data as DealRecord);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 640 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, color: "var(--navy)" }}>New Deal</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>Add a new deal to the pipeline</p>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="form-label">Deal Name *</label>
            <input className="form-input" value={dealName} onChange={(e) => setDealName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Property Address</label>
            <input className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Contact Name</label>
              <input className="form-input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Account Name</label>
              <input className="form-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">Office *</label>
              <select className="form-input" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                <option value="">Select</option>
                {offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Stage *</label>
              <select className="form-input" value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
                {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Deal Value ($)</label>
              <input type="number" className="form-input" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Assigned Broker</label>
            <input className="form-input" value={broker} onChange={(e) => setBroker(e.target.value)} />
          </div>
          <div>
            <label className="form-label">OM Link (URL)</label>
            <input type="url" className="form-input" value={omLink} onChange={(e) => setOmLink(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="form-label">Sectors</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SECTOR_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip gold ${sectors.includes(s) ? "active" : ""}`}
                  onClick={() => toggleSector(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err && <div style={{ color: "#dc2626", fontSize: 12 }}>{err}</div>}
          <button className="btn-primary" onClick={save} disabled={saving} style={{ justifyContent: "center" }}>
            {saving ? "Saving…" : "Create Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
