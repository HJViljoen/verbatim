import { SHARE_BAND, type BandOptions } from '../report-bands'
import type { MonthLabel, MonthPoint, MonthSeries } from '../reading/series'
import type { CalendarBand, CalendarPoint, CalendarRule, CalendarSeries } from './calendar'

// The reading layer → the chart (Phase 1 WP10).
//
// WHY THIS IS ONE FILE AND NOT EIGHT. `MonthSeries` (lib/reading/series.ts) is
// what every Block B loader gets back, and `CalendarSeries` is what the chart
// takes. Left to themselves, Overview, Subjects, Voice, Market, Competitive,
// This week and both reports would each write this mapping, and the eight
// copies would disagree about the thing that matters most: WHICH MONTHS ARE
// DRAWN AS READINGS. That decision belongs in one place with the floors it
// depends on beside it.
//
// IT IS A SEPARATE MODULE FROM `calendar.ts` ON PURPOSE. `calendar.ts` is
// imported by `Sparkline`, which is on nearly every page; `reading/series.ts`
// pulls in the change log, the rival stitcher and the clustering boundaries.
// Keeping the adapter apart means a sparkline costs a sparkline.

export type Measure = 'share' | 'videos' | 'comments'

export interface ToCalendarOptions {
  /** The entity's colour — `var(--you)`, `var(--comp)`, `var(--cat)`. */
  color: string
  /** What the reader is shown. Defaults to the series' object label, then its
   *  newest audience key. */
  label?: string
  /** `share` plots k as a percentage of the audience's videos; `videos` and
   *  `comments` plot the audience's own counts. */
  measure?: Measure
  /** The floor a month's OWN k is called `below_numerator` against. `SHARE_BAND`
   *  — ten of the object's own videos — unless a caller has a measured reason.
   *  Null turns the check off, which is what a `videos` or `comments` measure
   *  wants: there is no numerator to be below. */
  floor?: BandOptions | null
  excludes?: string
  endNote?: string
  /** What this series read at this point LAST month, for the still-filling
   *  bar's tick. Nothing here computes it — it is a second window call
   *  (lib/reading/read.ts) and only a loader can make one. */
  atLastMonth?: number | null
}

const measureOf = (point: MonthPoint, measure: Measure): number | null =>
  measure === 'share' ? point.pct : measure === 'videos' ? point.videos : point.comments

/** The caveats a HOVER carries, as opposed to the ones that draw a rule. `thin`
 *  and `split_keys` are about how much to trust THIS month's number, which is
 *  exactly what someone pointing at the point is asking. */
const HOVER_LABELS = new Set<MonthLabel['kind']>(['thin', 'split_keys'])

/**
 * One month series, as a line.
 *
 * THE STATE MAPPING IS THE WHOLE POINT.
 *   missing / not_seeded / hollow  → `hollow`. Three different facts upstream
 *     (the table is not there · this tenant has no rows · nothing was said),
 *     and the chart draws all three the same way because it draws NOTHING for
 *     all three. The difference is not lost — it is in `MonthSeries.substrate`
 *     and the surface prints it in words, where it can be explained.
 *   below_floor                    → `below_floor`, a gutter mark.
 *   frozen / filling with k under the numerator floor → `below_numerator`. A
 *     month whose audience was read but where this object barely appeared has a
 *     real percentage and no comparison; drawing it as a point invites a reader
 *     to compare it. "Still filling" survives in the hover rather than in the
 *     token, because unreadable outranks unfinished.
 *   frozen                         → `read`.
 *   filling                        → `filling`.
 */
export function seriesToCalendar(series: MonthSeries, opts: ToCalendarOptions): CalendarSeries {
  const measure = opts.measure ?? 'share'
  const floor = opts.floor === null ? null : (opts.floor ?? SHARE_BAND)
  const minK = measure === 'share' ? floor?.minK ?? null : null
  const last = series.points[series.points.length - 1]

  const points: CalendarPoint[] = series.points.map((p) => {
    const value = measureOf(p, measure)
    const hover = p.labels.filter((l) => HOVER_LABELS.has(l.kind)).map((l) => l.text)
    const note = hover.length ? hover.join(' ') : undefined

    if (p.state === 'missing' || p.state === 'not_seeded' || p.state === 'hollow') {
      return { month: p.month, value: null, state: 'hollow', k: p.k, n: p.videos, ...(note ? { note } : {}) }
    }
    if (p.state === 'below_floor') {
      return { month: p.month, value: null, state: 'below_floor', k: p.k, n: p.videos, ...(note ? { note } : {}) }
    }
    if (minK != null && p.k != null && p.k < minK) {
      const filling = p.state === 'filling' ? 'Still filling — this month is still taking comments.' : null
      const both = [filling, note].filter(Boolean).join(' ')
      return { month: p.month, value: null, state: 'below_numerator', k: p.k, n: p.videos, ...(both ? { note: both } : {}) }
    }
    const state: CalendarPoint['state'] = p.state === 'filling' ? 'filling' : 'read'
    return {
      month: p.month,
      value,
      state,
      k: p.k,
      n: p.videos,
      ...(state === 'filling' && opts.atLastMonth != null ? { atLastMonth: opts.atLastMonth } : {}),
      ...(note ? { note } : {}),
    }
  })

  return {
    label: opts.label ?? series.objectLabel ?? series.audience,
    color: opts.color,
    points,
    ...(opts.excludes ? { excludes: opts.excludes } : {}),
    ...(opts.endNote ? { endNote: opts.endNote } : last?.videos != null ? { endNote: `of ${last.videos.toLocaleString('en-US')}` } : {}),
  }
}

const RULE_KIND: Partial<Record<MonthLabel['kind'], CalendarRule['kind']>> = {
  clustering_changed: 'clustering_changed',
  tracking_change: 'tracking_change',
  renamed: 'renamed',
}

/**
 * The dated rules a set of series earns, de-duplicated.
 *
 * Several lines on one chart carry the same break — a rename splits every
 * theme's line at the same month, a re-tag moves every audience — and the rule
 * is a property of the AXIS, not of a line. One rule per (month, kind, label),
 * whichever series said it.
 */
export function calendarRulesFor(series: readonly MonthSeries[]): CalendarRule[] {
  const seen = new Map<string, CalendarRule>()
  for (const s of series) {
    for (const p of s.points) {
      for (const label of p.labels) {
        const kind = RULE_KIND[label.kind]
        if (!kind) continue
        const key = `${p.month}|${kind}|${label.text}`
        if (seen.has(key)) continue
        seen.set(key, { month: p.month, kind, label: label.text, ...(label.months ? { affects: label.months } : {}) })
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.month.localeCompare(b.month) || a.label.localeCompare(b.label))
}

/**
 * The months that had already closed when this tenant was set up — one band,
 * not one per month.
 *
 * `read_back_at_setup` is a per-point label carrying one shared sentence, so a
 * six-month back-read would otherwise be six identical caveats. The band says
 * it once, over the stretch it covers.
 */
export function calendarBandsFor(series: readonly MonthSeries[]): CalendarBand[] {
  const months = new Set<string>()
  let label: string | null = null
  for (const s of series) {
    for (const p of s.points) {
      const back = p.labels.find((l) => l.kind === 'read_back_at_setup')
      if (!back) continue
      months.add(p.month)
      label ??= back.text
    }
  }
  if (!months.size || !label) return []
  return [{ months: [...months].sort(), label }]
}
