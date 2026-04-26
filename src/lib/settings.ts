/**
 * App-level settings: pure types + defaults + JSONB normalisation.
 * Server-only loader lives in settings.server.ts so this module can be
 * safely imported from client components without dragging the Supabase
 * server client (which uses next/headers) into the browser bundle.
 */

export interface FreshnessThresholds {
  /** days <= this → "current" (green) */
  current: number;
  /** days <= this → "due for update" (orange); else "stale" (red) */
  due: number;
}

export interface NetworkFreshnessSettings {
  contacts: FreshnessThresholds;
  pipeline: FreshnessThresholds;
}

export const NETWORK_FRESHNESS_KEY = "network.freshness";

export const DEFAULT_NETWORK_FRESHNESS: NetworkFreshnessSettings = {
  contacts: { current: 3, due: 10 },
  pipeline: { current: 3, due: 10 }
};

/**
 * Coerce a possibly-partial / corrupted JSONB blob into a fully-formed
 * NetworkFreshnessSettings. Keeps the rest of the app from crashing if
 * the row gets edited by hand into something unexpected.
 */
export function normaliseNetworkFreshness(
  raw: unknown
): NetworkFreshnessSettings {
  const safe = (
    v: unknown,
    fallback: FreshnessThresholds
  ): FreshnessThresholds => {
    if (!v || typeof v !== "object") return fallback;
    const obj = v as Record<string, unknown>;
    const current = Number(obj.current);
    const due = Number(obj.due);
    return {
      current: Number.isFinite(current) && current > 0 ? Math.floor(current) : fallback.current,
      due: Number.isFinite(due) && due > 0 ? Math.floor(due) : fallback.due
    };
  };
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    contacts: safe(r.contacts, DEFAULT_NETWORK_FRESHNESS.contacts),
    pipeline: safe(r.pipeline, DEFAULT_NETWORK_FRESHNESS.pipeline)
  };
}
