import type { SupabaseClient } from '@supabase/supabase-js'

import { mapWithLimit, READ_CONCURRENCY } from '../chunk'
import { fmtInt } from '../format'
import { rowWindow } from '../pipeline/run-bookkeeping'
import type { Scope } from '../renderables/types'
import { selectAll } from '../supabase-admin'
import { monthStartOf, nextMonth } from './month-key'
import { isMissingMonthlyReading, isMissingMonthTable } from './monthly'
import { loadWindowReading, type ReadingHandle } from './read'

/**
 * The series This week draws its chart from — the last thirteen UPDATES
 * (Phase 1 Block D, D5; `week.unusual.chart` / `.chart.legend`).
 *
 * THIS IS A CHART OF OUR CADENCE, NOT OF THE CONVERSATION, and every line in
 * this file exists to keep it that way.
 *
 * The mock draws a thirteen-WEEK series with a count band ("9–15, typical 12").
 * A thirteen-week series is a period series at a cadence the reading layer
 * refuses to key on: a period is dated by the comment, the series is per
 * calendar month, and months do not divide into weeks because a thread spanning
 * two weeks is a member of both (AGENTS.md; lib/reading/anomaly.ts). So the
 * feature is built at the one cadence that IS real, dated and counted — the
 * update. `GLOSSARY.update`: "one delivery … counted and dated in the record;
 * an update is never a period". This week is the one surface dated by the
 * delivery, so this is the one surface a series of updates belongs on.
 *
 * FOUR RULES THE SHAPE ENFORCES:
 *
 *   1. EVERY POINT'S WINDOW COMES OFF ITS RUN ROW. `pipeline_runs.window_start`
 *      / `window_end` through `rowWindow`, never recomputed from the clock —
 *      three steps once did and two multi-day runs gathered and synthesised
 *      against windows 18 and 9 days apart. A run with no window is EXCLUDED
 *      and named in `note`, never drawn at a guessed width.
 *
 *   2. EVERY POINT RESTATES ITS CONTRIBUTION TO THE MONTH IT FALLS IN. That is
 *      the rule This week already keeps for its own update ("this update's
 *      contribution to September so far: 205 of 449"), applied to all thirteen,
 *      so the chart can never be read as a period series. A window that crosses
 *      a month boundary — which a monthly cadence does every time — carries
 *      BOTH months, each with its own clipped numerator and the month's own
 *      denominator.
 *
 *   3. THE BAND IS A COUNT BAND AND SAYS SO. `UnusualFlag.bandPts` is in
 *      percentage points; this one is in videos. Two bands on one block that do
 *      not say which is which is how a reader reads 4.9 points as five videos,
 *      so `updateSeriesLine` prints the unit and `band` is documented as a
 *      count everywhere it is named.
 *
 *   4. NO DIRECTION WORD, NO TREND LINE, NO MULTIPLE. Thirteen readings of our
 *      own cadence are not three consecutive monthly readings under one
 *      clustering, so nothing here earns `directionWord` (lib/reading/bands.ts)
 *      and no reader flag is turned on for it. The mock's "3.1× its usual rate"
 *      has no honest form at all: it is a ratio of two counts on two different
 *      spans of days, and the product's answer to "was this update unusual" is
 *      the anomaly check's banded k-of-n, which is printed a few lines above.
 */

/** How many updates the series draws. Thirteen, the mock's own point count. */
export const UPDATE_SERIES_POINTS = 13

/**
 * How many points the band needs before it is drawn at all.
 *
 * THREE, which is two behind the newest. A "typical" from one prior update is
 * that update, and a range from one point is a point. Below this the series
 * still draws — a reader wants to see the two updates there are — and `band`
 * and `median` are null with `note` saying why.
 */
export const UPDATE_BAND_MINIMUM = 3

