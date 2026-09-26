import { fmtInt, longMonth } from '../format'
import type { PendingWeekLine } from '../reading/week-line'
import { addDays, isoWeekOf, msOfInstant, weekRuleGroupOf, WEEK_RULE_GROUPS, type WeekRule, type WeekRuleGroup, type WeekVolume } from '../reading/weeks'

// The weekly volume bars' arithmetic and their words, with no React in sight
// (market-first decision M, part 1; WP2.9 "Design"). The SVG for app and
// print and the email table (components/charts/week-bars.tsx) draw from this;
// the geometry is the part worth testing without a renderer, as
// lib/charts/calendar.ts is for the month line.
//
// THE DESIGN, IN NUMBERS (WP2.9):
//   - one column per ISO week on the axis; bars 56% of their slot, square-ended,
//     on a hairline baseline; no gridlines and no y axis;
//   - two rows as small multiples: videos (64 px) then comments (40 px, its own
//     scale), 20 px apart; every videos bar carries its count above it, the
//     comments row only its largest;
//   - the current week ("so far") and an ended week with under two updates
//     since ("filling") are the same ink at 40%, with the word under the bar,
//     so the state never rests on colour alone;
//   - a week with no dated comment draws no bar and keeps its slot, and one
//     label spans a run of them: "none gathered";
//   - our changes: a dashed vertical at the change's own day inside its week,
//     with the day as a 9 px tick label, staggered when two would touch; one
//     key line under the chart names them (a chart key, not a note);
//   - week labels are the Monday's day in 10 px mono, thinned to every other
//     week under 480 px of plot (always keeping the latest), with the month
//     on a second line under the first week that starts in each month.
//
// COUNTS ONLY. No share, no percentage, no arrow and no direction or movement
// word is produced here, in the chart, the hover, the key, the aria-label or
// the email table (tested). The method sentences (the counts follow our
// searches as much as the market; a video in two weeks counts in both) are
// How to read's "Week by week" card, never a line under the chart.

export const WEEK_BARS = {
  videosH: 64,
  commentsH: 40,
  rowGap: 20,
  barFrac: 0.56,
  /** Room above the tallest videos bar for its count. */
  countRoom: 14,
  /** Height of one row of rule tick labels. */
  ruleRow: 12,
  /** Two tick labels closer than this go on different rows. */
  ruleLabelGap: 34,
  /** Under this many px of plot, week labels thin to every other week. */
  thinBelow: 480,
  /** Under this page width the strip scrolls sideways (the renderer's). */
  scrollBelow: 640,
  labelPx: 10,
  tickPx: 9,
  /** The left column that holds the row names ("Videos", "Comments"). */
  padL: 96,
  padR: 0,
  /** The 40% ink of a week still being read. */
  dimOpacity: 0.4,
} as const

export interface WeekColumn {
  week: string
  /** The slot's left edge and its centre. */
  x: number
  cx: number
  state: WeekVolume['state']
  /** Drawn at `WEEK_BARS.dimOpacity`: so far, or filling. */
  dim: boolean
  /** The word under the bar, or null. */
  stateWord: 'so far' | 'filling' | null
  videos: { y: number; h: number; label: string; labelY: number } | null
  comments: { y: number; h: number; label: string | null; labelY: number } | null
  /** The Monday's day ("7"), or null where thinned. */
  dayLabel: string | null
  /** The month ("Sep") under the first week that starts in it, or null. */
  monthLabel: string | null
  hover: string
}

export interface WeekRuleTick {
  date: string
  x: number
  /** 0 is the top row of tick labels. */
  row: number
  label: string
  labelY: number
  groups: WeekRuleGroup[]
}

