/**
 * USPS state-name → 2-letter code map. Accepts either form (full name like
 * "California" or the existing 2-letter code like "CA"). Returns the
 * canonical 2-letter code, or null if the input doesn't match a US state.
 *
 * Non-US values (e.g. "British Columbia") return null and the caller can
 * leave the state column as-is plus set country accordingly.
 */
const NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  // Territories
  "puerto rico": "PR",
  "u.s. virgin islands": "VI",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP"
};

const CODE_SET = new Set(Object.values(NAME_TO_CODE));

export function normaliseUsState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;

  // Already a valid 2-letter US code?
  if (t.length === 2) {
    const upper = t.toUpperCase();
    return CODE_SET.has(upper) ? upper : null;
  }

  return NAME_TO_CODE[t.toLowerCase()] ?? null;
}

const CANADIAN_PROVINCES = new Set([
  "alberta",
  "british columbia",
  "manitoba",
  "new brunswick",
  "newfoundland and labrador",
  "nova scotia",
  "ontario",
  "prince edward island",
  "quebec",
  "saskatchewan",
  "northwest territories",
  "nunavut",
  "yukon"
]);

const CA_POSTAL_RE = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;

/**
 * Best-effort country guess from state + zip when the import file doesn't
 * include a country column. Defaults to "US" so the bulk of rows behave.
 */
export function guessCountry(state: string | null, zip: string | null): string {
  if (state && CANADIAN_PROVINCES.has(state.trim().toLowerCase())) return "CA";
  if (zip && CA_POSTAL_RE.test(zip.trim())) return "CA";
  return "US";
}