/** One update, as a point on the series. */
export interface UpdatePoint {
  runId: string
  /** The run's OWN frozen window — never recomputed from the clock. */
  window: { from: string; to: string }
  days: number
  /**
   * Videos this update NEWLY FOUND — `videos.run_id`, the run that discovered
   * them, which is written once and never rewritten.
   *
   * NOT `analyzed_run_id`, AND THE DIFFERENCE IS THE WHOLE POINT OF THIS
   * FIELD. That column names the run whose insights are a video's CURRENT
   * analysis (AGENTS.md, incremental Pass A), so it MOVES: every time a newer
   * update re-reads a video, the older update loses it. Measured read-only on
   * production, 2026-09-18 — Össur's thirteen delivered updates, counted on
   * `analyzed_run_id`: 508, 205, 65, 796, and then NINE ZEROES. Those nine
   * updates each analysed several hundred videos at the time; every one of
   * them has since been superseded. A chart of that column would tell a paying
   * client we read nothing for nine weeks, which is false, and it would tell
   * them so in the one section of the product whose printed question is what
   * the update actually read.
   *
   * `run_id` does not move, and over the same thirteen updates it reads 618,
   * 559, 466, 376, 473, 456, 488, 0, 462, 1, 0, 94, 0 — which is a record of
   * our cadence, zeroes and all. It is also the number `CameInBlock.gathered`
   * already prints for the newest update (618), so the chart's rightmost point
   * and the block below it agree by construction.
   *
   * A ZERO HERE IS A REAL ZERO: an update that found nothing. It is drawn, and
   * it is kept OUT of the band (see `updateBand`), because "what an update of
   * this workspace usually brings in" is not a question about the updates that
   * brought in nothing.
   */
  videos: number
  /** Comments dated inside the window, where the window read answers. */
  comments: number | null
  /** The month this window falls in; both months when it crosses. */
  months: string[]
  /** This update's contribution to each of those months, and the month's own
   *  denominator — the restatement that stops a reader treating it as a period. */
  contribution: { month: string; videos: number; of: number }[]
}

/**
 * Why the series is short, or absent, or read against fewer updates than it
 * has — one sentence, with the KIND of caveat it is beside it.
 *
 * THE KIND IS WHAT LETS A CHART NOT REPEAT ITSELF (Block D wave 2, design
 * review F4). `note` is these joined with a space and is what a surface with
 * no picture prints; a surface that DRAWS the series draws the quiet updates
 * on the floor and says so in its legend, so it prints every caveat except
 * `quiet`. Matching on the sentence's own words to do that would be a renderer
 * deciding which of the reading layer's statements it had already made — this
 * is the reading layer saying it.
 */
export type UpdateNoteKind =
  /** Updates behind this one that found nothing, left out of the band. */
  | 'quiet'
  /** Delivered updates carrying no window at all, not drawn. */
  | 'windowless'
  /** Fewer points than were asked for. */
  | 'short'
  /** No band, and which of the two reasons. */
  | 'no_band'
  /** The windowed reading is absent or failed, so no contribution is stated. */
  | 'window_read'

export interface UpdateNote {
  kind: UpdateNoteKind
  text: string
}

export interface UpdateSeries {
  /** Oldest first, at most `updates` points. */
  points: UpdatePoint[]
  /** The median videos-per-update of the points behind the newest. */
  median: number | null
  /** A COUNT band, labelled as one — never percentage points. */
  band: { low: number; high: number } | null
  /** "the last 13 updates · what each one brought in" — the axis's own words. */
  basis: string
  /** Why the series is short or absent — every caveat, joined. */
  note: string | null
  /** The same caveats, each with its kind, so a surface that has already drawn
   *  one does not print it twice. */
  notes: UpdateNote[]
}

export interface UpdateSeriesOptions {
  updates?: number
}

const DAY_MS = 86_400_000

/** The most months one window may be spread over before `monthsOfWindow` stops
 *  counting. A cap, not a rule: no real window reaches it. */
const MAX_WINDOW_MONTHS = 120

const EMPTY_BASIS = 'no update of this workspace carries a window'

/** The axis's words when the runs themselves could not be read. NOT
 *  `EMPTY_BASIS`, which asserts something we did not manage to look at: on this
 *  arm what is true is that we could not look. Not rendered today — `Series`
 *  draws nothing without points — which is exactly why it has to be right
 *  before a wave-2 port prints `basis` unconditionally. */
const UNREAD_BASIS = 'this workspace’s updates could not be read just now'

/** An empty series, with a reason. The shape never changes, so a block that
 *  draws it never has to guard. */
function emptySeries(note: string, basis: string = EMPTY_BASIS, notes: UpdateNote[] = []): UpdateSeries {
  return { points: [], median: null, band: null, basis, note, notes }
}

