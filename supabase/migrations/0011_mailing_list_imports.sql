-- ============================================================
-- Mailing list import audit trail
--   Mirrors contact_imports — every bulk upload writes a row
--   here so admins can reconcile counts and skipped rows.
-- ============================================================

create table if not exists public.mailing_list_imports (
  id uuid primary key default uuid_generate_v4(),
  source_office_id uuid references public.offices(id) on delete set null,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_by_name text default '',
  mode text not null check (mode in ('replace', 'add_on')),
  file_name text default '',
  inserted_count integer not null default 0,
  deleted_count integer not null default 0,
  skipped_count integer not null default 0,
  skipped_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mailing_list_imports_office_idx
  on public.mailing_list_imports (source_office_id, created_at desc);

-- Audit rows are written via the service role (admin client) inside the
-- import API route, so the policies here only need to govern read access.
-- Lock that down to superadmins; office admins don't need history through
-- the public API today, and we don't want anon clients to enumerate it.
alter table public.mailing_list_imports enable row level security;

drop policy if exists mailing_list_imports_read on public.mailing_list_imports;
create policy mailing_list_imports_read on public.mailing_list_imports
  for select using (public.is_superadmin());
