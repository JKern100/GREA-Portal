import PipelineView from "@/components/pipeline/PipelineView";
import { listDeals, listOffices, listProfiles, requireProfile } from "@/lib/data";

export default async function PipelinePage() {
  const [profile, offices, deals, profiles] = await Promise.all([
    requireProfile(),
    listOffices(),
    listDeals(),
    listProfiles()
  ]);

  // "Hide" toggle: hidden deals never appear in the cross-office pipeline.
  const visibleDeals = deals.filter((d) => !d.is_confidential);

  // Only active brokers/admins can be "specialists to loop in" on a deal.
  const activeProfiles = profiles.filter((p) => p.is_active);

  return (
    <PipelineView
      profile={profile}
      offices={offices}
      initialDeals={visibleDeals}
      profiles={activeProfiles}
    />
  );
}
