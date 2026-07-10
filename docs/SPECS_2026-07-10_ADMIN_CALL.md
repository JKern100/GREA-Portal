# Specs — improvements from the 2026-07-09 office-admin call

*Source: call with Annamaria Leib (Philly/FL) and Ellie Nakamura (CRS General
Office). Each spec lists current behavior (with file refs), the change, and
acceptance criteria. Status legend: **Ready** = build now · **Config** = no
code · **Blocked** = needs a decision first · **Parking lot** = logged, later
phase.*

---

## S-1 · Invite/reset link lifetime — raise to the maximum (Config, do first)

**Reported:** links "expired within 45 minutes / an hour" of being sent;
Annamaria asked for 48-hour validity.

**Analysis:** link lifetime is not set in code — `generateLink()` tokens
honor the Supabase project's **Auth → Email OTP expiration** setting, which
defaults to **3600 s (1 hour)** on newer projects. That matches the "expired
in 45 minutes" reports far better than scanner-consumption (which the
click-to-verify `/welcome` flow, deployed 2026-07-02 `b297ead`, already
prevents). Supabase caps this setting at **86400 s (24 h)** — true 48 h is
not possible with Supabase-managed tokens without building a custom token
system (out of scope).

**Change (dashboard, not code):**
1. Supabase Dashboard → Authentication → Sessions/Email → set Email OTP
   expiration to `86400`.
2. Add this to the README deploy checklist.

**Communicate to admins:** links last 24 h (platform maximum); re-issuing is
one click (see S-2), so a lapsed link is a 30-second fix, and scanners can no
longer burn links since the click-to-verify change.

**Acceptance:** a fresh invite link opened 20 h after issuance still works.

---

## S-2 · Re-issue link: naming + availability in the row menu (Ready, small)

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

## S-3 · Link result appears at top of page — easy to miss (Ready, small)

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

## S-4 · "Email link…" via mailto (Ready, small)

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

## S-5 · Label broker vs. contact fields in the Contacts card (Ready, small)

**Reported (Ellie):** in the expanded cross-office contact card, "it looks
like a complete contact… who's the contact, and who's the broker?" — broker
name, broker phone, and contact phone appear without labels, so the broker
reads as the contact (Adriana Ferro vs. David Allen confusion; tags sitting
next to the broker's name).

**Current:** `ContactsView.tsx` expanded office entries render
`brokerName` / `brokerPhone` / `contactPhone` / `contactEmail` with layout
implying — but never stating — which is which.

**Change:** add explicit field labels to every office entry in the expanded
card: **GREA Broker**, **Broker phone**, **Contact phone**, **Contact
email**, **Status**, **Listing**. Same treatment in the collapsed row if the
broker name appears there. Apply the same labels in
`MyOfficeContacts.tsx` where the ambiguity repeats.

**Acceptance:** someone who has never seen the app can identify, from one
expanded card, which person is the GREA broker and whose phone number is
whose. (Jeff: "let's not be guessing — label it.")

---

## S-6 · Group-by toggle: Contact ↔ Company (Ready, medium)

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

---

## S-7 · Contacts import: broker email + name become required (Blocked → Ready pending Tiffany's OK)

**Reported:** Annamaria: "broker name and email and phone need to be
required." Jeff: agree on **name and email; phone stays optional**.
"Otherwise, what's the point? Here's a great contact… and what do I do with
it?" Needs Tiffany's confirmation as a cross-office rule (Jeff will
recommend it).

**Current:** `src/lib/contacts/import-schema.ts:23-25` — `broker_email`,
`broker_name`, `broker_phone` all `required: false`.

**Change (once confirmed):**
1. Flip `required: true` on `broker_email` and `broker_name`
   (`mapHeaders` then auto-rejects files missing the columns).
2. In `parseRow`, empty `broker_email` or `broker_name` becomes a per-row
   error → row is skipped and reported, consistent with other required
   fields.
3. **Unchanged:** an email that doesn't match a registered user still
   imports unassigned with the aggregate warning — required means
   *present*, not *registered*.
4. Update the template hints and the field-definition spreadsheet shared
   with admins.

**Acceptance:** a row without broker email or name is skipped and reported;
existing rows in the DB are untouched.

---

## S-8 · Feedback waiting — in-app notification for office admins (Ready, small/medium)

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

---

## S-9 · Pipeline date field — display it; naming decision open (Blocked on broker feedback)

**Reported:** "Date added doesn't really make sense — we could know about a
deal a year before it goes live." Suggested "Date launched"/"Listed date";
Ellie: get broker feedback once real data is in. Jeff also noticed the app
doesn't display the date at all: "we're not even showing it, so I guess we
should show it."

**Current:** `deals.date_added` is required at import but not rendered in
the pipeline card or `DealDetailModal`.

**Change:**
1. **Now (Ready):** show the date in `DealDetailModal` (with Stage History,
   which it chronologically anchors).
2. **Blocked:** the label ("Date added" vs "Listed"/"Launched") — one
   GREA-wide term via Tiffany after broker feedback on real data. Import
   header stays `Date Added` until then (aliases already tolerated by
   `normaliseHeader`).

**Acceptance (part 1):** opening a deal shows its date with a neutral label
("Date").

---

## S-10 · Relationship-strength field, 1–3 (Blocked — Tiffany defines the scale)

**Reported (Annamaria):** a "relationship meter" so that when multiple
offices hold the same contact, brokers can see who has the strongest
relationship ("people will fight over contacts… show who the right person
to reach out to is"). Jeff: simple 1/2/3 scale, but criteria must be defined
once, cross-office, by Tiffany — "if people populate it differently, it's
worse than not having it."

**Change (pre-speced, do not build until the scale is ratified):**
1. Migration: `contacts.relationship_strength smallint null check (1..3)`.
2. Import template: optional `Relationship Strength` column (1–3; blank ok);
   per-row error on other values.
3. Display: badge on each office entry in the grouped contact card (works
   in both S-6 modes — in Company view it directly answers "who should call
   Dominion"); entries sorted strongest-first within a group.
4. Export: round-trips like every other column.

**Acceptance:** deferred until unblocked.

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
| S-1 | Config only | none — do immediately |
| S-2, S-3, S-4, S-5, S-8 | Ready | none |
| S-6 | Ready | none (align signal with Tiffany's rule when it lands) |
| S-9 part 1 | Ready | none |
| S-7 | Needs sign-off | Tiffany (Jeff recommends yes) |
| S-9 part 2 | Needs decision | Tiffany + broker feedback on real data |
| S-10 | Needs decision | Tiffany (define the 1–3 criteria cross-office) |
