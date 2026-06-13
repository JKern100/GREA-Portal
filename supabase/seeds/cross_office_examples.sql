-- ============================================================
-- CROSS-OFFICE CONTACT EXAMPLES (hand-maintained, not generated)
--
-- Purpose: give brokers a clear, searchable demonstration of what a
-- cross-office relationship looks like in the Contacts view — the same
-- person/account owned by more than one GREA office, consolidated into a
-- single card with multiple office badges and the gold "Cross-office
-- relationship" banner.
--
-- How consolidation works (see src/components/contacts/ContactsView.tsx):
-- rows merge into one card when their CONTACT NAME and ACCOUNT NAME both
-- match across offices. So each person below is inserted once per office
-- with an IDENTICAL contact_name + account_name, but a different local
-- broker and their own relationship details — which is exactly the story
-- the expanded card tells.
--
-- Notes:
--   * Run AFTER large_sample.sql (it relies on the 6 canonical offices).
--   * Idempotent: the WHERE NOT EXISTS guard skips rows already present,
--     so it's safe to re-run.
--   * Every row is is_confidential = false ON PURPOSE — confidential
--     contacts are only visible to their owning office, which would hide
--     the cross-office effect from everyone else.
--
-- Apply to a live Supabase project, e.g.:
--   psql "$DATABASE_URL" -f supabase/seeds/cross_office_examples.sql
--   (or paste the file into the Supabase SQL editor and run it)
-- ============================================================

insert into public.contacts (
  office_id,
  contact_name, account_name,
  broker_name_snapshot, broker_phone_snapshot,
  contact_email, contact_phone, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note,
  is_confidential
)
select
  o.id,
  v.contact_name, v.account_name,
  v.broker_name, v.broker_phone,
  v.contact_email, v.contact_phone, v.relationship_status,
  v.tags, v.sectors,
  v.date_added, v.last_contact_date,
  v.listing, v.note,
  v.is_confidential
