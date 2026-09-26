import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import type { OurChange, OurChangeSurface } from './comparability'
import { marketAudiences } from './market'
import { prevMonth } from './month-key'
import type { ReadingMonth } from './reading-month'
import type { PendingWeekLine, WeekLineBlock } from './week-line'

// Week by week: the weekly volume bars (market-first decision M, part 1; plan
// §4.2 `weeks.ts`, WP2.9).
//
// COUNTS ONLY. For each week, Monday to Sunday by the day each comment was
// written, the market's videos and comments. No share, no verdict, no arrow
// and no direction word is computed here, so the standing rule "nothing
// computed over a week alone" (AGENTS.md; research H11) holds for the bars.
// The one weekly reading is the same-age line (lib/reading/week-line.ts), and
// this file only carries its pending state or its block.
//
// A WEEK IS AN ISO WEEK AT UTC. Comment dates carry no time part, and the SQL
// buckets them with date_trunc('week', comment_date at time zone 'UTC'), so a
// comment dated Sunday 20 Sep is in the week of 14 Sep and Monday 28 Sep
// starts a week. A video with comments in two weeks counts in both, so the
// video bars do not add up to a month (How to read's "Week by week" says so).
//
// THE MARKET IS POOLED ACROSS AUDIENCES, NEVER ACROSS WEEKS (decision E). The
// category plus the videos filed under a tracked brand; the client's own posts
// are not in it. Audiences are disjoint (a video is in exactly one), so counts
// add across them. A MEDIAN DOES NOT: the market's median dated comments a
// video is not any sum or mix of the audiences' medians (staging, the week of
// 31 Aug: the category's median is 7, the market's 6). So MF4's
// `market_week_volumes` computes the median and the mean over the WHOLE market
// of the week (every audience it returns) and repeats them on each of the
// week's rows (supabase/migrations/20261005091000_market_first_weeks.sql, the
// MF2/MF4 package). The pooled median is that value, used only when every
// audience the SQL counted is in the pool and the rows agree: when the page
// pools fewer audiences (a rival no longer tracked), the week prints no median
// rather than a wrong one.
//
// PURE. The loader reads `market_week_volumes`, the runs and the change log
// and hands them in; nothing here reads a table.
//
// Measured on staging (Sealand, data to 20 Sep; read-only, 26 Sep), the SELECT
// form of `market_week_volumes` reproduces decision M's figures to the video
// and the comment: market videos 244 · 226 · 187 · 229 · 404 · 318 for the
// weeks of 10 Aug to 14 Sep, comments 5,809 · 2,646 · 1,831 · 3,275 · 7,851 ·
// 5,462, median 17 · 6.5 · 5 · 6 · 10 · 9.5, and no row for the weeks of 27 Jul
// and 3 Aug. The tests hold those rows.

const DAY_MS = 86_400_000

/** At most this many weeks on the axis: the latest ones, so the current week
 *  is always drawn (WP2.9, "at most 14 columns"). */
export const WEEK_AXIS_MAX = 14

/** Updates after a week ends before it reads "settled" rather than "filling".
 *  Two, the same count the same-age line reads a week at (14 days). */
export const WEEK_SETTLED_UPDATES = 2

/** so_far: not ended · filling: ended, under two updates since · settled: two
 *  or more · none_gathered: no dated comment in the market. */
export type WeekState = 'so_far' | 'filling' | 'settled' | 'none_gathered'

export interface WeekVolume {
  /** The ISO week's Monday, 'YYYY-MM-DD'. */
  week: string
  state: WeekState
  /** Updates finished since the week ended (0 while it is so far). */
  updatesSince: number
  /** The market: the category plus the tracked brands' audiences, the client's
   *  own posts left out (decision E). Distinct videos with a comment dated in
   *  the week, and those comments. */
  videos: number
  comments: number
  /** Hover only; never drawn as a stacked segment. */
  category: number
  rivalFiled: number
  /** Comments dated in a month that starts inside the week (0 inside one month). */
  commentsNextMonth: number
  /** The market's median dated comments a video in the week; null when no row
   *  covers exactly the pooled market (see the header). */
  medianDated: number | null
  /** Videos under 5 dated comments in the week. */
  under5: number
  /** Videos uploaded before the previous week's Monday (late comments on older videos). */
  olderVideos: number
  /** Videos let in before we checked relevance (a kept gate verdict with source 'default'). */
  unchecked: number
}

