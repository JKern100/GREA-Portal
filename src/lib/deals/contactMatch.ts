/**
 * Deal ↔ contact association, derived at read time.
 *
 * PREPARED, NOT YET WIRED IN. Nothing imports this module. See
 * docs/SPECS_DEAL_NOTES_AND_CONTACT_LINK.md, Part C. Do not connect it to any
 * page until that project is approved.
 *
 * Nothing is stored: associations are recomputed from whatever is currently
 * loaded, so they survive every upload with no matching step for offices.
 *
 * A contact is associated with a deal when, after normalisation, one of:
 *   - the deal's seller or buyer equals the contact's company   ("company")
 *   - the deal's seller or buyer equals the contact's name      ("person")
 *   - the contact's Listing equals the deal's name or address   ("listing")
 *
 * Exact match only, on purpose. A false "known contact" badge on a deal is
 * worse than a missed one.
 */

import { normKeyPart } from "./dealKey";

export interface MatchableContact {
  id: string;
  office_id: string;
  contact_name: string;
  account_name: string;
  listing: string | null;
  is_confidential: boolean;
}

export interface MatchableDeal {
  deal_name: string;
  property_address: string | null;
  seller_name: string | null;
  buyer_name: string | null;
}

export type MatchSignal =
  | "seller_company"
  | "buyer_company"
  | "seller_person"
  | "buyer_person"
  | "listing";

export interface DealContactMatch<C extends MatchableContact = MatchableContact> {
  contact: C;
  signals: MatchSignal[];
}

export interface Viewer {
  officeId: string | null;
  isSuperadmin: boolean;
}

/**
 * Values that mean "nothing here". Without this list every deal whose seller
 * is "Individual" would match every contact filed under "Individual" — PHL
 * uses exactly that for contacts with no company.
 */
const PLACEHOLDERS = new Set(
  [
    "individual",
    "individuals",
    "no value",
    "none",
    "n/a",
    "na",
    "tbd",
    "tba",
    "unknown",
    "private",
    "private owner",
    "private seller",
    "private buyer",
    "confidential",
    "undisclosed",
    "owner",
    "seller",
    "buyer",
    "various",
    "multiple",
    "other"
  ].map((s) => normKeyPart(s))
);

const MIN_LENGTH = 3;

/** Normalised form usable for matching, or null if it carries no identity. */
export function matchable(value: string | null | undefined): string | null {
  const n = normKeyPart(value);
  if (n.length < MIN_LENGTH) return null;
  if (PLACEHOLDERS.has(n)) return null;
  return n;
}

export interface ContactIndex<C extends MatchableContact = MatchableContact> {
  byCompany: Map<string, C[]>;
  byPerson: Map<string, C[]>;
  byListing: Map<string, C[]>;
}

function push<C>(map: Map<string, C[]>, key: string | null, c: C) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(c);
  else map.set(key, [c]);
}

/** Build once per page load; every deal lookup is then constant time. */
export function buildContactIndex<C extends MatchableContact>(contacts: C[]): ContactIndex<C> {
  const index: ContactIndex<C> = { byCompany: new Map(), byPerson: new Map(), byListing: new Map() };
  for (const c of contacts) {
    push(index.byCompany, matchable(c.account_name), c);
    push(index.byPerson, matchable(c.contact_name), c);
    push(index.byListing, matchable(c.listing), c);
  }
  return index;
}

/**
 * Contacts associated with one deal, de-duplicated, each with every signal
 * that matched.
 *
 * `viewer` is a second line of defence, not the primary control: the database
 * already hides other offices' confidential contacts. Filtering again here
 * means a caller that loaded contacts some other way cannot leak one.
 */
export function matchDealContacts<C extends MatchableContact>(
  deal: MatchableDeal,
  index: ContactIndex<C>,
  viewer?: Viewer
): DealContactMatch<C>[] {
  const found = new Map<string, DealContactMatch<C>>();

  const add = (list: C[] | undefined, signal: MatchSignal) => {
    for (const c of list ?? []) {
      if (viewer && c.is_confidential && !viewer.isSuperadmin && c.office_id !== viewer.officeId) continue;
      const existing = found.get(c.id);
      if (existing) {
        if (!existing.signals.includes(signal)) existing.signals.push(signal);
      } else {
        found.set(c.id, { contact: c, signals: [signal] });
      }
    }
  };

  const seller = matchable(deal.seller_name);
  const buyer = matchable(deal.buyer_name);
  if (seller) {
    add(index.byCompany.get(seller), "seller_company");
    add(index.byPerson.get(seller), "seller_person");
  }
  if (buyer) {
    add(index.byCompany.get(buyer), "buyer_company");
    add(index.byPerson.get(buyer), "buyer_person");
  }

  const name = matchable(deal.deal_name);
  const address = matchable(deal.property_address);
  if (name) add(index.byListing.get(name), "listing");
  if (address && address !== name) add(index.byListing.get(address), "listing");

  return [...found.values()];
}

/** True when a set of deals carries no seller or buyer at all. */
export function lacksParties(deals: MatchableDeal[]): boolean {
  return deals.length > 0 && deals.every((d) => !matchable(d.seller_name) && !matchable(d.buyer_name));
}