/**
 * The band and the median over the points BEHIND the newest.
 *
 * Behind, not including: the newest point is the one the legend compares, and a
 * median that contains the number it is being compared with moves with it. On
 * thirteen points that is a 1/13 self-comparison, which is small and is
 * precisely the kind of small wrongness nobody ever finds again.
 *
 * THE BAND IS THE OBSERVED RANGE, min to max, and nothing cleverer. "The twelve
 * before it ran 9–15 videos" is a claim a reader can check against the chart
 * with their eyes: the shortest bar was 9 and the tallest 15. A quartile band
 * would be a claim about a distribution nobody has argued this data has, drawn
 * on twelve points.
 *
 * The median may be fractional on an even count (the mean of the two middle
 * values, the ordinary definition). It is carried exact and rounded only where
 * it is PRINTED, so a caller charting it is not handed a rounded number.
 */
export function updateBand(points: readonly UpdatePoint[]): {
  median: number | null
  band: { low: number; high: number } | null
  /** How many of the points behind the newest the band was drawn on. */
  counted: number
  /** How many were left out because they found nothing. */
  quiet: number
} {
  const behind = points.slice(0, -1)
  const found = behind.filter((p) => p.videos > 0).map((p) => p.videos)
  const quiet = behind.length - found.length
  if (points.length < UPDATE_BAND_MINIMUM || found.length < UPDATE_BAND_MINIMUM - 1) {
    return { median: null, band: null, counted: found.length, quiet }
  }
  const sorted = [...found].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { median, band: { low: sorted[0], high: sorted[sorted.length - 1] }, counted: found.length, quiet }
}

const NO_SERIES = 'No delivered update of this workspace carries a window, so there is nothing to draw.'

/**
 * The newest update's own count, in words: "38 videos this update found".
 *
 * THE HALF OF `updateSeriesLine` A CHART DOES NOT DRAW (Block D wave 2, design
 * review F4). Where the series is drawn, the picture's own legend states the
 * band and its typical and how many updates found nothing — so a surface that
 * printed the whole line under the chart said those two facts twice, two lines
 * apart, in one column. What the chart does NOT say in words is the newest
 * point's count, which is the number the page is about; this is that, alone.
 */
export function updateSeriesHead(series: UpdateSeries): string {
  const newest = series.points[series.points.length - 1]
  if (!newest) return NO_SERIES
  return `${fmtInt(newest.videos)} ${newest.videos === 1 ? 'video' : 'videos'} this update found`
}

/**
 * The legend, in the reader's words:
 * "38 videos this update · the 12 updates before it ran 9–15 videos, typical 12".
 *
 * NO DIRECTION WORD AND NO MULTIPLE. It states where this update sits among the
 * ones behind it — a level against levels — and says nothing about which way
 * anything is going, because thirteen readings of our own cadence cannot earn
 * that (rule 4 in the header). "videos" is printed on the band so the count
 * band and the anomaly check's points band, which share a block, are never read
 * as the same unit.
 */
export function updateSeriesLine(series: UpdateSeries): string {
  const newest = series.points[series.points.length - 1]
  if (!newest) return NO_SERIES
  const head = updateSeriesHead(series)
  const behind = series.points.length - 1
  const { counted, quiet } = updateBand(series.points)
  if (series.median == null || series.band == null || behind < 1) {
    return `${head} · too few updates behind it to say what is typical`
  }
  const range = series.band.low === series.band.high
    ? `${fmtInt(series.band.low)} videos`
    : `${fmtInt(series.band.low)}–${fmtInt(series.band.high)} videos`
  const typical = `, typical ${fmtInt(Math.round(series.median))}`
  // AN UPDATE THAT FOUND NOTHING IS NAMED RATHER THAN QUIETLY DROPPED. It is
  // drawn on the chart and left out of the band, and a legend that said "the 12
  // before it" while counting 9 would be the page and the picture disagreeing.
  if (quiet > 0) {
    return `${head} · of the ${fmtInt(behind)} updates before it, the ${fmtInt(counted)} that found anything ran ${range}${typical}`
  }
  return `${head} · the ${fmtInt(behind)} ${behind === 1 ? 'update' : 'updates'} before it found ${range}${typical}`
}

