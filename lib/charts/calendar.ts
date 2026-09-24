import { monthName } from '../format'
import { monthStartOf } from '../reading/month-key'

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
  /**
   * Whose words the label is.
   *
   * Most series are named by code — a rival, a kind, an audience — and the
   * label is code's sentence like any other. A THEME'S label is not: it is the
   * `pass_b_theme` slot, which `PROSE_POLICY` marks 'none', so it is never
   * direction-scrubbed at write time and the register carries "Concerns about
   * declining quality". Rule (c) sweeps unmarked markup, so a series drawing a
   * theme says so here — as the PROSE_SLOTS key that wrote the words — and the
   * chart marks the end label, the legend and the hover `data-copy="subject"`
   * with that slot. Omitted means code's words.
   */
  labelSlot?: string
  /**
   * The LEGEND's own wording for this series, where it differs from the label.
   *
   * THE END LABEL AND THE KEY ARE TWO DIFFERENT JOBS. The end label sits inside
   * the plot's right-hand gutter beside the value and its denominator, and it
   * is read alongside three others at 11px — it wants the shortest true name.
   * The key is read once, away from the data, and is where a reader learns that
   * one of these lines is theirs and one is a rival ("Freitag — rival"). Putting
   * the qualified name in both ran the end labels off the 180px gutter and
   * clipped the denominator, which is the one thing on that label that may not
   * be lost. Omitted means the two are the same string.
   */
  legendLabel?: string
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
/** The default gutters, named so the one caller that has to scale them —
 *  `BlockCalendar` on paper — scales the same numbers this computes from. */
export const CAL_PAD_L = 56
export const CAL_PAD_R = 180

/**
 * THE PAPER FACTOR, and the CSS half of it is `--cal-p` in app/globals.css.
 *
 * A brief sheet lays its body out at `--vb-grid-w` and zooms it by `--vb-zoom`
 * (.902), so a chart label aimed at "near 10px on the glass" lands at 9.0px —
 * 6.8pt on a 297mm page, under the 8pt floor `components/print/slide.tsx`
 * names. `--cal-p` multiplies the label sizes inside `.vb-slide-body` by this
 * number; every font-size in a `CalendarLine` is in VIEWBOX UNITS, so the
 * GUTTERS those labels are drawn into are measured in the same units and have
 * to grow by the same factor or the type grows into the sheet's margin — which
 * is what the first attempt photographed, with "The category 41,200" cut off
 * at the right edge of the marketing brief's fourth sheet and the y-axis
 * figure running past the left edge of its column.
 *
 * 1.32 is what the drawing's SMALLEST tier needs — `ts(9)`, the month and date
 * ticks — to reach 10.67px printed. `lib/charts/calendar.test.ts` pins it
 * against the stylesheet, because two halves of one correction written in two
 * languages is exactly the pair that drifts.
 */
export const CAL_PAPER_K = 1.32

export function calendarGeometry(args: {
  axis: readonly string[]
  width?: number
  height?: number
  padL?: number
  padR?: number
}): CalendarGeometry {
  const width = args.width ?? 880
  const height = args.height ?? 210
  const padL = args.padL ?? CAL_PAD_L
  const padR = args.padR ?? CAL_PAD_R
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

/** The last month of a series that carries a plotted value — the point the end
 *  label belongs to, which on today's corpus is usually NOT the last month on
 *  the axis (a tenant's newest month is normally below the floor). */
export function lastReading(points: readonly CalendarPoint[]): CalendarPoint | null {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].value != null) return points[i]
  return null
}

/**
 * End labels, nudged apart.
 *
 * Phase 1's headline chart is you vs one rival vs the category on one axis, and
 * two lines ending within a couple of points put two 11px labels on top of each
 * other. The approved mock hand-spaced its four end labels 13–22px apart; this
 * is that spacing, computed. Nulls (a line with nothing plotted, which has no
 * end label) keep their place in the list.
 *
 * The labels are pushed DOWN in y order until each clears the one above by
 * `gap`, and the whole stack is then lifted if it ran past `max` — so a crowded
 * chart moves every label a little rather than moving the bottom one a lot, and
 * no label leaves the box. The POINTS do not move: only the words do, which is
 * the compromise — a label may sit a few pixels off its own line, and the
 * alternative is two unreadable labels.
 */
