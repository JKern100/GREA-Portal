-- ============================================================
-- 0022_onboarded_at.sql
--
-- Track real onboarding completion. The admin "Registered" badge was
-- derived from auth.users.last_sign_in_at, but that timestamp is set
-- the moment an invite/recovery link is *verified* — including when a
-- corporate email link-scanner auto-opens it — NOT when the user sets a
-- password. That made accounts look "Registered" when the person had
-- never finished (and had no password).
--
-- onboarded_at is stamped only when the user submits the set-password
-- form on /welcome, or when an admin sets their password directly. The
-- badge now keys off this, so it can't lie.
-- ============================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Backfill: anyone who already has a password has genuinely onboarded.
-- (Tiffany-style accounts with no password stay null → show "Pending".)
update public.profiles p
set onboarded_at = coalesce(u.last_sign_in_at, now())
from auth.users u
where u.id = p.id
  and u.encrypted_password is not null
  and u.encrypted_password <> ''
  and p.onboarded_at is null;
