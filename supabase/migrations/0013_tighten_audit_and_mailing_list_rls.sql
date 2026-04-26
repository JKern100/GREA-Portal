-- ============================================================
-- Defense-in-depth hardening
--
-- Two RLS gaps we discovered in audit:
--
-- 1. `contact_imports` was created in 0008 without enabling RLS.
--    With RLS off, the Supabase anon role can read the table by
--    default. The data (filenames, counts, importer ids, error
--    rows) is admin-internal and shouldn't be enumerable from a
--    logged-out browser. Lock reads to superadmins only — the
--    /api routes use the service role to write the audit
--    record, so enabling RLS doesn't affect the write path.
--
-- 2. `mailing_list_write` was permissive of office_admin OR
--    superadmin. After scoping all mailing-list management to
--    the Super Admin section, the office_admin path is no
--    longer exposed by any UI surface — but the policy still
--    permitted it at the database level. Tighten to superadmin
--    only so a crafted browser request from an office_admin
--    session can't bypass the missing UI.
-- ============================================================

-- 1. contact_imports
alter table public.contact_imports enable row level security;

drop policy if exists contact_imports_read on public.contact_imports;
create policy contact_imports_read on public.contact_imports
  for select using (public.is_superadmin());

-- 2. mailing_list_entries write policy
drop policy if exists mailing_list_write on public.mailing_list_entries;
create policy mailing_list_write on public.mailing_list_entries
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());
