/** Split `items` into consecutive runs of at most `size`, order preserved.
 *
 *  The repo chunks constantly and for two unrelated reasons: PostgREST's URL
 *  cap (a ~500-uuid `.in()` filter overflows it — the lesson behind every
 *  chunked read here) and a vendor's own list cap (YouTube takes 50 ids,
 *  OpenAI's embed endpoint takes 2048 inputs). This states the split; every
 *  caller keeps its own size and its own sequential/parallel choice, because
 *  those are the decisions and this is the boilerplate. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunk: size must be a positive integer, got ${size}`)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Ids per `.in()` filter for a 36-character uuid — the size a chunked READ
 * should use unless it has a reason of its own.
 *
 * MEASURED, NOT GUESSED (16 September 2026, against production). A `.in('id',
 * n)` read of `comments` succeeds at 100, 150, 200, 250, 300, 400 and 500 ids
 * and fails "Bad Request" at 700 and 1000 — so the cap is between ~18.6 KB and
 * ~26 KB of query string, not the 8 KiB the chunked readers were sized for.
 * 250 uuids is ~9.3 KB: half of the largest size proven to work, which is the
 * same margin 120 was chosen for against the smaller number.
 *
 * WHY IT MATTERS ENOUGH TO STATE. On this instance a round trip costs
 * 180–800 ms whatever it carries, and a page that chunks 3,600 ids at 100 puts
 * 36 requests in flight at once: This week's cited-comment read took 130 s of
 * summed wait for 452 rows. The cost is the number of statements, so the chunk
 * size is a performance constant, and a reader that halves the requests halves
 * the wait.
 *
 * NOT FOR A NON-UNIQUE KEY WITHOUT THINKING. Rows per id are unbounded when the
 * column is not unique (`insight_evidence.audience_insight_id` reaches 104),
 * and a chunk past 1,000 rows pages SERIALLY inside itself — so a bigger chunk
 * can trade concurrent requests for sequential ones. Use it where an id names
 * at most a handful of rows, and say so where you don't.
 */
export const UUID_IN_CHUNK = 250

/** The same, for a sha-256 hex hash (64 characters + the separator): 150 × 66
 *  bytes ≈ 9.9 KB, the same margin under the same measured cap. */
export const HASH_IN_CHUNK = 150
