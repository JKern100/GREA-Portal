-- ============================================================
-- Import API: per-office API keys  (see docs/SPECS_IMPORT_API.md)
--
-- Offices push Contacts / Pipeline data to /api/v1/import/* using a
-- bearer key. A key belongs to exactly one office, so the office is
-- always derived from the key and never from the request body — a
-- caller structurally cannot write into another office.
--
-- Only the SHA-256 hash of the key is stored. The plaintext is shown
-- once at creation and is unrecoverable afterwards; a lost key is
-- revoked and reissued rather than looked up.
-- ============================================================

create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  office_id uuid not null references public.offices(id) on delete cascade,
  -- sha256 hex of the plaintext key. Unique so a hash collision or a
  -- duplicate insert can't create two rows resolving to one key.
  key_hash text not null unique,
  -- Non-secret hint so an admin can tell keys apart in the UI
  -- (e.g. "grea_live_…a91f") without revealing the key.
  key_suffix text not null default '',
  label text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_office_idx on public.api_keys (office_id, created_at desc);
-- Lookup on every API call is by hash; only live keys matter.
create index if not exists api_keys_active_idx on public.api_keys (key_hash) where revoked_at is null;

-- Key rows are read and written by the service role inside the API and
-- admin routes, which bypass RLS. These policies exist so that no
-- ordinary authenticated session — including an office admin — can read
-- key material or enumerate other offices' keys.
alter table public.api_keys enable row level security;

drop policy if exists api_keys_read on public.api_keys;
create policy api_keys_read on public.api_keys
  for select using (public.is_superadmin());

drop policy if exists api_keys_write on public.api_keys;
create policy api_keys_write on public.api_keys
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ------------------------------------------------------------
-- First-stage contact-sharing policy, as a setting rather than code.
--
-- While false, the importer blanks contact phone/email on every
-- contacts import (API and manual upload alike) and reports how many
-- values it removed. Lifting the policy later is a settings change,
-- not a deploy.
-- ------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('contacts.share_contact_details', 'false'::jsonb)
on conflict (key) do nothing;
