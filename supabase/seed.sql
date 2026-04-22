-- ============================================================
-- GREA Contacts Portal — seed data
-- Run after 0001_initial_schema.sql
-- ============================================================

-- Offices
insert into public.offices (code, name, last_updated) values
  ('NYC', 'New York City', current_date - 30),
  ('NJ',  'New Jersey',    current_date - 40),
  ('DC',  'Washington DC', current_date - 55),
  ('ATL', 'Atlanta',       current_date - 90)
on conflict (code) do nothing;

-- Specialty teams
insert into public.specialty_teams (name, description, color) values
  ('Capital Services',  'Debt & equity placement, loan sales, and structured finance', '#2d6a4f'),
  ('Affordable Housing','Affordable, rent-stabilized, and tax-credit housing transactions', '#7b2d8e'),
  ('Student Housing',   'Student housing acquisitions, dispositions, and development', '#1a6fb5')
on conflict (name) do nothing;

-- Sample contacts are created once real profiles exist.
-- For now, insert a few rows with broker_name_snapshot only; broker_id stays null.
do $$
declare
  nyc uuid; nj uuid; dc uuid; atl uuid;
begin
  select id into nyc from public.offices where code = 'NYC';
  select id into nj  from public.offices where code = 'NJ';
  select id into dc  from public.offices where code = 'DC';
  select id into atl from public.offices where code = 'ATL';

  if not exists (select 1 from public.contacts limit 1) then
    insert into public.contacts (office_id, contact_name, account_name, broker_name_snapshot, broker_phone_snapshot, listing, note, tags, sectors, date_added) values
      (nyc, 'Steven Goldberg',     'Goldberg Capital Partners', 'Michael Tortorici', '(212) 544-9500 x11', '125 W 72nd St',        'Long-term hold investor',       array['Client','Seller'],  array['General','Multifamily'],       current_date - 100),
      (nyc, 'David Chen',          'Eastbridge Properties LLC', 'Victor Sozio',      '(212) 544-9500 x13', '340 E 93rd St',        'Family office investor',        array['Client','Buyer'],   array['Multifamily'],                  current_date - 42),
      (nyc, 'Rachel Moskowitz',    'RM Development Group',      'Michael Tortorici', '(212) 544-9500 x11', null,                    null,                            array['Lender'],           array['Capital Services','Multifamily'], current_date - 150),
      (nyc, 'James O''Brien',      'Atlantic Housing Corp',     'Jason Gold',        '(212) 544-9500 x15', '88 Atlantic Ave, Brooklyn', 'Office conversion projects', array['Referral Source'],  array['Multifamily'],                  current_date - 60),
      (nyc, 'Samantha Reeves',     'Reeves & Co Real Estate',   'Shimon Shkury',     '(212) 544-9500 x12', null,                    null,                            array['Active','Seller'],  array['Multifamily'],                  current_date - 20),
      (nj,  'David Chen',          'Eastbridge Properties LLC', 'Jeff Dwyer',        '(201) 326-6400 x21', '400 Market St, Newark', 'Off-market preference',         array['Active','Seller'],  array['Multifamily'],                  current_date - 75),
      (nj,  'Samantha Reeves',     'Reeves & Co Real Estate',   'Chris Muller',      '(201) 326-6400 x22', '88 Journal Sq, JC',     'Investor - seeking NJ',         array['Buyer'],            array['Multifamily'],                  current_date - 120),
      (dc,  'William Burke',       'Burke Capital Advisors',    'Matt Duzich',       '(202) 753-5200 x31', null,                    'Mixed-use focus',               array['Client','Active'],  array['Multifamily'],                  current_date - 80),
      (dc,  'Laura Bennett',       'Bennett Student Housing Fund','Kyle Daly',       '(202) 753-5200 x32', '3100 Georgia Ave NW',  'Acquisition opportunities',     array['Client','Seller'],  array['Student Housing','Multifamily'], current_date - 45),
      (atl, 'Thomas Reed',         'Reed Equities Group',       'Tony Kim',          '(404) 890-3200 x41', '225 Peachtree St NE',   'Long-term hold investor',       array['Buyer','Seller'],   array['Multifamily'],                  current_date - 20),
      (atl, 'Patricia Hernandez',  'Urban Core Capital',        'Derek Poole',       '(404) 890-3200 x42', '580 Ralph D Abernathy Blvd', null,                      array['Active','Buyer'],   array['Capital Services'],             current_date - 30);
  end if;
