"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  onClose: () => void;
}

export default function DealsImportModal({ onClose }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("add_on");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !!file &&
    !busy &&
    !result &&
    (mode === "add_on" || (mode === "replace" && confirmReplace));

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/deals/import", { method: "POST", body: fd });
      const json = (await res.json()) as ImportResult;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Import failed (HTTP ${res.status}).`);
      } else {
        setResult(json);
        // Refresh server-rendered deals list in the background.
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
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

        <h3 style={{ fontSize: 18, color: "var(--navy)", marginBottom: 6 }}>Upload Pipeline</h3>
        <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 14 }}>
          Upload a CSV or XLSX file matching the template. Need a copy?{" "}
          <a href="/api/deals/template?format=csv" style={{ textDecoration: "underline" }}>
            Download CSV template
          </a>{" "}
          ·{" "}
          <a href="/api/deals/template?format=xlsx" style={{ textDecoration: "underline" }}>
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
                    name="mode"
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
                      Append these deals to your office&apos;s existing pipeline. Nothing is deleted or modified.
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
                    name="mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    disabled={busy}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Comprehensive list (replace all)</div>
                    <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                      Permanently delete <strong>all existing deals</strong> in your office (including confidential
                      ones), then import this file as the new complete pipeline.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {mode === "replace" && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 10,
                  borderRadius: 6,
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                  fontSize: 13,
                  color: "#92400e"
                }}
              >
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    I understand that this will permanently delete every deal currently in this office&apos;s pipeline
                    before importing the uploaded file.
                  </span>
                </label>
              </div>
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
              Import complete. Inserted <strong>{result.inserted}</strong> deal
              {result.inserted === 1 ? "" : "s"}
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
                      <th>Deal</th>
                      <th>Stage</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skippedRows.map((r) => (
                      <tr key={r.row}>
                        <td style={{ fontSize: 12 }}>{r.row + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.preview.deal_name || "—"}</td>
                        <td style={{ fontSize: 12 }}>{r.preview.stage || "—"}</td>
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
