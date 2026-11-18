-- ============================================================
-- Local rehearsal for the DRAFT 0026 migration. Never run on production:
-- it creates test users, offices, deals and notes.
--
--   scripts/test_migrations_local.sh supabase/drafts/0026_deal_key_and_notes.sql \
--                                    supabase/drafts/0026_test.sql
--
-- Any failed check raises an exception, which fails the run.
-- ============================================================

create or replace function pg_temp.expect(label text, ok boolean) returns void
language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FAILED: %', label; end if;
  raise notice 'TEST ok   %', label;
end $$;

-- ------------------------------------------------------------
-- 1. Key function: same cases as scripts/test_deal_matching.js
-- ------------------------------------------------------------
select pg_temp.expect('cosmetic differences give the same key',
  public.compute_deal_key(null, 'The Arker Portfolio', '123 Main St.')
  = public.compute_deal_key(null, '  the arker  portfolio ', '123 MAIN ST'));
select pg_temp.expect('key shape',
  public.compute_deal_key(null, 'The Arker Portfolio', '123 Main St.') = 'nk:thearkerportfolio|123mainst');
select pg_temp.expect('a real edit gives a different key',
  public.compute_deal_key(null, 'Arker', '123 Main St') <> public.compute_deal_key(null, 'Arker', '123 Main Street'));
select pg_temp.expect('blank address still gives a key',
  public.compute_deal_key(null, 'Harlem 5-Building Package', '') = 'nk:harlem5buildingpackage|');
select pg_temp.expect('name that normalises to nothing gives null',
  public.compute_deal_key(null, ' -- ', '1 A St') is null);
select pg_temp.expect('usable external id wins',
  public.compute_deal_key(' a0B5e00000XyZ ', 'X', 'Y') = 'id:a0b5e00000xyz');
select pg_temp.expect('scientific-notation id is ignored',
  public.compute_deal_key('1.23457E+11', 'Arker', '1 A St') = 'nk:arker|1ast');
select pg_temp.expect('1.2e11 is ignored too',
  public.compute_deal_key('1.2e11', 'Arker', '1 A St') = 'nk:arker|1ast');
select pg_temp.expect('plain digits are a usable id',
  public.compute_deal_key('123456789012', 'Arker', '1 A St') = 'id:123456789012');

-- ------------------------------------------------------------
-- 2. Fixtures: two offices, three users, three deals
-- ------------------------------------------------------------
insert into public.offices (id, code, name) values
  ('00000000-0000-0000-0000-00000000000a', 'TSTA', 'Test Office A'),
  ('00000000-0000-0000-0000-00000000000b', 'TSTB', 'Test Office B');

insert into auth.users (id, email, invited_at) values
  ('10000000-0000-0000-0000-000000000001', 'broker.a@test.local', now()),
  ('10000000-0000-0000-0000-000000000002', 'broker.b@test.local', now()),
  ('10000000-0000-0000-0000-000000000003', 'super@test.local',    now());

update public.profiles set office_id = '00000000-0000-0000-0000-00000000000a'
  where id = '10000000-0000-0000-0000-000000000001';
update public.profiles set office_id = '00000000-0000-0000-0000-00000000000b'
  where id = '10000000-0000-0000-0000-000000000002';
update public.profiles set role = 'superadmin'
  where id = '10000000-0000-0000-0000-000000000003';

-- Office A: one open deal, one confidential deal. Inserted WITHOUT deal_key,
-- as today's importer would, to prove the backfill statement works.
insert into public.deals (office_id, deal_name, property_address, is_confidential) values
  ('00000000-0000-0000-0000-00000000000a', 'Open Deal',   '1 Open St',   false),
  ('00000000-0000-0000-0000-00000000000a', 'Secret Deal', '2 Hidden Ave', true);

update public.deals
set deal_key = public.compute_deal_key(external_id, deal_name, property_address)
where deal_key is null;

select pg_temp.expect('backfill filled every key',
  (select count(*) from public.deals where office_id = '00000000-0000-0000-0000-00000000000a' and deal_key is null) = 0);

