import { providerLabel } from './transport'

// The provider router (28 Nov 2026): a job's sources in order, the first that
// gives a non-empty answer wins, and every source passed over says why in a
// note. Notes travel back by return value (SearchResult.notes) because
// library code cannot reach the pipeline's noteWarning; the pipeline turns
// them into one housekeeping run warning each (summariseSearchNotes).

export type Attempt<T> = { provider: string; run: () => Promise<T> }

export type RouteKey = 'instagram.search' | 'instagram.comments' | 'reddit.search' | 'reddit.comments'

const reasonOf = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e)
  const line = (m.split('\n')[0] ?? '').trim()
  return line.length > 160 ? `${line.slice(0, 159)}…` : line || 'no reason given'
}

/**
 * Try each attempt in order. A throw is noted and the next one runs; an empty
 * result is remembered, noted, and the next one runs. The first non-empty
 * result wins. With none: the FIRST empty result if any attempt returned one
 * (an honest "nothing found" beats a later failure), otherwise the last error
 * is thrown, exactly as a lone source's failure always was.
 */
export async function firstWorking<T>(
  attempts: Attempt<T>[],
  isEmpty: (r: T) => boolean,
): Promise<{ result: T; provider: string; notes: string[] }> {
  const notes: string[] = []
  let empty: { result: T; provider: string } | null = null
  let lastError: unknown = new Error('no source to try')
  for (let i = 0; i < attempts.length; i++) {
    const { provider, run } = attempts[i]
    const name = providerLabel(provider)
    const next = attempts[i + 1] ? providerLabel(attempts[i + 1].provider) : null
    try {
      const result = await run()
      if (!isEmpty(result)) return { result, provider, notes }
      if (!empty) empty = { result, provider }
      notes.push(next ? `${name} found nothing, so the search also tried ${next}` : `${name} found nothing either`)
    } catch (e) {
      lastError = e
      notes.push(next ? `${name} did not work (${reasonOf(e)}), so the search used ${next}` : `${name} did not work either (${reasonOf(e)})`)
    }
  }
  if (empty) return { ...empty, notes }
  throw lastError
}

/** Each job's sources: the ones it can run today, and its order when the env
 *  names none. A job whose own build has not landed knows Apify alone, so an
 *  env line set early changes nothing. */
const ROUTES: Record<RouteKey, { known: readonly string[]; order: readonly string[] }> = {
  'instagram.search': { known: ['tikhub', 'apify'], order: ['tikhub', 'apify'] },
  'instagram.comments': { known: ['apify'], order: ['apify'] },
  'reddit.search': { known: ['apify'], order: ['apify'] },
  'reddit.comments': { known: ['apify'], order: ['apify'] },
}

/** `instagram.search` → `GATHER_INSTAGRAM_SEARCH_PROVIDERS`. */
export const providerOrderEnv = (key: RouteKey): string => `GATHER_${key.toUpperCase().replace(/\./g, '_')}_PROVIDERS`

/**
 * A job's sources in order, from `GATHER_<KEY>_PROVIDERS` (a comma list, read
 * per call) or the default. Names the job cannot run are dropped; a list left
 * empty falls back to the default, so a typo can never leave a search with no
 * source. Rollback is one line: `GATHER_INSTAGRAM_SEARCH_PROVIDERS=apify`.
 */
export function providerOrder(key: RouteKey): string[] {
  const route = ROUTES[key]
  const raw = process.env[providerOrderEnv(key)] ?? ''
  const named = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
  const usable = named.filter((p) => route.known.includes(p))
  return usable.length ? usable : [...route.order]
}

/**
 * A platform's search notes as run warnings: each distinct note once, with how
 * many of the platform's searches it covers, so sixty searches that all fell
 * back for one reason make one warning, not sixty. Notes never name the
 * keyword for exactly that reason. In first-seen order. PURE.
 */
export function summariseSearchNotes(searches: readonly { notes?: readonly string[] }[]): string[] {
  const counts = new Map<string, number>()
  for (const s of searches) for (const n of new Set(s.notes ?? [])) counts.set(n, (counts.get(n) ?? 0) + 1)
  const total = searches.length
  return [...counts].map(([note, n]) => `${note} (${n} of ${total} searches)`)
}
