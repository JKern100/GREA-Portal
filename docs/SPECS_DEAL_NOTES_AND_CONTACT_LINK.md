# Deal notes, stable deal matching, and deal ↔ contact association

*Status: **SPEC — not built, not yet priced/approved** · drafted 2026-11-18 · Owner: Jeff*

> **Commercial context:** both features were logged as "future version" items
> (`docs/WISHLIST.md` §1 and §3) and are outside the original build and outside
> monthly support. They are being proposed to Tiffany as a separately priced
> project. Do not start building until Jeff confirms she has approved it.

Requested by Tiffany (Nov 2026):

1. Attach notes to any pipeline deal.
2. *"We are just wanting the pipeline to identify if one of our loaded contacts
   is associated with it."*

Both collide with the same fact: **a deal has no identity that survives an
upload.** Every import deletes the office's deals and inserts new rows with new
UUIDs (`src/lib/import/core.ts:286`). Part A fixes that with the smallest
possible change; Parts B and C build on it.

---

## Design decision: keep replace-per-upload, add a stable deal key

Three ways to make "the same deal" recognisable across uploads were considered.

| Option | How it works | Work for offices | Weakness |
|---|---|---|---|
| 1. Office supplies an ID | New optional `Deal ID` column carrying the record ID from their own system | Add one column to the export (one-time; the mapper remembers nothing yet, so they map it each time) | Spreadsheet offices have no ID. Excel turns long numeric IDs into `1.23E+11` (seen on 91% of one PHL file) |
| 2. Portal matches on name + address | Key built from normalised deal name + address | None | A renamed deal looks like a new deal. Two deals with the same name and address collide |
| 3. **Hybrid (chosen)** | Use the office's ID when the file has one, otherwise fall back to name + address. Notes that lose their deal are kept and can be re-attached | None required; an ID is an optional upgrade | Slightly more logic on our side |

A fourth route, true upsert (update rows in place instead of delete + insert),
was rejected for this project. It changes the import core, the API contract
and the "an upload is a fresh copy" principle, and it is not needed: **notes do
not have to point at the deal row. They point at the deal's key.** The upload
keeps replacing rows exactly as today; each new row recomputes the same key;
its notes are found by `(office_id, deal_key)`.

Consequences worth stating plainly:

- Offices change nothing. Monthly uploads work as they do now.
- The API contract is unchanged apart from one new optional field.
- A deal's UUID still changes on every upload. Nothing new may reference
  `deals.id` for anything meant to persist.
- Stage history could later be rebuilt on the same key. Out of scope here.

---

## Part A · Stable deal key

### A-1 Schema (migration `0026_deal_key_and_notes.sql`)

```sql
alter table public.deals
  add column if not exists external_id text,
  add column if not exists deal_key text;
create index if not exists deals_office_key_idx on public.deals (office_id, deal_key);
```

Backfill `deal_key` for existing rows in the same migration using the natural
key (below), so notes can be added before an office's next upload.

### A-2 Key rule — one pure function, `src/lib/deals/dealKey.ts`

```
if external_id is usable  ->  "id:" + lower(trim(external_id))
else                      ->  "nk:" + norm(deal_name) + "|" + norm(property_address)
norm(s) = lowercase, strip everything except letters and digits
```

`external_id` is **not usable** (treated as absent, with a file warning) when
it looks like spreadsheet damage: matches `^\d+(\.\d+)?E\+\d+$`, or is shared
by more than one row in the file.

The function is used by the import core, the migration backfill (SQL twin),
and the unit tests. No other code may compute a key.

### A-3 Import changes (all in `src/lib/import/core.ts` + `deals/import-schema.ts`)

- New optional template column `Deal ID` (`external_id`). Aliases for the
  mapper: Record ID, Listing ID, Opportunity ID, Deal ID, ID.
- Core computes `deal_key` for every deal row before insert.
- **Duplicate keys within one file** → file warning naming the deals: their
  notes would be shared. Not a rejection.
- **ID adoption:** when an incoming row has an `id:` key with no notes under
  it, but notes exist for this office under the row's `nk:` key, re-key those
  notes to the `id:` key. This lets an office start supplying IDs later
  without orphaning anything.
- **Dry run / preview** (manual upload, mapper, API) reports
  `notesAtRisk`: notes whose key will not exist after this upload, with deal
  names. Shown as a warning, not a block: *"3 deals with notes are not in this
  file. Their notes will be kept and can be re-attached."*
- Export (`/api/deals/export`) includes `Deal ID` so export → re-upload
  round-trips.

### A-4 Acceptance

1. Upload the same file twice with Replace all: every deal has the same
   `deal_key` both times, different `id`.
2. File with `Deal ID`: keys are `id:`; removing the column on a later upload
   falls back to `nk:` and warns.
3. `1.23457E+11` in `Deal ID` is ignored with a warning; the row still imports.
4. Unit tests for `dealKey` incl. punctuation/case/whitespace variants.
5. Contacts import is untouched.

---

## Part B · Notes on deals

### B-1 Schema (same migration)

