-- ============================================================
-- Password reset requests
--
-- Lets a signed-out user signal "I forgot my password" from the
-- /login page without depending on Supabase SMTP. Each request
-- becomes a row here; admins see a badge on the user's row in
-- /admin/users (or /my-office for office admins) and click their
-- existing "Reset password" button to generate the link, which
-- marks the request resolved.
--
-- Writes happen exclusively through the service-role API route
-- (`/api/request-password-reset`), so this table needs no public
-- INSERT policy. RLS covers reads only.
--
--   - Superadmins read everything.
--   - Office admins read only requests for users in their office.
--   - Brokers see nothing.
-- ============================================================

create table if not exists public.password_reset_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists password_reset_requests_open_idx
  on public.password_reset_requests (user_id)
  where resolved_at is null;

create index if not exists password_reset_requests_recent_idx
  on public.password_reset_requests (requested_at desc);

alter table public.password_reset_requests enable row level security;

drop policy if exists prr_read_super on public.password_reset_requests;
create policy prr_read_super on public.password_reset_requests
  for select using (public.is_superadmin());

-- Office admins see only requests tied to a profile in their own office.
-- A request whose `user_id` is NULL (email didn't match any profile) is
-- intentionally invisible to office admins — those are spam / typos and
-- only superadmins should triage them.
drop policy if exists prr_read_office_admin on public.password_reset_requests;
create policy prr_read_office_admin on public.password_reset_requests
  for select using (
    public.current_role() = 'office_admin'
    and user_id is not null
    and exists (
      select 1 from public.profiles p
      where p.id = password_reset_requests.user_id
        and p.office_id = public.current_office()
    )
  );
