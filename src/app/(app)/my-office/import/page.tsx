import ImportMapperWizard from "@/components/admin/ImportMapperWizard";
import { listOffices, requireOfficeAdminOrSuperadmin } from "@/lib/data";

/**
 * Office admin entry point for the Import Mapper. The office is fixed to the
 * admin's own; the picker only appears in the superadmin version under
 * /admin/utilities. See docs/SPECS_IMPORT_MAPPER.md §11.
 */
export default async function MyOfficeImportPage() {
  const profile = await requireOfficeAdminOrSuperadmin();
  if (!profile.office_id) return null;

  const offices = await listOffices();
  const office = offices.find((o) => o.id === profile.office_id);

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16, maxWidth: 720 }}>
        Upload the file your own system exports. You&apos;ll match its columns to the portal&apos;s
        fields and see exactly what would happen before anything is saved. If you already have a
        file in the portal&apos;s template, the Upload button on the Contacts or Pipeline page is
        quicker.
      </p>
      <ImportMapperWizard fixedOfficeId={profile.office_id} officeCode={office?.code} />
    </div>
  );
}