/** One of our changes, on the week it was made. `words` names its group for
 *  the chart's key; the date is the change's own UTC day. */
export interface WeekRule {
  date: string
  week: string
  surface: OurChangeSurface
  words: string
}

export interface WeekVolumesBlock {
  /** `weekAxis` order, oldest first. */
  weeks: WeekVolume[]
  /** Our changes, on the week made. */
  rules: WeekRule[]
  /** The same-age line: its block once it prints, its pending state until then,
   *  and null when the tenant has no `WEEK_LINE` entry (Össur), so no row at all. */
  line: WeekLineBlock | PendingWeekLine | null
}

/** One row of MF4's `market_week_volumes`, camel-cased: one week, one market
 *  audience. `medianDated` and `meanDated` are the WHOLE market's for the week,
 *  repeated on each of its rows (see the header). */
export interface MarketWeekRow {
  week: string
  audience: string
  videos: number
  comments: number
  commentsNextMonth: number
  under5: number
  medianDated: number | null
  meanDated: number | null
  olderVideos: number
  unchecked: number
}

// ---- Days and weeks ----------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' of an epoch-ms, UTC. */
export const dayOf = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Epoch-ms of a date or an instant. A bare 'YYYY-MM-DD' is that day at 00:00
 * UTC. Postgres's text form ('2026-09-20 00:00:00+00') is read too, since a
 * comment date or a run's finish can arrive in it. NaN when it is not a date.
 */
export function msOfInstant(s: string): number {
  if (typeof s !== 'string') return Number.NaN
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Date.parse(`${t}T00:00:00.000Z`)
  let iso = t.replace(' ', 'T')
  if (/[+-]\d{2}$/.test(iso)) iso = `${iso}:00`
  return Date.parse(iso)
}

/** 'YYYY-MM-DD' plus n days. */
export function addDays(day: string, n: number): string {
  const ms = msOfInstant(day)
  if (Number.isNaN(ms)) throw new Error(`addDays: not a date: ${day}`)
  return dayOf(ms + n * DAY_MS)
}

/**
 * The Monday of the ISO week a comment date (or an instant) falls in, at UTC:
 * a comment dated Sun 20 Sep is in the week of 14 Sep, and Mon 28 Sep starts a
 * week. Throws on something that is not a date, as `monthStartOf` does.
 */
export function isoWeekOf(date: string): string {
  const ms = msOfInstant(date)
  if (Number.isNaN(ms)) throw new Error(`isoWeekOf: not a date: ${date}`)
  const d = new Date(ms)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return dayOf(midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS)
}

/** The instant a week ends: the next Monday, 00:00 UTC. */
export function weekEndInstant(week: string): string {
  return `${addDays(isoWeekOf(week), 7)}T00:00:00.000Z`
}

/**
 * The week axis: the Mondays of every week that overlaps the reading month or
 * the month before it, through the current week, oldest first, at most
 * `WEEK_AXIS_MAX` (the latest ones, so the current week is always there).
 *
 * Reading September on 11 Oct: 27 Jul to 5 Oct (11 columns). Reading October so
 * far on 20 Oct: 31 Aug to 19 Oct (8).
 */
export function weekAxis(r: Pick<ReadingMonth, 'month'>, now: string): string[] {
  const from = isoWeekOf(prevMonth(r.month))
  const current = isoWeekOf(now)
  const to = current < from ? from : current
  const out: string[] = []
  for (let w = from; w <= to; w = addDays(w, 7)) out.push(w)
  return out.slice(-WEEK_AXIS_MAX)
}

/** Updates finished from the week's end up to `now`. `updates` are the finish
 *  instants of completed or partial runs (as `readingMonthFor` takes them). */
export function updatesSinceWeek(week: string, now: string, updates: readonly string[]): number {
  const endMs = msOfInstant(weekEndInstant(week))
  const nowMs = msOfInstant(now)
  if (Number.isNaN(nowMs)) throw new Error(`updatesSinceWeek: not a date: ${now}`)
  let n = 0
  for (const u of updates) {
    const t = msOfInstant(u)
    if (!Number.isNaN(t) && t >= endMs && t <= nowMs) n++
  }
  return n
}