export interface WeekBarsGeometry {
  width: number
  height: number
  padL: number
  plotW: number
  slot: number
  barW: number
  videos: { top: number; baseline: number }
  comments: { top: number; baseline: number }
  axis: { dayY: number; monthY: number; stateY: number }
  columns: WeekColumn[]
  /** Runs of weeks with nothing gathered, one label each. */
  gaps: { from: string; to: string; cx: number; label: string }[]
  rules: WeekRuleTick[]
  /** Hover targets: one per column, the whole height. */
  targets: { week: string; x: number; y: number; w: number; h: number }[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const r1 = (n: number): number => Math.round(n * 10) / 10

const dayMonth = (day: string): { d: number; m: string; mi: number } => {
  const t = new Date(msOfInstant(day))
  return { d: t.getUTCDate(), m: MONTHS[t.getUTCMonth()], mi: t.getUTCMonth() }
}

/** "7 Sep": a week, by its Monday. */
export const weekName = (week: string): string => {
  const { d, m } = dayMonth(isoWeekOf(week))
  return `${d} ${m}`
}

/** A median as it prints: "10", "9.5". */
const fmtMedian = (n: number): string => (Number.isInteger(n) ? fmtInt(n) : String(r1(n)))

/**
 * The chart's geometry for these weeks (in axis order) and our changes.
 * `width` is the inner block's width; the row names sit in `padL`.
 */
export function weekBarsGeometry(
  weeks: readonly WeekVolume[],
  rules: readonly WeekRule[],
  opts: { width: number; padL?: number; padR?: number },
): WeekBarsGeometry {
  const B = WEEK_BARS
  const padL = opts.padL ?? B.padL
  const padR = opts.padR ?? B.padR
  const n = Math.max(1, weeks.length)
  const plotW = Math.max(0, opts.width - padL - padR)
  const slot = plotW / n
  const barW = r1(slot * B.barFrac)
  const index = new Map(weeks.map((w, i) => [isoWeekOf(w.week), i]))

  // Rule ticks first: their label rows set the top of the plot.
  const byDay = new Map<string, { date: string; groups: Set<WeekRuleGroup>; x: number }>()
  for (const r of rules) {
    const i = index.get(isoWeekOf(r.week))
    const g = weekRuleGroupOf(r.surface)
    if (i == null || !g) continue
    const dayIndex = Math.round((msOfInstant(r.date) - msOfInstant(isoWeekOf(r.week))) / 86_400_000)
    const x = r1(padL + i * slot + ((Math.min(Math.max(dayIndex, 0), 6) + 0.5) / 7) * slot)
    const held = byDay.get(r.date) ?? { date: r.date, groups: new Set<WeekRuleGroup>(), x }
    held.groups.add(g)
    byDay.set(r.date, held)
  }
  const ticks = [...byDay.values()].sort((a, b) => a.x - b.x || (a.date < b.date ? -1 : 1))
  const rowEnds: number[] = []
  const placed = ticks.map((t) => {
    let row = rowEnds.findIndex((end) => t.x - end >= B.ruleLabelGap)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(t.x)
    } else rowEnds[row] = t.x
    return { ...t, row }
  })
  const ruleRows = rowEnds.length
  const top = ruleRows * B.ruleRow

  const videosTop = top + B.countRoom
  const videosBase = videosTop + B.videosH
  const commentsTop = videosBase + B.rowGap
  const commentsBase = commentsTop + B.commentsH
  const dayY = commentsBase + 14
  const monthY = dayY + 12
  const stateY = monthY + 14
  const height = stateY + 4

  const drawn = weeks.filter((w) => w.state !== 'none_gathered' && w.videos > 0)
  const vMax = Math.max(1, ...drawn.map((w) => w.videos))
  const cMax = Math.max(1, ...drawn.map((w) => w.comments))
  const cTop = drawn.length ? drawn.reduce((a, w) => (w.comments > a.comments ? w : a)).week : null
  const thin = plotW < B.thinBelow

  const columns: WeekColumn[] = weeks.map((w, i) => {
    const week = isoWeekOf(w.week)
    const x = r1(padL + i * slot)
    const cx = r1(x + slot / 2)
    const has = w.state !== 'none_gathered' && w.videos > 0
    const vh = has ? r1((w.videos / vMax) * B.videosH) : 0
    const ch = has ? r1((w.comments / cMax) * B.commentsH) : 0
    const prev = i > 0 ? dayMonth(isoWeekOf(weeks[i - 1].week)) : null
    const here = dayMonth(week)
    return {
      week,
      x,
      cx,
      state: w.state,
      dim: w.state === 'so_far' || w.state === 'filling',
      stateWord: w.state === 'so_far' ? 'so far' : w.state === 'filling' ? 'filling' : null,
      videos: has ? { y: r1(videosBase - vh), h: vh, label: fmtInt(w.videos), labelY: r1(videosBase - vh - 4) } : null,
      comments: has
        ? { y: r1(commentsBase - ch), h: ch, label: week === cTop ? fmtInt(w.comments) : null, labelY: r1(commentsBase - ch - 4) }
        : null,
      dayLabel: thin && (weeks.length - 1 - i) % 2 !== 0 ? null : String(here.d),
      monthLabel: prev == null || prev.mi !== here.mi ? here.m : null,
      hover: weekHover(w),
    }
  })

  const gaps: WeekBarsGeometry['gaps'] = []
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].state !== 'none_gathered') continue
    let j = i
    while (j + 1 < columns.length && columns[j + 1].state === 'none_gathered') j++
    gaps.push({ from: columns[i].week, to: columns[j].week, cx: r1((columns[i].x + columns[j].x + slot) / 2), label: 'none gathered' })
    i = j
  }

  return {
    width: opts.width,
    height,
    padL,
    plotW,
    slot: r1(slot),
    barW,
    videos: { top: videosTop, baseline: videosBase },
    comments: { top: commentsTop, baseline: commentsBase },
    axis: { dayY, monthY, stateY },
    columns,
    gaps,
    rules: placed.map((t) => ({
      date: t.date, x: t.x, row: t.row, label: shortDay(t.date), labelY: (t.row + 1) * B.ruleRow - 3, groups: [...t.groups].sort(),
    })),
    targets: columns.map((c) => ({ week: c.week, x: c.x, y: 0, w: r1(slot), h: height })),
  }
}

