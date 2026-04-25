#!/usr/bin/env python3
"""
Generate bulk demo SQL for the GREA Portal.

Produces supabase/seeds/large_sample.sql which:
  1. Removes any office whose code is not in the canonical 6
     (NYC/ATL/DTW/HOU/PDX/PHL). FK cascades clean up dependent
     contacts/deals.
  2. Inserts 6 offices via on-conflict-do-nothing.
  3. Inserts ~40 contacts per office with realistic variety.
  4. Inserts ~40 deals per office.

Re-runnable: contacts/deals are inserted only if a row with the
same (office, contact_name, account_name) or deal_name doesn't
already exist.

Run:  python3 scripts/generate_seed_data.py
"""

import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

# Anchor "today" so the seed is deterministic and reproducible across runs.
# All generated dates fall on or before this date so the Network freshness
# ring never sees future-dated activity.
TODAY = date(2026, 4, 25)

OFFICES = {
    "NYC": {
        "name": "New York City",
        "phone": "(212) 544-9500",
        "brokers": [
            ("Michael Tortorici", "x11"),
            ("Shimon Shkury", "x12"),
            ("Victor Sozio", "x13"),
            ("Jason Gold", "x15"),
            ("Daniel Mahfar", "x16"),
            ("Ben Schlegel", "x17"),
        ],
        "streets": [
            "125 W 72nd St", "340 E 93rd St", "88 Atlantic Ave, Brooklyn",
            "421 W 54th St", "155 Rivington St", "230 E 112th St",
            "500 W 143rd St", "918 Bergen St, Brooklyn", "2400 Webb Ave, Bronx",
            "2100 Crotona Ave, Bronx", "315 St Nicholas Ave", "44-10 Queens Blvd",
            "742 Amsterdam Ave", "601 Prospect Pl, Brooklyn", "117 Hester St",
            "188 Suffolk St", "1645 Lexington Ave", "601 W 115th St",
            "55 Water St", "30-14 Steinway St, Queens", "420 W 118th St",
        ],
    },
    "ATL": {
        "name": "Atlanta",
        "phone": "(404) 890-3200",
        "brokers": [
            ("Derek Poole", "x41"),
            ("Tony Kim", "x42"),
            ("Cory Caroline Sams", "x43"),
            ("Marcus Booker", "x44"),
        ],
        "streets": [
            "225 Peachtree St NE", "580 Ralph David Abernathy Blvd",
            "1200 Joseph E Boone Blvd", "400 Memorial Dr SE", "710 Ponce de Leon Ave",
            "320 Marietta St NW", "880 North Ave NE", "515 Edgewood Ave SE",
            "100 Piedmont Ave NE", "900 MLK Jr Dr SW", "250 John Wesley Dobbs Ave",
            "1500 Campbellton Rd SW", "175 Luckie St NW", "150 Boulevard NE",
            "3030 Buckhead Loop NE", "655 Auburn Ave NE",
        ],
    },
    "DTW": {
        "name": "Detroit",
        "phone": "(313) 555-0100",
        "brokers": [
            ("Marcus Whitfield", "x21"),
            ("Diane Reilly", "x22"),
            ("Anthony Caruso", "x23"),
            ("Latoya Moore", "x24"),
        ],
        "streets": [
            "1400 Woodward Ave", "2727 2nd Ave", "4715 Cass Ave",
            "6533 Michigan Ave", "1001 Brush St", "3535 Jefferson Ave",
            "445 W Willis St", "3500 John R St", "13929 Gratiot Ave",
            "8200 Mack Ave", "5240 Cadillac Ave", "1818 Trumbull Ave",
            "525 Beaubien St", "2000 Brush Park", "9201 Grand River Ave",
            "1500 Vernor Hwy",
        ],
    },
    "HOU": {
        "name": "Houston",
        "phone": "(713) 555-0200",
        "brokers": [
            ("Carlos Mendoza", "x51"),
            ("Whitney Pryor", "x52"),
            ("Raymond Liu", "x53"),
            ("Brittany Cardenas", "x54"),
        ],
        "streets": [
            "1410 Westheimer Rd", "2727 Kirby Dr", "5005 Main St",
            "1717 Montrose Blvd", "5085 Westheimer Rd, Galleria", "910 Travis St",
            "3300 Hidalgo St", "4400 Post Oak Pkwy", "8200 Bellaire Blvd",
            "10001 Memorial Dr", "1200 Smith St", "5151 San Felipe St",
            "2425 W Loop S", "8888 Westheimer Rd", "1801 Almeda Rd",
            "2030 Buffalo Speedway",
        ],
    },
    "PDX": {
        "name": "Portland",
        "phone": "(503) 555-0300",
        "brokers": [
            ("Hannah Whitaker", "x61"),
            ("Joshua Park", "x62"),
            ("Riley Greer", "x63"),
            ("Mei Lin", "x64"),
        ],
        "streets": [
            "1310 NW Lovejoy St", "2828 NE Burnside St", "1500 SE Hawthorne Blvd",
            "925 NW Davis St", "1410 SW Morrison St", "2200 NE Alberta St",
            "3030 SE Division St", "1000 NW 23rd Ave", "555 SW Oak St",
            "1212 N Mississippi Ave", "4040 N Williams Ave", "1818 SE Clinton St",
            "9090 SE Foster Rd", "650 NW 19th Ave", "1414 SE Belmont St",
            "880 NW Glisan St",
        ],
    },
    "PHL": {
        "name": "Philadelphia",
        "phone": "(215) 555-0400",
        "brokers": [
            ("Daniel O'Sullivan", "x71"),
            ("Adriana Ferro", "x72"),
            ("Marcus Whitfield-Brown", "x73"),
            ("Priya Iyer", "x74"),
        ],
        "streets": [
            "1700 Walnut St", "1234 Market St", "2020 Chestnut St",
            "3030 Market St", "1818 Spring Garden St", "4040 N Broad St",
            "5000 Lancaster Ave", "1010 Race St", "2424 South St",
            "3200 Powelton Ave", "1500 Locust St", "915 Spring Garden St",
            "707 Chestnut St", "2200 Ben Franklin Pkwy", "1234 Frankford Ave",
            "850 N 5th St",
        ],
    },
}

