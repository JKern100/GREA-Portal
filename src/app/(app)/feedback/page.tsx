import FeedbackView from "@/components/feedback/FeedbackView";
import { listFeedbackItems, listProfiles, requireProfile } from "@/lib/data";

export default async function FeedbackPage() {
  const [profile, items, profiles] = await Promise.all([
    requireProfile(),
    listFeedbackItems(),
    listProfiles()
  ]);
  return <FeedbackView profile={profile} initialItems={items} profiles={profiles} />;
}
