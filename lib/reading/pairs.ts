import { pairSentence } from '../calibration'
import {
  changeInSpan,
  comparabilityOf,
  COMPARE_FLAG_SHARE,
  isSearchSurface,
  joins,
  latestPairRow,
  measuredShareOf,
  pairOnVerdict,
  type ComparabilityView,
  type OurChange,
  type PairComparability,
  type PairRow,
} from './comparability'
import { monthStartOf, nextMonth } from './month-key'
import { freezeBoundary, monthEndInstant } from './monthly'
import { monthStateOf, nextSlot, PAUSED_AFTER_DAYS, type MonthState } from './reading-month'

// The month-pair judge a loader holds (market-first decision D, WP1.3).
//
// `comparabilityOf` (lib/reading/comparability.ts) judges one pair from
// inputs it is handed. A page judges the same few pairs for dozens of objects,
// on several views, and has to say which update a refused pair is read with
// next. This is that glue, still pure: the loader reads the change log, the
// pair rows and the updates once (lib/reading/read.ts `loadPairContext`) and
// every verdict and chart step on the page asks this judge.
//
// Kept apart from comparability.ts so the rule stays free of the reading
// month's imports: bands.ts imports the rule, and the reading month imports
// bands.ts.

const msOf = (iso: string): number => Date.parse(iso)

/** A completed or partial run: an update. `finishedAt` is `completed_at`. */
export interface UpdateRun {
  id: string
  finishedAt: string
}

/**
 * The later month of a pair as `comparabilityOf` needs it, from the updates.
 *
 * The updates that read a month are every update from its first day up to its
 * freeze line, plus the first one past the line, which is the run that freezes
 * it (the reading month's own rule, lib/reading/reading-month.ts). The latest
 * of those at `now` is the month's latest update: a pair row that does not
 * account for it is stale. The month was read to its end when that update
 * finished after the month's last day. The state is `so_far` until the month
 * ends and `ended` after (the rule reads no other state).
 */
export function laterMonthOf(
  month: string,
  now: string,
  updates: readonly UpdateRun[],
): { state: MonthState; readToEnd: boolean; latestUpdateRunId: string | null } {
  const m = monthStartOf(month)
  const nowMs = msOf(now)
  const startMs = msOf(`${m}T00:00:00.000Z`)
  const lineMs = msOf(freezeBoundary(m))
  const done = updates
    .map((u) => ({ id: u.id, ms: msOf(u.finishedAt) }))
    .filter((u) => Number.isFinite(u.ms) && u.ms <= nowMs && u.ms >= startMs)
    .sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id))
  let latest: { id: string; ms: number } | null = null
  for (const u of done) {
    latest = u
    if (u.ms >= lineMs) break
  }
  return {
    state: Number.isNaN(nowMs) ? 'so_far' : monthStateOf(m, now),
    readToEnd: latest != null && latest.ms >= msOf(monthEndInstant(m)),
    latestUpdateRunId: latest?.id ?? null,
  }
}

/** The category's audience key: `INDUSTRY_AUDIENCE` (lib/rivals.ts), kept as a
 *  literal so this pure module stays free of the rivals module's I/O imports
 *  (pinned equal by the test). */
export const CATEGORY_AUDIENCE = 'industry-other'

/** The view a month verdict on one audience is judged for. The pooled market
 *  is `market`. The category is `themes`: everything read inside it (themes,
 *  subjects, kinds, mood) is grouped per audience, so re-filing a video between
 *  a brand and the category moves it, and its shares divide by the category's
 *  own n (decision E). Any other audience (you, a rival) is `brands`. */
export function viewForAudience(audience: string, marketKey = 'market'): ComparabilityView {
  if (audience === marketKey) return 'market'
  return audience === CATEGORY_AUDIENCE ? 'themes' : 'brands'
}

/** The key a whole-panel statement about brands is judged under: the
 *  standings (every brand's share of the month) are the brands view, not any
 *  one audience's. `viewForAudience` reads it as `brands`. */
export const BRANDS_PANEL = 'panel:brands'

export type PairJudge = (prevMonth: string, month: string, view: ComparabilityView) => PairComparability

export interface PairJudgeInput {
  now: string
  changes: readonly OurChange[]
  rows: readonly PairRow[]
  updates: readonly UpdateRun[]
  /** The tenant's schedule (`scheduledUpdateAfter`, lib/reading/reading-month.ts).
   *  Without one no refusal names an update to be checked with. */
  nextUpdateAfter?: ((instant: string) => string | null) | null
}

const DAY_MS = 86_400_000

