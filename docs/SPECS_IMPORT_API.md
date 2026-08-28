# GREA Portal — Import API specification (v1)

*Status: **BUILT** 2026-08-24 (commit `d32005d`) · spec drafted 2026-08-13 · Owner: Jeff*

> **Before use:** migrations `0016_deal_imports.sql` and `0025_api_keys.sql`
> must be applied to production. No API key can be issued until 0025 is in.
> Remaining from §12: office-facing integration docs, and the pilot.

The programmatic way for offices to load Contacts and Pipeline data into the
portal — the "Phase 3 / API" step of the original roadmap (manual uploads →
automated sync). Offices **push** to this API; the portal does not connect to
any office's CRM.

Design decisions locked with Jeff (2026-08-13):

| Decision | Choice |
|---|---|
| Direction | Offices push to us; no pull connectors in v1 |
| Sync semantics | **Replace-per-sync** — each sync wholesale replaces the office's dataset, same as today's "Replace all" upload |
| Audience | Mixed capability — designed for the weakest integrator; accepts CSV as well as JSON |
| Sharing guardrail | API **strips** contact phone/email server-side and reports it; not a docs-only policy |

---

## 1. Design principles

1. **One validation path.** The API reuses the exact modules the manual
   upload uses (`src/lib/contacts/import-schema.ts`,
   `src/lib/deals/import-schema.ts`, `src/lib/importDate.ts`). A file that
   imports in the UI imports through the API, byte for byte. No rule may
   exist in one path and not the other.
2. **Design for the weakest integrator.** An office with no developers must
   be able to automate with a one-line `curl` in a scheduled task, posting
   the same CSV they already know from manual uploads. JSON exists for
   offices that outgrow CSV.
3. **Office isolation by construction.** A key belongs to exactly one
   office; the office is derived from the key, never from the payload.
   There is no parameter that lets a caller write into another office.
4. **Fail loudly, never silently.** Every response carries the full
   per-row report (imported / skipped / why / warnings). Automation must
   surface at least the summary line to a human; see §8.

## 2. Authentication — per-office API keys

- New table `api_keys`:
  `id, office_id, key_hash (sha256), label, created_by, created_at,
  last_used_at, revoked_at`. The plaintext key is shown **once** at
  creation and never stored.
- Key format: `grea_live_<32 random bytes, base62>` — prefix makes leaked
  keys grep-able and identifiable in logs.
- Issued and revoked by a **superadmin** in the admin UI (key management
  screen, superadmin-only). One active key per office is the norm; two are
  allowed to permit rotation without downtime.
- Sent as `Authorization: Bearer grea_live_…`. HTTPS only.
- Every request updates `last_used_at`; the admin screen shows it so a
  dormant or never-used key is visible at a glance.
- RLS posture unchanged: routes execute with the service role exactly like
  today's import routes, after the key→office resolution. Keys never reach
  the browser.

## 3. Endpoints