FIRST_NAMES = [
    "John", "Sarah", "Michael", "Emily", "David", "Jessica", "Robert", "Linda",
    "James", "Patricia", "William", "Elizabeth", "Richard", "Jennifer", "Charles",
    "Susan", "Daniel", "Karen", "Matthew", "Nancy", "Joseph", "Margaret", "Thomas",
    "Sandra", "Christopher", "Deborah", "Mark", "Rachel", "Kevin", "Carol", "Brian",
    "Olivia", "Steven", "Sophia", "Andrew", "Hannah", "Paul", "Rebecca", "Edward",
    "Amy", "Ravi", "Yuki", "Aisha", "Carlos", "Maria", "Hassan", "Diane", "Tariq",
    "Felix", "Lena", "Amir", "Sasha", "Nora", "Keisha", "Elena", "Wendy", "Theo",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Goldberg", "Chen", "Kim", "Patel", "Bennett", "Russo",
    "Cooper", "Greene", "Sutherland", "Cohen", "Brennan", "Holmes",
]

ACCOUNT_PREFIXES = [
    "Bridgewater", "Goldberg", "Atlantic", "Eastbridge", "Pacific Rim",
    "Greenline", "Reed", "Davidson", "Blackwell", "Reeves", "Crescent",
    "Stein", "Patel", "Astoria", "Park-Jensen", "Kessler", "Donahue",
    "Whitfield", "Walsh", "Schwartz", "Rosenberg", "Henderson", "Cooper",
    "Bishop", "Marcus", "Yamamoto", "Burke", "Levin", "Cole", "Holmes",
    "Foster", "Riordan", "Vega", "Bridgepoint", "Ironbridge", "Cardinal",
    "Summit", "Harborline", "Cypress", "Northwood", "Beacon", "Stonefield",
]

