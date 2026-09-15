import { monthStartOf } from './monthly'
import type { DenominatorReading } from './types'

// How much history clears the floor — the shaping half of the coverage
// measurement (Phase 0 WP4, design item 37).
//
// The reading itself is two SQL functions; everything here is arithmetic over
// their rows, and it lives in lib/ rather than in scripts/coverage-report.ts
// because a rule that decides whether a month counts is not a print statement.

/** The name of the pooled denominator every pre-registered anomaly object is a
 *  share of: every audience together. Stated once, because a numerator and its
 *  denominator that disagree about their population is the bug this whole
 *  measurement exists to avoid. */
export const SLICE = 'every audience together'

/** One month's two counts, for whichever population the caller is shaping. */
export interface MonthCounts {
  /** First day of the month, or any instant inside it. */
  month: string
  videos: number
  comments: number
}

export interface MonthlyCoverage {
  audience: string
  monthsWithAny: number
  monthsVideos: number
  monthsComments: number
  /** `YYYY-MM`, or null for an audience with no month at all. */
  firstMonth: string | null
  lastMonth: string | null
  biggestVideos: number
  biggestComments: number
}

/** One audience's row: how many of its months clear the floor in each unit, and
 *  the span they cover. An audience with no month at all is a legitimate row —
 *  see `coverage` — so every field here survives an empty list. */
export function shapeCoverage(audience: string, months: readonly MonthCounts[], floor: number): MonthlyCoverage {
  const ordered = months.map((m) => monthStartOf(m.month)).sort()
  return {
    audience,
    monthsWithAny: months.length,
    monthsVideos: months.filter((m) => m.videos >= floor).length,
    monthsComments: months.filter((m) => m.comments >= floor).length,
    firstMonth: ordered[0]?.slice(0, 7) ?? null,
    lastMonth: ordered.at(-1)?.slice(0, 7) ?? null,
    biggestVideos: months.length > 0 ? Math.max(...months.map((m) => m.videos)) : 0,
    biggestComments: months.length > 0 ? Math.max(...months.map((m) => m.comments)) : 0,
  }
}

/**
 * The pooled slice — every audience together — as its own month series.
 *
 * Summing is the distinct count here and not an approximation of it: a video
 * sits in exactly one audience (`client`, `competitor:<name>` or
 * `industry-other` — the three-way precedence is exclusive) and a comment hangs
 * off exactly one video, so no video and no comment is counted twice. Verified
 * read-only against both tenants: the summed rows and a pooled COUNT(DISTINCT)
 * agree to the digit.
 */
export function sliceMonths(rows: readonly DenominatorReading[]): Map<string, { videos: number; comments: number }> {
  const out = new Map<string, { videos: number; comments: number }>()
  for (const r of rows) {
    const month = monthStartOf(r.month)
    const prev = out.get(month) ?? { videos: 0, comments: 0 }
    out.set(month, { videos: prev.videos + r.videos, comments: prev.comments + r.comments })
  }
  return out
}

/** Videos and comments per audience over a set of denominator rows, months
 *  summed — the same pooling as `sliceMonths`, grouped the other way. */
export function perAudience(rows: readonly DenominatorReading[]): Map<string, { videos: number; comments: number }> {
  const out = new Map<string, { videos: number; comments: number }>()
  for (const r of rows) {
    const prev = out.get(r.audience) ?? { videos: 0, comments: 0 }
    out.set(r.audience, { videos: prev.videos + r.videos, comments: prev.comments + r.comments })
  }
  return out
}

/**
 * How many months clear each floor, per audience.
 *
 * Three kinds of row, and the last two are why this is not a group-by:
 *  - one per audience that has any month at all;
 *  - one per tracked rival that has NONE, because "nobody posted about them in
 *    any month" is an answer — the readiness page prints it — and an audience
 *    that silently vanishes from a coverage table reads as an oversight;
 *  - the pooled slice last: it is the denominator the anomaly check actually
 *    uses, so it belongs in the same table as the audiences it pools.
 *
 * Audiences sort by their literal bucket string, which puts `client` first,
 * then the rivals alphabetically, then `industry-other` — and the slice after
 * all of them, where a total belongs.
 */
export function coverage(
  rows: readonly DenominatorReading[],
  floor: number,
  trackedAudiences: readonly string[] = [],
): MonthlyCoverage[] {
  const byAudience = new Map<string, MonthCounts[]>()
  for (const audience of trackedAudiences) byAudience.set(audience, [])
  for (const r of rows) {
    byAudience.set(r.audience, [...(byAudience.get(r.audience) ?? []), { month: r.month, videos: r.videos, comments: r.comments }])
  }
  const perAudienceRows = [...byAudience.entries()]
    .map(([audience, months]) => shapeCoverage(audience, months, floor))
    .sort((a, b) => a.audience.localeCompare(b.audience))
  const pooled = [...sliceMonths(rows).entries()].map(([month, counts]) => ({ month, ...counts }))
  return [...perAudienceRows, shapeCoverage(SLICE, pooled, floor)]
}
