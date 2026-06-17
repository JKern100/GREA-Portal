-- ============================================================
-- 0021_fix_protected_owner.sql
--
-- Correction to 0020: the protected-owner flag was set on the wrong
-- account. The owner signs in as jkern@arielpa.com (superadmin), not
-- jeff.kern@gmail.com. Move the protection.
--
-- Idempotent and safe to re-run. Runs via a no-JWT connection
-- (migration / SQL editor / service role), which the guard trigger
-- from 0020 allows.
-- ============================================================

update public.profiles set is_protected = false
where lower(email) = 'jeff.kern@gmail.com';

update public.profiles set is_protected = true
where lower(email) = 'jkern@arielpa.com';
