# Staging setup — checklist

*Status: **PREPARED, NOT DONE.** Nothing here has been carried out. Jeff is
waiting on Tiffany's answer on the deal-notes project before deciding whether
staging is worth setting up. Written 2026-11-18.*

Goal: a place to try changes before they reach the live portal, **without a
new server**. Vercel builds the staging site from a branch; a second (free)
Supabase project is the staging database.

## Branch names

| Branch | Role | Vercel |
|---|---|---|
| `production` | The live portal | Production Branch |
| `main` | Staging. All work lands here first | Preview, with a stable address |

A release is a merge of `main` into `production`. (Naming to be confirmed
against Jeff's Schulwise project; if that uses `staging`, rename here.)

## Order matters

Today `main` **is** the live site. Do these in order.

### 1. Staging database (Supabase) — Jeff, ~20 minutes
1. Supabase dashboard → New project, e.g. `grea-portal-staging`. Free plan is
   enough. (The free plan allows two projects and pauses an idle one after a
   week; un-pausing is one click.)
2. Build the bootstrap file and paste it into the new project's SQL editor:
   ```bash
   scripts/build_staging_bootstrap.sh > staging_bootstrap.sql
   ```
   It applies all migrations and loads the demo data (6 offices, ~260
   contacts, ~244 deals). Verified to load cleanly on 2026-11-18.
3. Authentication settings, to match production:
   - Email OTP expiry: `86400` (24 h)
   - Public sign-ups: off (invite only)
   - URL configuration → add the staging site address (from step 3 below) to
     Site URL / Redirect URLs, or invite and reset links will point at
     production.
4. Create your own staging login: Authentication → Users → **Invite user**
   (must be an invite; a plain sign-up gets no profile). Then in SQL:
   ```sql
   update public.profiles set role = 'superadmin' where lower(email) = '<your email>';
   ```

### 2. Create the `production` branch — Claude
```bash
git checkout main && git pull
git checkout -b production && git push -u origin production
```
At this point both branches are identical and nothing has changed for users.

### 3. Vercel — Jeff, ~10 minutes
1. Project → Settings → Git → **Production Branch**: change `main` to
   `production`.
2. Settings → Environment Variables. The three existing variables stay as
   they are for **Production**. Add the staging project's values for
   **Preview** only:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Settings → Domains (optional): give the `main` branch a fixed address so
   the staging link never changes.
4. Redeploy `main` so it picks up the Preview variables.

### 4. Prove the split before trusting it — Claude + Jeff
1. Push a harmless visible change to `main` (e.g. a "STAGING" ribbon shown
   when the Supabase URL is not production's).
2. Confirm it appears on the staging address and **not** on the live site.
3. Confirm the staging site shows demo data, not real contacts.

Only after this passes should real work land on `main`.

### 5. Update the working rules — Claude
- `CLAUDE.md` Git workflow: "work on `main` (staging); merge to `production`
  only when Jeff says to release."
- `docs/MIGRATIONS.md`: add a Staging column. Every migration is applied to
  staging first, then production.

## How a change flows afterwards

1. Rehearse any SQL locally: `scripts/test_migrations_local.sh <file>`.
2. Apply the SQL to **staging**; push code to `main`; check the staging site.
3. Apply the SQL to **production**; merge `main` → `production`.

SQL goes first in both places, and migrations stay additive, so the site
never runs code that expects a column that is not there yet.

## Known gaps

- Staging will have migration 0014 applied (production does not; harmless,
  nothing reads that column) and 0023's owner promotion is a no-op there.
- `supabase/seed.sql` is stale and no longer loads (it predates 0007). The
  bootstrap uses `supabase/seeds/large_sample.sql` instead. Fix or delete
  `seed.sql` at some point.
- API keys are per database. A key issued on staging does not work on
  production and vice versa.