Base path `/api/v1`. All responses JSON.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/import/contacts` | Replace the office's contacts with the payload |
| `POST` | `/api/v1/import/deals` | Replace the office's pipeline with the payload |
| `GET` | `/api/v1/imports` | Last 50 import runs for this office (audit trail) |
| `GET` | `/api/v1/whoami` | Echoes office code + key label — lets an office verify a key works without touching data |

No `mode` parameter. The API is **replace-only** by design: add-on in an
automated sync duplicates the dataset on every run (the exact trap the
manual-upload docs warn about). An office wanting add-on behaviour uses the
UI.

### 3.1 Dry-run

`POST /api/v1/import/contacts?dry_run=1` (same for deals) runs the complete
validation and returns the full report **without writing anything** — the
API twin of `scripts/check_import_file.js`. Integrators are told to wire
dry-run into development and testing, and optionally as a pre-flight before
each real sync.

## 4. Payload formats

Content negotiation by `Content-Type`; both formats hit identical
validation.

- **`text/csv`** — the exact manual-upload template: same headers, same
  alias tolerance (`Date Added` → `List Date`, `Won/Lost` → `Sub-status`,
  etc.), same required columns.
- **`application/json`** — `{ "rows": [ { … } ] }`, keys matching the
  template's snake_case keys (`contact_name`, `account_name`,
  `broker_email`, …). Same coercion rules (semicolon-separated lists may
  instead be JSON arrays; booleans may be real booleans).

Limits (identical to UI): **5 MB** body, **10,000 rows**. Same
formula-injection posture on any future export surface.

## 5. Validation & write semantics

Per request:

1. Resolve key → office. 401 on unknown, 403 on revoked.
2. Parse payload; map headers/keys. Missing required column ⇒ **422, whole
   request rejected, nothing written** (same as UI).
3. Validate rows via the shared `parseRow`. Invalid rows are **skipped and
   reported**, valid rows proceed (same as UI).
4. **Zero-valid-rows guard:** if no rows survive validation, the replace is
   refused (422) — an all-bad file must never wipe an office (same rule as
   UI).
5. Delete office's existing records, insert valid rows, chunked at 500
   (reuses the current route logic). *Hardening note: delete+insert is not
   atomic today; v1 accepts this (identical exposure to the manual path),
   with a transactional RPC listed under Future work.*
6. Write the audit row (§7).

### 5.1 Contact-sharing guardrail (server-side strip)

For **contacts**, the API blanks `contact_phone` and `contact_email` before
insert regardless of what was sent, and reports
`"strippedFields": {"contact_phone": N, "contact_email": M}` in the
response with a fixed explanatory message. Rows are **not** rejected for
carrying these fields.

Implemented as a server-side config flag (`app_settings`,
`share_contact_details: false`) so lifting the first-stage policy later is
a settings change, not a deploy. The manual upload route should apply the
same flag for consistency — flagged as part of this work.

## 6. Response shape

```json
{
  "ok": true,
  "dryRun": false,
  "office": "PHL",
  "entity": "contacts",
  "received": 352,
  "imported": 352,
  "deleted": 340,
  "skipped": 0,
  "skippedRows": [ { "row": 17, "errors": ["contact_name is required"] } ],
  "warnings": [
    "3 broker email(s) aren't registered users yet (…) — imported unassigned.",
    "contact_phone was provided on 12 row(s) and removed per current sharing policy."
  ],
  "importId": "…"
}
```

HTTP codes: `200` success (including with skips) · `401` bad key ·
`403` revoked key · `413` too large · `415` unsupported content type ·
`422` file-level rejection (missing columns / zero valid rows) ·
`429` rate-limited · `5xx` server fault, nothing written or partial state
reported honestly in `imported`.

## 7. Audit & observability

- Every run (including dry-runs, marked as such) writes to
  `contact_imports` / `deal_imports` with `source: "api"`, the key id, and
  the same counts as manual uploads.
- **Dependency:** migration `0016_deal_imports.sql` is still unapplied in
  production (see PROJECT_LOG 2026-08-13). It must be applied before the
  deals endpoint ships — the API's audit trail depends on it.
- `GET /api/v1/imports` reads this table, letting an office script check
  "did last night's sync run, and how many rows landed?" without a human
  logging into the portal.

## 8. Rate limiting & abuse

- Per key: **10 import POSTs per hour** (dry-runs count ×0.2). Via the
  existing `rateLimit.ts`; its per-instance in-memory caveat is accepted at
  this scale, as elsewhere in the app.
- Keys are office-scoped credentials: treat leakage like a password leak —
  revoke in admin UI, reissue, done. No key grants read access to contact
  data (import endpoints return only reports; `/imports` returns counts).

## 9. Versioning

`/api/v1` is frozen at this contract. Additive, non-breaking changes
(new optional fields, new warnings) may land in v1; anything breaking is
`/api/v2`. The template columns remain governed by the schema modules —
adding an optional column is non-breaking by definition of §4's alias
tolerance.

## 10. Integration patterns (docs to give offices)

- **Spreadsheet-based office (weakest case):** keep maintaining the same
  CSV; schedule
  `curl -H "Authorization: Bearer $KEY" -H "Content-Type: text/csv" --data-binary @contacts.csv https://…/api/v1/import/contacts`
  weekly (Task Scheduler / cron / Zapier webhook). Their entire integration
  is one line.
- **Salesforce office (Ariel):** scheduled Flow or report export feeding
  the same transformation that produced `NYC_Pipeline_Portal_Upload.csv`,
  then the curl above — or middleware (Zapier/Make) mapping fields to the
  JSON format. The username→broker-email mapping table from the NYC
  exercise becomes part of their transformation, defined once.
- **Any office:** start with `/whoami`, then `dry_run=1` until clean, then
  go live. Never wire the real endpoint first.

## 11. Explicitly out of scope for v1

- **Pull connectors** (us logging into their CRMs) — possible later layer
  that would call this same API internally.
- **Upsert / record identity.** Replace-per-sync means no record
  continuity across syncs: no stage history, no edit trail, and re-synced
  records get new ids (existing behaviour, unchanged). If that changes,
  the path is an `external_id` column and upsert semantics — see
  WISHLIST Note A. Revisiting this requires offices to add one column, so
  it is a v2 contract change, deliberately not smuggled into v1.
- Webhooks / notifications on sync completion (belongs with the future
  email engine).
- Per-broker or read-scope API keys.

## 12. Implementation checklist

1. Migration: `api_keys` table (+ RLS: superadmin-only) — and **apply
   `0016_deal_imports.sql` to production first**.
2. `app_settings.share_contact_details` flag; strip logic shared by API +
   manual route.
3. Refactor the two existing import routes to extract the shared
   validate/replace/audit core; API routes call the same core.
4. `/api/v1/*` routes + key middleware.
5. Superadmin key-management screen.
6. One-page integration doc per pattern in §10 (office-facing, PDF like
   the First Import Guide).
7. Pilot: Ariel/NYC as first key holder (they already have the
   transformation), then PHL (spreadsheet pattern).

## Open questions (for Tiffany / offices — none block the spec)

- Expected cadence per office (weekly?) — sets the freshness expectation on
  the Network page.
- Who at each office holds the key and gets the sync report.
- When (if ever) the first-stage contact-sharing policy lifts — flips one
  setting, §5.1.
