import { platformLabel } from '../format'

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
  /** True when the term meets the review rule — pooled, or on any one platform. */
  worthReviewing: boolean
  /** Platforms where the term meets the rule on its own. Pooling across
   *  platforms hides a term that is dead on one and alive on another. */
  reviewPlatforms: string[]
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
    reviewPlatforms: [],
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
 * Every term, worst relevance first.
 *
 * `by` picks the grouping: 'platform-term' keeps a term's platforms apart (the
 * operator CLI, where a term is dropped per platform), 'term' pools them — a
 * client reads terms, not actors, and 45 terms across four platforms would be
 * 180 rows in a settings card.
 *
 * Pooling alone would hide the only thing worth telling a client, though: a
 * term can be dead on Instagram and carry the whole category on YouTube, and
 * the pooled numbers wash that out (Sealand's "freitag" — 182 found and 3 kept
 * on Instagram, healthy everywhere else). So the pooled row keeps its pooled
 * numbers and ALSO inherits the flag from any single platform that meets the
 * rule, with that platform named in the evidence.
 */
export function summariseTerms(rows: KeywordPerfRow[], by: 'term' | 'platform-term' = 'term'): TermSummary[] {
  const insightBearing = insightBearingUpdates(rows)
  // Fold the key: `Ossur` and `ossur` from two eras of one config are one term.
  const termKey = (r: KeywordPerfRow) => r.keyword.trim().toLowerCase()
  const group = (keyOf: (r: KeywordPerfRow) => string): [string, KeywordPerfRow[]][] => {
    const out = new Map<string, KeywordPerfRow[]>()
    for (const r of rows) {
      const k = keyOf(r)
      const g = out.get(k)
      if (g) g.push(r)
      else out.set(k, [r])
    }
    return [...out]
  }

  if (by === 'platform-term') {
    return group((r) => `${r.platform}::${termKey(r)}`)
      .map(([key, g]) => ({ ...termValue(g, insightBearing), key }))
      .sort(byWorstRelevance)
  }

  // Per (term, platform) first, so the pooled row can inherit a flag one
  // platform earned. Same rule, same function — only the grouping differs.
  const perPlatform = new Map<string, TermSummary[]>()
  for (const [, g] of group((r) => `${r.platform}::${termKey(r)}`)) {
    const s = termValue(g, insightBearing)
    const list = perPlatform.get(termKey(g[0]))
    if (list) list.push(s)
    else perPlatform.set(termKey(g[0]), [s])
  }

  return group(termKey)
    .map(([key, g]) => {
      const pooled = { ...termValue(g, insightBearing), key }
      const flagged = (perPlatform.get(key) ?? []).filter((p) => p.worthReviewing)
      if (flagged.length === 0) return pooled
      const lines = flagged.map((p) => {
        const where = platformLabel(p.platforms[0] ?? '')
        return `on ${where} it found ${p.found.toLocaleString('en-US')} posts and kept ${p.kept.toLocaleString('en-US')} (${pct(p.kept, p.found)}%), with no insights`
      })
      return {
        ...pooled,
        worthReviewing: true,
        reviewPlatforms: flagged.map((p) => p.platforms[0] ?? '').filter(Boolean),
        because: pooled.worthReviewing
          ? [...pooled.because, ...lines]
          : [...lines, 'everywhere else it is doing better — this is one platform’s problem, not the term’s'],
      }
    })
    .sort(byWorstRelevance)
}

/** Worst relevance first, then the biggest spender among equals. */
const byWorstRelevance = (a: TermSummary, b: TermSummary) => a.keptRate - b.keptRate || b.found - a.found
