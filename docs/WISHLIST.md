# GREA Portal — Wishlist (future versions)

Durable list of features and ideas deliberately deferred beyond the current
phase. This is the "later, on purpose" list — not bugs, not the standardization
decisions Tiffany owns (those live elsewhere), and not near-term work (see
`SPECS_2026-07-10_ADMIN_CALL.md` for the active spec list).

Each item notes who asked for it and where it came from. Newest sourcing at the
top of each section. Keep this current: when something here gets built, move it
out; when a new "future version" idea lands, add it here.

Last updated: 2026-07-14 (from the office-admin feedback round, exported via the
Feedback CSV).

---

## 1. Collaboration layer (biggest deferred theme)

Raised independently by multiple admins — the clearest "next big thing." These
belong together as one workstream rather than three separate features.

- **Comments / notes on contacts and deals.** A place for brokers to add notes
  to a record so they can communicate context with each other.
  *Source: Ellie (ATL) — "Adding a place for brokers to make comments and
  notes"; also in Ellie's "Future Wish List." Jeff: "Possible for a subsequent
  version."*
- **Tag an office or another broker in a comment.**
  *Source: Ellie (ATL), "Future Wish List Items." Jeff: "for a subsequent
  version."*
- **Retained history / activity trail on a record** (once the system becomes a
  source of record rather than a per-upload mirror). Ties directly to the
  comments feature.
  *Source: Annamaria (PHL) discussion; recurring. Depends on solving deal/
  contact identity across uploads first (see Note A below).*

Prerequisite: this only fully works once records have stable identity across
uploads (today every import creates fresh rows — see Note A).

---

## 2. Specialty-sector dashboards & home pages

- **Per-sector dashboards / landing pages** (Affordable Housing, Student
  Housing, etc.) showing metrics, recent contacts, and that sector's pipeline —
  visible to those users on login.
  *Source: Annamaria (PHL), "Specialty Sector Dashboards" — Jeff: "yes, in the
  next version. I'd like to learn what would be helpful in a dashboard." Also
  Ellie (ATL), "Future Wish List" — "for a subsequent version."*
- **Curated "priority contacts" list per sector** (e.g. a combined top-50
  Affordable Housing collaboration list) that could surface on a sector
  dashboard.
  *Source: Ellie (ATL), "Affordable Housing suggestions."*

Open input needed: what specifically would be useful on these dashboards.

---

## 3. Contacts ↔ deals ↔ company linking

- **Link contacts and/or companies to deals**, so it's visually clear who is
  connected to what (a step toward CRM-style object relationships).
  *Source: Annamaria (PHL), "Contacts Linked to Deals" — Jeff: "Not at this
  stage of the app, but possible for the next." Related: Ellie's "click on the
  Company and see all the contacts associated" (the read-only version of this,
  **already delivered** as the Group-by-Company toggle, S-6).*
- **Link to a client's past sales** (possibly from an outside source).
  *Source: Ellie (ATL), "Future Wish List." Jeff: needs explanation / scoping.*
- **Most recently touched deals shown on the Contact page** (rather than only a
  search bar).
  *Source: Ellie (ATL), "Future Wish List." Jeff: needs explanation.*

---

## 4. AI-powered data enrichment

- **Pull in / enrich company and contact info** — e.g. match company websites
  with email domains, fill contact details from public sources.
  *Source: Annamaria (PHL), "Filter in contact data from company name and
  domain." Jeff: "the app does not use AI [today]; it's possible to include AI
  and this feature in a future stage."*

Important context: the portal has **zero AI/LLM integration today.** This item
would be the first introduction of it, and would need a data-handling /
client-data-protection review before adoption (two admins raised data-protection
concerns specifically because they *assumed* AI was already involved — it isn't).

---

## 5. Email engine & notifications

Known-deferred since the first admin call; no email-sending capability exists in
the current phase.

- **System-sent emails** — invites, password resets, and "you were assigned
  feedback" notifications sent directly instead of the admin copying/mailing a
  link by hand. (Interim: the in-app "New invite link" + mailto handoff, and the
  in-app feedback badge, cover the immediate need.)
- **Subscription notifications** — e.g. "email me when a contact at this company
  changes" or when a watched record is updated.
  *Source: multiple calls; Jeff on the record about an email engine being a
  later phase.*
- **Planned-maintenance / downtime notices** ahead of time.
  *Source: Annamaria (PHL), "Notifications for Maintenance." Jeff confirmed
  these will be sent — delivery mechanism depends on the email engine.*

---

## 6. Richer contact & deal fields

Field additions that are wanted but depend on cross-office standardization
before they're worth building (so they sit between "wishlist" and "Tiffany
decision").

- **More contact specifics** — title, a website link, and a way to note the
  market vs. the contact source.
  *Source: Ellie (ATL), "Future Wish List." Jeff: needs standardization.*
- **A note alongside "last contacted date"** — what the contact was (emailed,
  left VM, sent OM, had meeting).
  *Source: Annamaria (PHL), "Last contacted note on each contact." Jeff: "we
  can, as long as it's standardized."*
- **Reliability / relationship score, richer version.** The basic 1–3
  relationship-strength field is **already built** (S-10); a fuller "reliability
  score" concept was also floated.
  *Source: Lindsay (HOU), Annamaria (PHL), Ellie (ATL). Definition pending
  Tiffany.*

---

## 7. Confidentiality / access refinements

- **Off-market deals visible only within a specialty sector** (a sector-scoped
  confidentiality tier, distinct from the current office-level "confidential"
  flag).
  *Source: Annamaria (PHL), "Off-Market Deals." Jeff: "possible, to be
  discussed."*
- **Broker self-service** — should brokers be able to edit their own profile /
  specialty team, and hide their own contacts (vs. routing through the office
  admin)?
  *Source: Jeff's own open product questions ("Edit Profile", "Brokers to hide
  their own contacts").*

---

## 8. Stage History (reintroduce)

Removed from the UI on 2026-07-14 to avoid confusion (it was always empty —
nothing ever wrote to it). The `deal_stage_history` table, its RLS, and the
`DealStageHistory` type were **deliberately kept** for a clean reintroduction.

- **Reintroduce a working stage-change timeline** on deals — requires (a) writing
  a history row on manual stage changes, and (b) resolving deal identity across
  uploads so import-driven stage changes can be tracked (Note A).
  *Source: Annamaria (PHL), "Stage History" ticket.*

---

## Notes / cross-cutting prerequisites

**Note A — record identity across uploads.** Today every import creates brand-new
rows with fresh UUIDs; there's no external/reference ID on contacts or deals. So
"the same deal/contact from last month" isn't recognized on re-import. Several
wishlist items (retained history, working Stage History, activity trails) can't
be fully built until this is solved. It's the Pipeline-side sibling of the
cross-office contact-matching question already open with Tiffany
(S-11 in the spec doc).

**Not on this list (on purpose):**
- Cross-office standardization decisions (what "Closed" means, required fields,
  tag vocabularies, deal naming, upload cadence, FL office designation, etc.) —
  those are Tiffany's to define, not features to build. Many tickets resolve to
  "needs standardization."
- Bugs and near-term fixes — see the active spec doc and the Feedback tickets.