ACCOUNT_SUFFIXES = [
    "Capital Partners", "Holdings LLC", "Realty Group", "Equities",
    "Properties", "Investments", "Real Estate", "Development Co",
    "Capital Group", "Ventures", "Trust", "Family Office", "& Associates",
    "Advisors", "Fund", "Acquisitions",
]

NOTE_BANK = [
    "Long-term hold investor.", "Strategic partnership seeking.",
    "Family office investor.", "Off-market deal preference.",
    "Active in office conversion projects.", "Looking to expand portfolio.",
    "Interested in acquisition opportunities.", "Refinancing existing portfolio.",
    "Active buyer — multifamily.", "Institutional capital.",
    "New to market — evaluating options.", "Value-add specialist.",
    "Development pipeline active.", "Opportunistic buyer.",
    "Portfolio diversification goals.", "Focus on mixed-use developments.",
    "Seller — exploring exit.", "Lender preferences are conservative.",
]

SECTOR_POOLS = [
    ["Multifamily"], ["Multifamily"],
    ["Affordable Housing", "Multifamily"],
    ["Student Housing"], ["Student Housing", "Multifamily"],
    ["Capital Services"], ["Capital Services", "Multifamily"],
    ["General"], ["General", "Multifamily"],
    ["Multifamily", "Affordable Housing", "General"],
]

TAG_POOLS = [
    ["Client"], ["Seller"], ["Active", "Buyer"],
    ["Lender"], ["Referral Source"], ["Active", "Seller"],
    ["Buyer", "Seller"], ["Client", "Seller"], ["Client", "Active"],
    ["Active"], ["Buyer"], ["Other"],
]

STATUS_POOL = ["Active", "Active", "Active", "Active", "Prospect", "Prospect", "Former"]

PROPERTY_TYPES = ["Multifamily", "Multifamily", "Multifamily", "Mixed-Use", "Office", "Retail", "Industrial", "Student Housing"]

DEAL_STAGES = ["Lead", "Lead", "Listing", "Listing", "Listing", "Contract", "Closed"]


def sql_str(s: str | None) -> str:
    if s is None:
        return "null"
    return "'" + s.replace("'", "''") + "'"


def sql_array(items) -> str:
    if not items:
        return "array[]::text[]"
    return "array[" + ", ".join(sql_str(x) for x in items) + "]::text[]"


def random_date(start_year: int = 2024, end_year: int = 2026) -> str:
    # Generate within [start_year-01-01, min(end_year-12-28, TODAY)] so
    # demo data never appears in the future relative to the anchor.
    earliest = date(start_year, 1, 1)
    latest = min(date(end_year, 12, 28), TODAY)
    span_days = (latest - earliest).days
    d = earliest + timedelta(days=random.randint(0, span_days))
    return d.isoformat()


def gen_email(first: str, last: str) -> str:
    domain = random.choice(["gmail.com", "outlook.com", "company.com", "advisors.io"])
    style = random.choice(["fl", "first.last", "first_last", "flast"])
    if style == "fl":
        local = (first[0] + last).lower()
    elif style == "first.last":
        local = f"{first}.{last}".lower()
    elif style == "first_last":
        local = f"{first}_{last}".lower()
    else:
        local = (first + last[0]).lower()
    local = local.replace("'", "")
    return f"{local}@{domain}"


def gen_phone() -> str:
    return f"({random.randint(200,999)}) {random.randint(200,999)}-{random.randint(1000,9999)}"


