-- ============================================================
-- Feedback: items + threaded comments
--   - Any authenticated user can submit feedback.
--   - Submitters read their own. Office admins read items from
--     their own office. Superadmins read everything.
--   - Submitters can edit their own item only while status='open'.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feedback_category') then
    create type feedback_category as enum ('bug', 'suggestion', 'question', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'feedback_status') then
    create type feedback_status as enum ('open', 'in_progress', 'resolved', 'closed');
  end if;
end$$;

create table if not exists public.feedback_items (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null default '',
  category feedback_category not null default 'other',
  status feedback_status not null default 'open',
  submitted_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  related_contact_id uuid references public.contacts(id) on delete set null,
  related_deal_id uuid references public.deals(id) on delete set null,
  context_url text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists feedback_items_status_idx on public.feedback_items(status);
create index if not exists feedback_items_submitted_by_idx on public.feedback_items(submitted_by);
create index if not exists feedback_items_assigned_to_idx on public.feedback_items(assigned_to);

create table if not exists public.feedback_comments (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.feedback_items(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists feedback_comments_item_idx on public.feedback_comments(item_id);

alter table public.feedback_items enable row level security;
alter table public.feedback_comments enable row level security;

-- ------------------------------------------------------------
-- Visibility helper: can the caller see items submitted by
-- someone in their own office?
-- ------------------------------------------------------------
create or replace function public.can_see_feedback_from(submitter uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_superadmin()
    or submitter = auth.uid()
    or (
      public.is_office_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = submitter and p.office_id = public.current_office()
      )
    )
$$;

-- ------------------------------------------------------------
-- feedback_items RLS
-- ------------------------------------------------------------
drop policy if exists feedback_items_read on public.feedback_items;
create policy feedback_items_read on public.feedback_items
  for select using (public.can_see_feedback_from(submitted_by));

drop policy if exists feedback_items_insert on public.feedback_items;
create policy feedback_items_insert on public.feedback_items
  for insert with check (submitted_by = auth.uid());

-- Admins can update within their scope. Submitters can update their
-- own item only while status='open' (WITH CHECK keeps status='open'
-- for that code path — they can't transition away on their own).
drop policy if exists feedback_items_update on public.feedback_items;
create policy feedback_items_update on public.feedback_items
  for update
  using (
    public.is_superadmin()
    or (
      public.is_office_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = submitted_by and p.office_id = public.current_office()
      )
    )
    or (submitted_by = auth.uid() and status = 'open')
  )
  with check (
    public.is_superadmin()
    or (
      public.is_office_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = submitted_by and p.office_id = public.current_office()
      )
    )
    or (submitted_by = auth.uid() and status = 'open')
  );

drop policy if exists feedback_items_delete on public.feedback_items;
create policy feedback_items_delete on public.feedback_items
  for delete using (public.is_superadmin());

-- ------------------------------------------------------------
-- feedback_comments RLS (inherits visibility from parent)
-- ------------------------------------------------------------
drop policy if exists feedback_comments_read on public.feedback_comments;
create policy feedback_comments_read on public.feedback_comments
  for select using (
    exists (
      select 1 from public.feedback_items i
      where i.id = item_id and public.can_see_feedback_from(i.submitted_by)
    )
  );

drop policy if exists feedback_comments_insert on public.feedback_comments;
create policy feedback_comments_insert on public.feedback_comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.feedback_items i
      where i.id = item_id and public.can_see_feedback_from(i.submitted_by)
    )
  );

drop policy if exists feedback_comments_update on public.feedback_comments;
create policy feedback_comments_update on public.feedback_comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists feedback_comments_delete on public.feedback_comments;
create policy feedback_comments_delete on public.feedback_comments
  for delete using (author_id = auth.uid() or public.is_superadmin());
