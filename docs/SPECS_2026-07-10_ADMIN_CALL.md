# Specs — improvements from the 2026-07-09 office-admin call

*Source: call with Annamaria Leib (Philly/FL) and Ellie Nakamura (CRS General
Office). Each spec lists current behavior (with file refs), the change, and
acceptance criteria. Status legend: **Ready** = build now · **Config** = no
code · **Blocked** = needs a decision first · **Parking lot** = logged, later
phase.*

---

## S-1 · Invite/reset link lifetime — verify only, no action taken (Resolved: setting was already correct)

**Reported:** links "expired within 45 minutes / an hour" of being sent;
Annamaria asked for 48-hour validity.

**Original theory (wrong):** assumed the project's Email OTP expiration was
sitting at Supabase's 1-hour default. **Checked live on 2026-07-10 — it was
already `86400` (24 h, the platform max).** Nothing to change; 48 h isn't
achievable on Supabase-managed tokens without a custom token system (out of
scope, noted below).

**Revised theory:** the reported expirations are almost certainly
**scanner-burn on links generated before the 2026-07-02 click-to-verify fix**
(`b297ead`) — Supabase's raw `action_link` auto-consumes on any GET,
including a corporate email scanner's prefetch, and a token burned within
seconds of being sent would read to the recipient as "expired in 45
minutes." Links generated after that deploy route through `/welcome` and
only consume the token on an explicit button click, so this shouldn't
reproduce anymore.

**Verification step (do before considering this closed):** send one fresh
test invite now, wait a couple of hours, and confirm the link still works.
If yes — S-1 needs no code or config change; the fix already shipped and the
reports predate it. If it still fails — this is a live bug, re-open and
investigate (check Vercel logs for that token).

**Acceptance:** a fresh invite link opened 20 h after issuance still works.

---

## S-2 · Re-issue link: naming + availability in the row menu (Done — `UsersTable.tsx`)

**Reported:** "the only reset functionality is copy their invitation link…
is there an option to just send them a new link quickly?"

**Current:** `src/components/admin/UsersTable.tsx:630-657` — the row menu
shows **either** "Copy invite link" (user not yet onboarded) **or** "Reset
password" (user onboarded). Both already generate a *fresh* link via the API
(`/api/invite-user` re-invite path / `/api/reset-password`), and the API
already authorizes office admins for their own office. So the capability
Annamaria wanted exists — it's a labeling/discoverability failure: "Copy
invite link" reads like it copies the *old* (expired) link.

**Change:**
1. Rename menu item to **"New invite link"** (and keep "Reset password" for
   onboarded users). Sub-label or title tooltip: "Generates a fresh link —
   any previous link keeps working until it expires or is used."
2. In the link-result UI (see S-3), state expiry explicitly: "Valid for
   24 hours."

**Acceptance:** an office admin can tell, without trial and error, that the
action mints a new link rather than copying the expired one.

---

## S-3 · Link result appears at top of page — easy to miss (Done — `UsersTable.tsx`)

**Reported:** "the link pops up at the top. Sometimes when you're down on
the list, you don't even realize that the link popped up. You have to scroll
back up."

**Current:** `UsersTable.tsx:276-310` — the green `linkResult` card renders
above the table; with 20+ users the row menu is below the fold and the
banner is invisible.

**Change:** render the link result as a centered **modal overlay** (reuse the
existing modal pattern + Escape-to-close) instead of a top-of-page banner:
user's email, the link in a readonly input, a **Copy** button, an **Email
link…** button (S-4), and the expiry note. Keep the banner markup as the
modal body — this is a repositioning, not a redesign.

**Acceptance:** invoking "New invite link"/"Reset password" from the last row
of a long list shows the link without scrolling.

---

## S-4 · "Email link…" via mailto (Done — `UsersTable.tsx`)

**Reported:** today the admin copies the link, opens their mail client,
composes an email by hand. A system-sent email needs an email engine (future
phase), but a **mailto: handoff** costs nothing — the same pattern the
"ask for an introduction" feature already uses
(`src/components/contacts/ContactsView.tsx:518-584`, including the
iOS/Android URI quirks already solved there).

**Change:** in the S-3 modal, add **"Email link…"** →
`mailto:<user email>?subject=Your GREA Portal link&body=<greeting + link +
"valid for 24 hours">`. No send tracking, no engine — it just opens the
admin's own mail client pre-filled.

**Acceptance:** one click opens a pre-addressed, pre-filled draft; the link
in the body matches the one shown in the modal.

---

## S-5 · Label broker vs. contact fields in the Contacts card (Done — `ContactsView.tsx`)

