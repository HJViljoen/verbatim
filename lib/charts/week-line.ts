import { fmtInt, shortDate } from '../format'
import { levelText } from '../reading/level'
import type { Verdict } from '../reading/verdicts'
import {
  WEEK_LINE_EXCLUDED, WEEK_LINE_FIRST_WEEK, weekKindLabel, type WeekLineBlock, type WeekLineRow, type WeekLineWeek,
  type WeekPairReason,
} from '../reading/week-line'
import { isoWeekOf } from '../reading/weeks'

// The same-age weekly line's geometry and words, with no React (market-first
// decision M, part 2; WP3.13 "Design of the line").
//
// SMALL MULTIPLES ON THE CALLER'S WEEK AXIS. One row per object, 24 px tall
// and 8 px apart, under the week axis its caller draws (WP2.9's bars): the
// caller hands each week's centre as a fraction of the plot (`columns`), so a
// point sits under the week it reads and this file never decides where a week
// is. Every horizontal position is that fraction; every vertical one is pixels
// inside the row, so the drawing needs no script to lay out at any width.
//
// EACH ROW ON ITS OWN Y SCALE, its lowest and highest shares as 9 px mono ticks,
// so one row's wiggle is never read against another's. The line is 1.5 px in
// the market ink; points are solid, ringed in `--tile` (§3.9), the latest one
// larger (MASTER's series-end rule).
//
// A PAIR NOT READ THE SAME WAY DRAWS BOTH POINTS AND NO SEGMENT, and the figure
// line under the rows says why ("28 Sep and 5 Oct not read the same way: read
// to different depths"): the WP1.3 rule for months, applied to weeks. A week
// with no point keeps its slot empty and the figure line names why (before the
// first week, the week of 21 Sep, a week not kept at its age).
//
// NO DIRECTION WORD, ANYWHERE. The latest pair's verdict is the Verdict itself,
// handed to `MovementBadge` by the component ("no clear change" muted, a rare
// "moved" arrowed only as the badge does). Nothing here says which way a line
// went; the tests hold every string against the copy contract.

export const WEEK_LINE_ROW = {
  /** A row's height and the gap between rows (WP3.13). */
  height: 24,
  gap: 8,
  /** Room above and below the plotted range inside a row, for a point's ring. */
  pad: 4,
  line: 1.5,
  /** A point, and the latest one (MASTER: r 2.2, 3.4 at the series end). */
  r: 2.2,
  rLast: 3.4,
  ring: 1.5,
  tickPx: 9,
  labelPx: 12,
  /** The left column (the object's name, then the ticks) and the right one
   *  (the latest share and the verdict). A caller aligning this plot with its
   *  own week axis gives its plot the same gutters. */
  labelWidth: 176,
  endWidth: 216,
} as const

/** The rows' empty state: the line prints and no week is kept yet. */
export const WEEK_LINE_EMPTY = 'No week has been read at the same age yet.'

/** Why a pair was not read the same way, in the reader's words. */
export const WEEK_PAIR_REASON_WORDS: Record<WeekPairReason, string> = {
  cadence: 'not one update a week',
  searches: 'we changed our searches',
  gate: 'relevance was not checked the same way',
  reader: 'we changed how we read comments',
  depth: 'read to different depths',
  not_kept: 'a week was not kept at its age',
  excluded: 'a week read on changing searches',
}

/** A week's centre on the caller's plot, as a fraction of its width (0 to 1). */
export interface WeekLineColumn {
  week: string
  cx: number
}

/** Evenly spaced slots, as WP2.9's bars place a week: the centre of the i-th of
 *  n slots. For a caller with no axis of its own (a fixture, a standalone row). */
export function evenColumns(weeks: readonly string[]): WeekLineColumn[] {
  const n = Math.max(1, weeks.length)
  return weeks.map((w, i) => ({ week: isoWeekOf(w), cx: (i + 0.5) / n }))
}

export interface WeekLinePointMark {
  week: string
  cx: number
  /** Pixels from the row's top. */
  y: number
  r: number
  k: number
  n: number
  hover: string
}

