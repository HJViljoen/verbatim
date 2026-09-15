import { monthName } from '../format'
import { monthStartOf } from '../reading/monthly'

// The calendar line's arithmetic and its copy, with no React in sight
// (Phase 1 WP10, design item 6, decisions L, M, U).
//
// WHY THE GEOMETRY IS ITS OWN MODULE. Every chart in this codebase is
// index-spaced — `x(i) = padL + i·innerW/(n−1)` in `line-chart.tsx:35`,
// `sparkline.tsx:27` and the private one in `profile-stats.tsx:218` — and an
// index-spaced axis SILENTLY CLOSES a hollow month up. Measured on production:
// Ottobock has conversation in 20 of 36 months, the Össur category in 55 of 72,
// Sealand's Freitag in 4 of 68. Drawn by index, a two-year hole and a one-month
// hole look identical and everything after them is misdated. So the axis is
// GENERATED from the calendar (lib/reading/series.ts `monthAxis`), every month
// occupies its own slot whether or not it has a row, and this file is the
// mapping from a month key to an x — which is the one piece of arithmetic that
// makes the difference, and therefore the one piece worth testing without a
// renderer.
//
// FIVE STATES, NOT TWO. A month on this axis is one of five things and only the
// first is a point on a line:
//   read              a reading that clears both floors — a solid point
//   below_floor       the AUDIENCE's denominator is under `SHARE_BAND.minN`;
//                     there is a real number and no comparison
//   below_numerator   the OBJECT's own k is under the numerator floor; the
//                     audience was read, this object was barely in it
//   hollow            no row at all — nothing happened, and nothing is drawn
//   filling           the month is still taking comments and will be rewritten
// The two below-floor states are marks in the GUTTER under the baseline, not
// points on the line, because a number that cannot be compared is not a reading
// and drawing it as one is the lie this whole layer exists to stop.
//
// THE COPY IS HERE TOO. A hover reads "Sealand 31.0% · August 2026 · 26 of 84
// videos", assembled in one place so the chart, its export and the email cannot
// word it three ways — the same reason lib/reading/series.ts owns the caveat
// sentences rather than each surface.

export type CalendarPointState = 'read' | 'below_floor' | 'below_numerator' | 'hollow' | 'filling'

/** One month of one series. `value` is what is plotted — null for every state
 *  but `read` and `filling`, and never coerced to 0, which is a different
 *  fact (`lib/reading/series.ts` MonthPoint carries the same distinction). */
export interface CalendarPoint {
  month: string
  value: number | null
  state: CalendarPointState
  /** The counted sides behind `value`, for the hover. Null where the caller
   *  has a value but no counts (a follower total, an attention index). */
  k?: number | null
  n?: number | null
  /** The same month's reading one month ago, at the same point in the month —
   *  the "at this point last month" tick beside a filling bar. Only ever set
   *  on a `filling` point, and only where the caller actually computed it. */
  atLastMonth?: number | null
  /** An extra clause on the hover, in the caller's words (a `MonthLabel.text`,
   *  usually). Never invented here. */
  note?: string
}

export interface CalendarSeries {
  label: string
  /** CSS colour or literal hex — the entity's, never the rank's. */
  color: string
  /** One entry per axis month, in axis order. A caller that hands a shorter
   *  list is drawing a different axis from the one it asked for, so the
   *  geometry indexes by MONTH and not by position. */
  points: readonly CalendarPoint[]
  /** What this series leaves out, named rather than implied — "excludes
   *  Reddit" on any series whose denominator does. */
  excludes?: string
  /** The denominator printed after the end label ("of 142"). */
  endNote?: string
}

/** A dated break. `kind` picks the token; `affects` is the stored
 *  `config_changes.affects_months` span — the months the change MOVED, which is
 *  rarely the month it was made in (decision U). */
export interface CalendarRule {
  month: string
  label: string
  kind: 'tracking_change' | 'clustering_changed' | 'renamed' | 'reconstructed'
  affects?: readonly string[]
  /** The change's own day, for the tick label ("3 Sep", as the mock draws it).
   *  The RULE is still drawn at the month — decision U: a change draws its rule
   *  at its own month, and the band says what it moved. */
  at?: string
}

/** A stretch of months shaded behind the lines: the back-read at setup, or the
 *  months a change moved. */
export interface CalendarBand {
  months: readonly string[]
  label: string
}

export interface CalendarGeometry {
  /** Left edge of the plot, and the first month's x. */
  padL: number
  /** Right edge of the plot. End labels live beyond it. */
  padR: number
  innerW: number
  /** y of the top of the plot area. */
  top: number
  /** y of the zero line. */
  baseline: number
  /** y of the row of gutter marks under the baseline (below-floor tokens). */
  gutterY: number
  /** y of the month labels. */
  labelY: number
  /** Width of one month's slot — the band and the hover target are sized off
   *  it, so a 6-month axis and a 68-month one both behave. */
  slot: number
  /** x of a month, or null when the month is not on this axis. */
  x(month: string): number | null
  /** x of an axis position. */
  xAt(i: number): number
}

