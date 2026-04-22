-- ============================================================
-- GREA Contacts Portal — initial schema
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('broker', 'office_admin', 'superadmin');
  end if;
  if not exists (select 1 from pg_type where typname = 'deal_stage') then
    create type deal_stage as enum ('Lead', 'Listing', 'Contract', 'Closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'deal_sub_status') then
    create type deal_sub_status as enum ('Won', 'Lost');
  end if;
end$$;

-- ------------------------------------------------------------
-- Offices
-- ------------------------------------------------------------
create table if not exists public.offices (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  last_updated date default current_date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null default '',
  title text default '',
  phone text default '',
  office_id uuid references public.offices(id) on delete set null,
  role user_role not null default 'broker',
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_office_id_idx on public.profiles(office_id);
create index if not exists profiles_role_idx on public.profiles(role);

-- Auto-create a profile row when a new auth.users row appears
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Contacts
-- ------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  office_id uuid not null references public.offices(id) on delete cascade,
  contact_name text not null,
  account_name text not null,
  broker_id uuid references public.profiles(id) on delete set null,
  broker_name_snapshot text default '',
  broker_phone_snapshot text default '',
  listing text,
  note text,
  tags text[] not null default '{}',
  sectors text[] not null default '{}',
  date_added date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists contacts_office_idx on public.contacts(office_id);
create index if not exists contacts_broker_idx on public.contacts(broker_id);
create index if not exists contacts_name_trgm_idx on public.contacts using gin (contact_name gin_trgm_ops);
create index if not exists contacts_account_trgm_idx on public.contacts using gin (account_name gin_trgm_ops);

-- ------------------------------------------------------------
-- Deals
-- ------------------------------------------------------------
create table if not exists public.deals (
  id uuid primary key default uuid_generate_v4(),
  deal_name text not null,
  property_address text default '',
  contact_name text default '',
  account_name text default '',
  office_id uuid not null references public.offices(id) on delete cascade,
  assigned_broker_id uuid references public.profiles(id) on delete set null,
  assigned_broker_name text default '',
  stage deal_stage not null default 'Lead',
  sub_status deal_sub_status,
  deal_value numeric(16,2),
  sectors text[] not null default '{}',
  notes text,
  om_link text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists deals_office_idx on public.deals(office_id);
create index if not exists deals_stage_idx on public.deals(stage);

create table if not exists public.deal_stage_history (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  stage deal_stage not null,
  note text,
  occurred_on date not null default current_date,
  created_at timestamptz default now()
);

create index if not exists deal_stage_history_deal_idx on public.deal_stage_history(deal_id);

-- ------------------------------------------------------------
-- Specialty Teams
-- ------------------------------------------------------------
create table if not exists public.specialty_teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text default '',
  color text default '#1a2744',
  created_at timestamptz default now()
);

create table if not exists public.specialty_team_members (
  team_id uuid not null references public.specialty_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);

-- ------------------------------------------------------------
-- Helpers for RLS
-- ------------------------------------------------------------
create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_office() returns uuid
language sql stable security definer set search_path = public as $$
  select office_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'superadmin', false)
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.offices enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.deal_stage_history enable row level security;
alter table public.specialty_teams enable row level security;
alter table public.specialty_team_members enable row level security;

-- Offices: any authenticated user can read; only superadmins write
drop policy if exists offices_read on public.offices;
create policy offices_read on public.offices
  for select using (auth.role() = 'authenticated');

drop policy if exists offices_write on public.offices;
create policy offices_write on public.offices
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Profiles: users read all (for directory), update self; superadmin writes all
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Contacts: all authenticated can read; brokers can write their own office's contacts
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
  for select using (auth.role() = 'authenticated');

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (
    public.is_superadmin() or office_id = public.current_office()
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (
    public.is_superadmin() or office_id = public.current_office()
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete using (
    public.is_superadmin() or (public.current_role() = 'office_admin' and office_id = public.current_office())
  );

-- Deals: similar rules
drop policy if exists deals_read on public.deals;
create policy deals_read on public.deals
  for select using (auth.role() = 'authenticated');

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert with check (
    public.is_superadmin() or office_id = public.current_office()
  );

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update using (
    public.is_superadmin() or office_id = public.current_office()
  );

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals
  for delete using (
    public.is_superadmin() or (public.current_role() = 'office_admin' and office_id = public.current_office())
  );

-- Deal stage history follows deal permissions
drop policy if exists deal_stage_history_read on public.deal_stage_history;
create policy deal_stage_history_read on public.deal_stage_history
  for select using (auth.role() = 'authenticated');

drop policy if exists deal_stage_history_write on public.deal_stage_history;
create policy deal_stage_history_write on public.deal_stage_history
  for all using (
    public.is_superadmin() or exists (
      select 1 from public.deals d where d.id = deal_id and d.office_id = public.current_office()
    )
  ) with check (
    public.is_superadmin() or exists (
      select 1 from public.deals d where d.id = deal_id and d.office_id = public.current_office()
    )
  );

-- Specialty teams: read-all, superadmin write
drop policy if exists teams_read on public.specialty_teams;
create policy teams_read on public.specialty_teams
  for select using (auth.role() = 'authenticated');

drop policy if exists teams_write on public.specialty_teams;
create policy teams_write on public.specialty_teams
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists team_members_read on public.specialty_team_members;
create policy team_members_read on public.specialty_team_members
  for select using (auth.role() = 'authenticated');

drop policy if exists team_members_write on public.specialty_team_members;
create policy team_members_write on public.specialty_team_members
  for all using (public.is_superadmin()) with check (public.is_superadmin());
