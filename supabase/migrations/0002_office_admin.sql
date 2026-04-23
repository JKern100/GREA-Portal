-- ============================================================
-- Office Admin role support
--   - offices.can_add_contacts toggle (office_admins can set)
--   - office_admin RLS: manage own office + own office profiles
--   - contacts insert gated on can_add_contacts for brokers
-- ============================================================

alter table public.offices
  add column if not exists can_add_contacts boolean not null default true;

-- ------------------------------------------------------------
-- Helper: is current user an office_admin?
-- ------------------------------------------------------------
create or replace function public.is_office_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'office_admin', false)
$$;

-- ------------------------------------------------------------
-- Offices: office_admin can update their own office only
-- ------------------------------------------------------------
drop policy if exists offices_update_own on public.offices;
create policy offices_update_own on public.offices
  for update
  using (public.is_office_admin() and id = public.current_office())
  with check (public.is_office_admin() and id = public.current_office());

-- ------------------------------------------------------------
-- Profiles: office_admin can update profiles within their own office,
-- but cannot promote anyone above broker, and cannot change their own role.
-- ------------------------------------------------------------
drop policy if exists profiles_office_admin_update on public.profiles;
create policy profiles_office_admin_update on public.profiles
  for update
  using (
    public.is_office_admin()
    and office_id = public.current_office()
    and id <> auth.uid()
  )
  with check (
    public.is_office_admin()
    and office_id = public.current_office()
    and role = 'broker'
  );

-- ------------------------------------------------------------
-- Contacts: insert gated on offices.can_add_contacts for brokers.
-- Superadmins and office_admins (of that office) always bypass.
-- ------------------------------------------------------------
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (
    public.is_superadmin()
    or (
      office_id = public.current_office()
      and (
        public.is_office_admin()
        or exists (
          select 1 from public.offices o
          where o.id = office_id and o.can_add_contacts
        )
      )
    )
  );