const shortDay = (day: string): string => {
  const { d, m } = dayMonth(day)
  return `${d} ${m}`
}

// ---- Words ------------------------------------------------------------------------

/**
 * A week's hover, which answers a question (MASTER preference):
 *   "Week of 7 Sep · 404 videos: 389 in the category, 15 filed under a brand
 *    you track · 7,851 comments, all dated in September · median 10 comments a
 *    video · read by 1 update since it ended · 27 let in before we checked
 *    relevance"
 * A week that spans two months gives its comments per month. One count, and
 * one base, per clause.
 */
export function weekHover(v: WeekVolume): string {
  const head = `Week of ${weekName(v.week)}`
  if (v.state === 'none_gathered' || v.videos === 0) return `${head} · none gathered`
  const parts: string[] = [head]
  parts.push(v.rivalFiled > 0
    ? `${fmtInt(v.videos)} videos: ${fmtInt(v.category)} in the category, ${fmtInt(v.rivalFiled)} filed under a brand you track`
    : `${fmtInt(v.videos)} videos, all in the category`)
  const monday = isoWeekOf(v.week)
  const firstMonth = longMonth(`${monday.slice(0, 7)}-01`)
  const lastMonth = longMonth(`${addDays(monday, 6).slice(0, 7)}-01`)
  if (v.commentsNextMonth > 0 && v.commentsNextMonth < v.comments && firstMonth !== lastMonth) {
    parts.push(`${fmtInt(v.comments)} comments: ${fmtInt(v.comments - v.commentsNextMonth)} dated in ${firstMonth}, ${fmtInt(v.commentsNextMonth)} in ${lastMonth}`)
  } else {
    parts.push(`${fmtInt(v.comments)} comments, all dated in ${v.commentsNextMonth > 0 ? lastMonth : firstMonth}`)
  }
  if (v.medianDated != null) parts.push(`median ${fmtMedian(v.medianDated)} comments a video`)
  parts.push(v.state === 'so_far'
    ? 'so far'
    : v.updatesSince === 0 ? 'not read by an update since it ended' : `read by ${v.updatesSince} ${v.updatesSince === 1 ? 'update' : 'updates'} since it ended`)
  if (v.unchecked > 0) parts.push(`${fmtInt(v.unchecked)} let in before we checked relevance`)
  return parts.join(' · ')
}

