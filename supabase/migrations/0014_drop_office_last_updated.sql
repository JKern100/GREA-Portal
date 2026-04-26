-- ============================================================
-- Drop offices.last_updated
--
-- The column was a manually-bumped freshness timestamp tied to
-- a "Mark Refreshed" button on the Offices admin. We've removed
-- that UI and reframed the Network page's freshness ring as a
-- derived metric — it now reads the most recent contact /deal
-- activity per office. The column has no remaining consumer in
-- the app, so drop it from the schema to avoid drift.
-- ============================================================

alter table public.offices
  drop column if exists last_updated;
