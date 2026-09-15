import type { ConfigChange } from '../config-log'

/**
 * "Added {date}" on a search term (Phase 1 WP16, design ST2).
 *
 * A term chip should say when it entered the set. `tracking_configs` holds only
 * the current lists and one `updated_at` that is a FLOOR rather than a
 * last-edit date (Össur's reads 18 August while its subreddits carry a probe
 * dated 13 September), so the date has to come from the change log.
 *
 * TWO GRADES OF ANSWER, AND THEY ARE NOT THE SAME ANSWER. A `logged` or
 * `trigger` row is a record: the term appeared in `after` and not in `before`
 * on that date, and we wrote that down at the time. A `reconstructed` row is a
 * label: the reconstruction worked out from what each update searched that the
 * term was already in use by then, which puts an upper bound on when it was
 * added and is not the same claim. The two are kept apart here and printed
 * apart, the way `changeLogBoundary` insists.
 *
 * Pure. The caller reads the log; this reads the log's arrays.
 */

export type TermDateSource = 'recorded' | 'reconstructed'

export interface TermDate {
  /** `YYYY-MM-DD`. */
  on: string
  source: TermDateSource
}

const TERM_FIELDS = new Set([
  'brand_keywords', 'competitor_keywords', 'industry_keywords', 'exclude_terms',
])

const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

const fold = (s: string): string => s.trim().toLowerCase()

/**
 * When each term now in the set first appeared, from the change log.
 *
 * Walks OLDEST FIRST and keeps the first appearance: a term removed and added
 * back is dated by the day it came back, because that is when the series it
 * feeds begins again. A term that appears in no `after` array at all gets no
 * entry, and the chip says "before we kept a record" rather than a date.
 */
export function termDates(changes: readonly ConfigChange[]): Map<string, TermDate> {
  const out = new Map<string, TermDate>()
  const rows = [...changes]
    .filter((c) => c.surface === 'terms' && (c.field === null || TERM_FIELDS.has(c.field)))
    .sort((a, b) => (a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : 0))

  for (const c of rows) {
    const before = new Set(listOf(c.before).map(fold))
    const after = listOf(c.after)
    const source: TermDateSource = c.source === 'reconstructed' ? 'reconstructed' : 'recorded'
    for (const term of after) {
      const key = fold(term)
      if (!key || before.has(key)) continue
      const seen = out.get(key)
      // A recorded date beats a reconstructed one for the same term even when
      // the reconstruction is older: one is a record and the other is an upper
      // bound, and a page that preferred the earlier number would be preferring
      // the weaker claim.
      if (!seen || (seen.source === 'reconstructed' && source === 'recorded')) {
        out.set(key, { on: c.changed_at.slice(0, 10), source })
      }
    }
  }
  return out
}

/** What a chip says. The sentence, not a bare date, because the two sources
 *  are different claims and a client reading a date has no way to tell. */
export function termDateWords(date: TermDate | undefined): string {
  if (!date) return 'in the set before we kept a record'
  return date.source === 'recorded' ? `added ${date.on}` : `in use by ${date.on}, not recorded`
}
