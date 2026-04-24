"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ContactRecord, DealRecord, Office, Profile } from "@/lib/types";

interface Props {
  office: Office;
  members: Profile[];
  contacts: ContactRecord[];
  deals: DealRecord[];
  currentUserId: string;
}

function formatValue(v: number | null) {
  if (!v) return "—";
  return "$" + v.toLocaleString();
}

export default function MyOfficeAdmin({
  office,
  members: initialMembers,
  contacts: initialContacts,
  deals: initialDeals,
  currentUserId
}: Props) {
  const router = useRouter();
  const [members] = useState(initialMembers);
  const [contacts, setContacts] = useState(initialContacts);
  const [deals, setDeals] = useState(initialDeals);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [dealQuery, setDealQuery] = useState("");

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.contact_name.toLowerCase().includes(q) ||
        c.account_name.toLowerCase().includes(q) ||
        (c.broker_name_snapshot || "").toLowerCase().includes(q)
    );
  }, [contacts, contactQuery]);

  const filteredDeals = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.deal_name.toLowerCase().includes(q) ||
        (d.seller_name || "").toLowerCase().includes(q) ||
        (d.buyer_name || "").toLowerCase().includes(q) ||
        (d.property_type || "").toLowerCase().includes(q) ||
        (d.assigned_broker_name || "").toLowerCase().includes(q)
    );
  }, [deals, dealQuery]);

  async function sendInvite() {
    setInviteErr(null);
    setInviteOk(null);
    const email = inviteEmail.trim();
    if (!email) {
      setInviteErr("Email is required.");
      return;
    }
    setInviting(true);
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name: inviteName.trim() || undefined })
    });
    setInviting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteErr(body.error ?? "Failed to send invite.");
      return;
    }
    setInviteOk(`Invite sent to ${email}.`);
    setInviteEmail("");
    setInviteName("");
    router.refresh();
  }

  async function toggleContactConfidential(id: string, next: boolean) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .update({ is_confidential: next })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setContacts((prev) => prev.map((c) => (c.id === id ? (data as ContactRecord) : c)));
  }

  async function toggleDealConfidential(id: string, next: boolean) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .update({ is_confidential: next })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setDeals((prev) => prev.map((d) => (d.id === id ? (data as DealRecord) : d)));
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>
        My Office — {office.code} <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>({office.name})</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        Manage your office&apos;s settings, invite brokers, and flag sensitive records as confidential.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>Invite Broker</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="form-label">Email *</label>
            <input
              className="form-input"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="broker@example.com"
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Broker" />
          </div>
          <button className="btn-primary" onClick={sendInvite} disabled={inviting}>
            {inviting ? "Sending…" : "Send Invite"}
          </button>
        </div>
        {inviteErr && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{inviteErr}</div>}
        {inviteOk && <div style={{ color: "#15803d", fontSize: 12, marginTop: 8 }}>{inviteOk}</div>}
        <p style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 10 }}>
          Invited users receive an email with a sign-in link and join as brokers in <strong>{office.code}</strong>.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 18 }}>
        <div style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          Office Members ({members.length})
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name || "—"}</td>
                <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                  {m.email}
                  {m.id === currentUserId && <span style={{ marginLeft: 6, color: "var(--gold)", fontWeight: 600 }}>(you)</span>}
                </td>
                <td style={{ textTransform: "capitalize" }}>{m.role.replace("_", " ")}</td>
                <td>{m.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 18 }}>
        <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
            Office Contacts ({contacts.length})
          </div>
          <input
            className="form-input"
            style={{ marginLeft: "auto", width: 240 }}
            placeholder="Filter contacts…"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Account</th>
              <th>Broker</th>
              <th>Added</th>
              <th style={{ textAlign: "center" }}>Confidential</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.contact_name}</strong></td>
                <td>{c.account_name}</td>
                <td style={{ fontSize: 12 }}>{c.broker_name_snapshot || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.date_added}</td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={c.is_confidential}
                    onChange={(e) => toggleContactConfidential(c.id, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
            {filteredContacts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                  No contacts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
            Office Deals ({deals.length})
          </div>
          <input
            className="form-input"
            style={{ marginLeft: "auto", width: 240 }}
            placeholder="Filter deals…"
            value={dealQuery}
            onChange={(e) => setDealQuery(e.target.value)}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Deal</th>
              <th>Type</th>
              <th>Seller / Buyer</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Broker</th>
              <th style={{ textAlign: "center" }}>Confidential</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.deal_name}</strong></td>
                <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{d.property_type || "—"}</td>
                <td style={{ fontSize: 12 }}>
                  <div>
                    <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>S:</span> {d.seller_name || "—"}
                  </div>
                  <div>
                    <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>B:</span> {d.buyer_name || "—"}
                  </div>
                </td>
                <td>
                  <span className={`stage-badge stage-${d.stage.toLowerCase()}`}>{d.stage}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{formatValue(d.deal_value)}</td>
                <td style={{ fontSize: 12 }}>{d.assigned_broker_name || "—"}</td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={d.is_confidential}
                    onChange={(e) => toggleDealConfidential(d.id, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
            {filteredDeals.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                  No deals match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
