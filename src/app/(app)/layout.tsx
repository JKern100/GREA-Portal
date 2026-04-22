import AppHeader from "@/components/AppHeader";
import { listOffices, requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const offices = await listOffices();
  const officeCode = offices.find((o) => o.id === profile.office_id)?.code ?? null;

  return (
    <>
      <AppHeader profile={profile} officeCode={officeCode} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>{children}</main>
    </>
  );
}
