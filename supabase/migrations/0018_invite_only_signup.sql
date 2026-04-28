-- ============================================================
-- Lock the portal to invite-only access.
--
-- The original handle_new_user() trigger from 0001 creates a
-- profiles row for every new auth.users row, regardless of how
-- that auth row got there. Combined with Supabase Auth's default
-- public sign-up endpoint, that means anyone with a valid email
-- can create an account, get a default broker profile, and read
-- every office's contacts.
--
-- Fix: only create a profile when the auth.users row was created
-- by an invite (`invited_at` is set by `auth.admin.inviteUserByEmail`
-- and `auth.admin.generateLink({type:'invite'})`, which is what
-- /api/invite-user uses). Self-signups via supabase.auth.signUp()
-- have invited_at = NULL and will land in auth.users with no
-- corresponding profile, so requireProfile() bounces them to /login
-- on every request.
--
-- This is defense-in-depth — in addition, the Supabase project
-- should turn off "Allow new users to sign up" under Auth →
-- Providers → Email so the auth.users row is never created in
-- the first place. This migration ensures correct behavior even
-- if that toggle is missed or accidentally re-enabled.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reject anything that didn't come through an invite. Self-signup
  -- via supabase.auth.signUp() has invited_at = NULL.
  if new.invited_at is null then
    return new;
  end if;

  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger definition is unchanged from 0001 — re-create defensively in
-- case it was ever dropped. Functionally a no-op when the trigger
-- already exists.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