/**
 * A week's state on the clock: the current week is `so_far`; an ended week
 * with fewer than two updates since it ended is `filling`; two or more,
 * `settled`. Never `none_gathered`, which is a fact about the rows, not the
 * clock (`pooledWeekVolumes` decides it).
 */
export function weekStateOf(week: string, now: string, updates: readonly string[]): WeekState {
  const nowMs = msOfInstant(now)
  if (Number.isNaN(nowMs)) throw new Error(`weekStateOf: not a date: ${now}`)
  if (nowMs < msOfInstant(weekEndInstant(week))) return 'so_far'
  return updatesSinceWeek(week, now, updates) >= WEEK_SETTLED_UPDATES ? 'settled' : 'filling'
}

// ---- The market, pooled per week ---------------------------------------------

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

/**
 * The market's weekly volumes on the axis, from `market_week_volumes` rows.
 *
 * Counts add across the market's audiences (tracked rivals and the category;
 * `marketAudiences`): the client's rows and any audience not tracked are left
 * out, and a repeated audience in a week is counted once. The median is the
 * market's, repeated on the week's rows, when every non-client audience the
 * rows hold is pooled and the rows agree; otherwise null.
 *
 * A week with no market row comes back `none_gathered`, never dropped, so the
 * axis keeps its slots. A count that is not a whole number at or above zero is
 * refused (thrown): the SQL returns counts, and a malformed row printed as a
 * smaller number would read as the market.
 *
 * `clock` gives each week its state (`weekStateOf`). It is a fourth argument
 * beyond §4.2's three, because a week's state needs the clock and the updates.
 */
export function pooledWeekVolumes(
  rows: readonly MarketWeekRow[],
  rivalAudiences: readonly string[],
  axis: readonly string[],
  clock: { now: string; updates: readonly string[] },
): WeekVolume[] {
  const market = new Set(marketAudiences(rivalAudiences))
  const byWeek = new Map<string, { parts: Map<string, MarketWeekRow>; medians: Set<number | null>; unpooled: boolean }>()
  for (const r of rows) {
    const week = isoWeekOf(r.week)
    const slot = byWeek.get(week) ?? { parts: new Map<string, MarketWeekRow>(), medians: new Set<number | null>(), unpooled: false }
    byWeek.set(week, slot)
    if (r.audience === CLIENT_AUDIENCE) continue
    if (!market.has(r.audience)) {
      slot.unpooled = true
      continue
    }
    if (slot.parts.has(r.audience)) continue
    for (const k of ['videos', 'comments', 'commentsNextMonth', 'under5', 'olderVideos', 'unchecked'] as const) {
      if (!isCount(r[k])) throw new Error(`pooledWeekVolumes: ${k} is not a count for ${r.audience} in the week of ${week}: ${String(r[k])}`)
    }
    slot.parts.set(r.audience, r)
    slot.medians.add(typeof r.medianDated === 'number' && Number.isFinite(r.medianDated) && r.medianDated >= 0 ? r.medianDated : null)
  }

  return axis.map((w) => {
    const week = isoWeekOf(w)
    const updatesSince = updatesSinceWeek(week, clock.now, clock.updates)
    const slot = byWeek.get(week)
    const parts = slot ? [...slot.parts.values()] : []
    const sum = (k: 'videos' | 'comments' | 'commentsNextMonth' | 'under5' | 'olderVideos' | 'unchecked'): number =>
      parts.reduce((a, r) => a + r[k], 0)
    const videos = sum('videos')
    if (videos === 0) {
      return {
        week, state: 'none_gathered', updatesSince,
        videos: 0, comments: 0, category: 0, rivalFiled: 0, commentsNextMonth: 0,
        medianDated: null, under5: 0, olderVideos: 0, unchecked: 0,
      }
    }
    const comments = sum('comments')
    const category = parts.filter((r) => r.audience === INDUSTRY_AUDIENCE).reduce((a, r) => a + r.videos, 0)
    const medians = slot ? [...slot.medians] : []
    const medianDated = slot && !slot.unpooled && medians.length === 1 ? medians[0] : null
    return {
      week,
      state: weekStateOf(week, clock.now, clock.updates),
      updatesSince,
      videos,
      comments,
      category,
      rivalFiled: videos - category,
      commentsNextMonth: sum('commentsNextMonth'),
      medianDated,
      under5: sum('under5'),
      olderVideos: sum('olderVideos'),
      unchecked: sum('unchecked'),
    }
  })
}