**Reported (Ellie):** in the expanded cross-office contact card, "it looks
like a complete contact… who's the contact, and who's the broker?" — broker
name, broker phone, and contact phone appear without labels, so the broker
reads as the contact (Adriana Ferro vs. David Allen confusion; tags sitting
next to the broker's name).

**Current:** `ContactsView.tsx` expanded office entries render
`brokerName` / `brokerPhone` / `contactPhone` / `contactEmail` with layout
implying — but never stating — which is which.

**Change:** added explicit micro-labels to every office entry in the
expanded card: **GREA broker:**, **Broker phone:**, **Contact:** (covering
both contact email and phone together). **Note:** `MyOfficeContacts.tsx`
turned out not to need this — it's a plain table with a "Broker" column
header, which already disambiguates; no ambiguity existed there, so it was
left unchanged.

**Acceptance:** someone who has never seen the app can identify, from one
expanded card, which person is the GREA broker and whose phone number is
whose. (Jeff: "let's not be guessing — label it.")

---

## S-6 · Group-by toggle: Contact ↔ Company (Done — `ContactsView.tsx`)

**Built:** a gold-highlighted **"Group by: Contact | Company"** toggle in the
search card. Contact mode = unchanged. Company mode groups results by fuzzy
`account_name` alone (no per-office dedup, since a company legitimately has
many contacts and several may sit in one office); the card header shows the
company + "N contacts · M offices", and each expanded entry leads with the
contact's name, then the labeled GREA broker (S-5) and contact details.
Toggling re-runs the current query live. The "Shared only" filter and the
cross-office banner now count *distinct offices* (not entry count) so a
company with several contacts in one office isn't mislabeled as cross-office.
Same fuzzy-signal caveat as before — revisit the grouping signal if/when
Tiffany rules on the matching rule (see S-7/PROJECT_LOG).

<details><summary>Original spec</summary>

**Reported:** brokers search both directions — "sometimes they have a
contact, sometimes they're looking for the best contact at a company"
("you have somebody at Dominion?"). Today Stonefield's five contacts return
as five ungrouped cards.

**Current:** `ContactsView.tsx:160-183` groups search results by fuzzy
(contact name + account name); there is no company-level grouping.

**Change:** a **"Group by: Contact | Company"** toggle on the Contacts page.
- *Contact* (default): today's behavior, unchanged.
- *Company*: group results by fuzzy `account_name` alone. Card header =
  company name; entries = every matching contact across all offices, each
  showing contact name, office badge, GREA broker (labeled per S-5).
- Search input and filters work identically in both modes.

**Note:** this is display-side grouping like today's, so it inherits the
same fuzzy-signal weakness. Independent of — and not blocked by — the
matching-rule decision pending with Tiffany, but should adopt the same
signal once she rules.

**Acceptance:** searching "Stonefield" in Company mode returns one
Stonefield group listing all its contacts with their offices and brokers.

</details>

---

## S-7 · Contacts import: broker email + name become required (Done — Tiffany replied "Agreed" 2026-07-10)

**Reported:** Annamaria: "broker name and email and phone need to be
required." Jeff: agree on **name and email; phone stays optional**.
"Otherwise, what's the point? Here's a great contact… and what do I do with
it?"

**Built:** `src/lib/contacts/import-schema.ts` — `broker_email` and
`broker_name` are now `required: true` (`broker_phone` stays optional).
`parseRow` pushes a per-row error when either is blank, so the row is
skipped and reported exactly like `contact_name`/`account_name` today — no
change to the import route itself was needed, since it already generically
skips-and-reports any row with `errors.length > 0`.

**Unchanged (by design):** an email that doesn't match a registered office
member still imports unassigned, snapshotting the broker name/phone from the
file, with the aggregate "N broker emails aren't registered yet" warning —
required means *present in the file*, not *a matched account*.

**Acceptance:** a row without broker email or name is skipped and reported;
existing rows already in the DB are untouched (validation only applies at
import time).

---

## S-8 · Feedback waiting — in-app notification for office admins (Done — `useUnseenFeedback.ts` + `AdminSidebar.tsx`)

**Built:** `useUnseenFeedback` counts **open** feedback items created after a
per-device `localStorage` "last seen" timestamp (RLS scopes office admins to
their own office; superadmins see all). A red count badge renders on the
**Feedback** nav entry (a small dot in the collapsed icon rail). Opening
`/feedback` stamps "seen = now" and clears the badge immediately; new
submissions re-badge afterward. With no baseline yet, the whole current open
backlog is surfaced.

**Deliberate scope call:** implemented the **badge only**, not the "one-line
dismissible banner" the spec also mentioned — a persistent nav badge is less
intrusive than a banner on every page and already satisfies the acceptance
criteria. Banner remains a trivial follow-up if the badge proves too subtle.

<details><summary>Original spec</summary>

**Change (no email, no migration):**

**Reported:** "Can we get a notification that somebody from our team
uploaded feedback and we need to review it?" No email engine exists; Jeff
proposed: "as soon as you open the app, it could flash something at you…
then it turns off until the next time."

**Change (no email, no migration):**
1. On app load for office admins/superadmins, count open feedback items
   (RLS already scopes office admins to their office) newer than a
   `localStorage` "last seen" timestamp.
2. If > 0: show a badge on the Feedback nav entry ("Feedback • 3") and a
   one-line dismissible banner.
3. Visiting the Feedback page updates the timestamp and clears the badge.

**Limitation to state:** per-device (localStorage). If cross-device matters
later, add `profiles.last_feedback_seen_at` (small migration) — not now.

**Acceptance:** admin logs in after a teammate files feedback → sees the
badge; opens Feedback → badge clears until something new arrives.

</details>

---

## S-9 · Pipeline date field — display it; naming decided as "List Date" (Done — `DealDetailModal.tsx`, `deals/import-schema.ts`, `PageHelp.tsx`)

**Reported:** "Date added doesn't really make sense — we could know about a
deal a year before it goes live." Suggested "Date launched"/"Listed date";
Ellie: get broker feedback once real data is in. Jeff also noticed the app
doesn't display the date at all: "we're not even showing it, so I guess we
should show it."

**Decision (2026-07-10, Jeff):** call it **"List Date"** — no need to wait
for broker feedback on real data; settled directly.

**Built:**
1. `DealDetailModal.tsx` now shows a **List Date** cell in the deal info grid
   (next to Value), so the field is visible for the first time.
2. Import template column header changed from `Date Added` to `List Date`
   (`deals/import-schema.ts`). The underlying DB column/field name
   (`date_added`) is unchanged — this is a label-only rename, no migration.
3. **Backward compatible:** `Date Added` is still accepted as an alternate
   header, so spreadsheets built from the old template keep importing
   cleanly.
4. Updated the two UI copy references in `PageHelp.tsx` that mentioned
   "Date Added" by name.

**Acceptance:** opening a deal shows its List Date; a CSV using either
`List Date` or `Date Added` as the header imports correctly.

---

## S-10 · Relationship-strength field, 1–3 (Done — Tiffany: "sounds good in theory... start with this" 2026-07-10)

**Reported (Annamaria):** a "relationship meter" so that when multiple
offices hold the same contact, brokers can see who has the strongest
relationship ("people will fight over contacts… show who the right person
to reach out to is"). Jeff: simple 1/2/3 scale, but criteria must be defined
once, cross-office, by Tiffany — "if people populate it differently, it's
worse than not having it."

**Tiffany's answer treated as approval of the *mechanism*, not a final
rubric** — she flagged wanting to see real data before fully committing
("I feel like we may need to see the data come in"). What "1" vs "2" vs "3"
concretely means is still undefined; built the scale as a plain numeric
1–3 rating without baking in specific criteria text, so it's ready to use
but the actual definitions are still an open cross-office conversation.

**Built:**
1. Migration `0024_contact_relationship_strength.sql`:
   `contacts.relationship_strength smallint null check (between 1 and 3)`.
   **Not yet applied to the live database** — needs the normal migration
   push before it takes effect; the column doesn't exist in production
   until then.
2. Import template: optional `Relationship Strength` column (1–3, blank
   allowed); `parseRelationshipStrength` rejects anything else as a per-row
   error, consistent with other validated fields.
3. Display: a gold star badge (★★☆ etc., with a tooltip showing "N/3") next
   to the relationship-status pill on each office entry in the Contacts
   card — works in both S-6 modes. Entries within a group are now sorted
   strongest-first, so in Company mode the top entry directly answers "who
   should call Dominion."
4. Export/`ContactRecord`/`ParsedRow`: threaded through like every other
   column; round-trips cleanly.

**Acceptance:** importing a contact with `Relationship Strength = 3` shows a
full gold star badge; a group with mixed ratings displays strongest office
first; an out-of-range value (e.g. "5") is skipped and reported.

---

## S-11 · Cross-office matching signal — Tiffany gave direction, exact rule still needed

**Background:** the open question sent to Tiffany on 2026-07-02 (see
PROJECT_LOG) asked her to pick the signal that decides two contacts across
offices are "the same person" for display grouping, offering three
email/name-based options. This call added a fourth input: both Annamaria and
Ellie feel **company name** is actually the more stable signal, since emails
and domains change but a company's name usually doesn't.

**Tiffany's answer (2026-07-10):** "I trust this POV from the team... add
the company name in per their suggestion along with the email-based
options... hopefully we don't have to check and adjust once the data comes
in."

**Why this isn't built yet:** her answer is directional, not a precise
algorithm. Still undefined: does an email match override a company-name
mismatch (or vice versa)? Is company-only matching allowed when a contact
has no email at all? How loose should company-name fuzzy matching be, given
Annamaria's earlier fear of false merges from renames/acquisitions? Building
the wrong precedence order risks exactly the false-merge problem the room
has been worried about since the first call — so this needs one more
round with Jeff to nail the exact rule before implementation, rather than
guessing.

**Status:** direction confirmed, precise rule pending. Once settled, this
should update S-6's grouping logic (`ContactsView.tsx`) in both Contact and
Company modes.

---

## S-12 · Office-admin instructions for the first real-data import — gap identified, not yet written

**Surfaced by:** Tiffany's reply asked directly, "Do they have the
instructions on this first pull?" — in response to the ask for every office
to prepare a real (non-dummy) test import using the shared field-mapping
spreadsheet.

**Finding:** no, there isn't a dedicated guide. What exists today:
- The downloaded Excel template's built-in "Instructions" sheet (per-column
  required/optional + format hints, generated straight from
  `TEMPLATE_COLUMNS`).
- `docs/PHASE1_PROTOTYPE_GUIDE.md` — but this only covers *using* the
  read-only mirror, not preparing an import.

Nothing walks an office admin through turning their own system's export into
a file that matches the template for the first time.

**Status:** gap confirmed, not yet built. A short first-import guide is the
natural fix — should probably cover: where to get the template, what "required"
means and what happens to a row that fails validation, how replace-all vs.
add-on behave, and the review-before-first-import step Jeff already
committed to in the recap email.

---

## S-13 · Deal Sub-status (Won/Lost) in the import/export template (Done — session-discovered 2026-07-14)

**Surfaced by:** reviewing a real pipeline export with Jeff. `sub_status`
(the Won/Lost enum on `deals`, shown as a badge on Closed deals in the
Pipeline board and deal modal) existed in the DB and UI but was **only ever
set by seed data** — no import column, no export column, no edit UI. So on
real data every Closed deal would show no Won/Lost, and — worse — an
export→edit→Replace-all cycle would silently wipe any Won/Lost that did
exist, since it wasn't in the file. A quiet data-loss trap right before real
imports.

**Chosen fix (Jeff picked option 1):** add a dedicated **Sub-status** column
to the deals import/export template rather than folding Won/Lost into the
Stage vocabulary.

**Built (`deals/import-schema.ts`, `deals/import` + `deals/export` routes):**
1. New optional `Sub-status` column (position 5, right after Stage).
2. `parseSubStatus` accepts `Won`/`Lost` (case-insensitive) or blank;
   anything else is a per-row error.
3. Cross-field guard: Won/Lost on a non-Closed stage is rejected
   ("only applies when Stage is Closed").
4. `Won/Lost` accepted as an alias header.
5. Threaded through import insert and export (round-trips cleanly — export
   now emits it, import reads it back).

**Still not addressed (deliberately):** there's no in-app UI to *set*
sub_status on an existing deal — it's still import-only, same as most other
deal fields. If admins need to flip a deal Won/Lost without a re-import,
that's a separate small feature. Not built now.

**Verified:** parser exercised against Closed+Won, Closed+lost (normalizes),
Listing+Won (rejected), Closed+blank (null), Closed+garbage (rejected), and
the Won/Lost alias mapping — all pass.

---

## Parking lot (logged, explicitly not now)

| Idea | Source | Why parked |
|---|---|---|
| System-sent emails (invites, notifications, watch-a-contact alerts) | Annamaria, Jeff | Needs an email engine — a later phase; S-4's mailto is the interim |
| Comments/chat on contacts & deals | Corey via Ellie | "Future release" per call; shifts mirror → collaboration tool |
| Contact/deal history retained across uploads; archive of past uploads | Annamaria | Jeff unsure of value; revisit with real usage. Note: `contact_imports`/`deal_imports` audit tables already record counts & files-metadata per upload — a raw-file archive would be an extension, not a new system |
| Days-on-market tracking | Ellie | Depends on the S-9 naming/semantics decision |
| Upload-time dedup against a master copy | recurring | Phase 2 per existing scope; see PROJECT_LOG 2026-07-02 |

## Dependencies summary

| Spec | Status | Blocking party |
|---|---|---|
| S-1 | Resolved — verify with a test invite | none (no change needed; setting was already at max) |
| S-2, S-3, S-4, S-5 | **Done** | none |
| S-8 | **Done** | none |
| S-6 | **Done** | none (align signal with Tiffany's rule when it lands) |
| S-9 | **Done** | none (named "List Date" per Jeff's call) |
| S-7 | **Done** | none |
| S-10 | **Done** (migration not yet applied to prod — see note) | none for the mechanism; exact 1–3 criteria still open |
| S-11 | Direction confirmed, rule pending | Jeff (nail the exact precedence before building) |
| S-12 | Gap confirmed, not built | none — ready to write |
| S-13 | **Done** | none (in-app Won/Lost editor still absent, by choice) |