from (values
    -- David Chen — Eastbridge Properties LLC (NYC + ATL + DTW)
    ('NYC', 'David Chen', 'Eastbridge Properties LLC', 'Victor Sozio', '(212) 544-9500 x13', 'david.chen@eastbridgeprop.com', '(212) 555-7811', 'Active', array['Client', 'Buyer']::text[], array['Multifamily']::text[], '2024-09-12'::date, '2026-02-10'::date, '340 E 93rd St', 'Family office — Upper West Side focus.', false),
    ('ATL', 'David Chen', 'Eastbridge Properties LLC', 'Tony Kim', '(404) 890-3200 x42', 'david.chen@eastbridgeprop.com', null, 'Active', array['Client']::text[], array['Multifamily', 'General']::text[], '2025-01-20'::date, '2026-01-05'::date, '225 Peachtree St NE', 'Expanding into the Sun Belt.', false),
    ('DTW', 'David Chen', 'Eastbridge Properties LLC', 'Latoya Moore', '(313) 555-0100 x24', null, '(313) 555-7811', 'Prospect', array['Active', 'Buyer']::text[], array['Multifamily', 'Affordable Housing']::text[], '2025-06-02'::date, null, null, 'Evaluating Midwest entry.', false),

    -- Jennifer Walsh — Meridian Capital Holdings (NYC + ATL)
    ('NYC', 'Jennifer Walsh', 'Meridian Capital Holdings', 'Shimon Shkury', '(212) 544-9500 x12', 'jwalsh@meridiancap.com', null, 'Active', array['Lender']::text[], array['Capital Services', 'Multifamily']::text[], '2024-11-03'::date, '2025-12-19'::date, null, 'Provides bridge debt nationally.', false),
    ('ATL', 'Jennifer Walsh', 'Meridian Capital Holdings', 'Derek Poole', '(404) 890-3200 x41', 'jwalsh@meridiancap.com', '(404) 555-2240', 'Active', array['Lender']::text[], array['Capital Services']::text[], '2025-03-15'::date, '2026-02-22'::date, null, 'Same lender — Southeast deals.', false),

    -- Robert Tanaka — Pinnacle Investment Group (ATL + HOU + PDX)
    ('ATL', 'Robert Tanaka', 'Pinnacle Investment Group', 'Marcus Booker', '(404) 890-3200 x44', 'rtanaka@pinnaclegrp.com', null, 'Active', array['Buyer']::text[], array['Multifamily']::text[], '2024-08-19'::date, '2025-11-30'::date, '100 Piedmont Ave NE', '1031 exchange buyer.', false),
    ('HOU', 'Robert Tanaka', 'Pinnacle Investment Group', 'Raymond Liu', '(713) 555-0200 x53', 'rtanaka@pinnaclegrp.com', '(713) 555-9920', 'Active', array['Active', 'Buyer']::text[], array['Multifamily', 'General']::text[], '2025-02-27'::date, null, '5005 Main St', 'Texas value-add appetite.', false),
    ('PDX', 'Robert Tanaka', 'Pinnacle Investment Group', 'Joshua Park', '(503) 555-0300 x62', null, null, 'Prospect', array['Buyer']::text[], array['Multifamily']::text[], '2025-09-08'::date, null, null, 'Exploring the Pacific Northwest.', false),

    -- Maria Delgado — Coastal Equity Partners (NYC + PHL)
    ('NYC', 'Maria Delgado', 'Coastal Equity Partners', 'Jason Gold', '(212) 544-9500 x15', 'mdelgado@coastaleq.com', '(212) 555-3360', 'Active', array['Client', 'Seller']::text[], array['Multifamily']::text[], '2024-10-01'::date, '2025-10-20'::date, '155 Rivington St', 'Disposing of a Northeast portfolio.', false),
    ('PHL', 'Maria Delgado', 'Coastal Equity Partners', 'Adriana Ferro', '(215) 555-0400 x72', 'mdelgado@coastaleq.com', null, 'Active', array['Seller']::text[], array['Multifamily', 'Affordable Housing']::text[], '2025-04-12'::date, '2026-01-09'::date, '1818 Spring Garden St', 'Same seller — Philadelphia assets.', false),

    -- Samuel Okonkwo — Northstar Realty Trust (ATL + DTW + PHL)
    ('ATL', 'Samuel Okonkwo', 'Northstar Realty Trust', 'Cory Caroline Sams', '(404) 890-3200 x43', 'sokonkwo@northstartrust.com', null, 'Active', array['Client']::text[], array['Affordable Housing', 'Multifamily']::text[], '2024-07-22'::date, '2025-09-14'::date, '880 North Ave NE', 'LIHTC developer.', false),
    ('DTW', 'Samuel Okonkwo', 'Northstar Realty Trust', 'Marcus Whitfield', '(313) 555-0100 x21', 'sokonkwo@northstartrust.com', '(313) 555-6610', 'Active', array['Active']::text[], array['Affordable Housing']::text[], '2025-01-30'::date, null, '2727 2nd Ave', 'Detroit affordable pipeline.', false),
    ('PHL', 'Samuel Okonkwo', 'Northstar Realty Trust', 'Daniel O''Sullivan', '(215) 555-0400 x71', null, null, 'Prospect', array['Active', 'Buyer']::text[], array['Affordable Housing', 'Multifamily']::text[], '2025-08-05'::date, null, null, 'Eyeing Philly tax-credit deals.', false),

    -- Priya Raman — Horizon Property Ventures (NYC + HOU)
    ('NYC', 'Priya Raman', 'Horizon Property Ventures', 'Daniel Mahfar', '(212) 544-9500 x16', 'praman@horizonpv.com', null, 'Active', array['Buyer']::text[], array['Student Housing', 'Multifamily']::text[], '2024-12-09'::date, '2025-12-01'::date, '601 W 115th St', 'Student housing near Columbia.', false),
    ('HOU', 'Priya Raman', 'Horizon Property Ventures', 'Whitney Pryor', '(713) 555-0200 x52', 'praman@horizonpv.com', '(713) 555-4407', 'Active', array['Active', 'Buyer']::text[], array['Student Housing', 'Multifamily']::text[], '2025-05-21'::date, '2026-02-15'::date, null, 'Targeting Rice / UH submarkets.', false),

    -- Daniel Weiss — Keystone Asset Management (ATL + PHL + PDX)
    ('ATL', 'Daniel Weiss', 'Keystone Asset Management', 'Tony Kim', '(404) 890-3200 x42', 'dweiss@keystoneam.com', '(404) 555-7755', 'Active', array['Lender']::text[], array['Capital Services', 'Multifamily']::text[], '2024-09-28'::date, '2025-11-18'::date, null, 'Balance-sheet lender.', false),
    ('PHL', 'Daniel Weiss', 'Keystone Asset Management', 'Priya Iyer', '(215) 555-0400 x74', 'dweiss@keystoneam.com', null, 'Active', array['Lender']::text[], array['Capital Services']::text[], '2025-02-11'::date, null, null, 'Same lender — Mid-Atlantic.', false),
    ('PDX', 'Daniel Weiss', 'Keystone Asset Management', 'Riley Greer', '(503) 555-0300 x63', null, null, 'Prospect', array['Lender']::text[], array['Capital Services', 'Multifamily']::text[], '2025-07-19'::date, null, null, 'Considering West Coast lending.', false),

    -- Grace Liu — Evergreen Multifamily Fund (NYC + ATL + HOU + DTW — 4 offices)
    ('NYC', 'Grace Liu', 'Evergreen Multifamily Fund', 'Michael Tortorici', '(212) 544-9500 x11', 'gliu@evergreenmf.com', '(212) 555-1180', 'Active', array['Client', 'Buyer']::text[], array['Multifamily']::text[], '2024-06-15'::date, '2026-03-01'::date, '125 W 72nd St', 'Core-plus fund, national mandate.', false),
    ('ATL', 'Grace Liu', 'Evergreen Multifamily Fund', 'Derek Poole', '(404) 890-3200 x41', 'gliu@evergreenmf.com', null, 'Active', array['Client', 'Buyer']::text[], array['Multifamily', 'General']::text[], '2024-10-04'::date, '2025-12-12'::date, '3030 Buckhead Loop NE', 'Active Sun Belt acquirer.', false),
    ('HOU', 'Grace Liu', 'Evergreen Multifamily Fund', 'Carlos Mendoza', '(713) 555-0200 x51', 'gliu@evergreenmf.com', '(713) 555-1180', 'Active', array['Buyer']::text[], array['Multifamily']::text[], '2025-01-22'::date, null, '2030 Buffalo Speedway', 'Texas allocation growing.', false),
    ('DTW', 'Grace Liu', 'Evergreen Multifamily Fund', 'Anthony Caruso', '(313) 555-0100 x23', null, null, 'Prospect', array['Active', 'Buyer']::text[], array['Multifamily', 'Affordable Housing']::text[], '2025-06-30'::date, null, null, 'First look at the Midwest.', false)
) as v(
  office_code,
  contact_name, account_name,
  broker_name, broker_phone,
  contact_email, contact_phone, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note,
  is_confidential
)
join public.offices o on o.code = v.office_code
where not exists (
  select 1 from public.contacts c
  where c.office_id = o.id
    and c.contact_name = v.contact_name
    and c.account_name = v.account_name
);