```sql
create table public.deal_notes (
  id uuid primary key default uuid_generate_v4(),
  office_id uuid not null references public.offices(id) on delete cascade, -- deal's office
  deal_key text not null,
  deal_name_snapshot text not null default '',   -- for the unattached list
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  author_office_id uuid references public.offices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deal_notes_key_idx on public.deal_notes (office_id, deal_key, created_at);
```

No foreign key to `deals` by design (see the decision above).

### B-2 Who can do what — **defaults pending Tiffany's answer**

| Action | Default |
|---|---|
| Read notes on a deal | Anyone who can see the deal. Notes on a confidential deal follow the deal: owning office + superadmin only |
| Add a note | Any signed-in user, on any deal they can see (cross-office conversation is the point) |
| Edit / delete own note | The author |
| Delete any note on the office's deals | That office's admin; superadmin anywhere |

Enforced in RLS, not just the UI. If Tiffany wants "owning office only", it is
a policy change, not a redesign.

### B-3 UI

- **Deal detail modal:** a Notes section listing notes newest first (author,
  office chip, date) with an add box. The existing imported field is relabelled
  **"From the office's system"** so the two are not confused.
- **Pipeline list:** small note-count badge on deals that have notes.
- **My Office → Pipeline:** an **"Unattached notes"** panel, shown only when
  some exist. Each row: deal name snapshot, note count, last note date, and
  two actions: *Re-attach to…* (picker of current deals, best fuzzy matches
  first) or *Delete*. Re-attaching re-keys the notes.
- "Delete all" pipeline data does **not** delete notes; they become
  unattached. The confirmation text says so.

### B-4 Out of scope

Mentions/tagging, notifications or email, attachments, notes on contacts,
threading, edit history. (Wishlist §1 remainder.)

### B-5 Acceptance

1. Add a note, Replace all with the same file, note is still on the deal.
2. Rename the deal in the file, upload: preview warns; after import the note
   is in Unattached; re-attach puts it on the renamed deal.
3. Another office's broker can read/add per B-2; cannot edit someone else's.
4. Confidential deal: notes invisible to other offices (verified via RLS as a
   second user, not just hidden in the UI).
5. 2,001-character note rejected.

---

## Part C · Deal ↔ contact association

Tiffany's ask is recognition, not data entry: show on a deal when one of the
loaded contacts is connected to it.

### C-1 Approach: derived at read time, nothing stored

No link table, no new upload column. Computed from data offices already load,
so it survives every upload automatically.

A contact is **associated** with a deal when any of these match after
normalisation (same `norm()` as A-2, exact match, no fuzzy):

| Signal | Deal side | Contact side | Shown as |
|---|---|---|---|
| Company | `seller_name` or `buyer_name` | `account_name` | "Seller is a known company" |
| Person | `seller_name` or `buyer_name` | `contact_name` | "Seller is a known contact" |
| Listing | `deal_name` or `property_address` | `listing` | "Contact linked to this listing" |

Scope: all offices' contacts (that is the cross-office value), honouring the
existing confidentiality rule: a confidential contact only matches for its own
office and superadmins.

Exact-match only is deliberate. A false "known contact" badge on a deal is
worse than a missed one; fuzzy suggestions can come later if exact proves too
strict.

### C-2 UI

- **Deal detail modal:** "Known contacts" block listing each match: contact
  name, company, which office and broker hold the relationship, relationship
  strength if set, and which signal matched. Click through to the contact.
- **Pipeline list:** a small people icon with a count on deals with matches;
  a filter "Has a known contact".
- **Contact card (reverse):** "Associated deals" list.

### C-3 Dependency on data

Matches only appear where offices load Seller / Buyer on deals or Listing on
contacts. All three are optional today. The upload preview adds one line when
none of an office's deals carry Seller or Buyer: *"No seller or buyer names in
this file, so contact matches can't be shown for these deals."*

### C-4 Implementation notes

- Pure module `src/lib/deals/contactMatch.ts`: builds three lookup maps from
  the contact list once, then matches each deal in O(1). Unit tested.
- Pipeline and Contacts pages already load both lists (now paged via
  `fetchAll`), so no new queries.
- Ignore trivially short or placeholder values (`Individual`, `(No value)`,
  `N/A`, `TBD`, under 3 characters) or every such deal matches every such
  contact.

### C-5 Acceptance

1. Deal with Seller "Brookfield Properties" shows NYC's Brookfield contact,
   with office and broker.
2. Case/punctuation differences still match ("Brookfield Properties, Inc." vs
   "brookfield properties inc"); "Brookfield" alone does not.
3. A confidential contact in another office never appears.
4. `Individual` / `(No value)` never produce a match.
5. Re-upload either dataset: associations recompute with no manual step.

---

## Rollout

1. Migration 0026 (Jeff runs by hand; record in `docs/MIGRATIONS.md`).
2. Ship A, then B, then C. Each is independently releasable.
3. Update the two office guides: optional `Deal ID`, what the notes warning
   means, and that Seller/Buyer drive contact matches.
4. One short note to office admins. No action required of them.

## Open questions for Tiffany

1. Notes: can any office add notes on any deal, or only the owning office?
2. Notes: should brokers be able to add notes, or admins only?
3. Contact matches: across all offices (recommended) or within the deal's own
   office only?
