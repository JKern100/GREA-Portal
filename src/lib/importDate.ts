/**
 * Parse a date cell from an uploaded CSV into a normalized `YYYY-MM-DD` string
 * (the shape the contacts/deals `date` columns store).
 *
 * Why this exists: when Excel or Google Sheets saves a CSV it rewrites date
 * cells into the user's locale format (commonly `M/D/YYYY`), so an importer
 * that only accepts strict ISO rejects perfectly good dates. We accept the
 * common shapes and normalize. Numeric slash/dash dates are read **month-first
 * (US)** because the GREA offices are US-based; that ambiguity (is `3/4` Mar 4
 * or Apr 3?) can't be resolved from the value alone, so we commit to one
 * convention and document it.
 *
 * Accepted, e.g.:
 *   2025-11-01            ISO (preferred)
 *   2025/11/1
 *   11/1/2025  11/01/2025 (US month/day/year)
 *   11-1-2025
 *   Nov 1, 2025  November 1 2025
 *   1-Nov-2025   1 Nov 2025
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12
};

/** Build a YYYY-MM-DD string, or null if the components aren't a real date. */
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject overflow like 2025-02-30 (which Date would roll forward).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Expand a 2-digit year to 20xx (Excel commonly emits these). */
function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

export function parseImportDate(input: unknown): { value?: string; error?: string } {
  const s = input == null ? "" : String(input).trim();
  if (!s) return {};

  let m: RegExpExecArray | null;

  // ISO / year-first numeric: 2025-11-01, 2025/11/1
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s))) {
    const r = iso(+m[1], +m[2], +m[3]);
    return r ? { value: r } : { error: `"${s}" is not a valid date.` };
  }

  // US month-first numeric: 11/1/2025, 11-01-25
  if ((m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s))) {
    const r = iso(fullYear(+m[3]), +m[1], +m[2]);
    return r
      ? { value: r }
      : { error: `"${s}" is not a valid date (read as month/day/year).` };
  }

  // Month name first: "Nov 1, 2025", "November 1 2025"
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      const r = iso(+m[3], mo, +m[2]);
      if (r) return { value: r };
    }
  }

  // Day-month-name-year: "1-Nov-2025", "1 Nov 2025"
  if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s](\d{2,4})$/.exec(s))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) {
      const r = iso(fullYear(+m[3]), mo, +m[1]);
      if (r) return { value: r };
    }
  }

  return {
    error: `"${s}" isn't a recognized date — use YYYY-MM-DD (e.g. 2025-11-01) or M/D/YYYY.`
  };
}
