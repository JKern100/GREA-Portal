import { createClient } from "@/lib/supabase/server";

async function counts() {
  const supabase = createClient();
  const [o, p, c, d] = await Promise.all([
    supabase.from("offices").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("deals").select("id", { count: "exact", head: true })
  ]);
  return {
    offices: o.count ?? 0,
    profiles: p.count ?? 0,
    contacts: c.count ?? 0,
    deals: d.count ?? 0
  };
}

export default async function AdminHome() {
  const c = await counts();
  const tiles = [
    { label: "Offices", value: c.offices },
    { label: "Users", value: c.profiles },
    { label: "Contacts", value: c.contacts },
    { label: "Deals", value: c.deals }
  ];
  return (
    <div>
      <h2 style={{ fontSize: 22, color: "var(--navy)" }}>Superadmin</h2>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 22 }}>
        Manage offices, users, contacts, and deals across the portal.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--navy)" }}>{t.value}</div>
            <div style={{ fontSize: 12, color: "var(--gray-500)", textTransform: "uppercase", marginTop: 4 }}>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
