import { audienceLabel } from '../readiness/types'
import { SHARE_BAND, type BandOptions } from '../report-bands'
import type { MonthLabel, MonthPoint, MonthSeries } from '../reading/series'
import { backReadBandLabel } from './calendar'
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
  /** What follows the end label's value. A `share` line writes its own "of N"
   *  from the end month's denominator when this is absent; a `videos` or
   *  `comments` line writes none, because its n is not that figure's
   *  denominator. */
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

  // THE END LABEL'S DENOMINATOR IS THE END LABEL'S MONTH, not the last month on
  // the axis. The chart draws its label at the last PLOTTED point, so taking
  // `points[last].videos` puts one month's "of N" under another month's
  // percentage — and on today's corpus that is the normal case, because a
  // tenant's last axis month is usually below the floor and carries no point at
  // all (Sealand's own audience ends on 3 videos; Össur's on 19).
  //
  // AND IT IS OFFERED ONLY FOR A SHARE. `n` is the audience's VIDEO count
  // whatever the measure is, so on a `videos` line it is the plotted number
  // itself — production rendered "industry-other 388 of 388" — and on a
  // `comments` line it is a comment count over a video denominator. A share is
  // the only measure whose k/n this is. A caller plotting counts that wants a
  // denominator passes its own `endNote`.
  const end = measure === 'share' ? [...points].reverse().find((p) => p.value != null) : undefined
  return {
    // A CLIENT NEVER SEES A PIPELINE KEY. Callers are expected to pass `label`,
    // and the fallback used to hand `industry-other` and `competitor:Ottobock`
    // straight to an end label and every hover on the line. `audienceLabel` is
    // the one place those keys are turned into words (lib/readiness/types.ts).
    label: opts.label ?? series.objectLabel ?? audienceLabel(series.audience),
    color: opts.color,
    points,
    ...(opts.excludes ? { excludes: opts.excludes } : {}),
    ...(opts.endNote ? { endNote: opts.endNote } : end?.n != null ? { endNote: `of ${end.n.toLocaleString('en-US')}` } : {}),
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
 * it once, over the stretch it covers — IN ITS OWN WORDS, because the point's
 * sentence says "this month" and a band is a run of them (`backReadBandLabel`).
 */
export function calendarBandsFor(series: readonly MonthSeries[]): CalendarBand[] {
  // A BAND BREAKS ON A MONTH WE ACTUALLY READ, NOT ON AN EMPTY ONE. The chart
  // shades a band from its first month to its last (`spanOf` takes min..max),
  // so two separate back-reads in one months[] would hatch everything between
  // them — including months that were read live, which is exactly the claim the
  // hatch is there to deny. A month nobody has a row for is not such a month:
  // nothing was read in it either way, and breaking the run there would litter
  // production's axis with six bands where there is one back-read (Össur's 61
  // back-read months carry 11 hollow months among them; Sealand's 64 carry 6).
  // Two back-reads either side of a month we read live stay two bands — not
  // reachable today, reachable the day a rival is added to a tenant that
  // already has history, which is what the back-read exists for.
  const back = new Set<string>()
  const live = new Set<string>()
  for (const s of series) {
    for (const p of s.points) {
      if (p.labels.some((l) => l.kind === 'read_back_at_setup')) back.add(p.month)
      else if (p.state === 'frozen' || p.state === 'filling' || p.state === 'below_floor') live.add(p.month)
    }
  }
  const runs: string[][] = []
  let run: string[] = []
  // The axis is every month any line carries, in order — not the first line's,
  // which need not be the longest.
  const axis = [...new Set(series.flatMap((s) => s.points.map((p) => p.month)))].sort()
  for (const month of axis) {
    if (back.has(month)) run.push(month)
    else if (live.has(month) && run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs.map((r) => ({ months: r, label: backReadBandLabel(r.length) }))
}
