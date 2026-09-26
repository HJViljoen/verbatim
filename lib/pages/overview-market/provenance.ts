import type { ConfigChange } from '../../config-log'
import { subredditKey } from '../../gather/subreddits'
import { activeCommunities } from '../../reading/comparability'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import { isExclusions } from '../../settings/what-we-changed'

// The lead theme's "{x} of its {n} videos came from searches we added in
// September" (market-first WP1.6; the hero rule in the WP, `MarketTheme.
// provenance`).
//
// FOUND ONLY BY SEARCHES ADDED IN THE MONTH. A video counts when every search
// that first found it (`video_provenance.first_terms` and `first_subreddits`,
// MF1) is one we added in the reading month. A video first found by an older
// search as well does not count, nor does one with no provenance row. The
// terms added in the month come off the change log's `terms` rows dated in it
// (`after` minus `before`), leaving out the exclusions list, which is not a
// search (`isExclusions`, as Settings › What we changed counts them); the
// communities off its `subreddits` rows (the active set after, minus the
// active set before).
//
// PURE. Null where there is nothing to measure against (no provenance rows:
// MF1 not applied), never a zero.

const fold = (s: string): string => s.trim().toLowerCase()

const listOf = (side: unknown): string[] =>
  Array.isArray(side) ? side.filter((v): v is string => typeof v === 'string').map(fold) : typeof side === 'string' && side.trim() ? [fold(side)] : []

/** The searches added in `month`, from the change log. */
export function searchesAddedIn(month: string, rows: readonly (Pick<ConfigChange, 'surface' | 'changed_at' | 'before' | 'after'> & Partial<Pick<ConfigChange, 'field'>>)[]): { terms: Set<string>; subreddits: Set<string> } {
  const from = monthStartOf(month)
  const to = nextMonth(from)
  const terms = new Set<string>()
  const subreddits = new Set<string>()
  for (const r of rows) {
    const day = (r.changed_at ?? '').slice(0, 10)
    if (!(day >= from && day < to)) continue
    if (r.surface === 'terms' && !isExclusions({ field: r.field ?? null })) {
      const before = new Set(listOf(r.before))
      for (const t of listOf(r.after)) if (!before.has(t)) terms.add(t)
    } else if (r.surface === 'subreddits') {
      const before = activeCommunities(r.before) ?? new Set<string>()
      for (const s of activeCommunities(r.after) ?? []) if (!before.has(s)) subreddits.add(s)
    }
  }
  return { terms, subreddits }
}

/** How many of `videoIds` were found only by searches added in the month. */
export function fromNewSearches(
  videoIds: readonly string[],
  provenance: readonly { video_id: string; first_terms: readonly string[] | null; first_subreddits: readonly string[] | null }[],
  added: { terms: ReadonlySet<string>; subreddits: ReadonlySet<string> },
): { fromNewSearches: number; of: number } | null {
  if (videoIds.length === 0 || provenance.length === 0) return null
  const byVideo = new Map(provenance.map((p) => [p.video_id, p]))
  let count = 0
  for (const id of new Set(videoIds)) {
    const p = byVideo.get(id)
    if (!p) continue
    const terms = (p.first_terms ?? []).map(fold).filter(Boolean)
    const subs = (p.first_subreddits ?? []).map((s) => subredditKey(s) || fold(s)).filter(Boolean)
    if (terms.length + subs.length === 0) continue
    if (terms.every((t) => added.terms.has(t)) && subs.every((s) => added.subreddits.has(s))) count += 1
  }
  return { fromNewSearches: count, of: new Set(videoIds).size }
}
