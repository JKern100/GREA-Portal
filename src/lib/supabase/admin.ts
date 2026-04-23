import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS and
 * grants access to auth admin APIs (e.g. invite-by-email). NEVER import from
 * a client component or expose this key to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service-role credentials are not configured.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