/**
 * The months a half-open window `[from, to)` touches, oldest first.
 *
 * `to` IS EXCLUSIVE AND THE TEST HONOURS IT. A window ending at midnight on the
 * 1st read no day of the new month, and a point carrying a month it read
 * nothing in would print a contribution of zero against that month's real
 * denominator — a false "this update brought in none of October" on a chart
 * whose whole job is the contribution restatement.
 */
export function monthsOfWindow(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = monthStartOf(from)
  // BOUNDED, BECAUSE THIS RUNS ON A PAGE LOAD AND THE COMPARISON IS ON STRINGS.
  // `to` comes off `pipeline_runs.window_end`; the column is `timestamptz`, so
  // a value that never sorts below a month start is not reachable from the
  // schema today — and the cost of saying so is one counter. Ten years of
  // months is far past any window this product will draw.
  for (let i = 0; i < MAX_WINDOW_MONTHS && `${cursor}T00:00:00.000Z` < to; i += 1) {
    out.push(cursor)
    cursor = nextMonth(cursor)
  }
  // A window whose end is not after its own month's start is degenerate
  // (`to <= from`); it still belongs to the month it opened in.
  return out.length > 0 ? out : [monthStartOf(from)]
}

/** The half-open span of `window` that falls inside `month`. Null where they do
 *  not overlap. */
export function clipToMonth(
  window: { from: string; to: string },
  month: string,
): { from: string; to: string } | null {
  const monthFrom = `${month}T00:00:00.000Z`
  const monthTo = `${nextMonth(month)}T00:00:00.000Z`
  const from = window.from > monthFrom ? window.from : monthFrom
  const to = window.to < monthTo ? window.to : monthTo
  return from < to ? { from, to } : null
}

/** Whole days a window covered, never below one: an update that closed the same
 *  hour it opened still covered the day it ran on. */
export function windowDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (!Number.isFinite(ms)) return 1
  return Math.max(1, Math.round(ms / DAY_MS))
}

/**
 * Assemble the series from what the reads returned. Pure, so every branch —
 * a run with no window, a window crossing two months, a month with no stored
 * denominator, a workspace with two updates — is exercised without a database.
 */
