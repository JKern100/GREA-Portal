import { createClient } from "@/lib/supabase/server";
import type { ContactRecord, DealRecord, Office, Profile, SpecialtyTeam } from "@/lib/types";
import { redirect } from "next/navigation";

export async function getSessionUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data ? (data as unknown as Profile) : null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireSuperadmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "superadmin") redirect("/contacts");
  return profile;
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

export async function listSpecialtyTeams(): Promise<SpecialtyTeam[]> {
  const supabase = createClient();
  const { data } = await supabase.from("specialty_teams").select("*").order("name");
  return (data as SpecialtyTeam[]) ?? [];
}
