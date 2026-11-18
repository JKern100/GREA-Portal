-- ============================================================
-- Minimal stand-ins for what Supabase provides, so the migrations can be
-- run against a plain local Postgres for TESTING ONLY.
--
-- Used by scripts/test_migrations_local.sh. Never run this against a real
-- Supabase project: it would collide with the real `auth` schema.
--
-- What is imitated:
--   - roles anon / authenticated / service_role
--   - schema `auth` with a cut-down `auth.users`
--   - auth.uid() and auth.role(), driven by the same request.jwt.claim.*
--     settings PostgREST sets, so a test can "sign in" as a user with
--       set local role authenticated;
--       set local request.jwt.claim.sub = '<uuid>';
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  invited_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text)
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase grants table privileges on `public` to these roles by default and
-- relies on row-level security to restrict them. Mirror that, or every RLS
-- test would fail on a plain permission error instead of on policy.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
