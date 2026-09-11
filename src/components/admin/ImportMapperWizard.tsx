"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import ColumnReference from "@/components/office-admin/ColumnReference";
import { TEMPLATE_COLUMNS as CONTACT_COLUMNS } from "@/lib/contacts/import-schema";
import { TEMPLATE_COLUMNS as DEAL_COLUMNS } from "@/lib/deals/import-schema";
import {
  autoMatch,
  missingRequired,
  unusedHeaders,
  type MappingState
} from "@/lib/import/autoMatch";
import type { Office } from "@/lib/types";

/**
 * Import Mapper — upload an office's own export, match its columns to the
 * portal's template, preview exactly what would happen, then import.
 *
 * Phase A lives under Super Admin -> Utilities. It takes `fixedOfficeId` so
 * the same component can later be embedded in an office admin's upload flow
 * without the office picker; see docs/SPECS_IMPORT_MAPPER.md §11.
 *
 * Nothing is written until the final step: every preview is a server-side dry
 * run through the same import core the manual upload and the API use.
 */

type Entity = "contacts" | "deals";
type Mode = "replace" | "add_on";
type Step = 0 | 1 | 2 | 3;

interface SkippedRow {
  row: number;
  errors: string[];
  preview: Record<string, string>;
}

interface RunResult {
  ok: boolean;
  dryRun: boolean;
  mode: Mode;
  entity: Entity;
  received: number;
  inserted: number;
  deleted: number;
  skipped: number;
  skippedRows: SkippedRow[];
  warnings: string[];
  ignoredHeaders: string[];
  currentCount: number;
  strippedFields?: Record<string, number>;
  error?: string;
}