export interface WeekLineSegment {
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface WeekLineRowLayout {
  key: string
  objectKind: 'kind' | 'subject'
  objectId: string
  label: string
  /** A subject not yet ready (decision C): points, no verdict, the tag. */
  provisional: boolean
  /** Pixels from the rows' top. */
  top: number
  /** The row's highest and lowest shares, at their y (one tick when they print alike). */
  ticks: { text: string; y: number }[]
  points: WeekLinePointMark[]
  segments: WeekLineSegment[]
  /** The latest point's level ("61% · 195 of 318"), and the latest pair's verdict. */
  latest: { level: string; verdict: Verdict | null } | null
  aria: string
}

export interface WeekLineLayout {
  height: number
  rows: WeekLineRowLayout[]
  /** Why a slot is empty or a pair is not joined; null when nothing needs saying. */
  figureLine: string | null
}

const share = (k: number, n: number): number => (n > 0 ? k / n : Number.NaN)
const pctText = (s: number): string => `${Math.round(s * 100)}%`

/** A level with its "of N": "61% · 195 of 318" at 100 videos or more,
 *  `levelText`'s "8 of 50" under it (the Subjects rail's form). */
export function weekLineLevel(k: number, n: number): string {
  const level = levelText(k, n)
  if (!level) return `${fmtInt(k)} of ${fmtInt(n)}`
  return level.kind === 'share' ? `${level.text} · ${fmtInt(k)} of ${fmtInt(n)}` : level.text
}

/**
 * The hover sentence (WP3.13): "Week of 5 Oct, read with the 25 Oct update ·
 * Praising it 195 of 318 videos (61%) · at a fixed depth mix 61% · median 9.5
 * comments a video · 0 of 318 let in before we checked relevance · 39 of 318
 * older videos". A clause whose figure was not kept is left out, never zeroed.
 */
export function weekLineHover(
  row: Pick<WeekLineRow, 'label'>,
  point: WeekLineRow['points'][number],
  facts?: WeekLineWeek | null,
): string {
  const parts = [
    `Week of ${shortDate(point.week)}, read with the ${shortDate(point.readWith)} update`,
    `${row.label} ${fmtInt(point.k)} of ${fmtInt(point.n)} videos (${pctText(share(point.k, point.n))})`,
  ]
  if (point.standardised != null && Number.isFinite(point.standardised)) parts.push(`at a fixed depth mix ${pctText(point.standardised)}`)
  if (facts?.medianDated != null) parts.push(`median ${facts.medianDated.toLocaleString('en-US')} comments a video`)
  if (facts && Number.isFinite(facts.unchecked) && Number.isFinite(facts.videos)) {
    parts.push(`${fmtInt(facts.unchecked)} of ${fmtInt(facts.videos)} let in before we checked relevance`)
  }
  if (facts && Number.isFinite(facts.olderVideos) && Number.isFinite(facts.videos)) {
    parts.push(`${fmtInt(facts.olderVideos)} of ${fmtInt(facts.videos)} older videos`)
  }
  if (facts?.rescrapeCapped === true) parts.push('an update reached its limit on re-reading older videos')
  return parts.join(' · ')
}

/** Why slots are empty and pairs unjoined, for the weeks on the caller's axis. */
export function weekLineFigureLine(block: WeekLineBlock, columns: readonly WeekLineColumn[]): string | null {
  if (block.rows.length === 0) return null
  const firstWeek = block.firstWeek ?? WEEK_LINE_FIRST_WEEK
  const onAxis = new Set(columns.map((c) => isoWeekOf(c.week)))
  const keptWeeks = block.reads
    ? new Set(block.reads.map((r) => r.week))
    : new Set(block.rows.flatMap((r) => r.points.map((p) => p.week)))
  const lastKept = [...keptWeeks].sort().pop() ?? null
  const parts: string[] = []
  if ([...onAxis].some((w) => w < firstWeek && !WEEK_LINE_EXCLUDED.includes(w))) {
    parts.push(`Weeks before ${shortDate(firstWeek)} were read on changing searches, so they get no point.`)
  }
  for (const w of WEEK_LINE_EXCLUDED) {
    if (onAxis.has(w)) parts.push(`The week of ${shortDate(w)} is left out: we changed how we check relevance that week.`)
  }
  const missed = [...onAxis].filter((w) => w >= firstWeek && !WEEK_LINE_EXCLUDED.includes(w) && lastKept != null && w < lastKept && !keptWeeks.has(w)).sort()
  for (const w of missed) parts.push(`The week of ${shortDate(w)} was not kept at its age, so it has no point.`)
  // Every row carries the same pairs (a pair's conditions are about the two
  // weeks, never the object), so the first row speaks for the block.
  for (const pair of block.rows[0].pairs) {
    if (pair.mode !== 'refuse' || !onAxis.has(pair.prevWeek) || !onAxis.has(pair.week)) continue
    if (missed.includes(pair.prevWeek) || missed.includes(pair.week)) continue
    const why = pair.reasons.filter((r) => r !== 'not_kept').map((r) => WEEK_PAIR_REASON_WORDS[r])
    if (why.length === 0) continue
    parts.push(`${shortDate(pair.prevWeek)} and ${shortDate(pair.week)} not read the same way: ${why.join(', ')}.`)
  }
  return parts.length ? parts.join(' ') : null
}

/** The rows, laid out on the caller's columns. A point whose week has no
 *  column is not drawn (the caller's axis decides what is shown). */
export function weekLineLayout(block: WeekLineBlock, columns: readonly WeekLineColumn[]): WeekLineLayout {
  const R = WEEK_LINE_ROW
  const cx = new Map(columns.map((c) => [isoWeekOf(c.week), c.cx]))
  const facts = new Map((block.reads ?? []).map((r) => [r.week, r]))
  const rows: WeekLineRowLayout[] = block.rows.map((row, i) => {
    const shown = row.points.filter((p) => cx.has(p.week) && p.n > 0)
    const shares = shown.map((p) => share(p.k, p.n))
    const min = shares.length ? Math.min(...shares) : 0
    const max = shares.length ? Math.max(...shares) : 0
    const span = max - min
    const yOf = (s: number): number => (span > 1e-9 ? R.pad + (1 - (s - min) / span) * (R.height - 2 * R.pad) : R.height / 2)
    const last = shown.length ? shown[shown.length - 1].week : null
    const points: WeekLinePointMark[] = shown.map((p) => ({
      week: p.week, cx: cx.get(p.week)!, y: yOf(share(p.k, p.n)), r: p.week === last ? R.rLast : R.r, k: p.k, n: p.n,
      hover: weekLineHover(row, p, facts.get(p.week)),
    }))
    const at = new Map(points.map((p) => [p.week, p]))
    const segments: WeekLineSegment[] = row.pairs
      .filter((pair) => pair.mode === 'comparable' && at.has(pair.prevWeek) && at.has(pair.week))
      .map((pair) => {
        const a = at.get(pair.prevWeek)!
        const b = at.get(pair.week)!
        return { from: a.week, to: b.week, x1: a.cx, y1: a.y, x2: b.cx, y2: b.y }
      })
    const ticks = shares.length === 0
      ? []
      : pctText(max) === pctText(min)
        ? [{ text: pctText(max), y: yOf(max) }]
        : [{ text: pctText(max), y: R.pad }, { text: pctText(min), y: R.height - R.pad }]
    const latestPoint = shown.length ? shown[shown.length - 1] : null
    const latestPair = [...row.pairs].reverse().find((p) => at.has(p.week) && at.has(p.prevWeek)) ?? null
    const provisional = row.objectKind === 'subject' && row.calibration !== 'ready'
    const label = row.label || weekKindLabel(row.objectId)
    return {
      key: `${row.objectKind}|${row.objectId}`,
      objectKind: row.objectKind,
      objectId: row.objectId,
      label,
      provisional,
      top: i * (R.height + R.gap),
      ticks,
      points,
      segments,
      latest: latestPoint ? { level: weekLineLevel(latestPoint.k, latestPoint.n), verdict: latestPair?.verdict ?? null } : null,
      aria: `${label}, read at the same age: ${shown.map((p) => `week of ${shortDate(p.week)}, ${pctText(share(p.k, p.n))} (${fmtInt(p.k)} of ${fmtInt(p.n)})`).join('; ')}.`,
    }
  })
  const height = rows.length ? rows.length * R.height + (rows.length - 1) * R.gap : 0
  return { height, rows, figureLine: weekLineFigureLine(block, columns) }
}

/** The email's table: the weeks shown as columns, one row per object, each
 *  cell a level with its "of N". */
export function weekLineTable(block: WeekLineBlock, columns: readonly WeekLineColumn[]): {
  head: string[]
  rows: { key: string; label: string; provisional: boolean; cells: string[]; verdict: Verdict | null }[]
} {
  const weeks = columns.map((c) => isoWeekOf(c.week)).filter((w) => block.rows.some((r) => r.points.some((p) => p.week === w)))
  return {
    head: weeks.map((w) => shortDate(w)),
    rows: block.rows.map((row) => {
      const byWeek = new Map(row.points.map((p) => [p.week, p]))
      const latestPair = [...row.pairs].reverse().find((p) => byWeek.has(p.week) && byWeek.has(p.prevWeek) && weeks.includes(p.week)) ?? null
      return {
        key: `${row.objectKind}|${row.objectId}`,
        label: row.label,
        provisional: row.objectKind === 'subject' && row.calibration !== 'ready',
        cells: weeks.map((w) => {
          const p = byWeek.get(w)
          return p ? weekLineLevel(p.k, p.n) : '·'
        }),
        verdict: latestPair?.verdict ?? null,
      }
    }),
  }
}
