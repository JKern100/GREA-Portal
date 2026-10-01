/**
 * Fetch every row of a query, not just the first page.
 *
 * Supabase's API silently caps any single request at 1,000 rows (its `max_rows`
 * setting) and does NOT report that anything was cut off. Any query that can
 * legitimately return more than that must page through `.range()`, or it
 * quietly shows only the first thousand rows in sort order.
 *
 * That is exactly how the Network page showed NYC with 6 contacts instead of
 * 51: sorted by name, the cap fell part-way through the alphabet.
 *
 * Callers must include a deterministic ORDER BY (ending in a unique column such
 * as `id`) so pages neither overlap nor skip rows.
 */

const PAGE_SIZE = 1000;
// Safety valve against a runaway loop; 200 pages is 200,000 rows.
const MAX_PAGES = 200;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAll<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
