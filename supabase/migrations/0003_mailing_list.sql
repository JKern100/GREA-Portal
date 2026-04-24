-- ============================================================
-- Community Mailing List
--   - One shared, national list
--   - Read by any authenticated user
--   - Write by office_admin or superadmin (data steward upload pattern)
-- ============================================================

create table if not exists public.mailing_list_entries (
  id uuid primary key default uuid_generate_v4(),
  name text not null default '',
  email text,
  organization text,
  title text,
  phone text,
  sectors text[] not null default '{}',
  tags text[] not null default '{}',
  notes text,
  source_office_id uuid references public.offices(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mailing_list_email_idx on public.mailing_list_entries(lower(email));
create index if not exists mailing_list_name_trgm_idx on public.mailing_list_entries using gin (name gin_trgm_ops);
create index if not exists mailing_list_org_trgm_idx on public.mailing_list_entries using gin (organization gin_trgm_ops);

alter table public.mailing_list_entries enable row level security;

drop policy if exists mailing_list_read on public.mailing_list_entries;
create policy mailing_list_read on public.mailing_list_entries
  for select using (auth.role() = 'authenticated');

drop policy if exists mailing_list_write on public.mailing_list_entries;
create policy mailing_list_write on public.mailing_list_entries
  for all
  using (public.is_superadmin() or public.is_office_admin())
  with check (public.is_superadmin() or public.is_office_admin());