export function buildUpdateSeries(input: {
  /** Oldest first. Runs with no window are already excluded. */
  runs: readonly { runId: string; window: { from: string; to: string } }[]
  /** Videos each run analysed, by run id. */
  videosByRun: ReadonlyMap<string, number>
  /**
   * What each `runId::month` span read — the window read clipped to the month.
   * Absent for every span when M3 is not applied here, which is how the
   * contribution and the comments go silent together rather than as zeroes.
   */
  spans: ReadonlyMap<string, { videos: number; comments: number }>
  /** Every month's own denominator, summed over audiences. */
  monthOf: ReadonlyMap<string, number>
  /** How many delivered updates were dropped for carrying no window. */
  windowless: number
  /** How many updates were asked for. */
  requested: number
  /**
   * What the windowed reading DID, in three states and not two.
   *
   * `read` — it answered. `absent` — M3 is not applied here, so the RPC does
   * not exist and no contribution can ever be stated for this workspace until
   * it is. `failed` — the call errored, which is a fact about one read and not
   * about our deployment. A boolean folded the last two together and the page
   * then told a reader "the windowed reading is not installed for this
   * workspace" on the strength of a single blinked read.
   */
  windowRead: 'read' | 'absent' | 'failed'
}): UpdateSeries {
  const points: UpdatePoint[] = input.runs.map((r) => {
    const months = monthsOfWindow(r.window.from, r.window.to)
    const contribution: UpdatePoint['contribution'] = []
    let comments: number | null = null
    for (const month of months) {
      const span = input.spans.get(`${r.runId}::${month}`)
      if (!span) continue
      // COMMENTS SUM ACROSS DISJOINT SPANS AND VIDEOS DO NOT. A comment belongs
      // to exactly one instant, so the per-month comment counts of one window
      // add up to the window's own; a video carrying conversation on both sides
      // of a month boundary is a member of both months' video sets, which is
      // why `videos` is never added across months and `contribution` keeps them
      // apart (AGENTS.md: denominators do not add).
      comments = (comments ?? 0) + span.comments
      contribution.push({ month, videos: span.videos, of: input.monthOf.get(month) ?? 0 })
    }
    return {
      runId: r.runId,
      window: r.window,
      days: windowDayCount(r.window.from, r.window.to),
      videos: input.videosByRun.get(r.runId) ?? 0,
      comments,
      months,
      contribution,
    }
  })

  const { median, band, quiet } = updateBand(points)
  const notes: UpdateNote[] = []
  if (quiet > 0) {
    notes.push({
      kind: 'quiet',
      text: `${fmtInt(quiet)} of the updates behind this one found nothing at all; ${quiet === 1 ? 'it is' : 'they are'} drawn and left out of the band.`,
    })
  }
  if (input.windowless > 0) {
    notes.push({
      kind: 'windowless',
      text: `${fmtInt(input.windowless)} delivered ${input.windowless === 1 ? 'update carries' : 'updates carry'} no window and ${input.windowless === 1 ? 'is' : 'are'} not drawn.`,
    })
  }
  if (points.length > 0 && points.length < input.requested) {
    notes.push({
      kind: 'short',
      text: `This workspace has ${fmtInt(points.length)} delivered ${points.length === 1 ? 'update' : 'updates'} with a window, not ${fmtInt(input.requested)}.`,
    })
  }
  if (points.length > 0 && band == null) {
    // TWO DIFFERENT REFUSALS, AND PRINTING THE WRONG ONE IS A FALSE CLAIM ABOUT
    // OUR READING. `updateBand` withholds the band on either of two conditions
    // — fewer than three points at all, or fewer than two of the points behind
    // the newest that found anything — and one sentence for both told a
    // workspace with two deliveries that each found videos that "fewer than
    // three updates found anything", which is not true of it. Neither paying
    // tenant can reach it (both carry thirteen windowed updates); every new
    // workspace's first two deliveries do, on the first page it opens.
    notes.push({
      kind: 'no_band',
      text: points.length < UPDATE_BAND_MINIMUM
        ? `Fewer than ${fmtInt(UPDATE_BAND_MINIMUM)} updates of this workspace carry a window, so there is no typical for this one to be read against.`
        : `Fewer than ${fmtInt(UPDATE_BAND_MINIMUM - 1)} of the updates behind this one found anything, so there is no typical for this one to be read against.`,
    })
  }
  if (input.windowRead === 'absent') {
    notes.push({ kind: 'window_read', text: 'The windowed reading is not installed for this workspace, so no update’s contribution to its month can be stated.' })
  }
  if (input.windowRead === 'failed') {
    notes.push({ kind: 'window_read', text: 'The windowed reading could not be read just now, so no update’s contribution to its month is stated here.' })
  }

  const joined = notes.map((n) => n.text).join(' ')
  if (points.length === 0) {
    return emptySeries(notes.length > 0 ? joined : 'No delivered update of this workspace carries a window.', EMPTY_BASIS, notes)
  }

  return {
    points,
    median,
    band,
    basis: `the last ${fmtInt(points.length)} ${points.length === 1 ? 'update' : 'updates'} · what each one brought in`,
    note: notes.length > 0 ? joined : null,
    notes,
  }
}

interface RunRow {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  window_start?: string | null
  window_end?: string | null
  window_basis?: string | null
}

/**
 * The last thirteen updates, with what each one brought in.
 *
 * WHAT IT COSTS, SAID OUT LOUD. One read of `pipeline_runs` (thirteen rows, a
 * plain `limit` and never `selectAll`), one read of `month_denominators` over
 * the months those windows touch, thirteen HEAD counts on `videos` (no rows
 * come back — only the integer), and one `window_denominators` call per
 * (update, month) SPAN. The spans are the clipped ones and nothing else: the
 * full-window read a point would otherwise need is exactly the sum of its
 * months' comment counts, and its video count is the head count above, so there
 * is no redundant call. A weekly cadence gives thirteen spans; a monthly one,
 * whose every window crosses a boundary, gives twenty-six. They go out together
 * under `mapWithLimit`.
 *
 * `videos` IS A HEAD COUNT AND NOT THE WINDOW READ'S. They answer different
 * questions and the difference is the point of the chart: `videos.run_id`
 * counts what THIS UPDATE newly found — our cadence — while
 * `window_denominators` counts videos of any update that carry a comment dated
 * in these days. The chart is of the first; the contribution restatement is of
 * the second, and neither is `analyzed_run_id` (see `UpdatePoint.videos`).
 */
