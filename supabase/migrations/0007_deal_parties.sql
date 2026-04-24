-- ============================================================
-- Deals: adopt the GREA Standard Data Format for pipeline uploads.
--   - Drop contact_name and account_name (not in the format; replaced
--     by seller_name / buyer_name, which are the real parties).
--   - Add property_type (free text; e.g. Multifamily, Mixed-Use).
--   - Add seller_name, buyer_name.
--   - Add date_added (distinct from created_at timestamp).
-- ============================================================

alter table public.deals
  add column if not exists property_type text,
  add column if not exists seller_name text,
  add column if not exists buyer_name text,
  add column if not exists date_added date;

alter table public.deals drop column if exists contact_name;
alter table public.deals drop column if exists account_name;
