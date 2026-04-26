-- ============================================================
-- Generic app-level settings store
--
-- One row per setting, identified by `key`. `value` is JSONB so
-- shape can evolve without a migration each time. RLS:
--   - Any authenticated user can READ — settings drive UI
--     (e.g. the Network freshness thresholds) that every viewer
--     needs to render correctly.
--   - Only superadmins can WRITE — these are app-level knobs,
--     shared across all superadmins (no per-user storage), per
--     the design.
--
-- A trigger keeps `updated_at` accurate on every change, and the
-- row references `updated_by` so we know who last touched it.
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_app_settings_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function public.touch_app_settings_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Seed the Network freshness thresholds with the agreed defaults so the
-- ring colours work on first load even before any superadmin opens the
-- Settings page. Superadmins can override per-view from
-- /admin/settings.
insert into public.app_settings (key, value) values
  (
    'network.freshness',
    '{"contacts":{"current":3,"due":10},"pipeline":{"current":3,"due":10}}'::jsonb
  )
on conflict (key) do nothing;