/** "9, 13 and 17 Sep"; across months "30 Aug, 9 and 13 Sep". */
export function dayList(dates: readonly string[]): string {
  const sorted = [...new Set(dates)].sort()
  const groups: { m: string; days: number[] }[] = []
  for (const d of sorted) {
    const { d: day, m } = dayMonth(d)
    const last = groups[groups.length - 1]
    if (last && last.m === m) last.days.push(day)
    else groups.push({ m, days: [day] })
  }
  const flat: string[] = []
  for (const g of groups) g.days.forEach((d, di) => flat.push(di === g.days.length - 1 ? `${d} ${g.m}` : String(d)))
  if (flat.length <= 1) return flat.join('')
  return `${flat.slice(0, -1).join(', ')} and ${flat[flat.length - 1]}`
}

/**
 * The chart's key, one line (a key, not a note): each group of our changes
 * with its days. "our search changes, 9, 13 and 17 Sep · how we check
 * relevance, 26 Sep". Empty when no change is on the chart.
 */
export function weekRuleKey(rules: readonly WeekRule[]): string {
  const order: WeekRuleGroup[] = ['search', 'relevance', 'filing']
  return order
    .map((g) => ({ g, dates: rules.filter((r) => weekRuleGroupOf(r.surface) === g).map((r) => r.date) }))
    .filter((e) => e.dates.length > 0)
    .map((e) => `${WEEK_RULE_GROUPS[e.g].words}, ${dayList(e.dates)}`)
    .join(' · ')
}

/**
 * The chart's text alternative (`aria-label`): the latest four weeks, then the
 * weeks with nothing gathered, then our changes.
 */
export function weekBarsAriaLabel(weeks: readonly WeekVolume[], rules: readonly WeekRule[]): string {
  let units = true
  const latest = weeks.slice(-4).map((w) => {
    if (w.state === 'none_gathered' || w.videos === 0) return `${weekName(w.week)} none gathered`
    const counts = units
      ? `${fmtInt(w.videos)} videos and ${fmtInt(w.comments)} comments`
      : `${fmtInt(w.videos)} and ${fmtInt(w.comments)}`
    units = false
    return w.state === 'so_far' || w.state === 'filling' ? `${weekName(w.week)} ${counts}, ${w.state === 'so_far' ? 'so far' : 'filling'}` : `${weekName(w.week)} ${counts}`
  })
  const count = ['no week', 'week', 'two weeks', 'three weeks', 'four weeks'][latest.length]
  const parts = [`Your market’s videos and comments by week. Latest ${count}: ${latest.join('; ')}.`]
  const empty = weeks.slice(0, -4).filter((w) => w.state === 'none_gathered' || w.videos === 0).map((w) => weekName(w.week))
  if (empty.length) parts.push(`The ${empty.length === 1 ? 'week' : 'weeks'} of ${dayListNames(empty)}: none gathered.`)
  const key = weekRuleKey(rules)
  if (key) parts.push(`Our changes: ${key}.`)
  return parts.join(' ')
}

const dayListNames = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** The email's text form (tables and inline styles only): a row of week
 *  labels and two rows of counts. */
export function weekBarsTable(weeks: readonly WeekVolume[]): { head: string[]; videos: string[]; comments: string[] } {
  return {
    head: weeks.map((w) => weekName(w.week) + (w.state === 'so_far' ? ', so far' : w.state === 'filling' ? ', filling' : '')),
    videos: weeks.map((w) => (w.state === 'none_gathered' || w.videos === 0 ? 'none gathered' : fmtInt(w.videos))),
    comments: weeks.map((w) => (w.state === 'none_gathered' || w.videos === 0 ? '' : fmtInt(w.comments))),
  }
}

// ---- The pending row ("Read at the same age") ------------------------------------------

export interface PendingRowGeometry {
  /** The dotted `1 3` hairline. */
  lineY: number
  x1: number
  x2: number
  /** "due 18 Oct" in each slot from the first week. No mark: nothing here can
   *  be mistaken for a reading. */
  slots: { week: string; cx: number; label: string }[]
  /** One label spanning the weeks before the first week, or null. */
  blank: { from: string; to: string; cx: number; label: string } | null
  height: number
}