def gen_contact_rows(count_per_office=(35, 45)):
    rows = []
    for code, conf in OFFICES.items():
        n = random.randint(*count_per_office)
        used_names = set()
        for _ in range(n):
            for _ in range(20):
                fn = random.choice(FIRST_NAMES)
                ln = random.choice(LAST_NAMES)
                name = f"{fn} {ln}"
                if name not in used_names:
                    used_names.add(name)
                    break
            account = f"{random.choice(ACCOUNT_PREFIXES)} {random.choice(ACCOUNT_SUFFIXES)}"
            broker_name, ext = random.choice(conf["brokers"])
            broker_phone = f"{conf['phone']} {ext}"

            email = gen_email(fn, ln) if random.random() > 0.2 else None
            phone = gen_phone() if random.random() > 0.4 else None
            status = random.choice(STATUS_POOL)
            tags = random.choice(TAG_POOLS)
            sectors = random.choice(SECTOR_POOLS)
            date_added = random_date()
            last_contact = random_date(2025, 2026) if random.random() > 0.4 else None
            listing = random.choice(conf["streets"]) if random.random() > 0.45 else None
            note = random.choice(NOTE_BANK) if random.random() > 0.5 else None
            is_confidential = random.random() < 0.08

            rows.append(
                {
                    "office_code": code,
                    "contact_name": name,
                    "account_name": account,
                    "broker_name": broker_name,
                    "broker_phone": broker_phone,
                    "contact_email": email,
                    "contact_phone": phone,
                    "relationship_status": status,
                    "tags": tags,
                    "sectors": sectors,
                    "date_added": date_added,
                    "last_contact_date": last_contact,
                    "listing": listing,
                    "note": note,
                    "is_confidential": is_confidential,
                }
            )
    return rows


def gen_deal_rows(count_per_office=(35, 45)):
    rows = []
    for code, conf in OFFICES.items():
        n = random.randint(*count_per_office)
        used_names = set()
        for i in range(n):
            for _ in range(20):
                tag = random.choice(["Portfolio", "Acquisition", "Disposition", "Mixed-Use", "Repositioning", "Capital Raise", "Refi"])
                addr = random.choice(conf["streets"])
                deal_name = f"{addr.split(',')[0]} {tag}"
                if deal_name not in used_names:
                    used_names.add(deal_name)
                    break

            broker_name, _ = random.choice(conf["brokers"])
            stage = random.choice(DEAL_STAGES)
            sub_status = "Won" if stage == "Closed" and random.random() < 0.7 else ("Lost" if stage == "Closed" else None)
            value = random.randint(2, 50) * 500_000
            ptype = random.choice(PROPERTY_TYPES)
            sectors = random.choice(SECTOR_POOLS)

            seller = f"{random.choice(ACCOUNT_PREFIXES)} {random.choice(ACCOUNT_SUFFIXES)}"
            buyer = f"{random.choice(ACCOUNT_PREFIXES)} {random.choice(ACCOUNT_SUFFIXES)}" if random.random() > 0.35 else None
            date_added = random_date()
            notes = random.choice(NOTE_BANK) if random.random() > 0.4 else None
            om = "https://drive.google.com/file/d/example/view" if random.random() > 0.6 else None
            is_confidential = random.random() < 0.08

            rows.append(
                {
                    "office_code": code,
                    "deal_name": deal_name,
                    "property_address": addr,
                    "property_type": ptype,
                    "seller_name": seller,
                    "buyer_name": buyer,
                    "broker_name": broker_name,
                    "stage": stage,
                    "sub_status": sub_status,
                    "deal_value": value,
                    "sectors": sectors,
                    "date_added": date_added,
                    "om_link": om,
                    "notes": notes,
                    "is_confidential": is_confidential,
                }
            )
    return rows


def render_contact_values(rows):
    out = []
    for r in rows:
        out.append(
            "    ("
            + ", ".join(
                [
                    sql_str(r["office_code"]),
                    sql_str(r["contact_name"]),
                    sql_str(r["account_name"]),
                    sql_str(r["broker_name"]),
                    sql_str(r["broker_phone"]),
                    sql_str(r["contact_email"]),
                    sql_str(r["contact_phone"]),
                    sql_str(r["relationship_status"]),
                    sql_array(r["tags"]),
                    sql_array(r["sectors"]),
                    f"'{r['date_added']}'::date",
                    f"'{r['last_contact_date']}'::date" if r["last_contact_date"] else "null",
                    sql_str(r["listing"]),
                    sql_str(r["note"]),
                    "true" if r["is_confidential"] else "false",
                ]
            )
            + ")"
        )
    return ",\n".join(out)