end$$;

-- Sample deals
do $$
declare
  nyc uuid; nj uuid; dc uuid; atl uuid;
  d_id uuid;
begin
  select id into nyc from public.offices where code = 'NYC';
  select id into nj  from public.offices where code = 'NJ';
  select id into dc  from public.offices where code = 'DC';
  select id into atl from public.offices where code = 'ATL';

  if not exists (select 1 from public.deals limit 1) then
    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, deal_value, sectors, notes, om_link)
    values
      ('125 W 72nd St Portfolio',       '125 W 72nd St, New York, NY', 'Steven Goldberg', 'Goldberg Capital Partners', nyc, 'Michael Tortorici', 'Listing',  12500000, array['Multifamily'], '6-building portfolio', null)
      returning id into d_id;
    insert into public.deal_stage_history (deal_id, stage, occurred_on, note) values
      (d_id, 'Lead',    current_date - 120, 'Initial outreach'),
      (d_id, 'Listing', current_date - 60,  'Exclusive listing signed');

    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, deal_value, sectors, notes, om_link)
    values
      ('Eastbridge Properties Acquisition','340 E 93rd St, New York, NY', 'David Chen', 'Eastbridge Properties LLC', nyc, 'Victor Sozio', 'Contract', 8750000, array['Multifamily'], 'Value-add', null)
      returning id into d_id;
    insert into public.deal_stage_history (deal_id, stage, occurred_on, note) values
      (d_id, 'Lead',     current_date - 100, 'Initial meeting'),
      (d_id, 'Listing',  current_date - 60,  'Listing signed'),
      (d_id, 'Contract', current_date - 10,  'LOI executed');

    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, sub_status, deal_value, sectors, notes)
    values
      ('RM Development Mixed-Use','500 W 143rd St, New York, NY', 'Rachel Moskowitz', 'RM Development Group', nyc, 'Michael Tortorici', 'Closed', 'Won', 22000000, array['Multifamily'], 'Large mixed-use')
      returning id into d_id;
    insert into public.deal_stage_history (deal_id, stage, occurred_on, note) values
      (d_id, 'Lead',     current_date - 200, 'Initial call'),
      (d_id, 'Listing',  current_date - 150, 'Listing agreement'),
      (d_id, 'Contract', current_date - 90,  'Contract executed'),
      (d_id, 'Closed',   current_date - 10,  'Deal closed - Won');

    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, deal_value, sectors, notes)
    values
      ('Jersey City Waterfront Development','Jersey City Waterfront', 'Linda Chen', 'Chen Development Group', nj, 'Patricia Sullivan', 'Listing', 32000000, array['Multifamily'], 'Large mixed-use waterfront');

    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, deal_value, sectors, notes)
    values
      ('Georgetown Mixed-Use Development','Georgetown, Washington DC', 'Elizabeth Garrett', 'Garrett Development LLC', dc, 'Robert Thompson', 'Contract', 35000000, array['Multifamily'], 'Georgetown corner');

    insert into public.deals (deal_name, property_address, contact_name, account_name, office_id, assigned_broker_name, stage, deal_value, sectors, notes)
    values
      ('Atlanta Midtown Office Portfolio','Midtown Atlanta, GA', 'Christopher Lee', 'Lee Development Partners', atl, 'Derek Poole', 'Listing', 16800000, array['General'], 'Class A office complex');
  end if;
end$$;