export async function loadUpdateSeries(scope: Scope, opts: UpdateSeriesOptions = {}): Promise<UpdateSeries> {
  const supabase = scope.supabase as SupabaseClient
  const reading: ReadingHandle = scope.reading
  const { clientId } = scope
  const requested = Math.max(1, opts.updates ?? UPDATE_SERIES_POINTS)

  // `select('*')` for the window columns, not a column list: they are applied
  // by hand and a deploy can reach a database that has not had them yet, in
  // which case an absent column arrives as an absent key rather than a 42703
  // that takes the page down. lib/pages/week.ts keeps the same rule.
  const res = await supabase
    .from('pipeline_runs')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(requested)
  if (res.error) {
    console.error(`[reading] updates.runs: ${res.error.message}`)
    return emptySeries('This workspace’s updates could not be read just now, so the series is not drawn.', UNREAD_BASIS)
  }
  const raw = (res.data as RunRow[] | null) ?? []

  const withWindow: { runId: string; window: { from: string; to: string } }[] = []
  let windowless = 0
  for (const run of raw) {
    const stored = rowWindow(run)
    if (stored?.start && stored.end) withWindow.push({ runId: run.id, window: { from: stored.start, to: stored.end } })
    else windowless += 1
  }
  // OLDEST FIRST, which is the order the axis is drawn in and the order
  // `updateBand` assumes when it takes "the points behind the newest".
  withWindow.reverse()

  if (withWindow.length === 0) {
    return buildUpdateSeries({
      runs: [], videosByRun: new Map(), spans: new Map(), monthOf: new Map(),
      windowless, requested, windowRead: 'read',
    })
  }

  const months = [...new Set(withWindow.flatMap((r) => monthsOfWindow(r.window.from, r.window.to)))].sort()
  const spanKeys = withWindow.flatMap((r) =>
    monthsOfWindow(r.window.from, r.window.to)
      .map((month) => ({ runId: r.runId, month, span: clipToMonth(r.window, month) }))
      .filter((s): s is { runId: string; month: string; span: { from: string; to: string } } => s.span != null),
  )

  const [videosByRun, monthOf, spanReads] = await Promise.all([
    countVideosPerRun(supabase, clientId, withWindow.map((r) => r.runId)),
    readMonthDenominators(reading, clientId, months),
    readSpans(reading, clientId, spanKeys),
  ])

  const spans = new Map<string, { videos: number; comments: number }>()
  for (const s of spanReads.reads) if (s) spans.set(s.key, { videos: s.videos, comments: s.comments })

  return buildUpdateSeries({
    runs: withWindow,
    videosByRun,
    spans,
    monthOf,
    windowless,
    requested,
    // A SPAN THAT ANSWERED NOTHING IS NOT AN EMPTY SPAN, AND A SPAN THAT COULD
    // NOT BE READ IS NEITHER. `loadWindowReading` returns `denominators: null`
    // when M3 is absent and `[]` when it is present and the days were quiet —
    // the same distinction every reader on this page keeps — and a throw is a
    // third thing again. `readSpans` carries all three up so the note says
    // which happened rather than blaming the deployment for one failed call.
    windowRead: spanKeys.length === 0 ? 'read' : spanReads.probe,
  })
}

/**
 * The windowed read of every (update, month) span.
 *
 * THE FIRST SPAN IS A PROBE AND THE OTHER TWENTY-FIVE ARE NOT SENT WHERE IT
 * ANSWERS NOTHING. M3 is applied by hand and is not applied on production
 * today, so `window_denominators` is a function PostgREST has never heard of:
 * every one of these calls comes back a 404, `loadWindowReading` swallows it by
 * name and answers `denominators: null`, and the page would have paid
 * twenty-six round trips for twenty-six identical silences on every load. One
 * serial call in the healthy case is the price of that; the rest go out
 * together behind it.
 *
 * ONE SPAN THAT FAILS LOSES ITS OWN POINT'S CONTRIBUTION AND NOBODY ELSE'S. A
 * rejection would take the whole chart down, and a chart of thirteen updates is
 * worth drawing with twelve contributions on it — as long as the thirteenth
 * prints no number rather than a zero.
 *
 * AND THE PROBE'S OWN ANSWER IS THREE-VALUED, because the note it drives is.
 * "The RPC does not exist here" is a fact about this deployment; "that call
 * errored" is a fact about one read of it. Folding them into one `null` had the
 * page tell a reader the windowed reading was not installed for their
 * workspace on the strength of a single blinked read.
 */
