/**
 * Minimal in-memory sliding-window rate limiter for public endpoints.
 * Per-instance only (serverless instances don't share state), which is
 * acceptable for Phase 1 abuse damping — it stops naive scripted hammering
 * without any infrastructure. Swap for a shared store (e.g. Upstash) if
 * real abuse shows up.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Bound memory: under key churn (e.g. spoofed IPs), reset rather than grow.
  if (buckets.size > MAX_KEYS) buckets.clear();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
