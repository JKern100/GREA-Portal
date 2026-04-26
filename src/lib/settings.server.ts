// Server-only — never import from a client component. This module
// pulls in the Supabase server client (next/headers under the hood),
// which will fail to bundle for the browser. The .server.ts suffix
// is convention; the next/headers import is the actual guard.
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_NETWORK_FRESHNESS,
  NETWORK_FRESHNESS_KEY,
  normaliseNetworkFreshness,
  type NetworkFreshnessSettings
} from "@/lib/settings";

/** Load Network freshness thresholds, falling back to defaults. */
export async function loadNetworkFreshness(): Promise<NetworkFreshnessSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", NETWORK_FRESHNESS_KEY)
    .maybeSingle();
  if (!data?.value) return DEFAULT_NETWORK_FRESHNESS;
  return normaliseNetworkFreshness(data.value);
}
