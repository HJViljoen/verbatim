import { fmtInt, longMonth, shortDate, weekdayDate } from '../format'
import { lastExpectedSlot, type ScheduleConfig, DEFAULT_TZ } from '../pipeline/schedule-due'
import { SHARE_BAND } from '../report-bands'
import { thinMonth } from './bands'
import { monthStartOf, nextMonth, prevMonth } from './month-key'
import { freezeBoundary, monthEndInstant } from './monthly'

// The reading month (market-first decision A, plan §4.2, WP1.2).
//
// WHICH MONTH EVERY PAGE READS. Until now each loader read the calendar month
// it was built in, so on 1 October every page read an October with nothing in
// it and printed 29–86% less than it had the day before (GR F56), while the
// month that had just ended, the fullest reading the product holds, was never
// shown as the current state. The rule here is decision A's: read the month
// that has just ended until the new month is half over AND has had two
// updates AND is not thin, then read the month so far. A paused tenant reads
// the LATEST month it has rows for, whatever the date, which is why the
// fallback is "the latest month before this one with a denominator row" and
// not "the previous calendar month": Össur's last update was 13 Sep, and on
// 2 Nov the previous calendar month (October) has no row at all.
//
// THE CLOCK NEVER STANDS IN FOR AN UPDATE. "As at" is the date of the last
// update, the ninety-day windows end at the last update (never the wall
// clock, or Össur's window shrinks to nothing by December), and the bar says
// when the next update is due from the tenant's own schedule. A clock only
// decides which month is current and how far into it we are.
//
// PURE. Every input is handed in: the loader reads the runs, the pooled market
// denominators (decision E: the category plus the videos filed under a tracked
// brand, `lib/reading/market.ts`) and the schedule. Nothing here reads a table.

/** A month's state, in one vocabulary everywhere (plan §2, "Month states the
 *  reader sees"). The words are `monthWords`'; the word "complete" is never
 *  one of them. `so_far`: the month in progress. `ended`: over, still filling
 *  until its freeze. `final`: frozen. `read_at_setup`: back-read at the
 *  one-shot. `too_few`: under the readable floor. */
export type MonthState = 'so_far' | 'ended' | 'final' | 'read_at_setup' | 'too_few'

/** How far into the month (day of month ÷ days in month) the current month
 *  has to be before it leads. Half, not a third: on 11 Oct October has two
 *  updates but only about a third of its comments, and a half-month rule keeps
 *  September in front of Sealand at the 13 Oct call (decision A). ⅓ if
 *  Heinrich picks it; the caller passes `switchFraction`. */
export const READING_SWITCH_FRACTION = 0.5

/** Updates the current month needs before it can lead (decision A). */
export const READING_SWITCH_UPDATES = 2

/** No update for longer than this and the bar says "updates paused". */
export const PAUSED_AFTER_DAYS = 14

/** The query parameter a page takes to read another month: `?month=YYYY-MM`.
 *  Honoured only for a month with a denominator row, no later than the
 *  current month. */
export const MONTH_PARAM = 'month'

/** Under this many market videos a month is "too few to read": the band's own
 *  floor (`SHARE_BAND.minN`, lib/report-bands.ts), so the word and the floor
 *  can never disagree. */
export const MONTH_READABLE_VIDEOS = SHARE_BAND.minN

/** A scheduled update stays "the next update" for a day after its slot (a run
 *  takes about 4.5 h; a slow one longer). Past that it did not come, and the
 *  bar names the slot after it rather than a date in the past. */
export const UPDATE_OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000

const DAY_MS = 86_400_000

