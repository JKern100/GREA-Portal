import AdminSidebar from "@/components/AdminSidebar";
import FeedbackView from "@/components/feedback/FeedbackView";
import { listFeedbackItems, listProfiles, requireProfile } from "@/lib/data";

export default async function FeedbackPage() {
  const [profile, items, profiles] = await Promise.all([
    requireProfile(),
    listFeedbackItems(),
    listProfiles()
  ]);

  const view = <FeedbackView profile={profile} initialItems={items} profiles={profiles} />;

  // When an admin lands on /feedback from their sidebar, keep the sidebar
  // alongside so the navigation context isn't lost. Brokers see the page
  // bare — they don't have a sidebar elsewhere either.
  if (profile.role === "superadmin" || profile.role === "office_admin") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
        <AdminSidebar mode={profile.role} />
        <div>{view}</div>
      </div>
    );
  }

  return view;
}
