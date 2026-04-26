-- ============================================================
-- Contact import audit trail
--   Records every bulk import performed via the My Office
--   "Upload Contacts" flow. Captures the mode (replace vs
--   add-on), counts of rows inserted / deleted / skipped, and
--   the per-row validation errors for any skipped rows so an
--   admin can reconcile.
-- ============================================================

create table if not exists public.contact_imports (
  id uuid primary key default uuid_generate_v4(),
  office_id uuid not null references public.offices(id) on delete cascade,
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

create index if not exists contact_imports_office_idx
  on public.contact_imports (office_id, created_at desc);