export interface ReadingMonth {
  /** 'YYYY-MM-01': the month every block reads. */
  month: string
  /** The state of `month`. */
  state: MonthState
  /** The finish instant of the latest update that read `month`, or null when
   *  no update has (a month read only at setup). */
  readTo: string | null
  /** An update ran after `month`'s last day. */
  readToEnd: boolean
  /** No update for more than `PAUSED_AFTER_DAYS`. */
  paused: boolean
  /** The finish instant of the latest update on or before now. Never the wall
   *  clock; null when there has been no update at all. */
  asAt: string | null
  /** The next scheduled update after `asAt` (`nextUpdateAfter`); null when
   *  paused, or when no schedule was handed in. */
  nextUpdate: string | null
  /** `month` is the current calendar month. */
  leadsWithCurrent: boolean
  /** Why `month` was chosen.
   *  `current_readable` the current month clears all three tests.
   *  `current_early`    it has two updates but is under `switchFraction` in.
   *  `current_thin`     it has under two updates, or is thin (`thinMonth`).
   *  `explicit`         `?month=` named a month with a row.
   *  `latest_with_rows` the calendar month before this one has no row, so
   *                     the latest month that has one leads (a paused tenant).
   *  `no_month`         nothing before the current month has a row. */
  reason: 'current_readable' | 'current_early' | 'current_thin' | 'explicit' | 'latest_with_rows' | 'no_month'
  /** When `month` stops moving: its freeze line (`freezeBoundary`) and the
   *  first scheduled update after it, which is the run that freezes it. Null
   *  once the month is final or was read at setup. */
  settles: { boundary: string; withUpdateOn: string | null } | null
  /** The current calendar month, whether or not it leads. */
  current: { month: string; updates: number; videos: number | null; daysIn: number }
}

export interface ReadingMonthInput {
  /** The clock. Decides only which month is current and how far into it. */
  now: string
  /** Finish instants of completed or partial runs. Failed runs are not
   *  updates. Instants after `now` are ignored. */
  updates: readonly string[]
  /** The pooled market denominators by month (decision E). A month present
   *  here "has a denominator row". */
  videosByMonth: ReadonlyMap<string, number>
  /** The month of the tenant's first run: before it a month is read at setup
   *  (when `rows` does not say), and `thinMonth`'s trailing median counts only
   *  months from it on. */
  firstRunMonth: string
  /** The stored status and origin of each month's row, where the loader has
   *  them. They win over what is derived here: a month seeded at the one-shot
   *  is back-read whenever the first run was (Össur's June), and a run that
   *  finished past a month's freeze line without reaching freeze-months froze
   *  nothing. A month missing here is derived: back-read before
   *  `firstRunMonth`, frozen once an update finished past its freeze line. */
  rows?: ReadonlyMap<string, { status: 'filling' | 'frozen'; origin: 'live' | 'back_read' }>
  /** `?month=`: honoured when it names a month with a row, ≤ current. */
  explicit?: string | null
  switchFraction?: number
  /** The next scheduled update strictly after an instant. Sealand: the next
   *  Sunday 06:00 SAST (`scheduledUpdateAfter`). */
  nextUpdateAfter?: (instant: string) => string | null
}

// ---- Small helpers ------------------------------------------------------------

const msOf = (iso: string): number => Date.parse(iso)

/** Days in a month, 28–31. */
export function daysInMonth(month: string): number {
  return new Date(Date.parse(`${nextMonth(month)}T00:00:00.000Z`) - DAY_MS).getUTCDate()
}

/** `?month=` in, a month start out, or null for anything that is not a month.
 *  Accepts 'YYYY-MM' and 'YYYY-MM-01'; nothing looser, so a stray date or a
 *  typo never selects a month by accident. */
export function parseMonthParam(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/)
  return m ? `${m[1]}-${m[2]}-01` : null
}

/**
 * The tenant's schedule as `nextUpdateAfter`: the next slot strictly after an
 * instant, or null when no cadence applies (paused, unset). One rule with the
 * dispatcher and the ops check (`lastExpectedSlot`, lib/pipeline/schedule-due.ts),
 * never a second copy of it.
 *
 * Weekly: the one slot in (t, t + 7 days]. Monthly: the 1st after the last
 * slot at or before t (32 days on from a 1st always lands in the next month).
 */
