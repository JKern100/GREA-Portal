# GREA Portal — Phase 1 Pre-Launch Audit

*Date: 2026-06-12 · Scope: end-to-end audit (security, RLS/tenant isolation,
dependencies, usability, robustness) ahead of opening the Phase 1 prototype to
external GREA brokers. Audit only — no application code was changed.*

---

## Executive summary

The app is in **good shape for a Phase 1 feedback round**. The architecture is
sound: every API route checks authentication and role, RLS is enabled on all
tables, the service-role key is correctly server-only, and the highest-risk
features (impersonation, user invite/delete, password reset) are carefully
guarded against the obvious privilege-escalation paths. The two background
deep-dives (RLS migrations + frontend flows) and the manual review of every API
route agree: there are **no open Critical vulnerabilities**.

What stands between "works" and "safe to share widely" is a short list of
**hardening items** — most of which only bite once *real* data and *real*
external users are involved, which is exactly the Phase 1 transition. The items
worth doing before you send invites are: remove the PII debug logging in the
password-reset endpoint, neutralize CSV/spreadsheet formula injection in the
exports, add basic abuse protection to the one public endpoint, and decide
consciously about the cross-office "everyone can read everything" default.

`npm run typecheck` and `npm run lint` both pass clean (lint is unconfigured —
see L-5).

### Priority counts

| Severity | Count | Gate for sharing? |
|---|---|---|
| Critical | 0 | — |
| High | 3 | Yes — fix before external invites |
| Medium | 5 | Strongly recommended before sharing |
| Low | 6 | Soon / next phase |

---

## Must fix before sharing (High)

### H-1 · PII + debug logging in the public password-reset endpoint
`src/app/api/request-password-reset/route.ts:29,32,48,73,86`

The "Forgot password?" handler logs the submitted email and lookup results to
the server console on every call — and the code itself flags it as temporary
("TEMP debug logging — remove once we've isolated…"). This is a **public,
unauthenticated** endpoint, so anyone can write arbitrary emails into your logs,
and real user emails (PII) will land in Vercel/host logs in production. Remove
all five `console.log` calls before launch.

*Fix:* delete the `console.log` lines; keep the silent-success behavior.

### H-2 · CSV / spreadsheet formula injection in exports
`src/app/api/contacts/export/route.ts:11-13` · `src/app/api/deals/export/route.ts:11-13`
(and the mailing-list export in `MailingListView.tsx`)

`csvCell()` quotes and escapes `"` correctly, but does **not** neutralize cells
that begin with `=`, `+`, `-`, `@`, tab, or CR. A contact/deal field containing
e.g. `=HYPERLINK("http://evil","click")` or `=cmd|…` becomes a live formula when
an admin opens the export in Excel/Sheets — a classic CSV-injection → local
command/data-exfil vector. Because Phase 1 invites external brokers who will
type free-text into fields that later get exported by admins, this is in-scope
now.

*Fix:* prefix any cell whose first character is one of `= + - @ \t \r` with a
single quote (`'`) before emitting, in both CSV and XLSX paths. Apply the same
guard to the mailing-list client-side export.

### H-3 · `xlsx` (SheetJS) has known High-severity CVEs and parses untrusted uploads
`package.json` (`xlsx@^0.18.5`) · used in all three `*/import/route.ts`

`npm audit` reports **Prototype Pollution (GHSA-4r6h-8v6p-xvw6)** and **ReDoS
(GHSA-5pgg-2g8v-p4x9)** in `xlsx`, with **no fix available** on the npm-published
version. The import routes call `XLSX.read()` on user-supplied files. In Phase 1
the uploaders are trusted office admins (role-gated), which lowers the
likelihood — but a malicious/crafted spreadsheet from anyone an admin trusts
could trigger it.

*Fix (pick one):* migrate to the SheetJS-hosted current release
(`https://cdn.sheetjs.com/…`, which patches these), or replace `xlsx` with a
maintained parser (e.g. `exceljs`), or — cheapest for Phase 1 — restrict imports
to CSV only (you already have a working Papa-parse path) and disable the `.xlsx`
branch until the dependency is updated.

