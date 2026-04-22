# GREA Contacts Portal

A cross-office contact & deal management app for GREA, built on **Next.js 14** (App Router), **Supabase** (Postgres + Auth + RLS), and **TypeScript**.

Based on the single-page HTML prototype, rebuilt as a full-fledged multi-user application. The Call Log feature from the prototype has been removed.

---

## Features

- **Authentication** — Email/password login via Supabase Auth. New signups default to `broker` role.
- **Contacts** — Fuzzy search across all offices (Fuse.js), tag & sector filters, cross-office consolidation, "Request Intro" mailto, **Add Contact** form.
- **My Office (Admin)** — View and CSV-export the full contact list for an office; available to `office_admin` and `superadmin`.
- **Pipeline** — Deal CRUD, stage filtering, stage-advance flow, deal detail modal with specialty-team contacts and stage history.
- **Network Stats** — Modal showing contact counts and data-freshness per office.
- **Superadmin area** — Manage users, offices, specialty teams, contacts, and deals.

---

## Stack

| Layer        | Choice                                         |
|--------------|------------------------------------------------|
| Framework    | Next.js 14 (App Router, RSC)                   |
| Language     | TypeScript                                     |
| Auth & DB    | Supabase (Postgres + Auth + RLS)               |
| Styling      | Tailwind CSS + CSS variables (navy/gold brand) |
| Fuzzy search | Fuse.js (client-side)                          |

---

## Getting started

### 1. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/0001_initial_schema.sql`.
3. Run `supabase/seed.sql` to create sample offices, specialty teams, contacts, and deals.
4. Copy your project URL and anon key from **Settings → API**.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # optional, server-only
```

### 3. Install & run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

### 4. Create your superadmin user

1. Sign up at `/login` with any email + password.
2. In the Supabase dashboard → **Authentication → Users**, confirm the user (or disable email confirmation under **Auth → Providers → Email**).
3. In the SQL editor, promote yourself to superadmin:

```sql
update public.profiles
set role = 'superadmin',
    office_id = (select id from public.offices where code = 'NYC')
where email = 'you@example.com';
```

4. Refresh — the **Admin** tab should now appear in the header.

---

## Project layout

```
src/
├── app/
│   ├── (app)/                  # Authenticated routes
│   │   ├── contacts/page.tsx   # Search & cross-office results
│   │   ├── pipeline/page.tsx   # Deal table, filters, stage flow
│   │   └── admin/              # Superadmin-only area
│   │       ├── page.tsx        # Dashboard with counts
│   │       ├── users/          # Manage users & roles
│   │       ├── offices/        # CRUD offices
│   │       ├── teams/          # CRUD specialty teams + memberships
│   │       ├── contacts/       # All-office contact admin
│   │       └── deals/          # All-office deal admin
│   ├── auth/signout/route.ts
│   ├── login/page.tsx
│   ├── layout.tsx
│   ├── page.tsx                # Redirects to /contacts
│   └── globals.css
├── components/
│   ├── AppHeader.tsx
│   ├── contacts/               # Search, Add, MyOffice, Stats
│   ├── pipeline/               # PipelineView, NewDeal, DealDetail
│   └── admin/                  # Users/Offices/Teams/Contacts/Deals admins
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── data.ts                 # Server-side data loaders
│   └── types.ts                # App types + Database type shape
└── middleware.ts               # Session refresh + redirects

supabase/
├── migrations/0001_initial_schema.sql
└── seed.sql
```

---

## Roles & access

| Role           | Can see                                         | Can write                                     |
|----------------|-------------------------------------------------|-----------------------------------------------|
| `broker`       | All contacts & deals (read-only cross-office)   | Own-office contacts & deals                   |
| `office_admin` | Same as broker + **My Office** export           | Own-office contacts & deals; delete own-office|
| `superadmin`   | Everything + **Admin** tab                      | All tables                                    |

Rules are enforced with **Row-Level Security** policies on every table. See the bottom of `supabase/migrations/0001_initial_schema.sql`.

---

## Notes on the port from the prototype

- **Call Log** (prototype feature) is intentionally omitted per the requirements.
- Fuzzy consolidation of cross-office contacts uses the same Fuse.js thresholds as the prototype.
- Specialty teams are editable through the Admin UI (prototype had them hard-coded).
- Data freshness timestamps are editable per-office through the admin panel.
