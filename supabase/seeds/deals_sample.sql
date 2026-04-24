-- ============================================================
-- Sample deals from the prior POC template.
-- Safe to re-run: skips rows that already exist by deal_name.
-- Requires offices with codes NYC, NJ, ATL; missing offices
-- cause the respective rows to silently no-op.
-- ============================================================

insert into public.deals (
  office_id,
  deal_name, property_address, property_type,
  seller_name, buyer_name,
  assigned_broker_name,
  stage, deal_value,
  sectors, om_link,
  date_added, notes
)
select
  o.id,
  v.deal_name, v.property_address, v.property_type,
  v.seller_name, v.buyer_name,
  v.assigned_broker_name,
  v.stage::deal_stage, v.deal_value,
  v.sectors, v.om_link,
  v.date_added, v.notes
from (values
  ('NYC', '125 W 72nd St Portfolio', '125 W 72nd St, New York, NY', 'Multifamily',
   'Goldberg Family Trust', 'Chen Properties Group',
   'Michael Tortorici', 'Listing', 12500000::numeric,
   array['Multifamily'], 'https://drive.google.com/file/d/example-om/view',
   '2026-01-10'::date, 'Exclusive listing — 48-unit walkup, UWS'),

  ('NJ', 'Newark Mixed-Use Assemblage', '44-52 Market St, Newark, NJ', 'Mixed-Use',
   'Sorrento Holdings', null,
   'Patricia Sullivan', 'Lead', 8750000::numeric,
   array['Multifamily', 'General'], null,
   '2026-03-15'::date, 'Off-market — confidential'),

  ('ATL', 'Atlanta Student Portfolio', 'Various, Atlanta, GA', 'Multifamily',
   'SFR Capital Partners', 'Apex Student Housing REIT',
   'Derek Poole', 'Contract', 22000000::numeric,
   array['Student Housing'], 'https://drive.google.com/file/d/example-atl/view',
   '2025-12-01'::date, '3-property portfolio near Georgia Tech')
) as v(
  office_code,
  deal_name, property_address, property_type,
  seller_name, buyer_name,
  assigned_broker_name,
  stage, deal_value,
  sectors, om_link,
  date_added, notes
)
join public.offices o on o.code = v.office_code
where not exists (
  select 1 from public.deals d where d.deal_name = v.deal_name
);
