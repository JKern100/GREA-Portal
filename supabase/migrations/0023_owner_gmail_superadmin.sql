-- ============================================================
-- 0023_owner_gmail_superadmin.sql
--
-- Designate jeff.kern@gmail.com as a protected superadmin owner:
-- promote to superadmin and ensure the protection flag is set. The
-- protection still works exactly as before (other admins can't demote,
-- deactivate, delete, reset, or impersonate this account) — only the
-- visible "Protected" badge was removed from the UI.
--
-- Idempotent. Runs via a no-JWT connection (migration / SQL editor),
-- which the guard trigger from 0020 allows.
-- ============================================================

update public.profiles
set role = 'superadmin',
    is_protected = true
where lower(email) = 'jeff.kern@gmail.com';