---

## Strongly recommended before sharing (Medium)

### M-1 · Cross-office read default: everyone sees everything not flagged confidential
`supabase/migrations/0004_confidential_flag.sql:27-48`

Non-confidential `contacts` and `deals` are readable by **any** authenticated
user from **any** office; isolation depends entirely on records being correctly
marked `is_confidential`. This is the app's intended "national mirror" model and
is fine for the **dummy-data** prototype — but the moment real broker data is
loaded, every broker can read every other office's non-flagged contacts and
deals. Decide this consciously before real data lands: either confirm the open
model is intended, or invert the default (own-office unless explicitly shared).
*Flagging now because it's the single biggest data-exposure decision for the
next phase; not a prototype blocker.*

### M-2 · Full user directory exposed to every authenticated user
`supabase/migrations/0001_initial_schema.sql:193-195`

`profiles_read` lets any authenticated user `SELECT` every profile — names,
emails, phones, titles, office assignments, and roles across all offices. Useful
for the directory features, but it hands every invited external broker a
complete org/contact map (enumeration + social-engineering surface). Consider
scoping reads to `office_id = current_office() OR is_superadmin()`, or to a
narrowed column set, before widening the audience.

### M-3 · No rate limiting / abuse cap on the public reset endpoint
`src/app/api/request-password-reset/route.ts`

The endpoint is unauthenticated. There's a 1-hour per-user dedupe, but no IP or
global rate limit, so it can be hit at volume to grow `password_reset_requests`
and spam admin badges. Add a lightweight rate limit (per-IP, or a global
ceiling) — even a simple in-memory/Upstash limiter is enough for Phase 1.

### M-4 · No row-count cap on imports (only a 5 MB byte cap)
`contacts/import`, `deals/import`, `mailing-list/import`

Each import enforces `MAX_BYTES = 5 MB` but no maximum row count. A 5 MB CSV can
be hundreds of thousands of rows, all inserted in 500-row chunks against the
service-role client — a slow-request / resource pressure vector, and an easy way
for an admin to accidentally balloon a table. Add a sane row ceiling (e.g.
reject > 10k rows with a clear message).

### M-5 · Export error handler leaks stack traces to the client
`contacts/export/route.ts:147-160` · `deals/export/route.ts:141-151`

On an unhandled error the export returns the exception message **and the first 6
stack frames** in the HTTP response body. Helpful while debugging; in production
it discloses internal paths/implementation detail to the caller. Return a
generic message to the client and keep the stack in server logs only.

### M-6 · Modal data-fetch failures render blank instead of an error
`src/components/pipeline/DealDetailModal.tsx:115-116`

If the deal-detail fetch fails, the modal falls back to null/blank under a
persistent "Loading…", with no error state. During a feedback round this looks
like a broken feature and will generate noise. Show a "Couldn't load deal
details — try again" state.

---

## Soon / next phase (Low)

- **L-1 · Modals lack Escape-to-close and focus trapping.** `PageHelp.tsx`
  handles Escape correctly, but `DealDetailModal` (`:112`) and
  `SubmitFeedbackModal` (`:78`) close only on overlay click, and no modal traps
  focus. Standardize on the `PageHelp` keydown pattern; add focus containment if
  you want a WCAG baseline. Not a user blocker.
- **L-2 · `alert()` for error reporting in admin flows.**
  `MailingListView.tsx:48,63` (and an office-admin path) use `alert()` for
  errors, inconsistent with the app's inline error UX. Replace with an inline
  message/toast.
- **L-3 · `ws` moderate CVE (GHSA-58qx-3vcg-4xpx).** Transitive, **fix
  available** via `npm audit fix`. Run it.
- **L-4 · Document the required Supabase Auth setting.** DB-level invite-only
  enforcement (`0018`) is solid, but it assumes "Allow new users to sign up" is
  **disabled** in the Supabase Auth dashboard. Add this to the deploy checklist
  / README so it can't be missed on a fresh project.
