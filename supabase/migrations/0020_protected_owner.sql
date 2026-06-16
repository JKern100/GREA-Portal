-- ============================================================
-- 0020_protected_owner.sql
--
-- "Protected owner" — an account other admins cannot act against.
-- A protected profile cannot be demoted, deactivated, deleted,
-- password-reset, or impersonated by anyone other than itself, and
-- only an existing protected owner may grant or revoke the flag.
-- This keeps the founding superadmin always-on-top even when other
-- co-equal superadmins exist.
--
-- Enforcement is layered:
--   * RLS below blocks other superadmins from writing a protected row.
--   * A trigger blocks setting/clearing the flag itself.
--   * The privileged API routes (delete-user, reset-password,
--     impersonate) use the service-role key (which bypasses RLS), so
--     they carry their own is_protected guards in application code.
-- ============================================================

alter table public.profiles
  add column if not exists is_protected boolean not null default false;

-- Mark the owner. Change this email (or run an update) if the owner
-- account ever moves.
update public.profiles set is_protected = true
where lower(email) = 'jeff.kern@gmail.com';

-- Is the CURRENT user a protected owner?
create or replace function public.is_protected_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_protected from public.profiles where id = auth.uid()), false)
$$;

-- Superadmins may write any profile EXCEPT a protected one that isn't
-- their own. SELECT is unaffected (profiles_read still exposes the
-- directory to everyone).
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all
  using (public.is_superadmin() and (not is_protected or id = auth.uid()))
  with check (public.is_superadmin() and (not is_protected or id = auth.uid()));

-- Only a protected owner may change the is_protected flag. Stops a
-- co-equal superadmin from protecting themselves or stripping the
-- owner's protection via a raw write. A no-JWT connection (service
-- role / SQL console / this migration) is trusted and passes through.
create or replace function public.guard_protected_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_protected and not public.is_protected_owner() then
      raise exception 'Only a protected owner can create a protected account';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.is_protected is distinct from old.is_protected
     and not public.is_protected_owner() then
    raise exception 'Only a protected owner can change account protection';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_protected_flag on public.profiles;
create trigger trg_guard_protected_flag
  before insert or update on public.profiles
  for each row execute function public.guard_protected_flag();
