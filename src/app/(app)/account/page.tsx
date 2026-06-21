import { redirect } from "next/navigation";
import ChangePasswordView from "@/components/account/ChangePasswordView";
import { getCurrentProfile, getRealProfile } from "@/lib/data";

export default async function AccountPage() {
  // Password changes operate on the real signed-in session, so anchor the
  // page to the real profile even when a superadmin is impersonating.
  const real = await getRealProfile();
  if (!real) redirect("/login");
  const effective = await getCurrentProfile();
  const impersonating = !!effective && effective.id !== real.id;

  return <ChangePasswordView email={real.email} impersonating={impersonating} />;
}
