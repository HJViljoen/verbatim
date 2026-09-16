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

/**
 * Ids per `.in()` filter when ONE ID NAMES MANY ROWS — the month readings, and
 * anything else whose `.in()` column is not a key of the table.
 *
 * The URL cap is not the binding constraint on such a read; the ROW cap is.
 * PostgREST answers at most 1,000 rows a request (server-side `db-max-rows`),
 * so `selectAll` pages a chunk that returns more — and those pages are SERIAL,
 * inside a chunk that was going to be one of several concurrent requests. Ids
 * per chunk should therefore be about 1,000 / rows-per-id, not the URL's 250:
 * `month_theme_readings` is keyed (client_id, month, audience, theme_id), so a
 * twelve-month window over a client, its industry and three rivals is ~60 rows
 * per theme id, and 250 themes is 15,000 rows — fifteen requests in a row where
 * 100 themes is six, and the six can overlap with the next chunk's.
 *
 * A hundred, then: the size these readers were measured at, and the right order
 * of magnitude for a read of a few tens of rows per id. Raising it does not buy
 * fewer round trips on this shape of read — it trades concurrent ones for
 * sequential ones.
 */
export const MULTI_ROW_IN_CHUNK = 100

/**
 * How many chunked reads a loader may have in flight at once.
 *
 * WHY THERE IS A CEILING AT ALL, AND WHY IT IS NOT LOW. In isolation, more
 * concurrency is simply better: 32 concurrent 100-id reads of `comments`
 * against production finish in 382 ms against 6,714 ms one at a time, because
 * the cost here is the round trip and not the query. But a page does not issue
 * one shape of read in isolation — This week issues sixty-odd — and when the
 * burst is wide enough this instance goes into a state where EVERYTHING is slow
 * together: the same page on the same tenant took 5.2 s in one run and 49.5 s
 * in the next, and in the slow run a one-row `videos` read took 12.6 s and a
 * read that returns nothing took 1.9 s. That is not a query getting slower.
 *
 * MEASURED, five runs of This week per setting (Össur · Sealand, 16 September):
 *
 *     4   9.0 · 11.0   7.0 · 7.8          too few: the latency stops overlapping
 *     6   4.5 ·  5.8   4.2 · 11.1
 *    12   4.6 ·  4.6   3.6 ·  4.0         the steadiest
 *    24   3.4 ·  3.9   3.2 · 12.9
 *   none  4.9 ·  4.4   3.6 ·  3.9
 *
 * Twelve, then: enough that a loader's chunks still overlap and the 200-300 ms
 * a round trip costs is still paid in parallel, and a ceiling on the burst
 * rather than a throttle on the page. The tail above 10 s appears at 6, at 24
 * and unbounded alike, so it belongs to the instance and not to this number —
 * which is the honest reading, and the reason not to tune it further.
 *
 * It is a CEILING PER CALL, not a global semaphore. A global one would make one
 * slow section of a page block another, which is the serialisation this package
 * spent its time removing.
 */
export const READ_CONCURRENCY = 12

/**
 * `items.map(fn)` awaited together, with at most `limit` running at once, and
 * the results in the order the items were given.
 *
 * Rejection behaves like `Promise.all`: the first failure is what the caller
 * gets. Workers stop taking new items once one has failed, so a page that is
 * going to fail does not first finish paying for every chunk of the read that
 * failed.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length <= 1 || limit >= items.length) return Promise.all(items.map((item, i) => fn(item, i)))
  const out = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= items.length || failed) return
      try {
        out[i] = await fn(items[i], i)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker))
  return out
}