/** A row of `market_week_volumes` as PostgREST returns it (snake case;
 *  `numeric` may arrive as a string). */
export interface MarketWeekRowRaw {
  week: string
  audience: string
  videos: number | string
  comments: number | string
  comments_next_month: number | string
  under_5: number | string
  median_dated: number | string | null
  mean_dated: number | string | null
  older_videos: number | string
  unchecked: number | string
}

const num = (v: number | string | null | undefined): number => (v == null ? Number.NaN : typeof v === 'number' ? v : Number(v))
const numOrNull = (v: number | string | null | undefined): number | null => (v == null ? null : num(v))

/** One `market_week_volumes` row, camel-cased. Nothing is coerced to zero: a
 *  malformed count stays NaN and `pooledWeekVolumes` refuses it. */
export function marketWeekRowOf(raw: MarketWeekRowRaw): MarketWeekRow {
  return {
    week: isoWeekOf(raw.week),
    audience: raw.audience,
    videos: num(raw.videos),
    comments: num(raw.comments),
    commentsNextMonth: num(raw.comments_next_month),
    under5: num(raw.under_5),
    medianDated: numOrNull(raw.median_dated),
    meanDated: numOrNull(raw.mean_dated),
    olderVideos: num(raw.older_videos),
    unchecked: num(raw.unchecked),
  }
}

// ---- Our changes, on their weeks ---------------------------------------------

/** Which of our changes the chart draws, by group, and the group's words in
 *  the chart's key. A week in which we changed a search, the relevance check or
 *  the filing carries a dated rule (WP2.9, "Our changes"). A change to how we
 *  READ a video (prompt_version), a lens rule (segment) and the `other` rows (an
 *  attention-panel freeze, a capped gather) move no weekly count, so they draw
 *  nothing here. The words join the block's words in lib/calibration.ts with
 *  the render (WP2.9's component step); they are here until then so the pure
 *  pieces carry no file inside the pipeline's import closure. */
export const WEEK_RULE_GROUPS = {
  search: { words: 'our search changes', surfaces: ['terms', 'platforms', 'knobs', 'subreddits'] },
  relevance: { words: 'how we check relevance', surfaces: ['gate_rule', 'regate'] },
  filing: { words: 'how we file videos', surfaces: ['rivals', 'handles', 'rival_rename', 'entity_retag', 'attribution'] },
} as const satisfies Record<string, { words: string; surfaces: readonly OurChangeSurface[] }>

export type WeekRuleGroup = keyof typeof WEEK_RULE_GROUPS

/** The group a surface draws in, or null when the chart does not draw it. */
export function weekRuleGroupOf(surface: OurChangeSurface): WeekRuleGroup | null {
  for (const [g, def] of Object.entries(WEEK_RULE_GROUPS) as [WeekRuleGroup, (typeof WEEK_RULE_GROUPS)[WeekRuleGroup]][]) {
    if ((def.surfaces as readonly string[]).includes(surface)) return g
  }
  return null
}

/**
 * Our changes on the axis, each on the week it was made, oldest first. The
 * changes are `changesFromLog`'s (so a community change is here only when the
 * active set moved, and one change's rows are one change). A change whose date
 * does not parse, or whose week is not on the axis, is left out.
 */
export function weekRules(changes: readonly OurChange[], axis: readonly string[]): WeekRule[] {
  const on = new Set(axis.map(isoWeekOf))
  const out: (WeekRule & { ms: number })[] = []
  for (const c of changes) {
    const group = weekRuleGroupOf(c.surface)
    if (!group) continue
    const ms = msOfInstant(c.changedAt)
    if (Number.isNaN(ms)) continue
    const week = isoWeekOf(c.changedAt)
    if (!on.has(week)) continue
    out.push({ date: dayOf(ms), week, surface: c.surface, words: WEEK_RULE_GROUPS[group].words, ms })
  }
  return out.sort((a, b) => a.ms - b.ms || a.surface.localeCompare(b.surface)).map(({ ms: _ms, ...r }) => r)
}