/** The pending row's geometry on the same axis as the bars. */
export function pendingRowGeometry(
  axis: readonly string[],
  pending: PendingWeekLine,
  opts: { width: number; padL?: number; padR?: number },
): PendingRowGeometry {
  const padL = opts.padL ?? WEEK_BARS.padL
  const padR = opts.padR ?? WEEK_BARS.padR
  const n = Math.max(1, axis.length)
  const slot = Math.max(0, opts.width - padL - padR) / n
  const cxOf = (i: number): number => r1(padL + i * slot + slot / 2)
  const weeks = axis.map(isoWeekOf)
  const due = new Map(pending.due.map((d) => [isoWeekOf(d.week), d.date]))
  const before = weeks.map((w, i) => ({ w, i })).filter((e) => e.w < isoWeekOf(pending.firstWeek))
  const lineY = 16
  return {
    lineY,
    x1: padL,
    x2: r1(padL + slot * n),
    slots: weeks.map((w, i) => ({ w, i })).filter((e) => due.has(e.w)).map((e) => ({ week: e.w, cx: cxOf(e.i), label: dueLabel(due.get(e.w)!) })),
    blank: before.length
      ? {
          from: before[0].w,
          to: before[before.length - 1].w,
          cx: r1((cxOf(before[0].i) + cxOf(before[before.length - 1].i)) / 2),
          label: pendingBlankLabel(pending.firstWeek),
        }
      : null,
    height: lineY + 14,
  }
}

/** "due 18 Oct". */
export const dueLabel = (date: string): string => `due ${shortDay(date)}`

/** The label spanning the weeks before the first week. */
export const pendingBlankLabel = (firstWeek: string): string =>
  `Weeks before ${weekName(firstWeek)} were read on changing searches, so they get no point.`

/** The one waiting line above the pending row (decision B). */
export const pendingWaitingLine = (firstComparisonDate: string): string =>
  `Pending: the first comparison is due with the ${shortDay(firstComparisonDate)} update, if a check on real data passes.`

// ---- The responsive layout (the component step, WP2.9) ---------------------------
//
// THE PREVIEW IS DRAWN AT ONE WIDTH; THE PAGE IS NOT. `weekBarsGeometry` above
// places everything in pixels for a known width. The component draws at every
// width without JavaScript, so this layout keeps the heights in pixels (the
// rows do not change height with the width) and every horizontal position as a
// FRACTION of the plot (0 to 1), which the SVG prints as a percentage. The one
// thing that depends on pixels is where the rule labels go, so they are placed
// at the plot's narrowest width (`WEEK_PLOT_MIN`, where the strip starts to
// scroll): anything that does not collide there does not collide wider.
//
// FOLLOWING THE APPROVED PREVIEW (WeeklyLine.dc.html, the front page; and
// ThisWeek.dc.html's "Week by week"), where it differs from the WP's words on
// looks: bars 55% of their slot in the ink, a filling or so-far week drawn
// OUTLINED rather than at 40% ink, every comments bar labelled, the rule ticks
// as triangles (filled: our searches; hollow: how we check or file videos)
// with a dotted line down through both rows. The marks are our searches
// (filled) and our relevance check (hollow); a filing change is not drawn,
// since the pooled market does not move when a video is re-filed.

/** The narrowest plot the chart draws at; under it the strip scrolls. */
export const WEEK_PLOT_MIN = 520

/** The narrowest a week's slot may be (its day label and a due date fit). */
export const WEEK_SLOT_MIN = 48

/** The plot's narrowest width for this many weeks: never under
 *  `WEEK_PLOT_MIN`, and never so narrow a slot cannot hold its labels. */
export const weekPlotMin = (weeks: number): number => Math.max(WEEK_PLOT_MIN, weeks * WEEK_SLOT_MIN)

export type WeekBarsSize = 'large' | 'medium'

/** The rows' heights, per size: the front page's (the preview's Week by week,
 *  videos to 208 px) and This week's (its preview, videos to 128 px). */
export const WEEK_BARS_SIZES: Record<WeekBarsSize, { videosH: number; commentsH: number; rowGap: number }> = {
  large: { videosH: 208, commentsH: 60, rowGap: 56 },
  medium: { videosH: 128, commentsH: 70, rowGap: 44 },
}

const TICK_ROW = 20
const TICK_LABEL_CHAR = 7.4
const TICK_PAD = 22
const f4 = (n: number): number => Math.round(n * 10000) / 10000