export function scheduledUpdateAfter(
  cfg: ScheduleConfig,
  tz: string = DEFAULT_TZ,
): (instant: string) => string | null {
  return (instant: string) => {
    const t = msOf(instant)
    if (Number.isNaN(t)) return null
    if (cfg.report_period === 'weekly') {
      return lastExpectedSlot(cfg, new Date(t + 7 * DAY_MS), tz)?.toISOString() ?? null
    }
    if (cfg.report_period === 'monthly') {
      const last = lastExpectedSlot(cfg, new Date(t), tz)
      if (!last) return null
      return lastExpectedSlot(cfg, new Date(last.getTime() + 32 * DAY_MS), tz)?.toISOString() ?? null
    }
    return null
  }
}

interface Update { iso: string; ms: number }

function doneUpdates(updates: readonly string[], nowMs: number): Update[] {
  return updates
    .map((iso) => ({ iso, ms: msOf(iso) }))
    .filter((u) => !Number.isNaN(u.ms) && u.ms <= nowMs)
    .sort((a, b) => a.ms - b.ms)
}

/** The updates that read a month: every update from the month's first day up
 *  to its freeze line, plus the first one past the line, which is the run
 *  that writes its final values and freezes it (`monthsToRefresh`,
 *  lib/reading/monthly.ts). Nothing after that run touches it again. */
function updatesReading(month: string, done: readonly Update[]): { reading: Update[]; freezeRun: Update | null } {
  const startMs = msOf(`${month}T00:00:00.000Z`)
  const lineMs = msOf(freezeBoundary(month))
  const reading: Update[] = []
  let freezeRun: Update | null = null
  for (const u of done) {
    if (u.ms < startMs) continue
    if (u.ms < lineMs) reading.push(u)
    else { freezeRun = u; reading.push(u); break }
  }
  return { reading, freezeRun }
}

/** The next scheduled update after `base` that is not already overdue at
 *  `nowMs`. Bounded: a schedule that never reaches the present answers null
 *  rather than looping. */
function nextSlot(base: string, nowMs: number, after: (instant: string) => string | null): string | null {
  let next = after(base)
  for (let guard = 0; next != null && guard < 400; guard++) {
    const at = msOf(next)
    if (Number.isNaN(at)) return null
    if (at + UPDATE_OVERDUE_AFTER_MS >= nowMs) return next
    next = after(next)
  }
  return null
}

// ---- The month's state ----------------------------------------------------------

/**
 * One month's state at `now`.
 *
 * In this order, each winning over the ones after it:
 *   so_far         `now` is before the month ends.
 *   too_few        the market had fewer than 100 videos, and the count is
 *                  settled enough to say so: the month is frozen, or it has
 *                  been read past its end (`readToEnd`; omitted counts as
 *                  read). A month still being read towards its end may yet
 *                  clear the floor, so it reads `ended` until then.
 *   read_at_setup  the row was back-read at the one-shot.
 *   final          the row is frozen.
 *   ended          everything else.
 *
 * Without a row nothing here claims `final` or `read_at_setup`: those are
 * facts about a stored row, and the clock passing a freeze line is not the
 * run that froze it.
 */
export function monthStateOf(
  month: string,
  now: string,
  row?: { status: 'filling' | 'frozen'; origin: 'live' | 'back_read'; videos: number | null } | null,
  readToEnd?: boolean,
): MonthState {
  const m = monthStartOf(month)
  if (msOf(now) < msOf(monthEndInstant(m))) return 'so_far'
  const videos = row?.videos
  const settledSize = row?.status === 'frozen' || readToEnd !== false
  if (videos != null && Number.isFinite(videos) && videos < MONTH_READABLE_VIDEOS && settledSize) return 'too_few'
  if (row?.origin === 'back_read') return 'read_at_setup'
  if (row?.status === 'frozen') return 'final'
  return 'ended'
}

// ---- The rule -------------------------------------------------------------------

