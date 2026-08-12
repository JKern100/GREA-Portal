# Office data onboarding — playbook

How to get a GREA office's real CRM data into the portal, and the problems
that keep recurring. Written after taking Philadelphia through three rounds
and converting NYC's pipeline export; almost everything here will repeat with
the next office.

---

## First: dry-run the file, never eyeball it

```bash
node scripts/check_import_file.js contacts <file.csv>
node scripts/check_import_file.js deals    <file.csv> --rows
```

Runs the office's file through the **actual** import schema (same `mapHeaders`
/ `parseRow` the API uses) and reports how many rows would import, why the
rest would be skipped, and warnings for things that import *silently wrong*.
Touches no database.

Always run this before telling an office "you're good to upload." Reviewing a
CSV by hand does not reliably predict the importer's behaviour — the first PHL
file looked fine and had a 100% failure rate.

---

## Recurring problems in real CRM exports

Ordered by how much damage they caused.

### 1. Datetime cells in date columns
`7/30/2026 16:31` in Last Contact Date / List Date. **Fixed on our side**
(2026-08-06) — the parser now strips a trailing time. Before that it failed
382/382 rows in one file. If a date still fails, it's a genuinely bad value.

### 2. `(No value)` placeholder text
Some CRMs export the literal string `(No value)` for empty cells. It is
**non-empty text**, so it passes required-field checks and lands in the
database as a company name. Fix is a find-and-replace at source.

Watch the follow-on trap: replacing it with *blank* then breaks
**Account / Company**, which is required. Contacts with no company need a real
value — PHL settled on `Individual`.

### 3. Sector wording that is close but wrong
`Affordable` instead of `Affordable Housing`; internal category codes like
`608 - Senior/Affordable`. **Sectors are not validated on import** — wrong
values save happily and then never match the sector filters. Silent and
therefore the worst failure mode. The dry-run script warns on these.

Valid: `Multifamily`, `Affordable Housing`, `Student Housing`,
`Capital Services`, `General`.

### 4. Blank required fields
Contacts require Contact Name, Account/Company, Broker Email, Broker Name.
Deals require Deal Name, Stage, List Date. Note a cell containing a single
space counts as blank.

### 5. Encoding damage
`Sothebyâ€™s` — the file was saved in the wrong encoding. Save as CSV UTF-8.

### 6. Leftover junk records
Test rows (`fdsa fdsa`, `First Last`), duplicate contacts, and **GREA brokers
entered as contacts** (Steffan Ramos appeared in PHL's own list). Worth
scanning for before import; none of these are caught by validation.

### 7. Broker email / broker name disagreement
Some rows pair one broker's email with another's name. **The email wins** for
linking, so the row silently attributes to the wrong person.

---

## Field mapping guidance

- **Broker Email is the linking key.** If it matches a registered portal user,
  the record links to that account. If not, the record still imports and
  displays the typed Broker Name — and links automatically on a later import
  once that person is registered. Required on contacts, optional on deals.
- **Confidential** hides a record from *other* offices. It is not a
  general-purpose flag; see the caveat in PROJECT_LOG about the mirror pages
  hiding confidential records from everyone including the owning office.
- **Contact phone/email**: per the first-stage sharing guidelines (agreed with
  Tiffany, Aug 2026) offices leave these blank and share Name + Company only.
  See `docs/` first-import guide.

### Converting a Salesforce-style listing export (NYC/APA pattern)

| Portal column | Typical source | Notes |
|---|---|---|
| Deal Name | Listing name | |
| Address | Neighborhood + Borough + ZIP | These exports often have no street-address column |
| Property Type | Primary property type | Free text, keep verbatim |
| Amount ($) | Campaign/asking price | Check for a "keep price confidential" flag |
| Stage | Pipeline stage | `Closed Won` → Stage `Closed` + Sub-status `Won` |
| Sectors | Derived from property type | Multifamily if present, else General |
| OM Link | Setup/offering PDF URL | |
| List Date | Activity/listing date, **not** last-modified | Often years old; expect the Network freshness ring to look stale |
| Notes | Short subtitle, **not** the long description | Descriptions are usually HTML with `<br>` tags |

**Salesperson fields are the hard part.** Exports carry usernames
(`vsozio`, `mtortorici`), often several per listing, while the portal holds
one broker per deal. Don't guess emails from usernames — Ariel and GREA use
different conventions and a wrong address mislinks. Ask the office for a
username → name/email mapping, leave Broker Email blank in the interim (deals
allow it), and re-run once you have it.

---

## Per-office status (as of 2026-08-13)

| Office | Contacts | Pipeline |
|---|---|---|
| ATL | 828 loaded (Jul 24) | 19 loaded (Jul 22) |
| PHL | 352 validated clean, ready to upload | not started |
| NYC | 51 loaded (Jul 30) | 97 converted, blocked on broker mapping |
| DTW, HOU, PDX | none | seed data only |

**Careful:** the remaining seed/demo data uses real Ariel broker names and
real NYC addresses, so it reads as genuine. Confirm against `created_at`
before concluding an office has uploaded — the bulk seed load shares one
timestamp (`2026-04-26 12:56:57`) across four offices.

---

## Useful diagnostic queries

```sql
-- Has an office actually uploaded, or is that seed data?
select o.code, count(*) as rows,
       max(c.created_at) as last_written, max(c.date_added) as newest
from public.contacts c join public.offices o on o.id = c.office_id
group by o.code order by o.code;   -- swap contacts→deals for pipeline
```

The Network page's freshness ring measures **`created_at`** (when the row was
written to the portal), while "Newest contact/deal" shows **`date_added`**
(the business date from the file). They answer different questions and will
disagree; that is intended.

Note the Network page also **excludes confidential records** from its counts,
so its totals will be lower than a raw `count(*)`.
