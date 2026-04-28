"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { revalidateVisibilityCaches } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import type { DealRecord } from "@/lib/types";
import DealsImportModal from "./DealsImportModal";

interface Props {
  deals: DealRecord[];
  officeId: string;
}

function formatValue(v: number | null) {
  if (!v) return "—";
  return "$" + v.toLocaleString();
}

export default function MyOfficeDeals({ deals: initial, officeId }: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showWipe, setShowWipe] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeErr, setWipeErr] = useState<string | null>(null);

  // After a bulk import the modal calls router.refresh(), which re-runs the
  // server component and produces a fresh `initial` prop. Sync it down so the
  // table reflects the new data without requiring a full page reload.
  useEffect(() => {
    setDeals(initial);
  }, [initial]);

  async function wipeAll() {
    setWiping(true);
    setWipeErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("deals").delete().eq("office_id", officeId);
    setWiping(false);
    if (error) {
      setWipeErr(error.message);
      return;
    }
    setDeals([]);
    setShowWipe(false);
    setWipeConfirmText("");
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.deal_name.toLowerCase().includes(q) ||
        (d.seller_name || "").toLowerCase().includes(q) ||
        (d.buyer_name || "").toLowerCase().includes(q) ||
        (d.property_type || "").toLowerCase().includes(q) ||
        (d.assigned_broker_name || "").toLowerCase().includes(q)
    );
  }, [deals, query]);

  async function toggleConfidential(id: string, next: boolean) {
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
    await revalidateVisibilityCaches();
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <div style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Office Deals ({deals.length})</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <a className="btn-outline" href="/api/deals/export?format=csv">
            Export CSV
          </a>
          <a className="btn-outline" href="/api/deals/export?format=xlsx">
            Export Excel
          </a>
          <a className="btn-outline" href="/api/deals/template?format=csv">
            Download template
          </a>
          <button className="btn-primary" onClick={() => setShowImport(true)}>
            Upload pipeline
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              setWipeErr(null);
              setWipeConfirmText("");
              setShowWipe(true);
            }}
            disabled={deals.length === 0}
            title={
              deals.length === 0
                ? "No deals to delete"
                : "Delete every deal in your office (independent of upload)"
            }
          >
            Delete all
          </button>
          <input
            className="form-input"
            style={{ width: 240 }}
            placeholder="Filter deals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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
            <th style={{ textAlign: "center" }}>Hide</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <tr key={d.id}>
              <td><strong>{d.deal_name}</strong></td>
              <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{d.property_type || "—"}</td>
              <td style={{ fontSize: 12 }}>
                <div>
                  <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>S:</span>{" "}
                  {d.seller_name || "—"}
                </div>
                <div>
                  <span style={{ color: "var(--gray-500)", fontSize: 10, textTransform: "uppercase" }}>B:</span>{" "}
                  {d.buyer_name || "—"}
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
                  onChange={(e) => toggleConfidential(d.id, e.target.checked)}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", fontSize: 13, padding: 14 }}>
                No deals match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showImport && <DealsImportModal onClose={() => setShowImport(false)} />}

      {showWipe && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !wiping && setShowWipe(false)}
        >
          <div className="modal-panel" style={{ maxWidth: 480 }}>
            <button
              className="modal-close"
              onClick={() => !wiping && setShowWipe(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h3 style={{ fontSize: 18, color: "#991b1b", marginBottom: 6 }}>
              Delete every deal in this office?
            </h3>
            <p style={{ fontSize: 13, color: "var(--gray-700)", marginBottom: 12 }}>
              This will permanently remove all <strong>{deals.length}</strong> deal
              {deals.length === 1 ? "" : "s"} currently in your office&apos;s pipeline — including
              hidden ones. This action cannot be undone.
            </p>
            <p style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 8 }}>
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              className="form-input"
              autoFocus
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={wiping}
              style={{ marginBottom: 12 }}
            />
            {wipeErr && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: 12,
                  marginBottom: 12
                }}
              >
                {wipeErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn-outline"
                onClick={() => setShowWipe(false)}
                disabled={wiping}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={wipeAll}
                disabled={wiping || wipeConfirmText !== "DELETE"}
              >
                {wiping ? "Deleting…" : `Delete ${deals.length} deals`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
