import AdminShell from "@/components/AdminShell";
import FeedbackView from "@/components/feedback/FeedbackView";
import { listFeedbackItems, listOffices, listProfiles, requireProfile } from "@/lib/data";

export default async function FeedbackPage() {
  const [profile, items, profiles, offices] = await Promise.all([
    requireProfile(),
    listFeedbackItems(),
    listProfiles(),
    listOffices()
  ]);

  const view = (
    <FeedbackView profile={profile} initialItems={items} profiles={profiles} offices={offices} />
  );

  // Office admins land here from their My Office sidebar — match the
  // wrapper their other my-office pages use ("My Office — NYC (...)") so
  // they don't feel like they've left that section.
  if (profile.role === "office_admin") {
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
        <AdminShell mode="office_admin">{view}</AdminShell>
      </div>
    );
  }

  if (profile.role === "superadmin") {
    return <AdminShell mode="superadmin">{view}</AdminShell>;
  }

  return view;
}
