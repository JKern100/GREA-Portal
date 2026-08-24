"use client";

import { useState } from "react";
import Papa from "papaparse";
import {
  convertHubspotContacts,
  defaultBrokerEmail,
  extractOwners,
  type ConvertResult
} from "@/lib/converters/hubspotContacts";

const parse = (text: string): string[][] =>
  Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;

/**
 * Superadmin utility: converts a raw HubSpot contact export into the portal's
 * contacts import template.
 *
 * Runs entirely in the browser — the file is never uploaded anywhere, which
 * keeps an office's raw CRM export (including the phone numbers we strip) off
 * our servers.
 */
export default function HubspotContactConverter() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [owners, setOwners] = useState<string[]>([]);
  const [brokerEmails, setBrokerEmails] = useState<Record<string, string>>({});
  const [dropTestRecords, setDropTestRecords] = useState(true);
  const [dropInternalStaff, setDropInternalStaff] = useState(true);
  const [dropDuplicates, setDropDuplicates] = useState(true);
  const [preserveCodesInNote, setPreserveCodesInNote] = useState(true);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    setResult(null);
    setError(null);
    if (!file) {
      setFileName(null);
      setText(null);
      setOwners([]);
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    const found = extractOwners(content, parse);
    setOwners(found);
    const seeded: Record<string, string> = {};
    found.forEach((o) => (seeded[o] = defaultBrokerEmail(o)));
    setBrokerEmails(seeded);
  }

  function convert() {
    if (!text) return;
    setError(null);
    try {
      setResult(
        convertHubspotContacts(
          text,
          { brokerEmails, dropTestRecords, dropInternalStaff, dropDuplicates, preserveCodesInNote },
          parse
        )
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function download() {
    if (!result) return;
    const base = (fileName ?? "hubspot_export").replace(/\.csv$/i, "");
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_PORTAL_READY.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const checkbox = (label: string, hint: string, value: boolean, set: (v: boolean) => void) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--gray-600)" }}>{hint}</span>
      </span>
    </label>
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, color: "var(--navy)" }}>PHL &mdash; HubSpot Contact Converter</h2>
      <p style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 4, marginBottom: 18, maxWidth: 720 }}>
        Converts a raw HubSpot contact export into the portal&apos;s contacts import template. Built
        for Philadelphia&apos;s report format (First Name, Last Name, Company Name, Contact owner,
        Phone Number, Property Listing, Code, Last Activity Date). The file is processed in your
        browser and never uploaded.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <label className="form-label">HubSpot export (.csv)</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {fileName && (
          <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 6 }}>{fileName}</div>
        )}
      </div>

      {owners.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 4 }}>
            Broker emails
          </div>
          <p style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 10 }}>
            Each HubSpot &quot;Contact owner&quot; needs the email they use to log in to the portal &mdash;
            that&apos;s what links a contact to their account. Pre-filled with the usual
            first.last@grea.com pattern; correct any that differ.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {owners.map((o) => (
              <div key={o} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, minWidth: 160 }}>{o}</span>
                <input
                  className="form-input"
                  style={{ flex: 1, minWidth: 240, fontSize: 13 }}
                  value={brokerEmails[o] ?? ""}
                  placeholder="name@grea.com"
                  onChange={(e) => setBrokerEmails((p) => ({ ...p, [o]: e.target.value.trim() }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {text && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
            Options
          </div>
          {checkbox("Drop obvious test records", "Names like “fdsa fdsa” or “First Last”.", dropTestRecords, setDropTestRecords)}
          {checkbox("Drop GREA / Ariel staff", "Colleagues entered as contacts rather than clients.", dropInternalStaff, setDropInternalStaff)}
          {checkbox("Drop duplicates", "Same contact name and company appearing more than once.", dropDuplicates, setDropDuplicates)}
          {checkbox("Keep HubSpot codes in the Note column", "Preserves categories like “800 - Large Owner/Investor” that the portal has no field for.", preserveCodesInNote, setPreserveCodesInNote)}
          <button className="btn-primary" style={{ marginTop: 6 }} onClick={convert}>
            Convert
          </button>
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 14, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: 13, color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {result && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
              {result.outputRows} row{result.outputRows === 1 ? "" : "s"} ready
              <span style={{ fontWeight: 400, color: "var(--gray-500)" }}>
                {" "}
                from {result.sourceRows} in the export
              </span>
            </div>
            {result.outputRows > 0 && (
              <button className="btn-primary" style={{ marginLeft: "auto" }} onClick={download}>
                Download portal-ready CSV
              </button>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-500)", marginBottom: 6 }}>
                What changed
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--gray-700)" }}>
                {result.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {result.dropped.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray-500)", marginBottom: 6 }}>
                Rows left out ({result.dropped.length})
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--gray-200)", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Row", "Name", "Reason"].map((h) => (
                        <th key={h} style={{ position: "sticky", top: 0, background: "var(--navy)", color: "white", textAlign: "left", padding: "5px 8px", fontSize: 11 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.dropped.map((d, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--gray-100)" }}>
                        <td style={{ padding: "5px 8px", color: "var(--gray-500)" }}>{d.row}</td>
                        <td style={{ padding: "5px 8px" }}>{d.name}</td>
                        <td style={{ padding: "5px 8px", color: "var(--gray-700)" }}>{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
