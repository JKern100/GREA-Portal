import AppHeader from "@/components/AppHeader";
import FeedbackLauncher from "@/components/FeedbackLauncher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import PageHelp from "@/components/PageHelp";
import PresenceBeacon from "@/components/PresenceBeacon";
import { listOffices, requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const offices = await listOffices();
  const officeCode = offices.find((o) => o.id === profile.office_id)?.code ?? null;
  const impersonatedBy = profile._impersonatedBy;

  // Presence is keyed by the REAL signed-in user, not the impersonated
  // profile. Otherwise a superadmin viewing-as someone else would appear
  // online from two seats at once and the indicator would lie.
  const presenceUserId = impersonatedBy?.id ?? profile.id;

  return (
    <>
      {impersonatedBy && (
        <ImpersonationBanner
          impersonatingName={profile.name || profile.email}
          realName={impersonatedBy.name || impersonatedBy.email}
        />
      )}
      <AppHeader profile={profile} officeCode={officeCode} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>{children}</main>
      <FeedbackLauncher />
      <PageHelp />
      <PresenceBeacon userId={presenceUserId} />
    </>
  );
}