/**
 * The month every block reads (decision A).
 *
 * `explicit` (valid) → it. Else the current month when it has had at least two
 * updates AND day-of-month ÷ days-in-month ≥ `switchFraction` AND it is not
 * thin (`thinMonth`, lib/reading/bands.ts). Else the LATEST month before the
 * current one with a denominator row. Else the current month.
 *
 * Sealand's calendar under it (Sunday updates): September so far to 30 Sep;
 * September, ended, 1–15 Oct (on 11 Oct October has two updates but is on day
 * 11 of 31); October so far from 16 Oct; October, ended, from 1 Nov. Össur,
 * paused since 13 Sep, reads September on every date.
 */
export function readingMonthFor(input: ReadingMonthInput): ReadingMonth {
  const nowMs = msOf(input.now)
  if (Number.isNaN(nowMs)) throw new Error(`readingMonthFor: not a date: ${input.now}`)
  const current = monthStartOf(input.now)
  const done = doneUpdates(input.updates, nowMs)
  const last = done.length > 0 ? done[done.length - 1] : null

  const videos = new Map<string, number>()
  for (const [m, v] of input.videosByMonth) videos.set(monthStartOf(m), v)
  const withRows = [...videos.keys()].sort()
  const firstRun = monthStartOf(input.firstRunMonth)

  const currentUpdates = done.filter((u) => monthStartOf(u.iso) === current).length
  const daysIn = new Date(nowMs).getUTCDate()
  const currentVideos = videos.get(current) ?? null
  const fraction = input.switchFraction ?? READING_SWITCH_FRACTION
  const early = daysIn / daysInMonth(current) < fraction
  const trailing = withRows
    .filter((m) => m < current && m >= firstRun)
    .slice(-12)
    .map((m) => videos.get(m) ?? null)
  const thin = thinMonth(
    { month: current, videos: currentVideos, k: null },
    trailing,
    { updates: currentUpdates, firstRunMonth: firstRun },
  )

  let month: string
  let reason: ReadingMonth['reason']
  const explicit = parseMonthParam(input.explicit)
  if (explicit && videos.has(explicit) && explicit <= current) {
    month = explicit
    reason = 'explicit'
  } else if (currentUpdates >= READING_SWITCH_UPDATES && !early && !thin) {
    month = current
    reason = 'current_readable'
  } else {
    const before = withRows.filter((m) => m < current)
    const fallback = before.length > 0 ? before[before.length - 1] : null
    if (fallback == null) {
      month = current
      reason = 'no_month'
    } else {
      month = fallback
      reason = fallback !== prevMonth(current)
        ? 'latest_with_rows'
        : currentUpdates < READING_SWITCH_UPDATES
          ? 'current_thin'
          : early ? 'current_early' : 'current_thin'
    }
  }

  const { reading, freezeRun } = updatesReading(month, done)
  const readToU = reading.length > 0 ? reading[reading.length - 1] : null
  const readToEnd = readToU != null && readToU.ms >= msOf(monthEndInstant(month))
  let stored: { status: 'filling' | 'frozen'; origin: 'live' | 'back_read' } | undefined
  for (const [m, r] of input.rows ?? []) if (monthStartOf(m) === month) stored = r
  const row = videos.has(month) || stored
    ? {
        status: stored?.status ?? (freezeRun ? 'frozen' as const : 'filling' as const),
        origin: stored?.origin ?? (month < firstRun ? 'back_read' as const : 'live' as const),
        videos: videos.get(month) ?? null,
      }
    : null
  const state = monthStateOf(month, input.now, row, readToEnd)

  const paused = last != null && nowMs - last.ms > PAUSED_AFTER_DAYS * DAY_MS
  const after = input.nextUpdateAfter
  const nextUpdate = paused || !after ? null : nextSlot(last?.iso ?? input.now, nowMs, after)
  const boundary = freezeBoundary(month)
  const settles = state === 'final' || state === 'read_at_setup'
    ? null
    : { boundary, withUpdateOn: after ? after(boundary) : null }

  return {
    month,
    state,
    readTo: readToU?.iso ?? null,
    readToEnd,
    paused,
    asAt: last?.iso ?? null,
    nextUpdate,
    leadsWithCurrent: month === current,
    reason,
    settles,
    current: { month: current, updates: currentUpdates, videos: currentVideos, daysIn },
  }
}