- **L-5 · ESLint is not actually configured.** `npm run lint` drops into the
  interactive "How would you like to configure ESLint?" prompt — meaning lint is
  effectively a no-op in CI/local. Commit a `.eslintrc` (Strict + the Next.js
  plugin) so linting actually runs.
- **L-6 · Minor a11y gaps.** Some bulk-select checkboxes lack descriptive
  labels (`MailingListView.tsx` admin header). Low impact; tidy when convenient.

---

## What was reviewed and looks solid (no action)

These were specifically checked and passed — recorded so the next reviewer
doesn't re-audit them:

- **Service-role key isolation** — `src/lib/supabase/admin.ts` is server-only
  with a clear guard; never imported into client/RSC-exposed code; not exposed to
  the browser. `.env.example` correctly labels it server-only; `.gitignore`
  excludes all `.env*` files and git history contains no committed secrets.
- **Impersonation** (`api/impersonate/route.ts`, `lib/data.ts`) — start requires
  superadmin or office_admin; office admins are constrained to **brokers in their
  own office** (verified via admin lookup); self-impersonation blocked; cookie is
  `httpOnly`, `sameSite=lax`, `secure` in prod, 8h expiry. `getCurrentProfile`
  only honors the cookie when the **real** user is a superadmin, and
  `requireSuperadmin` re-checks the real user so an impersonating admin can't
  reach `/admin`. Solid.
- **invite-user / delete-user / reset-password** — all gated to the correct
  roles; office admins are locked to broker role + their own office; delete
  blocks self-deletion and last-superadmin removal; reset blocks deactivated
  accounts and is office-scoped for office admins.
- **request-password-reset** — correctly always returns 200 to prevent email
  enumeration (the *behavior* is right; only the logging in H-1 is the issue).
- **Import auth guards** — contacts/deals imports require effective
  `office_admin` + an `office_id`; mailing-list import is superadmin-only;
  replace-mode is blocked when an upload yields zero valid rows (prevents
  accidental table-wipe); inserts are office-scoped and chunked.
- **Middleware** — unauthenticated requests to non-auth routes are redirected to
  `/login`; deactivated accounts (`is_active=false`) are force-signed-out on
  every request (Supabase doesn't know about the flag); `/welcome` is correctly
  allowlisted so invite tokens in the URL hash survive.
- **RLS** — enabled on all 16 tables; the one historical gap
  (`contact_imports` shipped without RLS in `0008`) was closed in `0013`. Audit
  tables (`*_imports`, `login_events`) are superadmin-read-only; feedback and
  password-reset requests are correctly office-scoped. All 8 `SECURITY DEFINER`
  functions are read-only/audit-only, scoped by `auth.uid()`, no dynamic SQL.
- **Seed data** — demo/fictional only; no default passwords or real credentials.
- **Core feature flows** — Contacts search/filters, Pipeline, Mailing List,
  Network stats, My Office, Request Intro (with iOS/Android-specific handling),
  Help-for-this-page, and the end-to-end feedback channel (per-item "Report"
  links → `feedback_items` with context URL + impersonation-aware
  `submitted_by`) are all present, complete, and working. Empty/error/first-run
  states are handled. Mobile is responsive.

---

## Recommended fix order before sending invites

1. **H-1** — delete the password-reset debug logging *(minutes)*.
2. **H-2** — add formula-injection guard to all exports *(small, contained)*.
3. **H-3** — CSV-only imports *or* upgrade off the vulnerable `xlsx`
   *(decide based on whether admins need xlsx upload in Phase 1)*.
4. **M-3 / M-4** — rate-limit the public endpoint; cap import row count.
5. **M-5 / M-6** — stop leaking stack traces; add the deal-modal error state.
6. **M-1 / M-2** — **decide** the cross-office + directory visibility model
   before any *real* data is loaded (can stay open for dummy-data Phase 1, but
   make it a conscious call).
7. **L-3 / L-4 / L-5** — `npm audit fix`, document the Auth signup setting, wire
   up ESLint.
8. **L-1 / L-2 / L-6** — modal Escape/focus, replace `alert()`, a11y tidy —
   post-launch polish.
