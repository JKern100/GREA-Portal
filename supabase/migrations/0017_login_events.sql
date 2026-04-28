-- ============================================================
-- Login event audit trail
--   Records every successful sign-in. Populated by a trigger on
--   auth.users that fires whenever Supabase Auth bumps
--   last_sign_in_at (which it does on every successful login).
--
--   This is read-only history for superadmins. Office admins do
--   not see it. Impersonation does not generate rows here — only
--   real auth sign-ins do.
-- ============================================================

create table if not exists public.login_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signed_in_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists login_events_user_idx
  on public.login_events (user_id, signed_in_at desc);

create index if not exists login_events_signed_in_idx
  on public.login_events (signed_in_at desc);

-- ------------------------------------------------------------
-- Trigger: write a row whenever auth.users.last_sign_in_at moves.
--   - SECURITY DEFINER so it can write to public.login_events
--     regardless of the calling role (Supabase Auth runs as the
--     authenticator role on sign-in).
--   - Guard with `is distinct from` so unrelated updates to
--     auth.users (email change, metadata edit) don't create
--     phantom rows.
--   - If the matching profile row hasn't been created yet (race
--     against the on_auth_user_created trigger from 0001), skip
--     rather than fail — the next sign-in will record fine.
-- ------------------------------------------------------------
create or replace function public.handle_user_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and new.last_sign_in_at is not null then
    if exists (select 1 from public.profiles where id = new.id) then
      insert into public.login_events (user_id, signed_in_at)
      values (new.id, new.last_sign_in_at);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_signin on auth.users;
create trigger on_auth_user_signin
  after update of last_sign_in_at on auth.users
  for each row execute procedure public.handle_user_signin();

-- ------------------------------------------------------------
-- Backfill: seed the table with each existing user's most recent
-- sign-in so the page is useful from day one rather than empty
-- until everyone signs in again. Idempotent — re-running the
-- migration won't double-insert because we filter on a not-exists
-- check against (user_id, signed_in_at).
-- ------------------------------------------------------------
insert into public.login_events (user_id, signed_in_at)
select u.id, u.last_sign_in_at
from auth.users u
join public.profiles p on p.id = u.id
where u.last_sign_in_at is not null
  and not exists (
    select 1 from public.login_events e
    where e.user_id = u.id and e.signed_in_at = u.last_sign_in_at
  );

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.login_events enable row level security;

drop policy if exists login_events_read on public.login_events;
create policy login_events_read on public.login_events
  for select using (public.is_superadmin());

-- No write policy — rows are inserted by the SECURITY DEFINER
-- trigger and never by user-facing clients.
