-- ============================================================
-- Contacts: relationship_strength (spec S-10)
--   Optional 1-3 scale so brokers can tell, when the same contact is
--   shared across offices, which office has the strongest relationship
--   with that person. Populated at import time (numeric only).
--
--   The *meaning* of 1 vs 2 vs 3 is a cross-office decision (Tiffany
--   approved starting with this scale on 2026-07-10, but the precise
--   criteria are still provisional and may be recalibrated once real
--   office data is in) -- this migration only enforces the numeric
--   range, not a specific rubric.
-- ============================================================

alter table public.contacts
  add column if not exists relationship_strength smallint
    check (relationship_strength is null or relationship_strength between 1 and 3);
