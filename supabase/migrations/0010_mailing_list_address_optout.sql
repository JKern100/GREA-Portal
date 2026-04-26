-- ============================================================
-- Mailing list: opt-out flag + address columns + last-registered
--   The original 0003 schema only had name/email/org/title/phone
--   plus tag arrays. The first real-world data dump includes
--   opt-out status, postal address (often multi-line), and a
--   last-registration timestamp from the source system. Add
--   them as nullable columns; existing rows stay valid.
--
--   `opted_out` is NOT NULL with a default of false so any
--   downstream "send to mailing list" logic can rely on it
--   without a coalesce.
-- ============================================================

alter table public.mailing_list_entries
  add column if not exists opted_out boolean not null default false,
  add column if not exists last_registration_date timestamptz,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists country text;

create index if not exists mailing_list_opted_out_idx
  on public.mailing_list_entries (opted_out)
  where opted_out = true;
