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
