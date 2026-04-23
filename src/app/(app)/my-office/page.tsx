import { redirect } from "next/navigation";
import MyOfficeAdmin from "@/components/office-admin/MyOfficeAdmin";
import { createClient } from "@/lib/supabase/server";
import { listOffices, requireOfficeAdminOrSuperadmin } from "@/lib/data";
import type { Office, Profile } from "@/lib/types";

export default async function MyOfficePage() {
  const profile = await requireOfficeAdminOrSuperadmin();

  // Superadmins manage offices via /admin/offices; send them there.
  if (profile.role === "superadmin") redirect("/admin/offices");

  if (!profile.office_id) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 20, color: "var(--navy)" }}>My Office</h2>
        <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 8 }}>
          You are not assigned to an office yet. Please contact a superadmin to be assigned.
        </p>
      </div>
    );
  }

  const offices = await listOffices();
  const office = offices.find((o) => o.id === profile.office_id) as Office | undefined;
  if (!office) redirect("/contacts");

  const supabase = createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("office_id", profile.office_id)
    .order("name");

  return (
    <MyOfficeAdmin
      office={office}
      members={(members as Profile[]) ?? []}
      currentUserId={profile.id}
    />
  );
}
