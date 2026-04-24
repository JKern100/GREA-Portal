-- ============================================================
-- Contacts: extra fields from the GREA Standard Data Format
--   - contact_phone, contact_email
--   - relationship_status (free text; e.g. Active, Prospect,
--     Former, Inactive). Free text for now; promote to enum
--     once the canonical value set stabilises.
--   - last_contact_date
-- ============================================================

alter table public.contacts
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists relationship_status text,
  add column if not exists last_contact_date date;

create index if not exists contacts_email_idx
  on public.contacts (lower(contact_email))
  where contact_email is not null;
