-- ============================================================
-- DRAFT — NOT A MIGRATION YET. DO NOT RUN ON PRODUCTION.
--
-- 0026_deal_key_and_notes.sql
--
-- Prepared ahead of the deal-notes project
-- (docs/SPECS_DEAL_NOTES_AND_CONTACT_LINK.md, Parts A and B). It lives in
-- supabase/drafts/ rather than supabase/migrations/ so nobody mistakes it
-- for a pending change. If the project is approved: move it to
-- supabase/migrations/, add it to docs/MIGRATIONS.md as pending, and apply.
--
-- Rehearsed locally with:
--   scripts/test_migrations_local.sh supabase/drafts/0026_deal_key_and_notes.sql \
--                                    supabase/drafts/0026_test.sql
--
-- Additive and idempotent: new columns, new table, new functions. Existing
-- code keeps working whether or not this has been applied.
-- ============================================================

-- ------------------------------------------------------------
-- A. Stable deal key
-- ------------------------------------------------------------
alter table public.deals
  add column if not exists external_id text,
  add column if not exists deal_key text;

create index if not exists deals_office_key_idx on public.deals (office_id, deal_key);

-- SQL twin of normKeyPart() in src/lib/deals/dealKey.ts. ASCII-only on
-- purpose so the two cannot disagree about Unicode case-folding.
create or replace function public.deal_key_norm(v text) returns text
language sql immutable as $$
  select regexp_replace(lower(coalesce(v, '')), '[^a-z0-9]+', '', 'g')
$$;

-- SQL twin of dealKey(). Keep the two in step; 0026_test.sql checks the
-- same cases as scripts/test_deal_matching.js.
create or replace function public.compute_deal_key(p_external_id text, p_name text, p_address text)
returns text
language sql immutable as $$
  with x as (
    select regexp_replace(coalesce(p_external_id, ''), '^\s+|\s+$', '', 'g') as ext
  )
  select case
    when x.ext <> '' and x.ext !~* '^\d+(\.\d+)?e\+?\d+$'
      then 'id:' || lower(x.ext)
    when public.deal_key_norm(p_name) = ''
      then null
    else 'nk:' || public.deal_key_norm(p_name) || '|' || public.deal_key_norm(p_address)
  end
  from x
$$;

-- Backfill, so notes can be added before an office's next upload.
update public.deals
set deal_key = public.compute_deal_key(external_id, deal_name, property_address)
where deal_key is null;

-- ------------------------------------------------------------
-- B. Notes
--
-- No foreign key to deals, by design: a deal's row is deleted and
-- re-inserted on every upload, so notes point at (office_id, deal_key).
-- ------------------------------------------------------------
create table if not exists public.deal_notes (
  id uuid primary key default uuid_generate_v4(),
  office_id uuid not null references public.offices(id) on delete cascade,  -- the DEAL's office
  deal_key text not null,
  deal_name_snapshot text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  author_office_id uuid references public.offices(id) on delete set null,
  -- Set when an upload no longer contains this note's deal. Once set, the
  -- note stays "unattached" even if the same key shows up again later: an
  -- admin must re-attach it. This is what stops an old note reappearing on a
  -- property that was relisted under the same name and address.
  detached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deal_notes_key_idx
  on public.deal_notes (office_id, deal_key, created_at);
create index if not exists deal_notes_detached_idx
  on public.deal_notes (office_id, detached_at) where detached_at is not null;

-- May other offices see notes under this key? Only if the key currently
-- belongs to at least one deal and none of the deals carrying it is
-- confidential.
--
-- SECURITY DEFINER because the caller cannot see another office's
-- confidential deals (deals_read hides them), so a plain subquery in the
-- policy would wrongly conclude "no confidential deal here".
create or replace function public.deal_key_is_shared(p_office uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.deals d
           where d.office_id = p_office and d.deal_key = p_key
         )
     and not exists (
           select 1 from public.deals d
           where d.office_id = p_office and d.deal_key = p_key and d.is_confidential
         )
$$;

alter table public.deal_notes enable row level security;

-- Read: superadmin; the deal's own office (including unattached notes); and
-- everyone else only while the note is attached to a non-confidential deal.
drop policy if exists deal_notes_read on public.deal_notes;
create policy deal_notes_read on public.deal_notes
  for select using (
    auth.role() = 'authenticated' and (
      public.is_superadmin()
      or office_id = public.current_office()
      or (detached_at is null and public.deal_key_is_shared(office_id, deal_key))
    )
  );

-- No INSERT / UPDATE / DELETE policies, deliberately. All writes go through
-- server routes using the service role, which check who may add, edit,
-- delete and re-attach. That keeps author fields unspoofable and stops a
-- client from re-pointing a note at a different deal.
