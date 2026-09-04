# Import Mapper — column-mapping wizard for office data

*Status: **SPEC — ready to build (Phase A)** · drafted 2026-09-01 · Owner: Jeff*

> **Commercial context (do not lose this):** a mapping tool was never part of
> the agreed scope. Jeff is building the core wizard (Phase A) at no charge as
> a **one-time exception**, stated as such to Tiffany in writing. Phases B and
> C below are explicitly **not included** and are to be treated as new work if
> requested. Do not quietly expand Phase A into B or C.

## Why

Every office's CRM exports a differently-shaped file. Today the portal
demands the office reshape that file to match our template before uploading,
and the failure mode when they don't is bad: an unrecognised header is
**silently dropped** by `mapHeaders` (`src/lib/contacts/import-schema.ts:133`),
which then surfaces as "Missing required column: Account / Company — file
rejected" even when the column is right there under the name "Company". The
admin has no way to say "that one is this one."

On the 2026-08-31 admin call every office asked for the same thing: upload the
export as-is, match its columns to ours, and have the portal say precisely
what needs fixing *before* anything is saved. That is the standard CRM import
wizard, and it is the difference between telling the three offices that have
never uploaded "reformat your data" and "upload what you have."

It also retires the one-off `HubspotContactConverter` (see §9).

## Design principles

1. **Same core, same answers.** The mapper produces a template-ordered sheet
   and hands it to `runImport()` in `src/lib/import/core.ts`. It adds no
   validation rules of its own. A file that imports through the mapper
   imports identically through the manual dialog and the API.
2. **Nothing is written until the last click.** Every step before "Import" is
   a `dryRun`. The preview *is* the dry run.
3. **Identify problems; never edit data in the portal.** Every upload replaces
   the office's data, so a cell fixed in the portal is undone by the next
   upload. The mapper names the problem, hands back the broken rows, and
   sends the admin to fix them at source.
4. **Built as a reusable component.** Phase A ships under Super Admin →
   Utilities, but the destination is the office admin's Upload dialog. The
   wizard takes `officeId` as a prop and must not assume who is driving it.

---

## 1. Where it lives (Phase A)

**Super Admin → Utilities → "Import Mapper"**, replacing the HubSpot converter
as the page's only tool. Superadmin-only via the existing `/admin` layout
guard (`requireSuperadmin()`); the API route re-checks with `getRealProfile()`
so an impersonating session cannot import as someone else.

Because a superadmin has no office, the wizard opens with an **office picker**
(reuse `listOffices()`, same as `ApiKeysAdmin`). Everything downstream is
scoped to the chosen office exactly as if that office's admin were uploading.

Audit: the import is recorded in `contact_imports` / `deal_imports` with
`imported_by` = the superadmin's profile, `imported_by_name` = their name, and
`file_name` = `"<original file name> (via mapper)"`. No schema change; those
tables have no `source` column and don't need one for this.

## 2. The flow

Five steps, one screen each, a back button on every step. State lives in the
client until the final POST.

