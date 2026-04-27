import AdminSidebar from "@/components/AdminSidebar";
import FeedbackView from "@/components/feedback/FeedbackView";
import { listFeedbackItems, listOffices, listProfiles, requireProfile } from "@/lib/data";

export default async function FeedbackPage() {
  const [profile, items, profiles] = await Promise.all([
    requireProfile(),
    listFeedbackItems(),
    listProfiles()
  ]);

  const view = <FeedbackView profile={profile} initialItems={items} profiles={profiles} />;

  // Office admins land here from their My Office sidebar — match the
  // wrapper their other my-office pages use ("My Office — NYC (...)") so
  // they don't feel like they've left that section.
  if (profile.role === "office_admin") {
    const offices = await listOffices();
    const office = offices.find((o) => o.id === profile.office_id);
    return (
      <div>
        {office && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 22, color: "var(--navy)" }}>
              My Office — {office.code}{" "}
              <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>({office.name})</span>
            </h2>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
          <AdminSidebar mode="office_admin" />
          <div>{view}</div>
        </div>
      </div>
    );
  }

  if (profile.role === "superadmin") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
        <AdminSidebar mode="superadmin" />
        <div>{view}</div>
      </div>
    );
  }

  return view;
}
