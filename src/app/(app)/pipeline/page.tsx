import PipelineView from "@/components/pipeline/PipelineView";
import { listDeals, listOffices, listSpecialtyTeams, requireProfile } from "@/lib/data";

export default async function PipelinePage() {
  const [profile, offices, deals, teams] = await Promise.all([
    requireProfile(),
    listOffices(),
    listDeals(),
    listSpecialtyTeams()
  ]);
  return <PipelineView profile={profile} offices={offices} initialDeals={deals} teams={teams} />;
}