export interface WeekTick {
  date: string
  /** The tick's x, as a fraction of the plot. */
  x: number
  row: number
  /** Which side of its mark the day sits: 'end' is left of it. */
  side: 'start' | 'end'
  label: string
  /** Filled for a change to our searches; hollow for how we check relevance. */
  mark: 'search' | 'other'
}

export interface WeekBarsLayout {
  n: number
  height: number
  /** The rows' tops and baselines, px. */
  videos: { top: number; base: number }
  comments: { top: number; base: number }
  axis: { dayY: number; monthY: number; stateY: number; marksY: number | null }
  ticks: WeekTick[]
  columns: {
    week: string
    /** Slot left edge and centre, as fractions of the plot. */
    x: number
    cx: number
    w: number
    outlined: boolean
    stateWord: 'so far' | 'filling' | null
    videos: { y: number; h: number; label: string } | null
    comments: { y: number; h: number; label: string } | null
    dayLabel: string
    monthLabel: string | null
  }[]
  gaps: { cx: number; label: string }[]
  /** 'row' ticks (This week): our changes as marks under the axis, per week. */
  marks: { cx: number; items: { day: string; mark: 'search' | 'other' }[] }[]
}

/**
 * Place the rule labels so none collides with another label, with another
 * rule's mark on its row, or with a rule's dotted line from a row above:
 * rows from the top, and on each row the label's right side first unless a
 * later rule sits within reach there, or the label would run past the plot's
 * right edge (the deploy-3 review: a change in the latest week printed "△ 26"
 * with "Sep" cut off), then its left.
 */
export function placeTicks(ticks: readonly { x: number; label: string }[], plotPx: number = WEEK_PLOT_MIN): { row: number; side: 'start' | 'end' }[] {
  const px = ticks.map((t) => t.x * plotPx)
  const widths = ticks.map((t) => t.label.length * TICK_LABEL_CHAR)
  const placed: { x: number; row: number; from: number; to: number }[] = []
  return ticks.map((_, i) => {
    const x = px[i]
    for (let row = 0; row < 6; row++) {
      const crowdedRight = px.some((o, j) => j > i && o > x && o - x < widths[i] + TICK_PAD + 6)
      const pastEdge = x + widths[i] + TICK_PAD > plotPx
      // Past the edge the right side is never taken: a lower row on the left
      // before a clipped label on the right.
      const sides: ('start' | 'end')[] = pastEdge ? ['end'] : crowdedRight ? ['end', 'start'] : ['start', 'end']
      for (const side of sides) {
        const from = side === 'start' ? x - 6 : x - widths[i] - TICK_PAD + 4
        const to = side === 'start' ? x + widths[i] + TICK_PAD - 4 : x + 6
        const clash = placed.some((p) =>
          (p.row === row && from < p.to && to > p.from)
          // A rule placed on a row above draws its line down through this one.
          || (p.row < row && p.x > from - 2 && p.x < to + 2))
          // Another rule's own mark, if it lands on this row later, would sit
          // under this label: keep clear of every mark on the first row.
          || (row === 0 && px.some((o, j) => j > i && o > from - 6 && o < to + 6))
        if (!clash) {
          placed.push({ x, row, from, to })
          return { row, side }
        }
      }
    }
    placed.push({ x, row: 6, from: x - 6, to: x + 6 })
    return { row: 6, side: x + widths[i] + TICK_PAD > plotPx ? 'end' as const : 'start' as const }
  })
}

/**
 * The chart's layout for these weeks (axis order) and our changes. `ticks`:
 * 'top' draws each change as a mark above the plot with a dotted line down
 * through both rows (the front page); 'row' draws them as marks in a row under
 * the axis (This week).
 */