/**
 * Every month pair a page reads, judged one way: `comparabilityOf` over the
 * tenant's changes, its newest pair rows and its updates, with the update each
 * refusal is next read with. Memoised per pair and view, because a page judges
 * the same pair for dozens of objects.
 *
 * `checkWith`: none when updates are paused (no update for more than
 * `PAUSED_AFTER_DAYS`), when no schedule is known, or when the later month is
 * past its freeze line (no later update reads it). Otherwise the first scheduled
 * update after the later month ends, or after the last update if that is
 * later, that is not already overdue: October so far on 16 Oct is checked with
 * the 1 Nov update; September on 1 Oct with the 4 Oct update.
 */
export function pairJudge(input: PairJudgeInput): PairJudge {
  const cache = new Map<string, PairComparability>()
  const nowMs = msOf(input.now)
  const done = input.updates.map((u) => msOf(u.finishedAt)).filter((t) => Number.isFinite(t) && t <= nowMs)
  const lastMs = done.length > 0 ? Math.max(...done) : null
  const paused = lastMs != null && nowMs - lastMs > PAUSED_AFTER_DAYS * DAY_MS
  const after = input.nextUpdateAfter ?? null

  const checkWithFor = (month: string): string | null => {
    if (!after || paused || Number.isNaN(nowMs)) return null
    // A month past its freeze line is read by no later update, so no update
    // is promised for it.
    if (nowMs >= msOf(freezeBoundary(month))) return null
    const endMs = msOf(monthEndInstant(month))
    const baseMs = Math.max(lastMs ?? nowMs, endMs)
    return nextSlot(new Date(baseMs).toISOString(), nowMs, after)
  }

  return (prevMonth, month, view) => {
    const pm = monthStartOf(prevMonth)
    const m = monthStartOf(month)
    const key = `${pm}|${m}|${view}`
    const held = cache.get(key)
    if (held) return held
    const pair = comparabilityOf(pm, m, {
      row: latestPairRow(input.rows, pm, m),
      changes: input.changes,
      view,
      later: laterMonthOf(m, input.now, input.updates),
    })
    // THE REAL CAUSE IS NAMED WHILE A MONTH IS STILL BEING READ, TOO. Rules 1
    // and 2 (a so-far month, a month not read past its end) return before the
    // change list, which rule 3 lists so the words can name the real cause.
    // A so-far September that our own search changes also refuse is refused
    // for those changes, and says so: "Not read as a change: we changed what
    // we search in September" on 20 Sep and on 2 Oct (WP1.3). The rule's own
    // first reason stays first; the mode is already refuse. A pair with no
    // change of ours in its span still reads "not compared yet".
    //
    // A CHANGE THE ROW MEASURED UNDER 1% IS NOT BLAMED (WP1.3 review fix). A
    // pair row, where one exists, carries each change's measured share: under
    // the flag share the change is left out, and between the flag and refusal
    // shares it is listed with that share, so it cannot be named as the cause
    // of the refusal (the month's own state is). Only a change the row does not
    // measure, or measured at 10% or more, can be named.
    const early = pair.reasons[0]?.kind === 'incomplete' || pair.reasons[0]?.kind === 'not_read_to_end'
    const row = pair.row
    const named: PairComparability = early && pm < m
      ? {
          ...pair,
          reasons: [
            ...pair.reasons,
            ...input.changes
              .filter((c) => c.affects.includes(view) && changeInSpan(c, pm, m))
              .sort((a, b) => msOf(a.changedAt) - msOf(b.changedAt))
              .map((c) => ({ c, share: measuredShareOf(row, c, view) }))
              .filter(({ share }) => share == null || !(share < COMPARE_FLAG_SHARE))
              .map(({ c, share }) => ({
                kind: isSearchSurface(c.surface) ? ('searches' as const) : ('code_change' as const),
                changeId: c.id,
                share,
                changedAt: c.changedAt,
                surface: c.surface,
              })),
          ],
        }
      : pair
    const out: PairComparability = { ...named, checkWith: named.mode === 'refuse' ? checkWithFor(m) : null }
    cache.set(key, out)
    return out
  }
}

/** A month pair on one audience: the judge, with the view the audience is
 *  judged for (`viewForAudience`). What a page's builders are handed. */
export type PairOn = (prevMonth: string, month: string, audience: string) => PairComparability

export function pairOn(judge: PairJudge, marketKey?: string): PairOn {
  return (prevMonth, month, audience) => judge(prevMonth, month, viewForAudience(audience, marketKey))
}

/** `DirectionInput.comparable` for one audience: every step must join. */
export function comparableOn(pair: PairOn, audience: string): (prevMonth: string, month: string) => boolean {
  return (prevMonth, month) => joins(pair(prevMonth, month, audience))
}

