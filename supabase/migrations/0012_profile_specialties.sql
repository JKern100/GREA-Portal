-- ============================================================
-- Specialty teams → profile specialties
--
-- The original schema modelled practice areas as a separate
-- specialty_teams table with a specialty_team_members join. The
-- UI never actually used the membership data — the deal-detail
-- panel only showed the team name on a coloured bar. Collapsing
-- this into a `specialties text[]` column on profiles unifies
-- the vocabulary with the existing sectors taxonomy used on
-- contacts and deals, and lets us actually answer "who at the
-- firm does Affordable Housing?" with one query.
--
-- Migration is data-preserving: any existing memberships are
-- copied into profiles.specialties before the team tables go
-- away, so we don't lose what's already been wired up by hand.
-- ============================================================

alter table public.profiles
  add column if not exists specialties text[] not null default '{}';

create index if not exists profiles_specialties_idx
  on public.profiles using gin (specialties);

-- Copy existing memberships into the new column. Uses the team
-- NAME as the specialty value so it matches the sector vocabulary
-- already in use ("Capital Services", "Affordable Housing", etc.).
update public.profiles p
set specialties = sub.tags
from (
  select m.profile_id,
         array_agg(distinct st.name order by st.name) as tags
  from public.specialty_team_members m
  join public.specialty_teams st on st.id = m.team_id
  group by m.profile_id
) sub
where sub.profile_id = p.id;

-- Office admin RLS: the existing `profiles_office_admin_update`
-- policy already permits an office_admin to update profiles in
-- their own office, which now includes specialties. No new
-- policy needed.

drop table if exists public.specialty_team_members;
drop table if exists public.specialty_teams;