def render_deal_values(rows):
    out = []
    for r in rows:
        out.append(
            "    ("
            + ", ".join(
                [
                    sql_str(r["office_code"]),
                    sql_str(r["deal_name"]),
                    sql_str(r["property_address"]),
                    sql_str(r["property_type"]),
                    sql_str(r["seller_name"]),
                    sql_str(r["buyer_name"]),
                    sql_str(r["broker_name"]),
                    f"'{r['stage']}'::deal_stage",
                    f"'{r['sub_status']}'::deal_sub_status" if r["sub_status"] else "null",
                    str(r["deal_value"]),
                    sql_array(r["sectors"]),
                    f"'{r['date_added']}'::date",
                    sql_str(r["om_link"]),
                    sql_str(r["notes"]),
                    "true" if r["is_confidential"] else "false",
                ]
            )
            + ")"
        )
    return ",\n".join(out)


def main():
    contacts = gen_contact_rows()
    deals = gen_deal_rows()

    canonical = ", ".join(f"'{c}'" for c in OFFICES.keys())

    office_inserts = ",\n".join(
        f"  ('{c}', {sql_str(conf['name'])})" for c, conf in OFFICES.items()
    )

    sql = f"""-- ============================================================
-- BULK DEMO SEED — generated by scripts/generate_seed_data.py
--
-- 1. Drop any office whose code is not in the canonical list of 6.
--    FK cascades remove dependent contacts/deals/etc.
-- 2. Upsert the 6 canonical offices.
-- 3. Insert ~40 contacts and ~40 deals per office.
--    Re-runnable: skips rows that already exist by natural key.
-- ============================================================

-- 1. Remove any non-canonical offices
delete from public.offices where code not in ({canonical});

-- 2. Ensure canonical offices exist
insert into public.offices (code, name) values
{office_inserts}
on conflict (code) do nothing;

-- 3. Bulk contacts
insert into public.contacts (
  office_id,
  contact_name, account_name,
  broker_name_snapshot, broker_phone_snapshot,
  contact_email, contact_phone, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note,
  is_confidential
)
select
  o.id,
  v.contact_name, v.account_name,
  v.broker_name, v.broker_phone,
  v.contact_email, v.contact_phone, v.relationship_status,
  v.tags, v.sectors,
  v.date_added, v.last_contact_date,
  v.listing, v.note,
  v.is_confidential
from (values
{render_contact_values(contacts)}
) as v(
  office_code,
  contact_name, account_name,
  broker_name, broker_phone,
  contact_email, contact_phone, relationship_status,
  tags, sectors,
  date_added, last_contact_date,
  listing, note,
  is_confidential
)
join public.offices o on o.code = v.office_code
where not exists (
  select 1 from public.contacts c
  where c.office_id = o.id
    and c.contact_name = v.contact_name
    and c.account_name = v.account_name
);

-- 4. Bulk deals
insert into public.deals (
  office_id,
  deal_name, property_address, property_type,
  seller_name, buyer_name,
  assigned_broker_name,
  stage, sub_status, deal_value,
  sectors, date_added,
  om_link, notes,
  is_confidential
)
select
  o.id,
  v.deal_name, v.property_address, v.property_type,
  v.seller_name, v.buyer_name,
  v.broker_name,
  v.stage, v.sub_status, v.deal_value,
  v.sectors, v.date_added,
  v.om_link, v.notes,
  v.is_confidential
from (values
{render_deal_values(deals)}
) as v(
  office_code,
  deal_name, property_address, property_type,
  seller_name, buyer_name,
  broker_name,
  stage, sub_status, deal_value,
  sectors, date_added,
  om_link, notes,
  is_confidential
)
join public.offices o on o.code = v.office_code
where not exists (
  select 1 from public.deals d
  where d.deal_name = v.deal_name
);

-- 5. Bump offices.last_updated to the most recent contact for each office
update public.offices o
set last_updated = sub.last
from (
  select office_id, max(date_added) as last
  from public.contacts
  group by office_id
) sub
where sub.office_id = o.id;
"""

    out = Path(__file__).resolve().parent.parent / "supabase" / "seeds" / "large_sample.sql"
    out.write_text(sql)
    print(f"wrote {out}  ({len(contacts)} contacts, {len(deals)} deals)")


if __name__ == "__main__":
    main()