async function readSpans(
  reading: ReadingHandle,
  clientId: string,
  spanKeys: readonly { runId: string; month: string; span: { from: string; to: string } }[],
): Promise<{
  reads: ({ key: string; videos: number; comments: number } | null)[]
  probe: 'read' | 'absent' | 'failed'
}> {
  if (spanKeys.length === 0) return { reads: [], probe: 'read' }
  type SpanRead =
    | { kind: 'read'; key: string; videos: number; comments: number }
    | { kind: 'absent' }
    | { kind: 'failed' }
  const one = async (s: (typeof spanKeys)[number]): Promise<SpanRead> => {
    try {
      const read = await loadWindowReading(reading.client, clientId, { from: s.span.from, to: s.span.to })
      // `denominators: null` is `loadWindowReading` having swallowed the 404 by
      // name: the RPC does not exist here, which is a fact about the deployment.
      if (read.denominators == null) return { kind: 'absent' }
      return {
        kind: 'read',
        key: `${s.runId}::${s.month}`,
        videos: read.denominators.reduce((t, d) => t + (d.videos ?? 0), 0),
        comments: read.denominators.reduce((t, d) => t + (d.comments ?? 0), 0),
      }
    } catch (error) {
      // A THROW IS NOT THE SAME SILENCE. A PostgREST that cannot load its
      // schema cache throws where a missing function answers null, and calling
      // that "not installed for this workspace" is a claim about our deployment
      // made from one blinked read.
      if (isMissingMonthlyReading(error)) return { kind: 'absent' }
      console.error(`[reading] updates.span: ${(error as { message?: string })?.message ?? String(error)}`)
      return { kind: 'failed' }
    }
  }
  const held = (r: SpanRead) => (r.kind === 'read' ? { key: r.key, videos: r.videos, comments: r.comments } : null)
  const probe = await one(spanKeys[0])
  if (probe.kind !== 'read') return { reads: [], probe: probe.kind }
  const rest = await mapWithLimit(spanKeys.slice(1), READ_CONCURRENCY, one)
  return { reads: [held(probe), ...rest.map(held)], probe: 'read' }
}

/**
 * How many videos each of these updates NEWLY FOUND.
 *
 * `run_id`, THE DISCOVERING RUN, which is written once. `analyzed_run_id` is
 * the other column and it is not a record of anything historical — the note on
 * `UpdatePoint.videos` has the production measurement and what it would have
 * printed.
 *
 * A HEAD COUNT PER RUN, never a fetch: the only thing printed is the integer,
 * and one update's set is several hundred rows on a live tenant. Thirteen of
 * them go out together. A count that fails is zero for that point and the point
 * still draws — the alternative is dropping an update out of a chart of our own
 * cadence because one read blinked, which is indistinguishable on the page from
 * an update that found nothing.
 */
async function countVideosPerRun(
  supabase: SupabaseClient,
  clientId: string,
  runIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const counts = await mapWithLimit(runIds, READ_CONCURRENCY, async (runId) => {
    const res = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('run_id', runId)
    if (res.error) {
      console.error(`[reading] updates.videos: ${res.error.message}`)
      return { runId, videos: 0 }
    }
    return { runId, videos: res.count ?? 0 }
  })
  for (const c of counts) out.set(c.runId, c.videos)
  return out
}

/** Every month's own denominator, summed over audiences — the "of N" each
 *  point's contribution is stated against. Empty where M3/M2 are not applied,
 *  which the caller tells apart from a month of zero by the span read. */
async function readMonthDenominators(
  reading: ReadingHandle,
  clientId: string,
  months: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (months.length === 0) return out
  try {
    const held = await selectAll<{ month: string; videos: number }>(() =>
      reading.client
        .from('month_denominators')
        .select('month, videos')
        .eq('client_id', clientId)
        .gte('month', months[0])
        .lte('month', months[months.length - 1])
        .order('month', { ascending: true }),
    )
    for (const r of held) out.set(r.month, (out.get(r.month) ?? 0) + (r.videos ?? 0))
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
  }
  return out
}