/** The `now` handed to `horizonWindow`: noon on the reading month's first day,
 *  so every horizon a page draws is anchored on the month it reads. */
export function readingAnchor(r: ReadingMonth): string {
  return `${r.month}T12:00:00.000Z`
}

/** Where a ninety-day window ends: the end of the reading month, or the last
 *  update if that came first. Never the clock: Össur's window ends on 13 Sep
 *  on 7 Dec, as it did on 2 Oct. */
export function windowEnd(r: ReadingMonth): string {
  const end = monthEndInstant(r.month)
  if (r.asAt == null) return end
  const asAtMs = msOf(r.asAt)
  return !Number.isNaN(asAtMs) && asAtMs < msOf(end) ? r.asAt : end
}

/** The month the monthly report reads: the latest month with rows that has
 *  ended at `now`. With none, the calendar month before `now`'s. */
export function closedMonthFor(now: string, monthsWithRows: readonly string[]): string {
  const nowMs = msOf(now)
  const ended = monthsWithRows
    .map(monthStartOf)
    .filter((m) => msOf(monthEndInstant(m)) <= nowMs)
    .sort()
  return ended.length > 0 ? ended[ended.length - 1] : prevMonth(monthStartOf(now))
}

// ---- Words ------------------------------------------------------------------------

const plural = (n: number, one: string, many: string): string => `${fmtInt(n)} ${n === 1 ? one : many}`

/**
 * The month selector's tooltip, never the bar line (25 Sep rulings, §1 B):
 *   "October so far · 16 days · 2 updates"
 *   "September · ended · read to the 11 Oct update · still filling until the 1 Nov update"
 *   "September · read to the 13 Sep update · updates paused"
 *   "August · final" · "June · read at setup" · "July · 35 videos · too few to read"
 * `videos` is the month's market count, printed only on "too few to read".
 */
export function monthWords(r: ReadingMonth, videos?: number | null): string {
  const name = longMonth(r.month)
  switch (r.state) {
    case 'so_far': {
      if (r.current.month !== r.month) return `${name} so far`
      const updates = r.current.updates === 0 ? 'no update yet' : plural(r.current.updates, 'update', 'updates')
      return `${name} so far · ${plural(r.current.daysIn, 'day', 'days')} · ${updates}`
    }
    case 'final':
      return `${name} · final`
    case 'read_at_setup':
      return `${name} · read at setup`
    case 'too_few':
      return videos != null && Number.isFinite(videos)
        ? `${name} · ${plural(videos, 'video', 'videos')} · too few to read`
        : `${name} · too few to read`
    case 'ended': {
      const readTo = r.readTo ? `read to the ${shortDate(r.readTo)} update` : null
      if (r.paused) return [name, readTo, 'updates paused'].filter(Boolean).join(' · ')
      const filling = r.settles?.withUpdateOn ? `still filling until the ${shortDate(r.settles.withUpdateOn)} update` : null
      return [name, 'ended', readTo, filling].filter(Boolean).join(' · ')
    }
  }
}

/**
 * The bar's one line (25 Sep rulings, §1 B): "as at the 11 Oct update · next
 * update Sun 18 Oct"; paused: "as at the 13 Sep update · updates paused". The
 * month's state is the selector's (`monthWords`), never this line's.
 */
export function barLine(r: ReadingMonth): string {
  if (r.asAt == null) return r.nextUpdate ? `no update yet · next update ${weekdayDate(r.nextUpdate)}` : 'no update yet'
  const asAt = `as at the ${shortDate(r.asAt)} update`
  if (r.paused) return `${asAt} · updates paused`
  return r.nextUpdate ? `${asAt} · next update ${weekdayDate(r.nextUpdate)}` : asAt
}
