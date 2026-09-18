import { shortDate } from '../format'
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

/**
 * The same sentence at the artboard's scale: "added 6 Apr".
 *
 * A chip is 12px of text carrying a term and its date, and an ISO stamp spends
 * ten characters of it, four of which say nothing a reader of a settings page
 * needs — the year is this year. `shortDate` is the app's own short form and
 * the artboard's.
 *
 * THE SECOND GRADE SURVIVES THE SHORTENING, because it is the part that is not
 * decoration: "in use by 6 Apr, not recorded" is a different claim from "added
 * 6 Apr", and a chip that dropped the difference to fit would be printing the
 * stronger claim for free.
 */
export function termDateShort(date: TermDate | undefined): string {
  if (!date) return 'in the set before we kept a record'
  const on = shortDate(`${date.on}T00:00:00.000Z`)
  return date.source === 'recorded' ? `added ${on}` : `in use by ${on}, not recorded`
}

/**
 * Take a term off a list — by what it SAYS, not by which array it was filed in.
 *
 * The review strip's button removes `TermSummary.keyword`, which is the first
 * `keyword_performance` row's spelling and bucket, while the stored term is
 * whatever the client typed: a term stored as "Ossur" whose performance rows
 * recorded "ossur", or a term that has since moved bucket, matched nothing on
 * an exact comparison and the button reported nothing either — it looked inert
 * when it had worked and when it had not, alike.
 *
 * So the fold is the comparison (the same `fold` the date map uses), and a
 * miss in the named bucket falls through to the list that actually holds the
 * term. `removed` says whether anything moved, so a caller need not diff.
 *
 * Pure.
 */
export function removeTerm<B extends string>(
  terms: Readonly<Record<B, readonly string[]>>,
  /** Where the caller thinks it is. A plain string, so the record's own keys
   *  are what fixes `B` — a literal here would narrow the whole shape to it. */
  bucket: string,
  term: string,
): { terms: Record<B, string[]>; removed: boolean } {
  const want = fold(term)
  const keys = Object.keys(terms) as B[]
  const out = Object.fromEntries(keys.map((k) => [k, [...terms[k]]])) as Record<B, string[]>
  const order: B[] = [...keys.filter((k) => k === bucket), ...keys.filter((k) => k !== bucket)]
  for (const k of order) {
    const i = out[k].findIndex((t) => fold(t) === want)
    if (i >= 0) {
      out[k].splice(i, 1)
      return { terms: out, removed: true }
    }
  }
  return { terms: out, removed: false }
}

/** The terms section's mono meta: "21 terms · brand 4 · competitor 5 ·
 *  category 12 · not this 3". Every count is the length of the list it names,
 *  so the head cannot disagree with the rows under it. */
export function termsMeta(buckets: {
  brand: readonly string[]
  competitor: readonly string[]
  category: readonly string[]
  exclusions: readonly string[]
}): string {
  const total = buckets.brand.length + buckets.competitor.length + buckets.category.length
  const parts = [
    `${total} term${total === 1 ? '' : 's'}`,
    `brand ${buckets.brand.length}`,
    `competitor ${buckets.competitor.length}`,
    `category ${buckets.category.length}`,
  ]
  // The exclusions are not search terms and are not in the total: an exclusion
  // subtracts, and adding it to "21 terms" would say we search for it.
  if (buckets.exclusions.length > 0) parts.push(`not this ${buckets.exclusions.length}`)
  return parts.join(' · ')
}

// ---- The per-term yield, month by month -------------------------------------

/**
 * A term's yield per month — and the month is the UPDATE's, not the comment's.
 *
 * This is the one figure in the product that is honestly run-dated, and it
 * says so wherever it is printed. `keyword_performance` records what a GATHER
 * found: a term that ran on 13 September found what it found that day, and the
 * comments behind those videos are dated by their own clock and belong to
 * whatever months they belong to. So this axis cannot be put beside the monthly
 * reading's, and a page that drew them on one chart would be claiming a term's
 * yield moved in a month when what moved was when we searched.
 *
 * AGENTS.md's rule is that `run_id` / `run_date` are never a period key OUTSIDE
 * a run's own bookkeeping. A gather is a run's own bookkeeping; this is the
 * record of what each gather brought back.
 */
export interface TermMonth {
  month: string
  found: number
  kept: number
  /** kept / found, 0-100, one decimal. */
  keptPct: number
}

export interface TermYield {
  keyword: string
  months: TermMonth[]
  found: number
  kept: number
  keptPct: number
}

export interface KeywordRunRow {
  keyword: string
  videos_found: number
  gate_survived: number
  created_at: string
}

export function termYieldByMonth(rows: readonly KeywordRunRow[]): TermYield[] {
  const byTerm = new Map<string, Map<string, { found: number; kept: number }>>()
  for (const r of rows) {
    const keyword = (r.keyword ?? '').trim()
    if (!keyword) continue
    const month = r.created_at.slice(0, 7)
    const months = byTerm.get(keyword) ?? new Map()
    const cell = months.get(month) ?? { found: 0, kept: 0 }
    cell.found += r.videos_found ?? 0
    cell.kept += r.gate_survived ?? 0
    months.set(month, cell)
    byTerm.set(keyword, months)
  }
  const pct = (k: number, n: number) => (n > 0 ? Math.round((k / n) * 1000) / 10 : 0)
  return [...byTerm.entries()]
    .map(([keyword, months]) => {
      const list = [...months.entries()]
        .map(([month, v]) => ({ month, ...v, keptPct: pct(v.kept, v.found) }))
        .sort((a, b) => (a.month < b.month ? -1 : 1))
      const found = list.reduce((n, m) => n + m.found, 0)
      const kept = list.reduce((n, m) => n + m.kept, 0)
      return { keyword, months: list, found, kept, keptPct: pct(kept, found) }
    })
    .sort((a, b) => b.found - a.found || a.keyword.localeCompare(b.keyword))
}

/** The sentence that has to sit beside every one of those numbers. */
export const TERM_YIELD_BASIS =
  'Dated by the update that searched, not by when the comments were written — this is what each search brought back, and it is the only figure here on that clock.'
