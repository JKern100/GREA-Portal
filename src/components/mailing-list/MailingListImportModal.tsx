"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Office, Profile } from "@/lib/types";

type Mode = "replace" | "add_on";

interface SkippedRow {
  row: number;
  errors: string[];
  preview: Record<string, string>;
}

interface ImportResult {
  ok: boolean;
  mode: Mode;
  inserted: number;
  deleted: number;
  skipped: number;
  skippedRows: SkippedRow[];
  fileWarnings?: string[];
  error?: string;
}

interface Props {
  profile: Profile;
  offices: Office[];
  onClose: () => void;
}

export default function MailingListImportModal({ profile, offices, onClose }: Props) {
  const router = useRouter();
  const isSuperadmin = profile.role === "superadmin";
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("add_on");
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Superadmin-only fields:
  const [targetOfficeId, setTargetOfficeId] = useState<string>(profile.office_id ?? "global");
  const [replaceAll, setReplaceAll] = useState(false);
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replaceConfirmed = !replaceAll
    ? confirmReplace
    : confirmReplace && confirmReplaceAll;

  const canSubmit =
    !!file &&
    !busy &&
    !result &&
    (mode === "add_on" || (mode === "replace" && replaceConfirmed));

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (isSuperadmin) {
        fd.append("target_office_id", targetOfficeId);
        if (mode === "replace" && replaceAll) fd.append("replace_all", "true");
      }
      const res = await fetch("/api/mailing-list/import", { method: "POST", body: fd });
      const json = (await res.json()) as ImportResult;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Import failed (HTTP ${res.status}).`);
      } else {
        setResult(json);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal-panel" style={{ maxWidth: 640 }}>
        <button className="modal-close" onClick={close} aria-label="Close">
          ×
        </button>

        <h3 style={{ fontSize: 18, color: "var(--navy)", marginBottom: 6 }}>Upload Mailing List</h3>
        <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 14 }}>
          Upload a CSV or XLSX file matching the template.{" "}
          <a href="/api/mailing-list/template?format=csv" style={{ textDecoration: "underline" }}>
            Download CSV template
          </a>{" "}
          ·{" "}
          <a href="/api/mailing-list/template?format=xlsx" style={{ textDecoration: "underline" }}>
            Download Excel template
          </a>
        </p>

        {!result && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">File</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
              />
              {file && (
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                  Selected: {file.name} ({Math.round(file.size / 1024)} KB)
                </div>
              )}
            </div>

            {isSuperadmin && (
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Tag new entries as</label>
                <select
                  className="form-input"
                  value={targetOfficeId}
                  onChange={(e) => setTargetOfficeId(e.target.value)}
                  disabled={busy}
                >
                  <option value="global">Global (no source office)</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                  Sets <code>source_office_id</code> on every imported row. In replace mode, only entries with the same tag are deleted (unless &quot;Replace ALL&quot; is checked below).
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Import mode</label>
              <div style={{ display: "grid", gap: 8 }}>
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: 10,
                    border: "1px solid var(--gray-200)",
                    borderRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name="ml-mode"
                    checked={mode === "add_on"}
                    onChange={() => {
                      setMode("add_on");
                      setConfirmReplace(false);
                    }}
                    disabled={busy}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Add-on list</div>
                    <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                      Append these entries to your office&apos;s existing contributions to the shared mailing list.
                    </div>
                  </div>
                </label>
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: 10,
                    border: "1px solid var(--gray-200)",
                    borderRadius: 6,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name="ml-mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    disabled={busy}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      Comprehensive list (replace {isSuperadmin ? "the targeted office's entries" : "your office's entries"})
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                      {isSuperadmin
                        ? "Delete every mailing-list entry whose source matches the office selected above, then import this file. Other offices' entries are not affected unless you check Replace ALL below."
                        : "Permanently delete every mailing-list entry currently sourced from your office, then import this file as the new full set. Other offices' entries are not affected."}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {mode === "replace" && (
              <>
                {isSuperadmin && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 10,
                      borderRadius: 6,
                      background: "#fafafa",
                      border: "1px solid var(--gray-300)",
                      fontSize: 13,
                      color: "var(--gray-700)"
                    }}
                  >
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={replaceAll}
                        onChange={(e) => {
                          setReplaceAll(e.target.checked);
                          if (!e.target.checked) setConfirmReplaceAll(false);
                        }}
                        disabled={busy}
                      />
                      <span>
                        <strong>Replace ALL entries across every office</strong> (nuclear). Wipes every mailing-list row in the database before importing this file, regardless of source office.
                      </span>
                    </label>
                  </div>
                )}

                <div
                  style={{
                    marginBottom: 14,
                    padding: 10,
                    borderRadius: 6,
                    background: replaceAll ? "#fee2e2" : "#fef3c7",
                    border: `1px solid ${replaceAll ? "#dc2626" : "#f59e0b"}`,
                    fontSize: 13,
                    color: replaceAll ? "#991b1b" : "#92400e"
                  }}
                >
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: replaceAll ? 8 : 0 }}>
                    <input
                      type="checkbox"
                      checked={confirmReplace}
                      onChange={(e) => setConfirmReplace(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      I understand that this will permanently delete{" "}
                      {replaceAll
                        ? "every mailing-list entry across all offices"
                        : isSuperadmin
                          ? "every mailing-list entry tagged to the selected target"
                          : "every mailing-list entry currently sourced from my office"}{" "}
                      before importing the uploaded file.
                    </span>
                  </label>
                  {replaceAll && (
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={confirmReplaceAll}
                        onChange={(e) => setConfirmReplaceAll(e.target.checked)}
                        disabled={busy}
                      />
                      <span>
                        I have a backup or have exported the current list, and I accept that this action cannot be undone.
                      </span>
                    </label>
                  )}
                </div>
              </>
            )}

            {error && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 10,
                  borderRadius: 6,
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: 13
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-outline" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
                {busy ? "Importing…" : mode === "replace" ? "Replace and import" : "Import"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: "#d1fae5",
                color: "#065f46",
                fontSize: 13,
                marginBottom: 12
              }}
            >
              Import complete. Inserted <strong>{result.inserted}</strong> entr{result.inserted === 1 ? "y" : "ies"}
              {result.mode === "replace" && (
                <>
                  {" "}
                  · Deleted <strong>{result.deleted}</strong> previous
                </>
              )}
              {result.skipped > 0 && (
                <>
                  {" "}
                  · Skipped <strong>{result.skipped}</strong> row{result.skipped === 1 ? "" : "s"}
                </>
              )}
              .
            </div>

            {result.fileWarnings && result.fileWarnings.length > 0 && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: 12,
                  marginBottom: 12
                }}
              >
                {result.fileWarnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            {result.skippedRows.length > 0 && (
              <div className="card" style={{ padding: 0, marginBottom: 12, maxHeight: 240, overflow: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skippedRows.map((r) => (
                      <tr key={r.row}>
                        <td style={{ fontSize: 12 }}>{r.row + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.preview.full_name || "—"}</td>
                        <td style={{ fontSize: 12 }}>{r.preview.email || "—"}</td>
                        <td style={{ fontSize: 12, color: "#991b1b" }}>{r.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={close}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
