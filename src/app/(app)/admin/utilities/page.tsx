import HubspotContactConverter from "@/components/admin/HubspotContactConverter";

/**
 * Superadmin utilities. Access is enforced by the /admin layout's
 * requireSuperadmin() guard, so no additional check is needed here.
 *
 * One-off data tools live here rather than in an office admin's view: they
 * exist to help an office get its data in, but they encode assumptions about
 * a specific CRM export and shouldn't be presented as a supported workflow.
 */
export default function AdminUtilitiesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, color: "var(--navy)", marginBottom: 6 }}>Utilities</h1>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 24, maxWidth: 720 }}>
        Data tools for onboarding offices. These are format-specific helpers, not a general
        import path — the supported route for offices is the Upload dialog in My Office.
      </p>
      <HubspotContactConverter />
    </div>
  );
}
