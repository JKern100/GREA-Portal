import ImportMapperWizard from "@/components/admin/ImportMapperWizard";
import { listOffices } from "@/lib/data";

/**
 * Superadmin utilities. Access is enforced by the /admin layout's
 * requireSuperadmin() guard, so no additional check is needed here (the API
 * route re-checks the real profile independently).
 *
 * The Import Mapper replaced the one-off PHL HubSpot converter: rather than
 * encoding one CRM's export shape in code, it lets any export be matched to
 * the template by hand, with a dry-run preview. See
 * docs/SPECS_IMPORT_MAPPER.md.
 */
export default async function AdminUtilitiesPage() {
  const offices = await listOffices();
  return (
    <div>
      <h1 style={{ fontSize: 22, color: "var(--navy)", marginBottom: 6 }}>Utilities</h1>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 24, maxWidth: 720 }}>
        Data tools for onboarding offices. Superadmin only — the supported route for offices is
        the Upload dialog in My Office.
      </p>
      <ImportMapperWizard offices={offices} />
    </div>
  );
}
