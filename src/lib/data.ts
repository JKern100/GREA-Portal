import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type {
  ContactRecord,
  DealRecord,
  FeedbackItem,
  MailingListEntry,
  Office,
  Profile
} from "@/lib/types";
import { redirect } from "next/navigation";

export const IMPERSONATE_COOKIE = "grea_impersonate_user_id";

export async function getSessionUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns the real signed-in user's profile, ignoring any impersonation cookie.
 *
 * Returns null for deactivated accounts (is_active = false). Middleware
 * already bounces inactive users to /login on every request, but treating
 * an inactive profile as "no profile" here is the safety net for any code
 * path the middleware doesn't cover (e.g. server-side data fetches that
 * race against the middleware).
 */
export async function getRealProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;
  const profile = data as unknown as Profile;
  if (profile.is_active === false) return null;
  return profile;
}

/**
 * Returns the "effective" profile for the current request. If the real user
 * is a superadmin and an impersonation cookie is set, returns the impersonated
 * user's profile with _impersonatedBy populated. Otherwise returns the real
 * profile.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const real = await getRealProfile();
  if (!real) return null;

  if (real.role !== "superadmin") return real;

  const impersonateId = cookies().get(IMPERSONATE_COOKIE)?.value;
  if (!impersonateId || impersonateId === real.id) return real;

  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", impersonateId).maybeSingle();
  if (!data) return real;

  return { ...(data as unknown as Profile), _impersonatedBy: real };
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireSuperadmin(): Promise<Profile> {
  // Admin pages must check the REAL user — a superadmin impersonating a
  // broker should not be able to access /admin while impersonating.
  const real = await getRealProfile();
  if (!real) redirect("/login");
  const effective = await getCurrentProfile();
  if (!effective || effective.role !== "superadmin") redirect("/contacts");
  return effective;
}

export async function requireOfficeAdminOrSuperadmin(): Promise<Profile> {
  const real = await getRealProfile();
  if (!real) redirect("/login");
  const effective = await getCurrentProfile();
  if (!effective || (effective.role !== "office_admin" && effective.role !== "superadmin")) {
    redirect("/contacts");
  }
  return effective;
}

export async function listOffices(): Promise<Office[]> {
  const supabase = createClient();
  const { data } = await supabase.from("offices").select("*").order("code");
  return (data as Office[]) ?? [];
}

export async function listProfiles(): Promise<Profile[]> {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").order("name");
  return (data as Profile[]) ?? [];
}

export async function listContacts(): Promise<ContactRecord[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .order("contact_name", { ascending: true });
  return (data as ContactRecord[]) ?? [];
}

export async function listDeals(): Promise<DealRecord[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as DealRecord[]) ?? [];
}

export async function listMailingListEntries(): Promise<MailingListEntry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mailing_list_entries")
    .select("*")
    .order("name", { ascending: true });
  return (data as MailingListEntry[]) ?? [];
}

export async function listFeedbackItems(): Promise<FeedbackItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("feedback_items")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as FeedbackItem[]) ?? [];
}