export function spreadLabels(
  ys: readonly (number | null)[],
  opts: { gap?: number; min?: number; max?: number } = {},
): (number | null)[] {
  const gap = opts.gap ?? 13
  const min = opts.min ?? 0
  const max = opts.max ?? Number.POSITIVE_INFINITY
  const placed = ys
    .map((y, i) => ({ y, i }))
    .filter((e): e is { y: number; i: number } => e.y != null)
    .sort((a, b) => a.y - b.y)
  let last = -Infinity
  for (const e of placed) {
    e.y = Math.max(e.y, last + gap)
    last = e.y
  }
  const overflow = placed.length ? placed[placed.length - 1].y - max : 0
  if (overflow > 0) {
    const lift = Math.min(overflow, Math.max(0, (placed[0]?.y ?? min) - min))
    for (const e of placed) e.y -= lift
  }
  const out: (number | null)[] = ys.map(() => null)
  for (const e of placed) out[e.i] = e.y
  return out
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
  // A64: the short form. Why a read-back month is today's reading is How to
  // read's ("read at setup").
  return count === 1 ? 'Read at setup' : `${count.toLocaleString('en-US')} months read at setup`
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

/**
 * The months a gutter token actually marks, per state — "(Apr)".
 *
 * WHY THE LEGEND NAMES THEM. "below the floor" in a key tells a reader that
 * SOME month on this axis could not be read and leaves them to find it; the
 * artboard writes "below the floor (Apr)" and the reader knows before they
 * look. Named only while the list is short — past two months the key becomes a
 * list of months instead of a key, and the axis's own hollow marks are then the
 * better answer.
 */
export function legendMonths(
  series: readonly CalendarSeries[],
  state: CalendarPointState,
  max = 2,
): readonly string[] {
  const months = new Set<string>()
  for (const s of series) for (const p of s.points) if (p.state === state) months.add(p.month)
  const sorted = [...months].sort()
  return sorted.length > 0 && sorted.length <= max ? sorted : []
}

/**
 * When a token marks EVERY month the axis draws.
 *
 * `legendMonths` names them while the list is short and goes silent past two,
 * on the reasoning that a list of months is not a key. That leaves the one case
 * where the reader most needs the sentence unsaid: a client whose own audience
 * is under the floor in all six drawn months gets six hollow rings on the 0%
 * rule, a key promising a line, and nothing that says which months the rings
 * are. "every month" is not a list — it is the whole answer in two words.
 */
export function legendEveryMonth(
  series: readonly CalendarSeries[],
  state: CalendarPointState,
  axis: readonly string[],
): boolean {
  if (axis.length === 0) return false
  const months = new Set<string>()
  for (const s of series) for (const p of s.points) if (p.state === state) months.add(p.month)
  return axis.every((m) => months.has(m))
}

/**
 * A series that never reaches the plot, and what the key says instead.
 *
 * WHY THE KEY HAS TO SAY IT. The gutter tokens are spec-correct one month at a
 * time; at 100% coverage the COMPOSITION is not. Sealand carries 84 videos
 * against `SHARE_BAND.minN` 100, so every month of the client's own audience is
 * `below_floor` and the green series renders as evenly spaced hollow rings
 * tangent to the 0% baseline — which reads as a flat series plotted at zero —
 * while the key above still promises "● Sealand — you" as a line. The key is
 * where a reader looks to find out what an ink means, so that is where the
 * chart says this ink draws no line at all.
 *
 * Null for any series with at least one plotted point: a line with a hole in it
 * is still a line, and its holes are the gutter tokens' own business.
 */
export function undrawnNote(series: CalendarSeries): string | null {
  const points = series.points
  if (points.length === 0) return null
  if (points.some((p) => p.value != null)) return null
  const states = new Set(points.map((p) => p.state))
  if (states.size === 1) {
    const only = [...states][0]
    if (only === 'below_floor') return 'no line: every month is below the floor'
    if (only === 'below_numerator') return 'no line: too few to read in every month'
    if (only === 'hollow') return 'no line: no videos in any month'
  }
  return 'no line: no month could be read'
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
