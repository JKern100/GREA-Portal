/**
 * API key generation and authentication for the v1 import API.
 * Server-only: hashing plus service-role reads.
 */

import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Prefix makes a leaked key recognisable in logs and greppable in repos. */
const KEY_PREFIX = "grea_live_";

/** Base62 avoids punctuation that gets mangled in shell one-liners and env files. */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${KEY_PREFIX}${out}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Non-secret tail shown in the admin UI so keys can be told apart. */
export function keySuffix(key: string): string {
  return key.slice(-4);
}

export interface ResolvedKey {
  keyId: string;
  officeId: string;
  officeCode: string;
  label: string;
}

export type KeyAuthFailure = { status: 401 | 403; error: string };

/**
 * Resolve an Authorization header to an office.
 *
 * Returns the office the key belongs to — callers must use this and never a
 * value from the request body, so a key can only ever write to its own office.
 */
export async function authenticateApiKey(
  authorization: string | null
): Promise<{ ok: true; key: ResolvedKey } | { ok: false; failure: KeyAuthFailure }> {
  const raw = (authorization ?? "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match) {
    return { ok: false, failure: { status: 401, error: "Missing Authorization header. Use: Authorization: Bearer <your key>" } };
  }
  const presented = match[1].trim();
  if (!presented.startsWith(KEY_PREFIX)) {
    return { ok: false, failure: { status: 401, error: "Invalid API key." } };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, office_id, label, revoked_at, offices ( code )")
    .eq("key_hash", hashApiKey(presented))
    .maybeSingle();

  if (error) return { ok: false, failure: { status: 401, error: "Could not verify API key." } };
  if (!data) return { ok: false, failure: { status: 401, error: "Invalid API key." } };
  if (data.revoked_at) {
    return { ok: false, failure: { status: 403, error: "This API key has been revoked. Ask a GREA superadmin to issue a new one." } };
  }

  // Best-effort usage stamp; never block the request on it.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  const office = data.offices as unknown as { code?: string } | null;
  return {
    ok: true,
    key: {
      keyId: String(data.id),
      officeId: String(data.office_id),
      officeCode: office?.code ?? "",
      label: String(data.label ?? "")
    }
  };
}

/**
 * Whether contact phone/email may be stored. Defaults to false (withhold) so a
 * missing setting can never accidentally start sharing contact details.
 */
export async function loadShareContactDetails(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "contacts.share_contact_details")
    .maybeSingle();
  return data?.value === true;
}
