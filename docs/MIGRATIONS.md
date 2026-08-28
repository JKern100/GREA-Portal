# Migration status — what has actually been applied to production

There is **no automated migration runner** on this project. Jeff applies SQL by
hand in the Supabase SQL editor, so the files in `supabase/migrations/` are the
*intent*, not the state of the database. The two drift, and that drift has
already caused a real problem (see 0016 below).

**Rule for Claude:** never tell Jeff to "just run" a migration without checking
this file first, and update the table below the moment he confirms he has run
one. If status is `UNVERIFIED`, say so rather than assuming.

**Rule for Jeff:** after running one in the SQL editor, tell Claude, or tick it
here yourself.

Last verified against production: **2026-08-28**, by running the column-level
verification query at the bottom of this file. Result: everything expected is
in place except **0014**, which was never applied (harmless — see below).

---

## Status

| # | Migration | Status | Basis |
|---|---|---|---|
| 0001 | initial_schema | ✅ Applied | Core tables present in prod listing |
| 0002 | office_admin | ✅ Applied | Policies in force (office admins work) |
| 0003 | mailing_list | ✅ Applied | `mailing_list_entries` present |
| 0004 | confidential_flag | ✅ Applied | Confidential filtering works in app |
| 0005 | feedback | ✅ Applied | `feedback_items`, `feedback_comments` present |
| 0006 | contact_extra_fields | ✅ Applied | Verified 2026-08-28: `contacts.contact_email` exists |
| 0007 | deal_parties | ✅ Applied | Verified 2026-08-28: `deals.seller_name` exists |
| 0008 | contact_imports | ✅ Applied | `contact_imports` present |
| 0009 | office_color | ✅ Applied | Office badge colours render |
| 0010 | mailing_list_address_optout | ⚠️ Unverified | Table exists; its columns not covered by the verification query |
| 0011 | mailing_list_imports | ✅ Applied | `mailing_list_imports` present |
| 0012 | profile_specialties | ✅ Applied | Specialties render; `specialty_teams` gone from listing |
| 0013 | tighten_audit_and_mailing_list_rls | ⚠️ Unverified | Policy-only, not observable from a table listing |
| **0014** | **drop_office_last_updated** | ❌ **NOT APPLIED** | Verified 2026-08-28: `offices.last_updated` still exists. Harmless — no code reads it. Destructive to apply (drops a column), so optional |
| 0015 | app_settings | ✅ Applied | `app_settings` present; Network freshness settings work |
| 0016 | deal_imports | ✅ Applied | **Jeff ran it 2026-08-28**; verified `to_regclass` non-null |
| 0017 | login_events | ✅ Applied | `login_events` present |
| 0018 | invite_only_signup | ✅ Applied | Public sign-up is closed |
| 0019 | password_reset_requests | ✅ Applied | `password_reset_requests` present |
| 0020 | protected_owner | ✅ Applied | Verified 2026-08-28: `profiles.is_protected` exists |
| 0021 | fix_protected_owner | ⚠️ Unverified | Function replacement, not observable externally |
| 0022 | onboarded_at | ✅ Applied | Verified 2026-08-28: `profiles.onboarded_at` exists |
| 0023 | owner_gmail_superadmin | ⚠️ Unverified | Data-only change |
| 0024 | contact_relationship_strength | ✅ Applied | Jeff ran it 2026-08-11; verified 2026-08-28 |
| 0025 | api_keys | ✅ Applied | **Jeff ran it 2026-08-28**; `api_keys` present and `contacts.share_contact_details` seeded |

---

## Outstanding

**`0014_drop_office_last_updated.sql`** — the only migration not applied.
It drops `offices.last_updated`, a vestigial column from the old "Mark
Refreshed" button; the Network freshness ring now derives from `created_at`
instead, and nothing in `src/` reads the column. Applying it is **optional and
cosmetic** — and unlike the others it is **destructive** (a column drop, which
discards whatever values it holds). Left unapplied it does no harm; it is
recorded here so the drift is known rather than rediscovered.

Everything else is applied. The v1 import API is unblocked as of 2026-08-28 —
keys can be issued from Super Admin → API Keys.

---

## Verifying state properly

Run this to check tables *and* the columns the later migrations add, rather than
inferring from a table listing:

```sql
select
  to_regclass('public.deal_imports')  is not null as m0016_deal_imports,
  to_regclass('public.api_keys')      is not null as m0025_api_keys,
  exists (select 1 from information_schema.columns
          where table_name='contacts' and column_name='relationship_strength') as m0024_rel_strength,
  exists (select 1 from information_schema.columns
          where table_name='contacts' and column_name='contact_email')        as m0006_contact_fields,
  exists (select 1 from information_schema.columns
          where table_name='deals'    and column_name='seller_name')          as m0007_deal_parties,
  exists (select 1 from information_schema.columns
          where table_name='profiles' and column_name='onboarded_at')         as m0022_onboarded_at,
  exists (select 1 from information_schema.columns
          where table_name='profiles' and column_name='is_protected')         as m0020_protected_owner,
  exists (select 1 from information_schema.columns
          where table_name='offices'  and column_name='last_updated')         as m0014_should_be_FALSE,
  exists (select 1 from public.app_settings
          where key='contacts.share_contact_details')                         as m0025_share_flag;
```

Everything should return `true` except `m0014_should_be_FALSE`, which should be
`false` (that migration *drops* the column). Paste the result back and this file
gets updated with a fresh verification date.