/**
 * The plot box, in the geometry the mock draws (`Subjects.dc.html`: viewBox
 * 880×210, baseline 180, midline 96, gutter token 186, month labels 203).
 *
 * `baseline = height − 30` and `top = 12` reproduce all four of those numbers
 * and reduce to `line-chart.tsx`'s own `y(v) = 12 + (height−30)·(1−frac)` for
 * its 150px box, so the two charts share a vertical rhythm.
 */
export function calendarGeometry(args: {
  axis: readonly string[]
  width?: number
  height?: number
  padL?: number
  padR?: number
}): CalendarGeometry {
  const width = args.width ?? 880
  const height = args.height ?? 210
  const padL = args.padL ?? 56
  const padR = args.padR ?? 180
  const axis = args.axis.map(monthStartOf)
  const innerW = Math.max(0, width - padL - padR)
  const n = axis.length
  const xAt = (i: number): number => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1))
  const index = new Map(axis.map((m, i) => [m, i]))
  const top = 12
  const baseline = height - 30
  return {
    padL,
    padR: width - padR,
    innerW,
    top,
    baseline,
    gutterY: baseline + 6,
    labelY: height - 7,
    slot: n <= 1 ? innerW : innerW / (n - 1),
    xAt,
    x: (month) => {
      const i = index.get(monthStartOf(month))
      return i == null ? null : xAt(i)
    },
  }
}

export interface ValueScale {
  lo: number
  hi: number
  y(v: number): number
  /** The midline's value, printed on the left the way LineChart prints it. */
  mid: number
}

/**
 * The vertical scale over every plotted value in every series.
 *
 * Zero-based by default, like `LineChart` and unlike `Sparkline`: a share that
 * runs 29–31% on a min-based scale looks like a cliff. `hi` takes the same
 * 12% headroom the shipped chart takes, so an end label has somewhere to sit.
 */
export function valueScale(
  series: readonly CalendarSeries[],
  opts: { zeroBase?: boolean; top?: number; baseline?: number } = {},
): ValueScale {
  const top = opts.top ?? 12
  const baseline = opts.baseline ?? 180
  const values: number[] = []
  for (const s of series) for (const p of s.points) if (p.value != null) values.push(p.value)
  for (const s of series) for (const p of s.points) if (p.atLastMonth != null) values.push(p.atLastMonth)
  const zeroBase = opts.zeroBase ?? true
  const lo = zeroBase ? 0 : values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) * 1.12 : 1
  const span = hi - lo || 1
  return { lo, hi, mid: niceMid(lo, hi), y: (v) => baseline - (baseline - top) * ((v - lo) / span) }
}

/**
 * A midline a reader can read.
 *
 * `hi` carries 12% headroom so an end label has somewhere to sit, which makes
 * the arithmetic midpoint an arithmetic accident: a series topping out at 44%
 * puts the midline at 24.64%, and `LineChart` prints exactly that today. The
 * line is drawn AT this value, so the label and the rule still agree — only the
 * number is chosen to be a round one.
 */
export function niceMid(lo: number, hi: number): number {
  const mid = lo + (hi - lo) / 2
  const span = hi - lo
  if (span >= 100) return Math.round(mid / 10) * 10
  if (span >= 20) return Math.round(mid / 5) * 5
  if (span >= 4) return Math.round(mid)
  return Math.round(mid * 10) / 10
}

/**
 * The runs of consecutive plottable points, as index arrays.
 *
 * A GAP IS A GAP. `polyline` draws straight through a missing month, which is
 * the one thing an honest series must not do — `profile-stats.tsx:270-282` is
 * the only code in the repo that already knows this, and it is private to a
 * tile. One run per unbroken stretch; a lone point gets a run of one and is
 * drawn as a dot, because a one-point polyline is invisible.
 */
export function lineSegments(points: readonly CalendarPoint[]): number[][] {
  const runs: number[][] = []
  let held: number[] = []
  points.forEach((p, i) => {
    if (p.value == null) {
      if (held.length) runs.push(held)
      held = []
      return
    }
    held.push(i)
  })
  if (held.length) runs.push(held)
  return runs
}

/** The axis positions a set of months covers, or null when none of them is on
 *  this axis — a change that moved months nobody is looking at draws nothing. */
