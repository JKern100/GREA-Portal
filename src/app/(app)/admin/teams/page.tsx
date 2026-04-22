import TeamsAdmin from "@/components/admin/TeamsAdmin";
import { createClient } from "@/lib/supabase/server";
import { listProfiles, listSpecialtyTeams } from "@/lib/data";

export default async function AdminTeamsPage() {
  const [teams, profiles] = await Promise.all([listSpecialtyTeams(), listProfiles()]);
  const supabase = createClient();
  const { data } = await supabase.from("specialty_team_members").select("team_id, profile_id");
  const memberships = (data ?? []) as { team_id: string; profile_id: string }[];
  return <TeamsAdmin teams={teams} profiles={profiles} memberships={memberships} />;
}