### Step 0 — Set up
- Office (superadmin only; hidden when embedded in an office admin's view).
- Entity: **Contacts** or **Pipeline**.
- File: CSV only, 5 MB max, same rejection of `.xlsx` as the manual route
  (`src/app/api/contacts/import/route.ts:50`, security reason documented
  there). Parsed **in the browser** with `papaparse`, `skipEmptyLines:
  "greedy"`. Row limit 10,000 enforced client-side with the same message the
  core uses.
- Collapsible `ColumnReference` (existing component) so the target fields are
  one click away throughout.

### Step 1 — Match the columns
One table. **One row per portal field**, required fields first and marked
with the existing `.req` styling. Columns:

| Portal field | Their column | Sample values | Status |
|---|---|---|---|
| Contact Name * | `[dropdown: their headers]` | Jane Doe · John Ungar · Glenn R Brooks | ✅ matched / 🟡 suggested / ⚪ not mapped |

- **Dropdown** lists every header in their file, plus "— leave blank —", plus
  (for `contact_name` and `broker_name` only) **"Combine two columns…"**,
  which reveals a second dropdown and joins the two with a single space.
  This exists because HubSpot exports split first/last name and PHL's
  "First Name Last Name" column is unreliable (contains literal text for
  some rows); it is the one converter behaviour worth keeping.
- **Sample values**: the first three non-blank values from the selected
  source column. This is the sanity check — "does 'Primary Contact' really
  contain names?" — and it is what makes the screen usable by a
  non-technical admin. Update live when the dropdown changes.
- **Status** comes from the auto-matcher (§3). A superadmin can override any
  suggestion; overriding turns it ✅.
- Below the table: **"Columns in your file we'll ignore: X, Y, Z."** Nothing
  disappears silently. Each source column may be used at most once; picking
  a column already in use moves it (with a one-line notice), it doesn't
  duplicate.
- **Blocking rule:** the Next button is disabled while any required field is
  ⚪, with the message *"Contact Name, Broker Email still need a column."*
  This replaces the 422 the core would return; the core check remains as the
  backstop.

### Step 2 — Preview (dry run)
POST to the mapper route with `dryRun: true` (§4). Render the result as:

1. **Headline:** *"352 rows in your file. 338 will import. 14 will be
   skipped."* Plus, in replace mode, *"This will replace the 340 contacts
   currently in PHL."* Note the core's dry run returns `inserted: 0,
   deleted: 0` (`core.ts:265`), so the client derives "will import" as
   `received − skipped`, and the route supplies `currentCount` (§4) for the
   replace sentence.
2. **Problems, grouped by type, not by row:**
   ```
   ▸ 11 rows have no Contact Name            [show rows]
   ▸  6 rows have "(No value)" in List Date   [show rows]
   ```
   Group key = the error string from `skippedRows[].errors`. Each group
   expands to the row numbers and the existing 3-field preview. Fourteen rows
   with two problems is two things to fix, not fourteen.
3. **"Download the 14 problem rows"** — a CSV of the *original* rows (their
   columns, their headers) filtered to the skipped row numbers, with an extra
   first column `Problem` carrying the error text. Built client-side from the
   parsed file. This is the artefact the admin takes back to their CRM.
4. **Warnings**, separately and visually distinct from problems (they don't
   stop anything): unmatched broker emails, stripped contact phone/email
   counts, ignored columns.
5. If `ok: false` (zero valid rows, or a core-level rejection): show the
   error, no Import button, back to Step 1.

### Step 3 — Confirm
- Mode: **Replace all** / **Add on**, defaulting to *Replace all* (the mapper
  is for whole-list uploads; add-on is the exception here, the reverse of the
  manual dialog's default — say so in a one-line hint).
- Replace requires the same acknowledgement checkbox as the manual dialog,
  with the count in the sentence: *"I understand this will permanently delete
  the 340 contacts currently in PHL before importing."*
- The button carries the numbers: **"Replace 340 with 338"** / **"Add 338"**.
- POST with `dryRun: false`. On success, call the same `revalidatePath` set as
  the manual routes.

### Step 4 — Done
Same summary as Step 2 with final numbers, plus the problem-rows download
again (people forget), plus "Start another".

## 3. Auto-matching

Runs client-side when the file loads, in this order; the first hit wins and
sets the status:

1. **Exact** — `normaliseHeader(header)` found in the schema's header/key
   table (existing `HEADER_TO_KEY` logic, exposed via a small exported
   `matchHeader()` helper). Status ✅.
2. **Alias table** — a curated list in `src/lib/import/headerAliases.ts`,
   seeded from the real exports we've seen (HubSpot, Salesforce/APA, PHL's
   Student Housing sheet). Status ✅. Starting list:

   | Target | Aliases |
   |---|---|
   | `contact_name` | Name, Full Name, Contact, Primary Contact |
   | `account_name` | Company, Company Name, Account, Organization, Organisation |
   | `broker_email` | Owner Email, Contact Owner Email, Salesperson Email, Agent Email |
   | `broker_name` | Owner, Contact Owner, Salesperson, Agent, Broker |
   | `contact_email` | Email, Email Address, E-mail |
   | `contact_phone` | Phone, Phone Number, Mobile, Mobile Phone |
   | `last_contact_date` | Last Activity Date, Last Contacted, Last Activity |
   | `note` / `notes` | Notes, Comments, Description |
   | `deal_name` | Listing, Listing Name, Opportunity, Opportunity Name, Property |
   | `property_address` | Address, Street Address, Property Address |
   | `deal_value` | Amount, Price, Asking Price, Value |
   | `date_added` | List Date, Date Added, Listed, Created Date |
   | `om_link` | OM, OM URL, Offering Memorandum |

3. **Fuzzy** — `fuse.js` (already a dependency) over target headers + keys +
   aliases, threshold tight enough that "Cmpany" matches and "Country" does
   not (start at 0.3, tune against the three real files in
   `docs/OFFICE_DATA_ONBOARDING.md`). Status 🟡 **suggested** — visibly
   different so the admin looks at the sample values before trusting it.
4. Otherwise ⚪.

A source column is never auto-assigned to two targets; if two targets fuzzy-
match the same column, the higher score wins and the other stays ⚪.

## 4. Server route

`POST /api/admin/import-mapper` — superadmin only (`getRealProfile()`,
`role === "superadmin"`). JSON body:

```json
{
  "entity": "contacts",
  "officeId": "…",
  "mode": "replace",
  "dryRun": true,
  "fileName": "hubspot-export.csv",
  "mapping": {
    "contact_name": { "concat": ["First Name", "Last Name"] },
    "account_name": { "source": "Company" },
    "broker_email": { "source": "Contact owner email" }
  },
  "rows": [["First Name","Last Name","Company", "…"], ["Jane","Doe","Acme", "…"]]
}
```

Processing:

1. Auth; 5 MB body cap; row cap (the core enforces it too).
2. `applyMapping(rows, mapping, entity)` in **`src/lib/import/applyMapping.ts`**
   — a pure function that returns a new sheet whose header row is the
   template's `header` list in `TEMPLATE_COLUMNS` order and whose data rows
   are pulled from the named source columns (`concat` joins with a single
   space, trimming each side; missing source → blank). Unmapped targets are
   emitted as blank columns so the core's `mapHeaders` sees a complete
   template. This function is the *only* place mapping semantics live, so
   Phase B (saved mappings) and any future API use get them for free.
3. `runImport({ …, rows: mappedSheet, source: "ui", fileName:
   \`${fileName} (via mapper)\`, actorId: superadmin.id, actorName:
   superadmin.name, shareContactDetails: await loadShareContactDetails() })`.
4. Return the core result verbatim plus `currentCount` (rows the office has
   today for that entity) so the preview can state the replace impact.

The route is deliberately thin. Everything that matters is in `applyMapping`
(testable, pure) and the core (already shared).

## 5. Client structure

- `src/components/admin/ImportMapperWizard.tsx` — the whole flow, props
  `{ offices?: Office[]; fixedOfficeId?: string }`. When `fixedOfficeId` is
  set the office picker is hidden — this is the hook for the office-admin
  rollout.
- `src/lib/import/autoMatch.ts` — pure: `(headers: string[], entity) →
  Record<targetKey, { source | concat, status }>`. Unit-tested against the
  three real header sets we have.
- `src/lib/import/headerAliases.ts` — the alias table, exported so the
  column reference can eventually show "also accepted as".
- `src/lib/import/applyMapping.ts` — server-side, pure, unit-tested.
- `src/app/(app)/admin/utilities/page.tsx` — renders the wizard; converter
  removed (§9).

## 6. Explicitly out of scope for Phase A

- **Editing cell values in the browser.** See principle 3.
- **Saved mappings** — Phase B.
- **Value mapping for Stage / Sectors / Tags / Sub-status** — Phase C.
- **Encoding repair** (the `Sothebyâ€™s` mojibake fix in the converter). The
  mapper should *detect* the `â€` signature in sample values and show a
  one-line warning — "This file looks like it was saved with the wrong
  encoding; re-save as CSV UTF-8" — but not repair it. Fix at source.
- **Dropping test/self/duplicate records.** Editorial decisions the
  converter made; not the mapper's job. The dry-run script
  (`scripts/check_import_file.js`) remains the place for that kind of scan.
- Office-admin access (Phase A is superadmin-only by decision, to shake it
  out on real files before exposing it).
- `.xlsx` input (security posture unchanged).

## 7. Phase B — Saved mappings (NOT INCLUDED; new work if requested)

Recorded here only so Phase A doesn't preclude it.

- Migration `0026_import_mappings.sql`: `import_mappings (id, office_id,
  entity, name, header_fingerprint text, mapping jsonb, created_by,
  created_at, last_used_at)`. Fingerprint = sha256 of the sorted, normalised
  source headers.
- On file load, look up `(office_id, entity, fingerprint)`; on hit, pre-apply
  and show *"This looks like your HubSpot export — same mapping as last
  time?"* A changed export format produces a different fingerprint and falls
  back to auto-match rather than silently mis-mapping.
- "Save this mapping as ___" checkbox on Step 1.
- Same `applyMapping`; no core changes.

## 8. Phase C — Value mapping (NOT INCLUDED; new work if requested)

For enumerated fields (`stage`, `sub_status`, `sectors`, `tags`,
`relationship_status`), after column mapping: collect distinct source values,
show the unrecognised ones with counts, and let the admin map each to a
portal value or "leave as is". Persist alongside the column mapping in Phase
B's table. This is what fixes the silent-save problem (#3 in
`docs/OFFICE_DATA_ONBOARDING.md`) and is the proper version of the
sector-warning promised to Annamaria. Until it exists, the dry-run script's
sector warning is the only guard.

## 9. Retiring the HubSpot converter

`HubspotContactConverter.tsx` + `src/lib/converters/hubspotContacts.ts` are
removed when Phase A ships. What is lost, and the decision on each:

| Converter behaviour | Mapper equivalent | Decision |
|---|---|---|
| Rebuild name from First + Last | "Combine two columns" on `contact_name` | Kept |
| Owner-name → broker email guess | None — map their owner-email column, or leave broker email blank and fix at source | Dropped deliberately; guessing emails mislinks records |
| Mojibake repair | Detect + warn | Dropped; fix at source |
| Drop test / self / duplicate rows | None in the wizard | Dropped; editorial, belongs to the office |
| `preserveCodesInNote` (internal category codes → Note) | None | Dropped; PHL-specific |

Before deleting, confirm PHL's most recent export goes through the mapper
clean (the `check_import_file.js` dry run plus one wizard dry run).

## 10. Acceptance criteria (Phase A)

1. A superadmin can pick an office, pick Contacts, drop PHL's raw HubSpot
   Student Housing export, accept the auto-match, and reach a preview that
   shows the same imported/skipped counts as
   `node scripts/check_import_file.js contacts <file>`.
2. A header the schema doesn't know ("Company") is auto-matched to
   `account_name` via the alias table with status ✅; a misspelt one
   ("Cmpany") is offered as 🟡 with sample values visible.
3. With a required field unmapped, Next is disabled and names the field.
4. The preview groups problems by error text with counts, and the downloaded
   problem-rows CSV contains exactly the skipped rows, in the file's original
   columns, with a leading `Problem` column.
5. Nothing is written by anything before the final Import click (verify: dry
   run, then check `contact_imports` has no new row and counts are
   unchanged).
6. After Import in replace mode, the office's count equals the preview's
   `imported`, and the audit row shows the superadmin's name and
   `"<file> (via mapper)"`.
7. `applyMapping` and `autoMatch` have unit tests covering: concat, missing
   source column, a source used twice (rejected), and the three real header
   sets.
8. The office admin Upload dialog and the API are untouched and still import
   the same files with the same results.
9. `HubspotContactConverter` is gone from Utilities and the repo.

## 11. Rollout after Phase A

Once it has handled two or three real files under superadmin, embed
`ImportMapperWizard` with `fixedOfficeId` in the office admin's My Office
Upload flow as the default path, keeping "I already have the template" as a
shortcut. That step is small by construction (principle 4) and should be a
separate, explicitly-scoped item when it comes.