export function spanOf(axis: readonly string[], months: readonly string[]): { from: number; to: number } | null {
  const index = new Map(axis.map(monthStartOf).map((m, i) => [m, i]))
  const hits = months.map((m) => index.get(monthStartOf(m))).filter((i): i is number => i != null)
  if (!hits.length) return null
  return { from: Math.min(...hits), to: Math.max(...hits) }
}

/**
 * Consecutive months carrying the SAME break collapse into one rule.
 *
 * Block A's binding convention, at the chart: every month frozen before the
 * clustering fingerprint shipped carries no key, and two unknowns are
 * deliberately not one regime, so a five-month back-read yields four "themes
 * were re-grouped" boundaries. Drawn literally that is a dated rule on every
 * bar of the history the trial is sold on. One rule at the first month of the
 * run, with the run as its affected band, says the same thing once.
 *
 * Only identical (kind, label) pairs on ADJACENT axis months collapse — two
 * different changes in two different months stay two rules, which is the point
 * of dating them.
 */
export function collapseRules(axis: readonly string[], rules: readonly CalendarRule[]): CalendarRule[] {
  const order = new Map(axis.map(monthStartOf).map((m, i) => [m, i]))
  const on = rules
    .map((r) => ({ r, i: order.get(monthStartOf(r.month)) }))
    .filter((e): e is { r: CalendarRule; i: number } => e.i != null)
    .sort((a, b) => a.i - b.i || a.r.label.localeCompare(b.r.label))
  const out: CalendarRule[] = []
  let run: { r: CalendarRule; i: number }[] = []
  const flush = () => {
    if (!run.length) return
    const first = run[0].r
    // A LONE RULE KEEPS ITS OWN BAND. `affects_months` is what the change MOVED
    // and is rarely the month it was made in (decision U): folding the rule's
    // own month in stretched a retroactive band forward over every month
    // between — a change made in September that moved April and May shaded all
    // six months and said "affects Apr 2026 to Sep 2026". The union is only
    // defensible for a COLLAPSED run, where the months carrying the break are
    // themselves part of what is being said.
    const months = [...new Set([...run.flatMap((e) => e.r.affects ?? []), ...run.map((e) => axis[e.i])].map(monthStartOf))].sort()
    out.push(run.length === 1 ? first : { ...first, affects: months })
    run = []
  }
  for (const entry of on) {
    const held = run[run.length - 1]
    if (held && held.r.kind === entry.r.kind && held.r.label === entry.r.label && entry.i === held.i + 1) run.push(entry)
    else {
      flush()
      run = [entry]
    }
  }
  flush()
  return out
}

/**
 * Which months get a printed label.
 *
 * Sealand's "since we started" axis is 68 months wide. Printing 68 mono labels
 * under a 644px plot gives ~9px each, which is not a label. The LAST month
 * always keeps its label — it is the one the reader is being told about — and
 * the rest are taken back from it at an even step.
 */
export function axisLabels(axis: readonly string[], maxLabels = 12): number[] {
  const n = axis.length
  if (n === 0) return []
  if (n <= maxLabels) return axis.map((_, i) => i)
  const step = Math.ceil(n / maxLabels)
  const out: number[] = []
  for (let i = n - 1; i >= 0; i -= step) out.push(i)
  return out.reverse()
}

/**
 * What a hover says: the series, the value, the month, and the counts behind it.
 *
 * `k of n videos` is the whole point — item 6 asks for "hover with k/n", and a
 * share without its denominator is a score, which is the one thing this product
 * does not show (lib/calibration.ts, and the copy contract's rule (b)).
 */
export function hoverTitle(
  series: Pick<CalendarSeries, 'label'>,
  point: CalendarPoint,
  format: (v: number) => string = (v) => `${v}`,
): string {
  const [head, ...rest] = hoverLine(series, point, format).split(' · ')
  return [head, monthName(point.month), ...rest].join(' · ')
}

/** The same sentence without its month — one line of a month column, where the
 *  month is the column's own heading and printing it once per series would say
 *  "Aug 2026" three times in one tooltip. */
export function hoverLine(
  series: Pick<CalendarSeries, 'label'>,
  point: CalendarPoint,
  format: (v: number) => string = (v) => `${v}`,
): string {
  const parts: string[] = []
  parts.push(point.value == null ? series.label : `${series.label} ${format(point.value)}`)
  if (point.k != null && point.n != null) parts.push(`${point.k.toLocaleString('en-US')} of ${point.n.toLocaleString('en-US')} videos`)
  else if (point.n != null) parts.push(`${point.n.toLocaleString('en-US')} videos`)
  const state = stateNote(point.state)
  if (state) parts.push(state)
  if (point.note) parts.push(point.note)
  return parts.join(' · ')
}

/** One month's hover target, with every series' point for that month. */
export interface MonthColumn {
  month: string
  entries: readonly { series: CalendarSeries; point: CalendarPoint }[]
}