export function weekBarsLayout(
  weeks: readonly WeekVolume[],
  rules: readonly WeekRule[],
  opts: { size: WeekBarsSize; ticks: 'top' | 'row'; plotPx?: number },
): WeekBarsLayout {
  const S = WEEK_BARS_SIZES[opts.size]
  const n = Math.max(1, weeks.length)
  const index = new Map(weeks.map((w, i) => [isoWeekOf(w.week), i]))

  // Our changes, one per day, on their week; the mark is filled when any
  // change that day was to our searches.
  const byDay = new Map<string, { date: string; x: number; search: boolean }>()
  for (const r of rules) {
    const i = index.get(isoWeekOf(r.week))
    const g = weekRuleGroupOf(r.surface)
    // FILING IS NOT DRAWN ON THE MARKET'S BARS (the preview draws our searches
    // and our relevance check only): the market pools the category with the
    // brands you track, so a video re-filed between them moves no bar
    // (decision E).
    if (i == null || !g || g === 'filing') continue
    const dayIndex = Math.min(Math.max(Math.round((msOfInstant(r.date) - msOfInstant(isoWeekOf(r.week))) / 86_400_000), 0), 6)
    const x = (i + (dayIndex + 0.5) / 7) / n
    const held = byDay.get(r.date) ?? { date: r.date, x, search: false }
    held.search = held.search || g === 'search'
    byDay.set(r.date, held)
  }
  const days = [...byDay.values()].sort((a, b) => a.x - b.x || (a.date < b.date ? -1 : 1))
  const spots = opts.ticks === 'top' ? placeTicks(days.map((d) => ({ x: d.x, label: shortDay(d.date) })), opts.plotPx ?? weekPlotMin(n)) : []
  const tickRows = opts.ticks === 'top' && days.length > 0 ? Math.max(...spots.map((s) => s.row)) + 1 : 0
  const ticks: WeekTick[] = opts.ticks === 'top'
    ? days.map((d, i) => ({ date: d.date, x: f4(d.x), row: spots[i].row, side: spots[i].side, label: shortDay(d.date), mark: d.search ? 'search' : 'other' }))
    : []

  const top = tickRows * TICK_ROW + (tickRows > 0 ? 28 : 8) + 16
  const vBase = top + S.videosH
  const cTop = vBase + S.rowGap
  const cBase = cTop + S.commentsH
  const dayY = cBase + 22
  const monthY = dayY + 18
  const stateY = monthY + 22
  const marksY = opts.ticks === 'row' && days.length > 0 ? stateY + 30 : null
  const height = (marksY ?? stateY) + 10

  const drawn = weeks.filter((w) => w.state !== 'none_gathered' && w.videos > 0)
  const vMax = Math.max(1, ...drawn.map((w) => w.videos))
  const cMax = Math.max(1, ...drawn.map((w) => w.comments))
  const columns = weeks.map((w, i) => {
    const week = isoWeekOf(w.week)
    const has = w.state !== 'none_gathered' && w.videos > 0
    const vh = has ? Math.max(1, r1((w.videos / vMax) * S.videosH)) : 0
    const ch = has && w.comments > 0 ? Math.max(1, r1((w.comments / cMax) * S.commentsH)) : 0
    const prev = i > 0 ? dayMonth(isoWeekOf(weeks[i - 1].week)) : null
    const here = dayMonth(week)
    return {
      week,
      x: f4(i / n),
      cx: f4((i + 0.5) / n),
      w: f4(0.55 / n),
      outlined: w.state === 'so_far' || w.state === 'filling',
      stateWord: (w.state === 'so_far' ? 'so far' : w.state === 'filling' ? 'filling' : null) as 'so far' | 'filling' | null,
      videos: has ? { y: r1(vBase - vh), h: vh, label: fmtInt(w.videos) } : null,
      comments: has ? { y: r1(cBase - ch), h: ch, label: fmtInt(w.comments) } : null,
      dayLabel: String(here.d),
      monthLabel: prev == null || prev.mi !== here.mi ? here.m : null,
    }
  })

  const gaps: WeekBarsLayout['gaps'] = []
  for (let i = 0; i < weeks.length; i++) {
    if (columns[i].videos) continue
    let j = i
    while (j + 1 < weeks.length && !columns[j + 1].videos) j++
    gaps.push({ cx: f4((i + j + 1) / 2 / n), label: 'none gathered' })
    i = j
  }

  const marks: WeekBarsLayout['marks'] = []
  if (opts.ticks === 'row') {
    for (const c of columns) {
      const items = days.filter((d) => isoWeekOf(d.date) === c.week)
        .map((d) => ({ day: String(dayMonth(d.date).d), mark: (d.search ? 'search' : 'other') as 'search' | 'other' }))
      if (items.length > 0) marks.push({ cx: c.cx, items })
    }
  }

  return {
    n,
    height,
    videos: { top, base: vBase },
    comments: { top: cTop, base: cBase },
    axis: { dayY, monthY, stateY, marksY },
    ticks,
    columns,
    gaps,
    marks,
  }
}

