# Project Log — running context across sessions

This file carries forward decisions, open questions, and reasoning from past
Claude sessions that aren't visible anywhere else in the repo (code, migrations,
or PHASE1 docs already capture the "what"; this captures the "why" and "what's
still pending"). Read this at the start of a session if `CLAUDE.md` points here.

Append new entries at the top, dated, as significant decisions/discussions
happen. Keep entries short — link to commits/files rather than repeating their
content.

---

## 2026-09-01 — Import Mapper spec; commercial position on it

Admin call 2026-08-31: every office asked for a column-mapping wizard
(upload their raw export, match columns to ours, see problems before
anything is saved). Spec written: `docs/SPECS_IMPORT_MAPPER.md`.

**Commercial position (Jeff's, stated to Tiffany in writing):** a mapper was
never in the agreed scope. Phase 2 was fixed-price and is already paid; the
mapper is *not* being framed as Phase 2 delivery. Jeff is building the core
wizard (Phase A) at no charge as a **one-time exception**, explicitly to
avoid a slippery slope. Phases B (saved mappings) and C (value mapping for
Stage/Sectors/Tags) are **not included** and are new work if requested. Do
not let A grow into B/C without Jeff saying so. The ask made in return: a
date by which all six offices have a first upload in.

**Rollout decision:** Phase A ships **superadmin-only under Utilities**
(office picker, since superadmins have no office), replacing the PHL HubSpot
converter, which will be deleted once PHL's latest export goes through the
mapper clean. Built as a reusable `ImportMapperWizard` with `fixedOfficeId`
so embedding in the office-admin Upload flow later is a small, separately
scoped step.

**Design points worth remembering:** the mapper is a thin layer over
`runImport()` and adds no validation rules; every step before the final
click is a dry run (note dry run returns `inserted: 0, deleted: 0`, so the
UI derives counts); it never lets anyone edit data in the portal, because
replace-per-upload would undo it next week; problems are grouped by error
type, not by row, with a problem-rows CSV download in the file's original
columns.

Also this session: API guide rewritten to lead with the JSON API rather than
CSV/curl (`58b6a9a`), after Jeff pointed out the doc made a general-purpose
API read like a file courier. "Sync" wording dropped; Jeff positioned as
support, not implementer.

## 2026-07-14 — Created docs/WISHLIST.md (future-version feature list)

Consolidated the deferred/"future version" items — from the office-admin
feedback round (exported via the new Feedback CSV) plus known parking-lot
items from the earlier calls — into `docs/WISHLIST.md`, grouped by theme with
source attribution. Biggest deferred theme = a collaboration layer (comments/
notes on records + tag broker/office in a comment), raised independently by
Ellie and Annamaria. Refer to it when scoping the next version. Standardization
decisions (Tiffany's) and bugs are explicitly excluded from it.

## 2026-08-24 — Import API v1 BUILT (`d32005d`)

Tiffany approved all three business decisions (weekly cadence expectation;
office admin holds the key and gets the sync report; contact-sharing policy
revisited later, no date). Spec implemented — see `docs/SPECS_IMPORT_API.md`.

**Structural change worth knowing:** the two manual upload routes were
refactored to call a new shared core (`src/lib/import/core.ts`). The API uses
the same core, so there is now exactly one validation/replace/audit path.
Insert shapes and the UI response shape were preserved deliberately, so the
import modals were untouched. If you change import behaviour, change it in
the core — not in a route.

**Shipped:** `POST /api/v1/import/{contacts,deals}` (replace-only, CSV or
JSON, `?dry_run=1`), `GET /api/v1/whoami`, `GET /api/v1/imports`, per-office
hashed bearer keys (migration `0025_api_keys.sql`), superadmin **API Keys**
screen, and the `contacts.share_contact_details` flag (seeded `false`) that
strips contact phone/email on *both* the API and manual paths.

**BLOCKERS before the API is usable in production — two migrations unapplied:**
- `0016_deal_imports.sql` — still missing (known since 2026-08-13). The deals
  endpoint's audit trail and `/api/v1/imports` depend on it.
- `0025_api_keys.sql` — new. **No key can be issued until this is applied.**

**Still to do from the spec's checklist:** office-facing integration docs
(§10 patterns), and the pilot — NYC/Ariel first (their transformation exists
already), then PHL on the spreadsheet pattern.

## 2026-08-13 (later) — Import API spec drafted

`docs/SPECS_IMPORT_API.md` — v1 spec for the push API (Phase 3). Four design
decisions locked with Jeff via Q&A: offices **push** to us (no pull
connectors); **replace-per-sync** semantics (Jeff explicitly chose plain
replace over reserving external IDs — upsert/record-identity is a v2
contract change, see spec §11); designed for the **weakest integrator**
(CSV and JSON both accepted); API **strips contact phone/email server-side**
per the first-stage sharing policy, behind an `app_settings` flag so lifting
the policy is config, not code. Key dependencies called out in the spec:
apply `0016_deal_imports.sql` before the deals endpoint ships; extract the
shared import core out of the two existing routes. Not yet implemented —
spec only, pending review.

## 2026-08-13 — Import guidance surfaced in-app; onboarding playbook added

**New: `docs/OFFICE_DATA_ONBOARDING.md` + `scripts/check_import_file.js`.**
Read the playbook before helping any office with their data. The script
dry-runs a CSV against the real import schema and reports pass/fail per row
plus silent-degradation warnings — use it instead of eyeballing files.

**Shipped:**
- `e7eb941` — Sectors/Tags template hints now enumerate the valid values
  (generated from `SECTOR_OPTIONS`/`TAG_OPTIONS`, so they can't drift).
- `a4a2fc6` — collapsible "Show column reference" in both import modals,
  driven by `TEMPLATE_COLUMNS`.

**Architectural gotcha found:** every "Download template" button in the UI
requests `?format=csv`, and the CSV is only a header row plus a sample row.
The Instructions sheet exists solely in `buildXlsx()`, which **nothing links
to** — so per-column guidance was unreachable for admins, which plausibly
caused several of PHL's data problems. That's why the reference now lives in
the modal. The `?format=xlsx` endpoint is currently dead code; decide later
whether to wire it up or delete it.

Also rejected, for the record: a dropdown in the template (Annamaria's
request). Data validation is an xlsx feature, uploads are CSV-only, so it is
stripped by Save As CSV — and offices build files from CRM exports anyway.
In-app guidance was the workable answer.

**Open commitment:** Jeff's email to Annamaria promises the importer will
"flag any sector value it doesn't recognize." **Not built.** Agreed shape:
alias obvious variants (`Affordable` → `Affordable Housing`) + aggregate
warning for the rest, mirroring the unmatched-broker-email pattern. Must NOT
reject the row — Sectors is optional and killing a whole contact over it is
disproportionate.

**Production DB state:**
- `deal_imports` **does not exist** in production — migration
  `0016_deal_imports.sql` was never applied. The audit insert is caught and
  logged only, so imports still work, but there is **no audit trail for deal
  imports**. Worth applying; it would have answered "did NYC upload?" in one
  query instead of six.
- `0024_contact_relationship_strength.sql` **has** been applied manually.
- Contacts were bulk-deleted for non-ATL offices (`date_added < 2026-07-01`);
  DTW/HOU/PDX/PHL now have zero contacts.

**Working style (external comms):**
- Jeff writes emails; drafts should be delivered as a **styled HTML file** he
  opens and copy-pastes — markdown loses formatting pasting into Gmail.
- **No em dashes** in anything drafted for external audiences.
- **Do not take blame on GREA's behalf.** State what changed and why; don't
  editorialize it as our failure. The date format *was* documented and the
  office deviated from it; widening the parser was an accommodation, not a
  mea culpa. Over-apologising also sets an expectation that every
  CRM-vs-portal mismatch is ours to absorb, which undercuts the
  standardization effort.

## 2026-08-06 — Import date parser now tolerates datetime cells

PHL's first real contact uploads failed **100%** (0 of 382 rows across two
files). Root cause was ours, not theirs: `parseImportDate`'s patterns were
anchored `^...$`, so a trailing clock time (`7/30/2026 16:31`) — which every
CRM export emits — was rejected outright. Fixed by stripping a trailing time
before matching (handles space or ISO `T` separator, optional seconds,
AM/PM, timezone). Error messages now echo the original input, not the
stripped value. Template hints in both contacts and deals schemas updated to
say the time is ignored.

Verified against the real PHL files: Student Housing went 0/348 → **348/348**;
Affordable went 0/34 → **20/34** (the remaining 14 are genuine data problems
on their side — 11 blank Contact Name, 6 `(No value)` in the date column).
16-case parser test incl. negatives ("(No value)", "13/45/2026 10:00",
"2026-02-30") all pass.

Deliberately NOT handled: the literal `(No value)` placeholder their CRM
exports for empty cells. That's real junk data (it also lands in
Account/Company, where it would display as the company name), so silently
swallowing it would mask a problem the office should fix at source.

## 2026-07-14 — Superadmin Feedback CSV export (S-14)

Added an "Export CSV" button on the Feedback page, superadmin-only, so Jeff
can export the whole ticket backlog (with comments) and share it back for
review. New route `src/app/api/feedback/export/route.ts` (GET, superadmin-
gated, session client so RLS still applies — superadmin sees all tickets +
comments per 0005_feedback). One row per ticket: Title, Category, Status,
Office (submitter's), Submitted By, Submitter Email, Assigned To, Created,
Resolved, Context URL, Body, Comments (all comments concatenated
"Name (date): body", newline-separated in one quoted cell). Uses the
existing escapeFormula/csvCell formula-injection guard. Verified round-trip
(quotes/commas/newlines) + injection neutralization with a standalone test.
Button lives next to "+ Submit Feedback", gated on isSuperadmin.

## 2026-07-14 — Deal Sub-status (Won/Lost) added to import/export (S-13)

Found while reviewing a real pipeline export: `sub_status` (Won/Lost) was
DB+UI only, set exclusively by seed data — no import/export column, no edit
UI. Real Closed deals would never show Won/Lost, and an export→Replace-all
cycle would silently drop it. Jeff chose option 1 (dedicated Sub-status
column, not folding into Stage). Built + verified — see spec doc S-13.
Note: still no in-app UI to set Won/Lost on an existing deal (import-only);
left as a separate future feature by choice.

## 2026-07-14 — Stage History removed from the UI (deferred to a later version)

Removed the "Stage History" section from the deal detail modal
(`DealDetailModal.tsx`) and its two mentions in `PageHelp.tsx`. Reason: the
feature never actually worked — nothing in the app (or import) ever wrote to
`deal_stage_history`, so the timeline was always empty, and it can't be made
to work for import-driven stage changes until deal identity across uploads is
solved (deals get a fresh UUID on every import; no external/reference id —
same unresolved problem as contact matching / S-11, but on the Pipeline side;
noted in the earlier Stage-History discussion, not yet a tracked spec item).

**Deliberately left intact for a clean reintroduction later:** the
`deal_stage_history` table + its RLS (untouched in prod), the
`DealStageHistory` type, and `DealRecord.stage_history`. Only the UI render,
the now-unused fetch/state, and the inaccurate help copy ("changes are
recorded in deal_stage_history") were removed.

---

## 2026-07-10 (later) — Tiffany's decisions on the three pending items

Replied to Jeff's recap email (sent to the full office-admin distribution
list). Three rulings:

1. **S-10 relationship-strength scale**: approved to start with 1-3, with an
   explicit caveat — "I feel like we may need to see the data come in...
   I suggest we start with this." Read as: build it now, but treat the 1/2/3
   *criteria* as provisional, likely to be recalibrated once real data is in.
   Not a request to hold off building.
2. **S-7 required broker fields on import**: "Agreed" — unambiguous, no
   caveat. Cleared to build (broker name + email required, phone stays
   optional, per the original spec).
3. **Matching/identification signal**: "I trust this POV from the team...
   add the company name in per their suggestion along with the email-based
   options." Directional (combine company + email), not a precise algorithm
   — doesn't specify precedence (does an email match override a company
   mismatch? is company-only matching allowed when there's no email?) or how
   loose company-name fuzzy matching should be, which matters given
   Annamaria's earlier fear of false merges (company renames/acquisitions).
   Treated as a business-direction confirmation, not yet translated into an
   exact rule — flagged back to Jeff before implementing, rather than
   guessing the precedence order silently.

**Real gap surfaced**: Tiffany asked "Do they have the instructions on this
first pull?" in reply to the ask for offices to submit real test-data
spreadsheets. Checked — no, they don't. The only existing self-serve
material is the per-column hints baked into the downloaded Excel template's
"Instructions" sheet; there's no guide for an office admin mapping their own
system's data into the template for the first time.
`docs/PHASE1_PROTOTYPE_GUIDE.md` only covers *using* the read-only mirror,
not preparing an import. Drafting a short first-import guide as a result.

---

## 2026-07-10 — Specs from the second office-admin call (Annamaria, Ellie)

Wrote `docs/SPECS_2026-07-10_ADMIN_CALL.md` — ten specs (S-1…S-10) from the
July 9 call. Highlights and context not in the spec file itself:

- **Root cause of "links expired in 45 minutes"** is almost certainly the
  Supabase project's Email OTP expiration setting (defaults to 1 h on newer
  projects), NOT the scanner issue (that was fixed 2026-07-02 via
  click-to-verify). S-1 = raise the dashboard setting to the 24 h platform
  max. 48 h (Annamaria's ask) is impossible on Supabase-managed tokens;
  she accepted 24 h + easy re-issue as the answer on the call.
- **"Reset password" already exists for office admins** — it's just hidden
  for never-onboarded users (row menu shows Copy-invite-link XOR
  Reset-password based on `onboarded`). The fix is naming/UX (S-2/S-3),
  not new capability.
- **Matching-rule question got a new dimension on this call**: Annamaria and
  Ellie both want **company** in the mix (Ellie: company name is the most
  stable signal; emails/domains churn). Also surfaced as a distinct feature:
  group-by-company toggle in Contacts (S-6, buildable now, display-only).
  The email Jeff sent Tiffany (2026-07-02 log entry) listed 3 options that
  did NOT include company — expect her answer may need a follow-up round
  incorporating company. Jeff committed on the call to writing a summary
  email to the admins with conclusions + open questions for async iteration.
- **Two new Tiffany decisions queued**: required broker email+name on
  contacts import (S-7, Jeff recommends yes, phone stays optional), and the
  relationship-strength 1–3 scale criteria (S-10 — Annamaria's "relationship
  meter"; Jeff's position: worse than nothing if offices populate it
  inconsistently, so criteria must be ratified cross-office first).
- Feedback funnel reminder from the call: office feedback due into the
  in-app tool; Annamaria consolidating her office's list. Ellie already
  submitted pipeline-labeling feedback through the app.

## 2026-07-02 — Office-admin scoping review, Feedback UI redesign, dedup/identification questions

### What was confirmed (no code changes, verification only)
- **Office admins are correctly scoped for feedback tickets**: RLS
  (`supabase/migrations/0005_feedback.sql`, `can_see_feedback_from`) limits an
  office admin to their own office's submitters + their own submissions. This
  is DB-enforced, not just UI.
- **Deals/contacts are NOT office-isolated for reads** by design — this is the
  intended "national mirror" model (any authenticated user reads any
  non-confidential record; `is_confidential` is the only per-record office
  lock). Documented as intentional in `docs/PHASE1_AUDIT.md` (M-1).
- **Impersonation does not re-scope RLS.** It's a cookie-only app-layer swap
  (`src/app/api/impersonate/route.ts`) — the real JWT stays the impersonator's,
  so a superadmin impersonating a broker still sees everything their real
  (superadmin) account can see, not what the impersonated user would see. Not
  a security hole (RLS still bounds it to the real user's actual permissions),
  but a fidelity gap if "view as" is expected to be exact. Not yet fixed —
  flagged, no decision made on whether to fix it.
- **Contacts import does not do any cross-office sharing/dedup.** Every row
  gets `office_id = <importer's office>`, full stop
  (`src/app/api/contacts/import/route.ts:275`). No unique constraint on
  `contacts` table for email/name at the DB level, confirmed by grep across
  all migrations.

### Feedback ticket UI (shipped: commits `8268aff`, `12f082d` on `main`)
Problem: table view became cramped/unreadable once a ticket was selected
(6-column table squeezed into ~45% width, sideways scroll, wrapped titles).
Also: no office attribution shown to superadmins.

Fix: when a ticket is selected, list becomes a compact card list (title
truncated, fields stacked) and detail panel gets `minmax(340px,400px) 1fr`
instead of `1fr 1.2fr`. Full table (unchanged) shows when nothing's selected.
Added office as a colored chip (reuses `officeBadgeStyle`) in list, cards, and
detail header, resolved from the *submitter's* profile → office. Added
superadmin-only Office filter. Second commit added an explicit "No office"
pill instead of rendering blank, since superadmins/unassigned users have no
office and were rendering nothing — this affects most of Jeff's own test
tickets.

**Known limitation, not yet addressed**: office is derived live from the
submitter's *current* profile, not snapshotted at submission time. If a
broker changes offices, old tickets silently move with them in the view.

### Meeting feedback from GREA office admins (Lindsay, Laura, Annamaria, Adam,
Tiffany, Corey) — full assessment table given in conversation, not persisted
as a file yet (consider writing to `docs/` if it needs to survive as a
reference doc). Key points:

**Dominant theme: data integrity / duplicates.** This split into two distinct
problems that got conflated during discussion — important to keep them
separate going forward:

1. **Cross-office "same person" identification for display** (Laura's HubSpot
   comparison; matches the existing David Chen demo grouping in
   `src/components/contacts/ContactsView.tsx:160-183`). This grouping already
   exists but is **fuzzy name+account text matching only, no email
   comparison, client-side, search-screen only** — not a real identity system.
   Weak signal, risk of false-grouping (two different people) or missed
   grouping (name typo). **This is a live open question sent to Tiffany**
   (see email below) — needs one GREA-wide rule, not per-office debate.
   Recommended default if she doesn't have a preference: email match with
   name as fallback (favor precision over recall — a false merge is worse
   than a missed one).

2. **Import-time duplicate prevention** (Lindsay's reimport fear, Annamaria's
   "override could corrupt a good email"). This is a *write-path* problem,
   separate from #1. Real fix = matching rule + upsert logic, explicitly
   Phase 2 scope per `docs/PHASE1_FEEDBACK_ONEPAGER.md`'s "Parking Lot" table
   ("Data format, hygiene & upload process (Phase 2)"). **Decision: don't
   build real dedup now.** Instead, ship two small Phase-1-safe mitigations
   (not yet implemented as of this log entry):
   - Clearer copy in `src/components/office-admin/ContactsImportModal.tsx`:
     "replace all" = safe way to correct/update (re-upload full list),
     "add-on" = only for genuinely new contacts.
   - A soft, non-blocking post-import warning flagging likely exact-match
     duplicates within the office, for admin review only (no auto-merge).
   **Status: proposed, not yet built.** User agreed with this plan in
   conversation but didn't request implementation yet — check before
   assuming it's done.

**Other feedback items** (see conversation for full table with effort/scope
judgment per item): several requests push from "read-only mirror" toward
"system of record" (single-record contact update, mailing-list add-from-portal
turning it into a send tool) — flagged as scope creep, Phase 2+. CRM-lens asks
(listing↔contact association, company-as-object) deliberately out of scope,
matches the proposal. Two cheap fixes flagged: rename "Office Administrator"
label (no replacement chosen yet), fix "DTW" Detroit code confusion (reads as
Texas). Deadline: **July 10** (extended from July 7 for the holiday).

### Email drafted for Tiffany (not confirmed sent — was shared in-chat only)
Two-question email: (1) asks her to pick the cross-office identification
signal — this is the one needing an actual decision before July 10; (2)
informs her (no action needed) that duplicate-prevention-on-import has a
Phase-1 mitigation plan and real fix is deliberately Phase 2. Final version
used no em dashes per user's style preference. Not confirmed whether it was
actually sent — treat as drafted only unless told otherwise.

### Style/process notes for future sessions
- User dislikes em dashes in prose Claude generates for external
  communications (emails). Avoid them when drafting anything user-facing like
  that.
- User pushed back once on scope-creep framing when I conflated "collapse
  contacts" (merge/write) with "identify as same contact" (display only) —
  worth double-checking which one is meant before proposing solutions to
  "duplicate contact" type requests.
- `AskUserQuestion` tool has been flaky this session (silent stream-closed
  errors on retry) — if it fails, don't just keep retrying; fall back to
  laying out options in plain text and asking directly.
