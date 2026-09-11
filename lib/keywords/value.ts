/**
 * Search-term value — the rule that says a term is worth a second look.
 *
 * Extracted from scripts/keyword-roi.ts (2026-08-10), which was the only place
 * the rule lived: an operator CLI that printed DROP-CANDIDATE and never touched
 * tracking_configs. The rule is unchanged; it just has two readers now — the
 * script, and the client's own Settings table, where it is a *hint* ("Worth
 * reviewing", with the evidence behind it) and the client decides.
 *
 * Pure: callers supply the rows and decide the grouping. The script groups by
 * (platform, term) — a term can be dead on Instagram and alive on YouTube — and
 * Settings pools by term, because a client reads terms, not actors.
 */

/** The keyword_performance slice this module reads. */
export interface KeywordPerfRow {
  run_id: string
  platform: string
  keyword: string
  bucket: string
  videos_found: number
  gate_survived: number
  eligible_videos: number
  insights_contributed: number | null
}

export interface TermSummary {
  /** Group key — the term, or `platform::term` when grouped per platform. */
  key: string
  keyword: string
  bucket: string
  platforms: string[]
  /** Updates this term ran in. */
  updates: number
  found: number
  /** Survived the relevance gate — "kept" everywhere a client can read it. */
  kept: number
  /** Kept videos that had enough comments to be worth reading. */
  eligible: number
  insights: number
  /** kept / found over every update, 0-1. The number the table shows. */
  keptRate: number
  /** True when the term meets the review rule below. */
  worthReviewing: boolean
  /** Evidence for `worthReviewing`, in client language. Empty when false. */
  because: string[]
}

// The rule (plan 2026-08-10), pooled over updates that produced at least one
// insight ANYWHERE for this client — a gather-only or died-before-analysis
// update would otherwise fake a 0-insight signal and condemn every term in it.
const MIN_UPDATES = 3
const MAX_KEPT_RATE = 0.05
const MIN_FOUND = 100

export const REVIEW_RULE = { MIN_UPDATES, MAX_KEPT_RATE, MIN_FOUND } as const

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

/**
 * The updates whose analysis actually ran — an update is insight-bearing when
 * ANY of its terms contributed an insight. Compute over the client's whole row
 * set, then pass it to `termValue`; a single term's rows cannot tell a dead
 * term from a dead update.
 */
export function insightBearingUpdates(rows: KeywordPerfRow[]): Set<string> {
  const byRun = new Map<string, number>()
  for (const r of rows) byRun.set(r.run_id, (byRun.get(r.run_id) ?? 0) + (r.insights_contributed ?? 0))
  return new Set([...byRun].filter(([, n]) => n > 0).map(([id]) => id))
}

/** Pool one term's rows into the summary a table row (or the CLI) reads. */
export function termValue(rows: KeywordPerfRow[], insightBearing: ReadonlySet<string>): TermSummary {
  const first = rows[0]
  const updates = new Set<string>()
  const platforms = new Set<string>()
  let found = 0, kept = 0, eligible = 0, insights = 0
  // The rule's own denominators: only the insight-bearing updates count.
  const ruleUpdates = new Set<string>()
  let ruleFound = 0, ruleKept = 0

  for (const r of rows) {
    updates.add(r.run_id)
    platforms.add(r.platform)
    found += r.videos_found
    kept += r.gate_survived
    eligible += r.eligible_videos
    insights += r.insights_contributed ?? 0
    if (insightBearing.has(r.run_id)) {
      ruleUpdates.add(r.run_id)
      ruleFound += r.videos_found
      ruleKept += r.gate_survived
    }
  }

  const ruleRate = ruleFound > 0 ? ruleKept / ruleFound : 0
  const worthReviewing =
    ruleUpdates.size >= MIN_UPDATES && ruleFound >= MIN_FOUND && ruleRate < MAX_KEPT_RATE && insights === 0

  // Evidence, not a verdict (MASTER rule 5): the pill is only ever a claim the
  // reader can open. Client language — found / kept / insights / updates.
  const because = worthReviewing
    ? [
        `${ruleKept.toLocaleString('en-US')} of ${ruleFound.toLocaleString('en-US')} posts it found were about your market (${pct(ruleKept, ruleFound)}%)`,
        `nothing it found has turned into an insight yet`,
        `measured over ${ruleUpdates.size} update${ruleUpdates.size === 1 ? '' : 's'}`,
      ]
    : []

  return {
    key: first ? first.keyword : '',
    keyword: first?.keyword ?? '',
    bucket: first?.bucket ?? '',
    platforms: [...platforms],
    updates: updates.size,
    found,
    kept,
    eligible,
    insights,
    keptRate: found > 0 ? kept / found : 0,
    worthReviewing,
    because,
  }
}

/**
 * The rows of the `k` most recently gathered updates. A client's whole history
 * is the right window for the CLI and the wrong one for a page: a term changed
 * three months ago should not still be judged on what it did before the change.
 */
export function recentUpdates<T extends { run_id: string; created_at: string }>(rows: T[], k: number): T[] {
  const newestFirst = [...new Set(
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => r.run_id),
  )].slice(0, k)
  const keep = new Set(newestFirst)
  return rows.filter((r) => keep.has(r.run_id))
}

/**
 * Every term, worst relevance first. `by` picks the grouping: 'term' pools a
 * term across platforms (Settings), 'platform-term' keeps them apart (the CLI,
 * where a term can be dropped on one platform and kept on another).
 */
export function summariseTerms(rows: KeywordPerfRow[], by: 'term' | 'platform-term' = 'term'): TermSummary[] {
  const insightBearing = insightBearingUpdates(rows)
  const groups = new Map<string, KeywordPerfRow[]>()
  for (const r of rows) {
    const key = by === 'term' ? r.keyword : `${r.platform}::${r.keyword}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }
  return [...groups]
    .map(([key, g]) => ({ ...termValue(g, insightBearing), key }))
    .sort((a, b) => a.keptRate - b.keptRate || b.found - a.found)
}