insert into public.deal_notes (office_id, deal_key, deal_name_snapshot, body, author_id, author_name) values
  ('00000000-0000-0000-0000-00000000000a', 'nk:opendeal|1openst',     'Open Deal',   'note on open deal',   '10000000-0000-0000-0000-000000000001', 'Broker A'),
  ('00000000-0000-0000-0000-00000000000a', 'nk:secretdeal|2hiddenave', 'Secret Deal', 'note on secret deal', '10000000-0000-0000-0000-000000000001', 'Broker A'),
  ('00000000-0000-0000-0000-00000000000a', 'nk:gonedeal|9gonerd',      'Gone Deal',   'note with no deal',   '10000000-0000-0000-0000-000000000001', 'Broker A');

-- ------------------------------------------------------------
-- 3. Row-level security, as each kind of user
-- ------------------------------------------------------------
create or replace function pg_temp.visible_notes(p_user uuid) returns text[]
language plpgsql as $$
declare result text[];
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select coalesce(array_agg(body order by body), '{}') into result from public.deal_notes;
  reset role;
  return result;
end $$;

select pg_temp.expect('owning office sees all three of its notes, attached or not',
  pg_temp.visible_notes('10000000-0000-0000-0000-000000000001')
  = array['note on open deal', 'note on secret deal', 'note with no deal']);

select pg_temp.expect('other office sees only the note on the non-confidential deal',
  pg_temp.visible_notes('10000000-0000-0000-0000-000000000002') = array['note on open deal']);

select pg_temp.expect('superadmin sees everything',
  array_length(pg_temp.visible_notes('10000000-0000-0000-0000-000000000003'), 1) = 3);

-- The safeguard: a detached note stays hidden from other offices even though
-- a deal with the same key exists (the "relisted property" case).
update public.deal_notes set detached_at = now() where body = 'note on open deal';
select pg_temp.expect('detached note is hidden from other offices even if the key exists again',
  pg_temp.visible_notes('10000000-0000-0000-0000-000000000002') = '{}'::text[]);
select pg_temp.expect('detached note is still visible to its own office',
  'note on open deal' = any (pg_temp.visible_notes('10000000-0000-0000-0000-000000000001')));
update public.deal_notes set detached_at = null where body = 'note on open deal';

-- A confidential deal sharing a key with an open one hides the notes.
insert into public.deals (office_id, deal_name, property_address, is_confidential, deal_key) values
  ('00000000-0000-0000-0000-00000000000a', 'Open Deal', '1 Open St', true, 'nk:opendeal|1openst');
select pg_temp.expect('a confidential twin under the same key hides the notes from other offices',
  pg_temp.visible_notes('10000000-0000-0000-0000-000000000002') = '{}'::text[]);
delete from public.deals where deal_name = 'Open Deal' and is_confidential;

-- Clients cannot write directly.
do $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into public.deal_notes (office_id, deal_key, body)
    values ('00000000-0000-0000-0000-00000000000a', 'nk:opendeal|1openst', 'direct write');
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  perform pg_temp.expect('a signed-in client cannot insert a note directly', blocked);
end $$;

do $$
declare changed int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update public.deal_notes set deal_key = 'nk:secretdeal|2hiddenave' where body = 'note on open deal';
  get diagnostics changed = row_count;
  reset role;
  perform pg_temp.expect('a signed-in client cannot re-point a note at another deal', changed = 0);
end $$;

do $$
declare removed int;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  delete from public.deal_notes;
  get diagnostics removed = row_count;
  reset role;
  perform pg_temp.expect('a signed-in client cannot delete notes directly', removed = 0);
end $$;

-- Length limit.
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.deal_notes (office_id, deal_key, body)
    values ('00000000-0000-0000-0000-00000000000a', 'nk:opendeal|1openst', repeat('x', 2001));
  exception when check_violation then rejected := true;
  end;
  perform pg_temp.expect('a 2,001-character note is rejected', rejected);
end $$;

-- Notes survive the deal being deleted and re-inserted (a Replace all upload).
delete from public.deals where office_id = '00000000-0000-0000-0000-00000000000a' and not is_confidential;
insert into public.deals (office_id, deal_name, property_address, deal_key) values
  ('00000000-0000-0000-0000-00000000000a', 'OPEN DEAL', '1 Open St.',
   public.compute_deal_key(null, 'OPEN DEAL', '1 Open St.'));
select pg_temp.expect('after delete + re-insert the note is still on the deal for other offices',
  pg_temp.visible_notes('10000000-0000-0000-0000-000000000002') = array['note on open deal']);

-- The migration can be run twice.
