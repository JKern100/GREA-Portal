# Project Log — running context across sessions

This file carries forward decisions, open questions, and reasoning from past
Claude sessions that aren't visible anywhere else in the repo (code, migrations,
or PHASE1 docs already capture the "what"; this captures the "why" and "what's
still pending"). Read this at the start of a session if `CLAUDE.md` points here.

Append new entries at the top, dated, as significant decisions/discussions
happen. Keep entries short — link to commits/files rather than repeating their
content.

---

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
