-- ============================================================
-- Office colour
--   Lets superadmins assign a brand colour to each office so the
--   `office-badge` chip is visually distinguishable everywhere.
--   Stored as a CSS-compatible string (typically a #rrggbb hex).
--   Null means "use the default styling" (existing CSS rules in
--   globals.css for the originally-styled offices, or unstyled
--   fallback otherwise).
-- ============================================================

alter table public.offices
  add column if not exists color text;
