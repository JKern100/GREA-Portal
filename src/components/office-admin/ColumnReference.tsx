"use client";

import { useState } from "react";

interface Column {
  key: string;
  header: string;
  required: boolean;
  hint: string;
}

interface Props {
  columns: Column[];
}

/**
 * Collapsible per-column reference shown inside the import modals.
 *
 * Driven by the same `TEMPLATE_COLUMNS` the importer validates against, so the
 * guidance can't drift from the rules. This lives in the app rather than in
 * the downloaded file on purpose: uploads are CSV (which can't carry a second
 * sheet or any cell validation), and offices typically build their file from a
 * CRM export rather than typing into our template — so a note inside the
 * template would often never be seen.
 */
export default function ColumnReference({ columns }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 13,
          color: "var(--navy)",
          cursor: "pointer",
          textDecoration: "underline"
        }}
      >
        {open ? "Hide column reference" : "Show column reference"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            maxHeight: 260,
            overflowY: "auto",
            border: "1px solid var(--gray-200)",
            borderRadius: 6
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Column", "Required", "Notes"].map((h) => (
                  <th
                    key={h}
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "var(--navy)",
                      color: "white",
                      textAlign: "left",
                      padding: "6px 8px",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key} style={{ borderTop: "1px solid var(--gray-100)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {c.header}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {c.required ? (
                      <span style={{ color: "#991b1b", fontWeight: 700 }}>Required</span>
                    ) : (
                      <span style={{ color: "var(--gray-500)" }}>Optional</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--gray-700)", verticalAlign: "top" }}>{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
