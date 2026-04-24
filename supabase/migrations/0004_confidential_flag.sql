-- ============================================================
-- Read-only mirror + Confidential flag
--   - Drop the now-unused offices.can_add_contacts column.
--   - Add is_confidential flag to contacts and deals. When true,
--     the record is visible only to users in the owning office
--     (plus superadmins).
-- ============================================================

alter table public.offices drop column if exists can_add_contacts;

alter table public.contacts
  add column if not exists is_confidential boolean not null default false;

alter table public.deals
  add column if not exists is_confidential boolean not null default false;

create index if not exists contacts_confidential_idx on public.contacts(is_confidential) where is_confidential;
create index if not exists deals_confidential_idx on public.deals(is_confidential) where is_confidential;

-- ------------------------------------------------------------
-- Contacts: confidential records hidden from other offices
-- ------------------------------------------------------------
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
  for select using (
    auth.role() = 'authenticated' and (
      not is_confidential
      or public.is_superadmin()
      or office_id = public.current_office()
    )
  );

-- ------------------------------------------------------------
-- Deals: same visibility rule
-- ------------------------------------------------------------
drop policy if exists deals_read on public.deals;
create policy deals_read on public.deals
  for select using (
    auth.role() = 'authenticated' and (
      not is_confidential
      or public.is_superadmin()
      or office_id = public.current_office()
    )
  );

-- ------------------------------------------------------------
-- Read-only for brokers: tighten write access on contacts/deals so
-- only office_admin (own office) or superadmin can mutate records.
-- Ingestion is via office-admin uploads, plus the Confidential toggle.
-- ------------------------------------------------------------
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (
    public.is_superadmin()
    or (public.is_office_admin() and office_id = public.current_office())
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (
    public.is_superadmin()
    or (public.is_office_admin() and office_id = public.current_office())
  );

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert with check (
    public.is_superadmin()
    or (public.is_office_admin() and office_id = public.current_office())
  );

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update using (
    public.is_superadmin()
    or (public.is_office_admin() and office_id = public.current_office())
  );
