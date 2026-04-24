-- ============================================================
-- Sample contacts from the prior POC template.
-- Safe to re-run: skips rows that already exist (by name+account).
-- Requires offices with codes NYC, NJ, ATL to exist. If they
-- don't, the respective rows are silently skipped.
-- ============================================================

insert into public.contacts (
  office_id,
  contact_name, account_name,
  broker_name_snapshot, broker_phone_snapshot,
  contact_phone, contact_email, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note
)
select
  o.id,
  v.contact_name, v.account_name,
  v.broker_name, v.broker_phone,
  v.contact_phone, v.contact_email, v.relationship_status,
  v.tags, v.sectors,
  v.date_added, v.last_contact_date,
  v.listing, v.note
from (values
  ('NYC', 'John Smith', 'Smith Capital Partners',
   'Michael Tortorici', '(212) 555-1234 x10',
   '(212) 555-9000', 'jsmith@smithcap.com', 'Active',
   array['Client', 'Seller'], array['Affordable Housing', 'Multifamily'],
   '2026-01-15'::date, '2026-04-10'::date,
   '125 Main St',
   'Active buyer — multifamily, interested in Bronx portfolios'),

  ('ATL', 'Sarah Johnson', 'Johnson Development LLC',
   'Derek Poole', '(404) 555-2222 x05',
   '(404) 555-8800', 'sjohnson@johnsondv.com', 'Active',
   array['Active', 'Buyer'], array['Student Housing'],
   '2025-11-01'::date, '2026-03-20'::date,
   null,
   'Seller — affordable housing, prefers off-market'),

  ('NJ', 'Michael Chen', 'Chen Properties Group',
   'Patricia Sullivan', '(201) 555-5678 x20',
   null, null, 'Prospect',
   array['Active', 'Buyer'], array['Multifamily', 'General'],
   '2026-03-01'::date, null,
   '400 Park Ave',
   null)
) as v(
  office_code,
  contact_name, account_name,
  broker_name, broker_phone,
  contact_phone, contact_email, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note
)
join public.offices o on o.code = v.office_code
where not exists (
  select 1 from public.contacts c
  where c.contact_name = v.contact_name
    and c.account_name = v.account_name
);