/**
 * The refused steps along a run of months, for a chart (WP1.3, the chart
 * rule): each LATER month whose step from the calendar month before it is
 * refused, with the refusal's sentence. A step between two months that are not
 * consecutive on the calendar is not a step and is not judged; the chart does
 * not join across a gap anyway. The points stay: only the segment goes.
 */
export function refusedSteps(
  months: readonly string[],
  pair: (prevMonth: string, month: string) => PairComparability | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  const axis = [...new Set(months.map(monthStartOf))].sort()
  for (let i = 1; i < axis.length; i++) {
    if (axis[i] !== nextMonth(axis[i - 1])) continue
    const note = pairOnVerdict(pair(axis[i - 1], axis[i])).note
    if (note && note.mode === 'refuse') out[axis[i]] = pairSentence(note)
  }
  return out
}

/**
 * The run of months a reader may print side by side (T0a, the one condition):
 * the stretch around `anchor` that no refused step crosses.
 *
 * A level printed beside another month's level is a comparison, joined by a
 * line or not. So where the judge refuses a step, the months on the far side
 * of it from the anchor are not printed at all: a trail ending at the reading
 * month keeps the months since the latest refused step (`anchor` = the newest
 * month), and a move read forward from its own month keeps the months up to
 * the first one (`anchor` = the move's month). `joined(prev, month)` judges
 * one calendar step (`joins(pair(prev, month, audience))`); a step between two
 * months that are not consecutive is not judged, as `refusedSteps` does not
 * judge it. Points are taken in month order; an anchor not among them
 * returns nothing. PURE.
 */
export function joinedRun<T extends { month: string }>(
  points: readonly T[],
  anchor: string,
  joined: (prevMonth: string, month: string) => boolean,
): T[] {
  const sorted = [...points].sort((a, b) => monthStartOf(a.month).localeCompare(monthStartOf(b.month)))
  const at = sorted.findIndex((p) => monthStartOf(p.month) === monthStartOf(anchor))
  if (at < 0) return []
  const steps = (i: number): boolean => {
    const prev = monthStartOf(sorted[i - 1].month)
    const month = monthStartOf(sorted[i].month)
    return month !== nextMonth(prev) || joined(prev, month)
  }
  let from = at
  while (from > 0 && steps(from)) from--
  let to = at
  while (to < sorted.length - 1 && steps(to + 1)) to++
  return sorted.slice(from, to + 1)
}

/**
 * The three questions a page builder asks of its judge, in one place: the pair
 * for a verdict, `comparable` for a direction word, and the refused steps along
 * a sparkline's months (true where the step INTO that slot is refused). With no
 * judge (a fixture: "no month pair applies here") nothing is refused, every
 * step joins and no break list is made, so a fixture renders as it did.
 */
export function pairTools(pair: PairOn | null): {
  pairFor: (prevMonth: string, month: string, audience: string) => PairComparability | null
  comparableFor: (audience: string) => (prevMonth: string, month: string) => boolean
  stepBreaks: (months: readonly string[], audience: string) => boolean[] | undefined
  stepReasons: (months: readonly string[], audience: string) => (string | null)[] | undefined
} {
  return {
    pairFor: (prevMonth, month, audience) => (pair ? pair(prevMonth, month, audience) : null),
    comparableFor: (audience) => (pair ? comparableOn(pair, audience) : () => true),
    stepBreaks: (months, audience) => {
      if (!pair) return undefined
      return months.map((m, i) => {
        if (i === 0) return false
        const prev = monthStartOf(months[i - 1])
        return monthStartOf(m) === nextMonth(prev) && !joins(pair(prev, m, audience))
      })
    },
    // The same steps with the refusal's sentence (null where the step joins),
    // for a chart that prints why in its figure line (`brokenBefore`).
    stepReasons: (months, audience) => {
      if (!pair) return undefined
      return months.map((m, i) => {
        if (i === 0) return null
        const prev = monthStartOf(months[i - 1])
        if (monthStartOf(m) !== nextMonth(prev)) return null
        const note = pairOnVerdict(pair(prev, m, audience)).note
        return note && note.mode === 'refuse' ? pairSentence(note) : null
      })
    },
  }
}

/**
 * A judge that refuses every pair as unmeasured: what a reader holds when the
 * pair inputs could not be read at all. It fails CLOSED, because the other way
 * round a read error would let a "moved" through (decision D: absence reads as
 * "unmeasured", never as "no change").
 */
export const refuseEveryPair: PairOn = (prevMonth, month) => ({
  prevMonth: monthStartOf(prevMonth),
  month: monthStartOf(month),
  mode: 'refuse',
  reasons: [{ kind: 'unmeasured', changeId: null, share: null }],
  row: null,
  checkWith: null,
})
