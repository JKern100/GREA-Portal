import PipelineView from "@/components/pipeline/PipelineView";
import { listDeals, listOffices, listSpecialtyTeams, requireProfile } from "@/lib/data";

export default async function PipelinePage() {
  const [profile, offices, deals, teams] = await Promise.all([
    requireProfile(),
    listOffices(),
    listDeals(),
    listSpecialtyTeams()
  ]);

  // "Hide" toggle: hidden deals never appear in the cross-office pipeline.
  const visibleDeals = deals.filter((d) => !d.is_confidential);

  return <PipelineView profile={profile} offices={offices} initialDeals={visibleDeals} teams={teams} />;
}