interface Props {
  /** Superadmin mode: pick any office. */
  offices?: Office[];
  /** Office admin mode: locked to this office, no picker. */
  fixedOfficeId?: string;
  /** Display code for the fixed office (e.g. "PHL"). */
  officeCode?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

function columnsFor(entity: Entity) {
  return entity === "contacts" ? CONTACT_COLUMNS : DEAL_COLUMNS;
}

/**
 * Sample values shown under a mapping so the admin can sanity-check it.
 *
 * Takes one or two headers and reads them from the SAME rows, so a combined
 * pair previews as it will actually be joined. Pairing by filtered index
 * instead would misalign the moment one column has a blank.
 */
function samplesFor(sheet: string[][], headers: Array<string | undefined>, limit = 3): string[] {
  const picked = headers.filter((h): h is string => !!h && h.trim().length > 0);
  if (picked.length === 0 || sheet.length < 2) return [];
  const idxs = picked.map((h) => (sheet[0] ?? []).findIndex((x) => String(x ?? "").trim() === h.trim()));
  if (idxs.some((i) => i < 0)) return [];
  const out: string[] = [];
  for (let r = 1; r < sheet.length && out.length < limit; r++) {
    const joined = idxs
      .map((i) => String(sheet[r]?.[i] ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (joined) out.push(joined);
  }
  return out;
}

/** Group skipped rows by error text so the admin sees problems, not rows. */
function groupProblems(rows: SkippedRow[]): Array<{ error: string; rows: SkippedRow[] }> {
  const map = new Map<string, SkippedRow[]>();
  for (const r of rows) {
    for (const e of r.errors.length ? r.errors : ["Unknown problem"]) {
      const list = map.get(e) ?? [];
      list.push(r);
      map.set(e, list);
    }
  }
  return [...map.entries()]
    .map(([error, rs]) => ({ error, rows: rs }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

const box: React.CSSProperties = {
  padding: 12,
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 12
};

export default function ImportMapperWizard({ offices, fixedOfficeId, officeCode }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [officeId, setOfficeId] = useState(fixedOfficeId ?? "");
  const [entity, setEntity] = useState<Entity>("contacts");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<MappingState>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [final, setFinal] = useState<RunResult | null>(null);

  const columns = columnsFor(entity);
  const headers = useMemo(
    () => (sheet[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean),
    [sheet]
  );
  const dataRowCount = Math.max(0, sheet.length - 1);
  const stillMissing = useMemo(
    () => (sheet.length ? missingRequired(mapping, entity) : []),
    [mapping, entity, sheet.length]
  );
  const ignored = useMemo(
    () => (sheet.length ? unusedHeaders(headers, mapping) : []),
    [headers, mapping, sheet.length]
  );
  const officeName =
    offices?.find((o) => o.id === officeId)?.code ?? officeCode ?? (fixedOfficeId ? "your office" : "");

  function resetFile() {
    setSheet([]);
    setFileName("");
    setMapping({});
    setPreview(null);
    setFinal(null);
    setMode(null);
    setAck(false);
  }

  function onFile(file: File | null) {
    setError(null);
    resetFile();
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setError("Excel files aren't supported. Save the export as CSV and try again.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File exceeds the 5 MB limit.");
      return;
    }
    file
      .text()
      .then((text) => {
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
        const rows = (parsed.data ?? []).filter(Array.isArray) as string[][];
        if (rows.length < 2) {
          setError("That file has no data rows.");
          return;
        }
        if (rows.length - 1 > MAX_ROWS) {
          setError(
            `File has too many rows (${(rows.length - 1).toLocaleString()}). The limit is ${MAX_ROWS.toLocaleString()} — split it and import in batches.`
          );
          return;
        }
        setSheet(rows);
        setFileName(file.name);
        setMapping(autoMatch(rows[0].map((h) => String(h ?? "")), entity));
      })
      .catch((e: Error) => setError(`Could not read the file: ${e.message}`));
  }

  /** Point a target field at a source column, releasing whatever held it. */
  function setSource(key: string, source: string) {
    setMapping((prev) => {
      const next: MappingState = { ...prev };
      if (source === "") {
        next[key] = { status: "unmapped" };
        return next;
      }
      for (const [k, m] of Object.entries(next)) {
        if (k === key) continue;
        if (m.source === source) next[k] = { status: "unmapped" };
        if (m.concat?.includes(source)) next[k] = { status: "unmapped" };
      }
      next[key] = { source, status: "matched" };
      return next;
    });
  }

  function setConcat(key: string, which: 0 | 1, source: string) {
    setMapping((prev) => {
      const next: MappingState = { ...prev };
      const cur = next[key]?.concat ?? ["", ""];
      const pair: [string, string] = which === 0 ? [source, cur[1]] : [cur[0], source];
      for (const [k, m] of Object.entries(next)) {
        if (k === key) continue;
        if (m.source && pair.includes(m.source)) next[k] = { status: "unmapped" };
      }
      next[key] = pair[0] && pair[1] ? { concat: pair, status: "matched" } : { concat: pair, status: "unmapped" };
      return next;
    });
  }

  function toggleConcat(key: string, on: boolean) {
    setMapping((prev) => ({
      ...prev,
      [key]: on ? { concat: ["", ""], status: "unmapped" } : { status: "unmapped" }
    }));
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        entity,
        officeId,
        mode: mode ?? "add_on",
        dryRun,
        fileName,
        mapping: Object.fromEntries(
          Object.entries(mapping)
            .filter(([, m]) => m.source || (m.concat && m.concat[0] && m.concat[1]))
            .map(([k, m]) => [k, m.concat ? { concat: m.concat } : { source: m.source }])
        ),
        rows: sheet
      };
      const res = await fetch("/api/admin/import-mapper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as RunResult;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Request failed (HTTP ${res.status}).`);
        if (dryRun) setPreview(null);
        return;
      }
      if (dryRun) {
        setPreview(json);
        setStep(2);
      } else {
        setFinal(json);
        setStep(3);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Problem rows as a CSV in the file's ORIGINAL columns, for fixing at source. */
  function downloadProblems(result: RunResult) {
    const wanted = new Map(result.skippedRows.map((r) => [r.row, r.errors.join("; ")]));
    const out: string[][] = [["Problem", ...(sheet[0] ?? []).map((h) => String(h ?? ""))]];
    for (const [rowNum, problem] of wanted) {
      const src = sheet[rowNum];
      if (src) out.push([problem, ...src.map((c) => String(c ?? ""))]);
    }
    const csv = Papa.unparse(out);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `problem-rows-${entity}-${fileName || "import"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canLeaveStep0 = !!officeId && sheet.length > 1;
  const canLeaveStep1 = stillMissing.length === 0;
  const willImport = preview ? preview.received - preview.skipped : 0;

  return (
    <div className="card" style={{ padding: 18, maxWidth: 940 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, color: "var(--navy)" }}>Import Mapper</h2>
        <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Step {step + 1} of 4</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>
        Upload an office&apos;s own export, match its columns to the portal&apos;s fields, and see
        exactly what would happen before anything is saved.
      </p>

      {error && (
        <div style={{ ...box, background: "#fee2e2", color: "#991b1b" }}>{error}</div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 0 && (
        <div>
          {!fixedOfficeId && (
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Office</div>
              <select
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                style={{ padding: 7, minWidth: 260, fontSize: 13 }}
              >
                <option value="">Choose an office…</option>
                {(offices ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Data type</div>
            {(["contacts", "deals"] as Entity[]).map((e) => (
              <label key={e} style={{ marginRight: 16, fontSize: 13 }}>
                <input
                  type="radio"
                  checked={entity === e}
                  onChange={() => {
                    setEntity(e);
                    resetFile();
                  }}
                  style={{ marginRight: 6 }}
                />
                {e === "contacts" ? "Contacts" : "Pipeline"}
              </label>
            ))}
          </div>

          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Their export file (CSV)</div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>

          {sheet.length > 1 && (
            <div style={{ ...box, background: "#d1fae5", color: "#065f46" }}>
              Read <strong>{fileName}</strong>: {dataRowCount.toLocaleString()} data row
              {dataRowCount === 1 ? "" : "s"}, {headers.length} column{headers.length === 1 ? "" : "s"}.
            </div>
          )}

          <ColumnReference columns={columns} />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" disabled={!canLeaveStep0} onClick={() => setStep(1)}>
              Match columns
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            We matched what we could. Check the sample values — they come from the file — and fix
            anything that looks wrong.
          </p>

          <div className="card" style={{ padding: 0, marginBottom: 12, overflow: "auto", maxHeight: 460 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Portal field</th>
                  <th style={{ width: "32%" }}>Their column</th>
                  <th>Sample values</th>
                </tr>
              </thead>
              <tbody>
                {[...columns].sort((a, b) => Number(b.required) - Number(a.required)).map((col) => {
                  const m = mapping[col.key] ?? { status: "unmapped" as const };
                  const isConcat = !!m.concat;
                  const samples = isConcat
                    ? samplesFor(sheet, [m.concat?.[0], m.concat?.[1]])
                    : samplesFor(sheet, [m.source]);
                  return (
                    <tr key={col.key}>
                      <td style={{ fontSize: 12.5 }}>
                        {col.header}
                        {col.required && <span className="req" style={{ marginLeft: 4 }}>*</span>}
                        <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                          {m.status === "suggested" && "🟡 suggested — check this"}
                          {m.status === "matched" && "✅ matched"}
                          {m.status === "unmapped" && (col.required ? "⚪ needs a column" : "⚪ not mapped")}
                        </div>
                      </td>
                      <td>
                        {isConcat ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {[0, 1].map((i) => (
                              <select
                                key={i}
                                value={m.concat?.[i as 0 | 1] ?? ""}
                                onChange={(e) => setConcat(col.key, i as 0 | 1, e.target.value)}
                                style={{ fontSize: 12, padding: 4 }}
                              >
                                <option value="">{i === 0 ? "First part…" : "Second part…"}</option>
                                {headers.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            ))}
                            <button
                              type="button"
                              onClick={() => toggleConcat(col.key, false)}
                              style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--navy)", cursor: "pointer", textAlign: "left" }}
                            >
                              Use a single column instead
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <select
                              value={m.source ?? ""}
                              onChange={(e) => setSource(col.key, e.target.value)}
                              style={{ fontSize: 12, padding: 4, width: "100%" }}
                            >
                              <option value="">— leave blank —</option>
                              {headers.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                            {(col.key === "contact_name" || col.key === "broker_name") && (
                              <button
                                type="button"
                                onClick={() => toggleConcat(col.key, true)}
                                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--navy)", cursor: "pointer", textAlign: "left" }}
                              >
                                Combine two columns…
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 11.5, color: "var(--gray-500)" }}>
                        {samples.length ? samples.join(" · ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ignored.length > 0 && (
            <div style={{ ...box, background: "#f8f8f8", color: "var(--gray-500)", fontSize: 12 }}>
              Columns in their file we&apos;ll ignore: {ignored.join(", ")}
            </div>
          )}

          {stillMissing.length > 0 && (
            <div style={{ ...box, background: "#fef3c7", color: "#92400e" }}>
              {stillMissing.join(", ")} still need{stillMissing.length === 1 ? "s" : ""} a column.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button className="btn-outline" onClick={() => setStep(0)} disabled={busy}>
              Back
            </button>
            <button className="btn-primary" disabled={!canLeaveStep1 || busy} onClick={() => run(true)}>
              {busy ? "Checking…" : "Preview"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 2 && preview && (
        <div>
          <div style={{ ...box, background: "#eef2ff", color: "#1e3a8a" }}>
            <strong>{preview.received.toLocaleString()}</strong> rows in the file.{" "}
            <strong>{willImport.toLocaleString()}</strong> will import.{" "}
            <strong>{preview.skipped.toLocaleString()}</strong> will be skipped.
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {officeName} currently has {preview.currentCount.toLocaleString()}{" "}
              {entity === "contacts" ? "contacts" : "pipeline records"}. Nothing has been written yet.
            </div>
          </div>

          {preview.skipped > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Problems to fix at source</div>
              {groupProblems(preview.skippedRows).map((g) => (
                <div key={g.error} style={{ border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === g.error ? null : g.error)}
                    style={{
                      width: "100%", textAlign: "left", background: "none", border: "none",
                      padding: "8px 10px", fontSize: 12.5, cursor: "pointer", color: "#991b1b"
                    }}
                  >
                    {expanded === g.error ? "▾" : "▸"} <strong>{g.rows.length}</strong> row
                    {g.rows.length === 1 ? "" : "s"}: {g.error}
                  </button>
                  {expanded === g.error && (
                    <div style={{ padding: "0 10px 8px", fontSize: 11.5, color: "var(--gray-500)" }}>
                      Rows {g.rows.slice(0, 40).map((r) => r.row + 1).join(", ")}
                      {g.rows.length > 40 && ` and ${g.rows.length - 40} more`}
                    </div>
                  )}
                </div>
              ))}
              <button className="btn-outline" onClick={() => downloadProblems(preview)} style={{ fontSize: 12 }}>
                Download the {preview.skipped} problem row{preview.skipped === 1 ? "" : "s"}
              </button>
            </div>
          )}

          {(preview.warnings.length > 0 || preview.ignoredHeaders.length > 0) && (
            <div style={{ ...box, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Worth knowing (nothing is blocked)</div>
              {preview.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
              {preview.ignoredHeaders.length > 0 && (
                <div>Columns not imported: {preview.ignoredHeaders.join(", ")}</div>
              )}
            </div>
          )}

          {willImport === 0 && (
            <div style={{ ...box, background: "#fee2e2", color: "#991b1b" }}>
              No rows would import. Fix the problems above and upload the file again.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button className="btn-outline" onClick={() => setStep(1)} disabled={busy}>
              Back to columns
            </button>
            <button className="btn-primary" disabled={willImport === 0} onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 3 && !final && preview && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            How should these {willImport.toLocaleString()} records be applied?
          </div>

          {([
            ["add_on", "Add on", "Keeps the existing records and adds these. Only for genuinely new records."],
            ["replace", "Replace all", `Deletes the ${preview.currentCount.toLocaleString()} existing record(s) first. The safe way to correct or refresh a full list.`]
          ] as Array<[Mode, string, string]>).map(([value, label, hint]) => (
            <label
              key={value}
              style={{
                display: "block", border: "1px solid #e5e7eb", borderRadius: 6,
                padding: 10, marginBottom: 8, cursor: "pointer",
                background: mode === value ? "#eef2ff" : "transparent"
              }}
            >
              <input
                type="radio"
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setAck(false);
                }}
                style={{ marginRight: 8 }}
              />
              <strong style={{ fontSize: 13 }}>{label}</strong>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginLeft: 22 }}>{hint}</div>
            </label>
          ))}

          {mode === "replace" && (
            <div style={{ ...box, background: "#fee2e2", color: "#991b1b" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>
                  I understand this will permanently delete the {preview.currentCount.toLocaleString()}{" "}
                  {entity === "contacts" ? "contact" : "pipeline record"}
                  {preview.currentCount === 1 ? "" : "s"} currently in {officeName} before importing.
                </span>
              </label>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button className="btn-outline" onClick={() => setStep(2)} disabled={busy}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={busy || !mode || (mode === "replace" && !ack)}
              onClick={() => run(false)}
            >
              {busy
                ? "Importing…"
                : mode === "replace"
                  ? `Replace ${preview.currentCount.toLocaleString()} with ${willImport.toLocaleString()}`
                  : mode === "add_on"
                    ? `Add ${willImport.toLocaleString()}`
                    : "Choose an option above"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 3 && final && (
        <div>
          <div style={{ ...box, background: "#d1fae5", color: "#065f46" }}>
            Import complete. Added <strong>{final.inserted.toLocaleString()}</strong>
            {final.mode === "replace" && <> · Deleted <strong>{final.deleted.toLocaleString()}</strong> previous</>}
            {final.skipped > 0 && <> · Skipped <strong>{final.skipped.toLocaleString()}</strong></>}.
          </div>

          {final.warnings.length > 0 && (
            <div style={{ ...box, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
              {final.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          {final.skipped > 0 && (
            <button className="btn-outline" onClick={() => downloadProblems(final)} style={{ fontSize: 12, marginBottom: 12 }}>
              Download the {final.skipped} problem row{final.skipped === 1 ? "" : "s"}
            </button>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn-primary"
              onClick={() => {
                resetFile();
                setStep(0);
              }}
            >
              Start another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