/**
 * The hover targets: one per MONTH, carrying every line.
 *
 * A COLUMN BELONGS TO THE AXIS, NOT TO A LINE — the same reason a dated rule
 * does. Each series used to lay its own month-wide transparent rect over the
 * plot for every month it had no point in, and SVG has no z-index: the last
 * series painted covered the earlier series' point targets, so on a three-line
 * chart hovering your own August answered with the category's "too few videos
 * this month to read against". One target per month, drawn above everything,
 * cannot be shadowed by another series and answers with all of them at once —
 * which is the question a reader of a multi-line chart is actually asking.
 */
export function monthColumns(axis: readonly string[], series: readonly CalendarSeries[]): MonthColumn[] {
  const indexed = series.map((s) => ({ s, by: new Map(s.points.map((p) => [monthStartOf(p.month), p])) }))
  return axis.map(monthStartOf).map((month) => ({
    month,
    entries: indexed.flatMap(({ s, by }) => {
      const point = by.get(month)
      return point ? [{ series: s, point }] : []
    }),
  }))
}

/** What a month column says: the month, then one line per series, in the order
 *  the lines were handed to the chart. */
export function columnTitle(column: MonthColumn, format: (v: number) => string = (v) => `${v}`): string {
  return [monthName(column.month), ...column.entries.map((e) => hoverLine(e.series, e.point, format))].join('\n')
}

/** The one sentence each non-reading state is allowed, so no surface invents a
 *  second wording. `read` says nothing: a reading explains itself. */
export function stateNote(state: CalendarPointState): string | null {
  switch (state) {
    case 'read':
      return null
    case 'below_floor':
      return 'too few videos this month to read against'
    case 'below_numerator':
      return 'too few of this one to read'
    case 'hollow':
      // "conversations" is the LEGACY unit (lib/calibration.ts) — run-scoped,
      // and listed there as retiring with the pages that print it. This is the
      // newest reading surface in the product and the only place the
      // month-scoped reading is drawn, so it speaks the thirteen words: a
      // hollow month is a month whose audience had no video with comment on it.
      return 'no videos this month'
    case 'filling':
      return 'still filling'
  }
}

/**
 * What the read-back hatch says over a STRETCH of months.
 *
 * `read_back_at_setup` is a per-POINT caveat and its sentence is written for
 * one month — "this month had already closed when we started". Lifted verbatim
 * onto a band it named 61 months of Össur's axis "this month". A band is one
 * shape over a run, so it says how many months it covers and says it in the
 * plural; the per-month sentence stays where it belongs, on the point.
 */
export function backReadBandLabel(count: number): string {
  return count === 1
    ? 'Read back at setup — this month had already closed when we started, so this is what it reads today, ' +
      'not what we would have reported at the time.'
    : `Read back at setup — these ${count.toLocaleString('en-US')} months had already closed when we started, so this is ` +
      'what they read today, not what we would have reported at the time.'
}

/** A stable id for one chart's `<defs>`, so two calendar lines on one page do
 *  not share a hatch pattern. Deterministic (the same chart renders the same id
 *  on the server and in a snapshot test), and hydration-safe for the same
 *  reason `lib/format.ts` hand-rolls its separators. */
export function chartId(parts: readonly string[]): string {
  let h = 2166136261
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    h ^= 0x2f
    h = Math.imul(h, 16777619)
  }
  return `cal${(h >>> 0).toString(36)}`
}

/** The legend a chart draws for itself: one entry per series, plus one for each
 *  gutter token that is actually on the chart. A legend entry for a state
 *  nothing is in is noise. */
export function legendStates(series: readonly CalendarSeries[]): CalendarPointState[] {
  const wanted: CalendarPointState[] = ['below_floor', 'below_numerator', 'filling']
  const present = new Set<CalendarPointState>()
  for (const s of series) for (const p of s.points) present.add(p.state)
  return wanted.filter((state) => present.has(state))
}

/** The gutter token's word, for the legend. */
export const STATE_LABEL: Record<CalendarPointState, string> = {
  read: 'read',
  below_floor: 'below the floor',
  below_numerator: 'too few to read',
  hollow: 'no videos',
  filling: 'still filling',
}

/** The same five states in a table cell, where there is room for two words and
 *  a blank cell is indistinguishable from a rendering failure. An em dash is
 *  the cell's way of saying "nothing was said", which is what a hollow month
 *  is; a below-floor month says "too few", because something WAS said and it
 *  cannot be read. */
export const STATE_SHORT: Record<CalendarPointState, string> = {
  read: '',
  below_floor: 'too few',
  below_numerator: 'too few',
  hollow: '—',
  filling: 'filling',
}