/**
 * The chart's key as one sentence (the preview's): "We changed our searches on
 * 9, 13 and 17 Sep, and how we check relevance on 26 Sep." Empty when no
 * change is on the chart. Filing changes are not on it (`weekBarsLayout`).
 */
export function weekChangeSentence(rules: readonly WeekRule[]): string {
  const of = (g: WeekRuleGroup): string[] => rules.filter((r) => weekRuleGroupOf(r.surface) === g).map((r) => r.date)
  const parts: string[] = []
  const search = of('search')
  const relevance = of('relevance')
  if (search.length) parts.push(`our searches on ${dayList(search)}`)
  if (relevance.length) parts.push(`how we check relevance on ${dayList(relevance)}`)
  if (parts.length === 0) return ''
  if (parts.length === 1) return `We changed ${parts[0]}.`
  return `We changed ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`
}

/** A week's facts for its hover card (`lines`, the front page's preview) and
 *  for This week's side panel (`panel`, its preview): each a figure and its
 *  words; `gap` starts a new group of the card. One count, one base, per line. */
export interface WeekDetail {
  week: string
  title: string
  lines: { value: string; words: string; strong: boolean; gap: boolean }[]
  panel: { value: string; words: string; sub: string }[]
}

export function weekDetail(v: WeekVolume): WeekDetail {
  const title = `Week of ${weekName(v.week)}`
  if (v.state === 'none_gathered' || v.videos === 0) {
    return { week: v.week, title, lines: [{ value: '', words: 'none gathered', strong: false, gap: false }], panel: [] }
  }
  const lines: WeekDetail['lines'] = [{ value: fmtInt(v.videos), words: 'videos', strong: true, gap: false }]
  const panel: WeekDetail['panel'] = []
  if (v.rivalFiled > 0) {
    lines.push({ value: fmtInt(v.category), words: 'in the category', strong: false, gap: false })
    lines.push({ value: fmtInt(v.rivalFiled), words: 'filed under a brand you track', strong: false, gap: false })
    panel.push({ value: fmtInt(v.videos), words: 'videos', sub: `of them ${fmtInt(v.category)} in the category and ${fmtInt(v.rivalFiled)} filed under a brand you track` })
  } else {
    panel.push({ value: fmtInt(v.videos), words: 'videos', sub: 'all in the category' })
  }
  const monday = isoWeekOf(v.week)
  const firstMonth = longMonth(`${monday.slice(0, 7)}-01`)
  const lastMonth = longMonth(`${addDays(monday, 6).slice(0, 7)}-01`)
  const split = v.commentsNextMonth > 0 && v.commentsNextMonth < v.comments && firstMonth !== lastMonth
  const dated = split
    ? `${fmtInt(v.comments - v.commentsNextMonth)} dated in ${firstMonth} and ${fmtInt(v.commentsNextMonth)} in ${lastMonth}`
    : `all dated in ${v.commentsNextMonth > 0 ? lastMonth : firstMonth}`
  lines.push({ value: fmtInt(v.comments), words: `comments, ${dated}`, strong: true, gap: true })
  panel.push({ value: fmtInt(v.comments), words: 'comments', sub: dated })
  if (v.medianDated != null) {
    lines.push({ value: fmtMedian(v.medianDated), words: 'median comments a video', strong: false, gap: false })
    panel.push({ value: fmtMedian(v.medianDated), words: 'comments a video', sub: 'the median' })
  }
  if (v.unchecked > 0) {
    lines.push({ value: fmtInt(v.unchecked), words: 'let in before we checked relevance', strong: false, gap: true })
    panel.push({ value: fmtInt(v.unchecked), words: v.unchecked === 1 ? 'video let in' : 'videos let in', sub: 'before we checked relevance' })
  }
  return { week: v.week, title, lines, panel }
}
