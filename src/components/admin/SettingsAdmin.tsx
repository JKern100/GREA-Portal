"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_NETWORK_FRESHNESS,
  NETWORK_FRESHNESS_KEY,
  type NetworkFreshnessSettings
} from "@/lib/settings";

interface Props {
  initialFreshness: NetworkFreshnessSettings;
}

const COLOR_CURRENT = "#16a34a";
const COLOR_DUE = "#ea580c";
const COLOR_STALE = "#dc2626";

const MAX_DAYS = 365;

function PreviewBar({
  current,
  due
}: {
  current: number;
  due: number;
}) {
  // Cap the visible bar at max(due * 2, 14) so small values still produce
  // a readable spread between zones.
  const cap = Math.max(due * 2, 14);
  const currentPct = (Math.min(current, cap) / cap) * 100;
  const duePct = (Math.min(due, cap) / cap) * 100;
  const stalePct = 100 - duePct;
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--gray-200)"
        }}
      >
        <div style={{ width: `${currentPct}%`, background: COLOR_CURRENT }} title={`Current: 0–${current} days`} />
        <div style={{ width: `${duePct - currentPct}%`, background: COLOR_DUE }} title={`Due: ${current + 1}–${due} days`} />
        <div style={{ width: `${stalePct}%`, background: COLOR_STALE }} title={`Stale: ${due + 1}+ days`} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--gray-500)",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums"
        }}
      >
        <span>0d</span>
        <span style={{ color: COLOR_CURRENT, fontWeight: 600 }}>≤ {current}d Current</span>
        <span style={{ color: COLOR_DUE, fontWeight: 600 }}>≤ {due}d Due</span>
        <span style={{ color: COLOR_STALE, fontWeight: 600 }}>{due + 1}d+ Stale</span>
        <span>{cap}d</span>
      </div>
    </div>
  );
}

interface NumInputProps {
  value: number;
  onChange: (n: number) => void;
  invalid?: boolean;
}
function NumInput({ value, onChange, invalid }: NumInputProps) {
  return (
    <input
      type="number"
      min={1}
      max={MAX_DAYS}
      step={1}
      className="form-input"
      style={{
        width: 90,
        padding: "5px 8px",
        fontSize: 13,
        borderColor: invalid ? "#dc2626" : undefined
      }}
      value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export default function SettingsAdmin({ initialFreshness }: Props) {
  const [freshness, setFreshness] = useState<NetworkFreshnessSettings>(initialFreshness);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Validation: current must be < due, both positive integers ≤ MAX_DAYS.
  const errors = useMemo(() => {
    const errs: { contacts?: string; pipeline?: string } = {};
    (["contacts", "pipeline"] as const).forEach((view) => {
      const t = freshness[view];
      if (t.current < 1 || t.due < 1) errs[view] = "Both values must be at least 1.";
      else if (t.current >= t.due) errs[view] = "Current threshold must be less than the Due threshold.";
      else if (t.due > MAX_DAYS) errs[view] = `Due threshold must be at most ${MAX_DAYS}.`;
    });
    return errs;
  }, [freshness]);

  const isDirty =
    JSON.stringify(freshness) !== JSON.stringify(initialFreshness);
  const hasErrors = Object.keys(errors).length > 0;

  function update(view: "contacts" | "pipeline", field: "current" | "due", n: number) {
    setFreshness((prev) => ({
      ...prev,
      [view]: { ...prev[view], [field]: n }
    }));
    setSavedAt(null);
  }

  function resetToDefaults() {
    setFreshness(DEFAULT_NETWORK_FRESHNESS);
    setSavedAt(null);
  }

  async function save() {
    setErr(null);
    setSavedAt(null);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("app_settings").upsert({
      key: NETWORK_FRESHNESS_KEY,
      value: freshness
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSavedAt(Date.now());
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Settings</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
        App-level configuration. Changes apply to every viewer immediately.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>
          Network freshness thresholds
        </div>
        <p style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 16 }}>
          The Network page colours each office&apos;s ring based on days since the most
          recent contact (Contacts view) or deal (Pipeline view). Set how many days
          counts as <strong style={{ color: COLOR_CURRENT }}>Current</strong> /{" "}
          <strong style={{ color: COLOR_DUE }}>Due for update</strong> /{" "}
          <strong style={{ color: COLOR_STALE }}>Stale</strong> for each view.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {(["contacts", "pipeline"] as const).map((view) => {
            const t = freshness[view];
            const error = errors[view];
            return (
              <div key={view}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--gray-500)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 10
                  }}
                >
                  {view === "contacts" ? "Contacts view" : "Pipeline view"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <label style={{ fontSize: 13, color: "var(--gray-700)" }}>Current up to:</label>
                  <NumInput value={t.current} onChange={(n) => update(view, "current", n)} invalid={!!error} />
                  <span style={{ fontSize: 12, color: "var(--gray-500)" }}>days</span>

                  <label style={{ fontSize: 13, color: "var(--gray-700)" }}>Due up to:</label>
                  <NumInput value={t.due} onChange={(n) => update(view, "due", n)} invalid={!!error} />
                  <span style={{ fontSize: 12, color: "var(--gray-500)" }}>days</span>
                </div>

                <div style={{ marginTop: 14 }}>
                  <PreviewBar current={t.current} due={t.due} />
                </div>

                {error && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn-primary"
          onClick={save}
          disabled={saving || hasErrors || !isDirty}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          className="btn-outline"
          onClick={resetToDefaults}
          disabled={saving}
          title={`Reset to the default thresholds (${DEFAULT_NETWORK_FRESHNESS.contacts.current}/${DEFAULT_NETWORK_FRESHNESS.contacts.due})`}
        >
          Reset to defaults
        </button>
        {savedAt && (
          <span style={{ fontSize: 12, color: "#15803d" }}>Saved.</span>
        )}
        {err && <span style={{ fontSize: 12, color: "#dc2626" }}>{err}</span>}
      </div>
    </div>
  );
}
