import type { SupabaseClient } from '@supabase/supabase-js'

import type { ForSalesData, SalesGroup, SalesGrouping, SalesQuote } from '../blocks/for-sales'
import { chunk, mapWithLimit, MULTI_ROW_IN_CHUNK, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { SALES_GROUPS_SHOWN, SALES_PRAISE_SHOWN, SALES_QUOTES_PER_GROUP, SALES_SWITCHING_SHOWN } from '../blocks/for-sales'
import { perfVsMedian, pretty, type PerfMultiple } from '../content-tiles'
import { citationLink } from '../evidence-cite'
import { cap, fmtInt, longMonth, platformLabel, shortDate } from '../format'
import { rowWindow } from '../pipeline/run-bookkeeping'
import { cleanQuote, fetchQuoteCitationsByAudience, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { audienceLabel } from '../readiness/types'
import {
  BASELINE_MONTHS,
  baselineStateOf,
  type BaselineState,
  type DenominatorMonth,
} from '../reading/anomaly'
import { freezeStateFor, isMissingMonthlyReading, isMissingMonthTable } from '../reading/monthly'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { loadMonthSeries, loadWindowReading, type ReadingHandle } from '../reading/read'
import { platformMixLine } from '../reading/record'
import { mergeSeriesNotes, type MonthLabel, type MonthSeries } from '../reading/series'
import type { MonthStatus, PlatformMix } from '../reading/types'
import { bandVerdict, type FigureTable, type Verdict } from '../reading/verdicts'
import { parseRef, quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isMissingCompetitors, loadCompetitors, rivalKey, rivalNameOf } from '../rivals'
import { isMissingSubjects, TABLE_SUBJECTS, type Subject } from '../subjects/types'
import { selectAll } from '../supabase-admin'
import { row, rows } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'
import { loadOwnPublishedVideos, ownSides, type PlaybookVideo } from './playbook'
import type { FormatMatrix } from '../reading/formats'

// This week — "what needs attention this week?" (Phase 1 WP15, decision P,
// the mock's ThisWeek.dc.html).
//
// THE ONE PAGE DATED BY THE UPDATE AND NOT BY THE MONTH. Every other reading
// surface in Phase 1 answers a question about a calendar month, because the
// month is the record's key and a comment's own date is the only clock this
// product keeps (AGENTS.md). This page answers a question about the last
// DELIVERY, which is a different thing and has to say so on every figure it
// prints: its window is the run's own frozen `[window_start, window_end)`, read
// off the row and never recomputed from the clock, and every count it states
// against that window is stated again as a contribution to the month it falls
// in ("this update's contribution to September so far: 205 of 449"). That
// second half is what stops a reader treating a week as a period.
//
// WHY THE WINDOW COMES OFF THE ROW. Three steps once recomputed it from
// `Date.now()` and two multi-day runs gathered and synthesised against windows
// 18 and 9 days apart (AGENTS.md). A page is not exempt: read from the clock,
// This week would draw a seven-day window over a run that actually covered
// thirty, and Sealand's newest update covers exactly thirty. So `rowWindow`
// reads it, a run with no window says so, and the window's own days are printed
// on the page.
//
// SEVEN SECTIONS, NOT NINE, AND THE PAGE SAYS WHICH TWO ARE MISSING. The mock
// draws nine; two of them — Worth a reply and Flagged for awareness — are the
// Content page's reply inbox, and the design is explicit that the inbox moves
// in Phase 2, in the same phase Content is switched off, "never a phase later,
// because it is the content person's only work queue". Leaving them off with no
// word would read as "there was nothing"; `LATER_LINE` names them and says when.
//
// WHAT DEGRADES, AND HOW. Five of this page's reads are on migrations applied
// by hand in one window before R1 (§2's `month_subject_readings` and the
// subjects table, §1's `anomaly_checks` / `anomaly_flags`, the windowed
// denominators). Every one of them answers `null` — never `[]` and never `0` —
// when its table is absent, and every block prints a sentence saying the
// instrument is not installed rather than a zero that reads as a measurement.
// That is the `isMissing*` precedent, and it is the difference between "nothing
// was unusual" and "nobody has looked yet", which this page exists to keep
// apart.

// ---- the constants -----------------------------------------------------------

/**
 * How many distinct numbers the first screen may put in front of a reader.
 *
 * TWELVE, over the page bar and §1. The mock's first 900px is the bar's "312
 * videos this week" and the whole of Unusual this week — its stat, the
 * multiple, the typical week, the two ends of the band, the n, and the two
 * figures its interpretation cites. Counted the way WP11 counts Overview's
 * thirty: over figure TABLES rather than rendered digits, because the same
 * figure named twice is one number to a reader (lib/blocks/types.ts
 * `figureCount`).
 */
export const FIRST_SCREEN_BUDGET = 12

/** Risers shown. Three, per the design ("the three themes that moved most in
 *  the current month's reading") and the mock. */
export const RISERS_SHOWN = 3

/** How many themes the risers are chosen from — ranked on the month's own
 *  reading before the band is drawn, so the three shown are the three largest
 *  movements and not the first three that happened to clear a floor. */
export const RISER_POOL = 30

/** The floor a newly-heard theme has to clear before it is worth a name.
 *
 * TEN VIDEOS IN THE MONTH, which is `SHARE_BAND.minK` — the same floor every
 * other object on a reading surface clears. It exists because "new themes first
 * heard this update" is a three-digit number: the clustering is re-made over
 * the whole cumulative corpus every run and labels churn about 88% run to run
 * (AGENTS.md), so production writes 303 first-seen themes on Össur and 592 on
 * Sealand in ONE update. Two of Össur's 303 carry ten videos this month and
 * none of Sealand's 592 do. Printing 303 would be printing the churn; printing
 * the two that clear the floor is printing the week.
 */
export const NEW_THEME_FLOOR = 10

/** Formats and hooks shown in "What worked". */
export const WORKED_SHOWN = 4

/** Quotes shown under §4's "new quotes on your subjects". */
export const NEW_QUOTES_SHOWN = 4

/**
 * The two sections the mock draws and Phase 1 does not.
 *
 * Named, dated by the thing that moves them, and NOT by a calendar date: a
 * month computed at render is a promise to a paying client that is recomputed
 * every month (the OV5 precedent).
 */
export const LATER_LINE =
  'Comments worth a reply, and the claims flagged for awareness, stay on the Content page until it retires — they are the only work queue there, and they move here with it.'

// ---- the shapes --------------------------------------------------------------

/** The run this page is a reading of. */
export interface WeekUpdate {
  id: string
  /** When the update was delivered. */
  date: string
  /** The previous delivered update's date, or null where this is the first. */
  previous: string | null
  status: string
}

/** The run's own frozen window, half-open `[from, to)`. */
export interface WeekWindow {
  from: string
  to: string
  /** How the start was decided (`previous_run`, `reconstructed`, …). Printed
   *  nowhere; carried so the record can say it. */
  basis: string
}

/** One flag, in full — the design's own requirement for WK1 ("every flag in
 *  full: object, week figure, baseline, band, n"). */
export interface UnusualFlag {
  objectKind: string
  objectId: string
  label: string
  /** The population the share is a share of, by name. */
  denominator: string
  week: { k: number; n: number }
  baseline: { k: number; n: number }
  /** The months pooled into the baseline, and which of them were still
   *  filling when the flag was raised. */
  baselineMonths: string[]
  baselineFilling: string[]
  /**
   * Whether those months were read under ONE clustering — `one`, `mixed`,
   * `unknown`, or `not_grouped` for an object that has no grouping to be
   * like-for-like about (a kind is a kind).
   *
   * M7 stores it precisely so a surface can MARK a baseline that was not read
   * under one grouping, and its comment says so at length; a reader that never
   * selected the column printed the filling-months caveat and not the
   * like-for-like one. `null` where the column is absent, which is a fourth
   * thing again and is not marked.
   */
  baselineRegime: string | null
  changePts: number
  bandPts: number
  /** The model's explanation, labelled as interpretation. Empty where the
   *  check wrote none. */
  sentences: string[]
  /** Who wrote it — the model, or the product itself. */
  explanationModel: string | null
  quotes: { quote: Quote; cite: string; href: string | null }[]
  rank: number
}

export type UnusualState =
  /** Flags were raised and are printed below. */
  | 'flagged'
  /** The check ran and nothing cleared. The one answer most weeks give. */
  | 'nothing_unusual'
  /** The check ran and refused to read the week. `note` says why. */
  | 'refused'
  /** The baseline is not three complete months yet. */
  | 'baseline_forming'
  /** No check has ever run for this update — the table is not installed, or
   *  the step has not reached this tenant. */
  | 'not_checked'
  /** The check's own row says flags were raised and the flags themselves could
   *  not be read. NOT `nothing_unusual`: "nothing fired" and "we could not
   *  look" are the two answers this whole table exists to keep apart, and a
   *  failed read that renders as a reading puts the second in the first's
   *  words. */
  | 'unreadable'

export interface UnusualBlock {
  state: UnusualState
  /** The calibrated sentence the check itself wrote, where it wrote one. */
  note: string | null
  flags: UnusualFlag[]
  /** How many cleared both gates before the cap of three. */
  flaggedCount: number
  /** The pre-registered set's size and how many got as far as a p-value —
   *  a p means nothing without the number of questions asked to get it. */
  setSize: number | null
  tested: number | null
  /** The baseline's own state, for the forming sentence. */
  baseline: BaselineState | null
  /** "the check starts with the October reading" — the month the baseline
   *  completes in, or null when it is already ready. */
  startsWith: string | null
  /** This update's videos against the median of the updates behind it, when
   *  the check recorded them. */
  updateVideos: number | null
  medianVideos: number | null
}

/** One subject, month-to-date, with what this update put into it. */
export interface SubjectWeekRow {
  id: string
  label: string
  /** Videos carrying the subject this month so far, in the client's audience. */
  monthVideos: number
  /** The month's denominator for that audience. */
  monthOf: number
  /** What THIS update added — the videos of its window carrying the subject. */
  addedVideos: number | null
  verdict: Verdict | null
}

export interface WeekSubjectsBlock {
  rows: SubjectWeekRow[]
  /** Null when subjects are recorded here; a sentence when they are not. */
  unread: string | null
  /** The month the figures are of. */
  month: string
}

/** One theme rising in the month's reading. */
export interface Riser {
  id: string
  label: string
  /** The month-to-date reading. */
  month: { k: number; n: number }
  /** The trailing months it is read against. */
  baseline: { k: number; n: number }
  verdict: Verdict
  /** What this update put into it, where the windowed read is available. */
  addedVideos: number | null
  quotes: { quote: Quote; cite: string; href: string | null }[]
}

export interface RisingBlock {
  rows: Riser[]
  /** The audience the shares are shares of. */
  audience: string
  month: string
  monthOf: number
  /**
   * How many of the pool cleared their band WITH A LARGER SHARE, and how many
   * were banded at all.
   *
   * `moved` is filled only where the verdict is `moved` and the change is
   * positive — the same test that decides whether a row is printed — so it is
   * a count of risers and not of band-clearers. The note beside it says so.
   *
   * THE BLOCK CLAIMS "NOTHING ELSE MOVED CLEARLY", which is a statement about
   * the themes it did NOT print — so every one of them has to have been tested.
   * The loader used to stop the moment it had three, leaving the rest of the
   * pool unbanded and the sentence an assertion about comparisons nobody drew.
   * §1 gets this right ("N cleared the band this update; the 3 largest are
   * printed") and these two numbers are what let §3 say the same thing.
   */
  moved: number
  pooled: number
  /**
   * Whether the baseline is a SUM of three month rows rather than a window
   * read.
   *
   * True while `window_denominators` / `window_theme_readings` (M3) are not
   * applied: the n the band is drawn on is then video-months, a video talked
   * about in two of the three counts in both, and the block prints the note
   * that says so. False once the window read answers, and the note is not
   * printed, because it is not true of that reading.
   */
  pooledBaseline: boolean
  unread: string | null
}

/** One audience's share of what came in. */
export interface AudienceRow {
  audience: string
  label: string
  /** Videos this update GATHERED for that audience. */
  gathered: number
  /** Videos this update ANALYSED — the population every reading is drawn
   *  from, and never the same number as the one above. */
  analysed: number
  platformMix: PlatformMix
  /**
   * What THIS audience's window put into the month, and the month's own
   * denominator for it.
   *
   * THE PLAN ASKS FOR IT PER ROW and the page printed one line for the whole
   * update. It costs nothing to do properly — the windowed read already comes
   * back per audience (`WindowDenominator.audience`) and so do the stored month
   * rows — and a per-audience line is the one that makes the block's own point:
   * a window is not a period, whoever's conversation it was. Null where the
   * windowed read is not available.
   */
  contribution: { videos: number; of: number } | null
}

/** A theme first heard in this update that cleared the floor. */
export interface NewTheme {
  id: string
  label: string
  /** Videos carrying it in the month so far. */
  videos: number
}

/** A rival's posts this update, with the distinction the design leaves unsaid
 *  said out loud: posts the rival MADE, and posts ABOUT the rival. */
export interface RivalPosts {
  audience: string
  label: string
  /** Posts on the rival's own tracked accounts. */
  byThem: number
  /** Posts by anybody else that our search found under their name. */
  aboutThem: number
  comments: number
  /** Present when the tenant has no handle for this rival, so `byThem` is 0
   *  because nothing is read and not because nothing was posted. */
  ownPostsUnread: boolean
}

export interface CameInBlock {
  /** The window's own days, dated. */
  window: WeekWindow | null
  rows: AudienceRow[]
  gathered: number
  analysed: number
  /** Comments dated INSIDE the window. Never the same as comments gathered —
   *  a newly discovered YouTube video brings its whole back-thread. */
  windowComments: number | null
  /** Videos of the window that fall inside the month, and the month's total. */
  contribution: { videos: number; of: number } | null
  /** Set when the window reaches back into an earlier month. */
  crossesInto: string | null
  newThemes: NewTheme[]
  /** How many themes were first heard at all, before the floor. */
  newThemesSeen: number
  rivals: RivalPosts[]
  /** New quotes on the client's subjects, where subjects are recorded. */
  quotes: { subject: string; quote: Quote; cite: string; href: string | null }[]
  /** How many there were in all, of which the above are the shown few. */
  quotesTotal: number | null
  /** Why there are none, when the reason is the instrument and not the week. */
  quotesUnread: string | null
  playbookHref: string
}

/** One format or hook, with its n. */
export interface WorkedRow {
  /** The reader's label, already humanised by `workedLabel` — not the slug.
   *  Done in the loader so the email arm, which has no stylesheet to
   *  capitalise with, and the report get the same words as the page. */
  label: string
  videos: number
  /** Average engagement rate of that group, AS THE COLUMN STORES IT — a
   *  percentage, not a share. `videos.engagement_rate` is 3.8 for 3.8%, which
   *  is what every other surface prints straight through `fmtPct`. */
  engagement: number
  /** That average against the update's median video. */
  multiple: number
}

export interface WorkedBlock {
  formats: WorkedRow[]
  hooks: WorkedRow[]
  /** Videos with an engagement rate that this update analysed — the n behind
   *  the median everything above is read against. */
  rated: number
  /** Platforms excluded from the reading, by name. */
  excluded: string[]
  /**
   * YOUR OWN SIDE, MONTH TO DATE (Phase 1 Block D, D6 — `week.worked.yourhooks`).
   *
   * Everything above is the update's videos with no audience split at all —
   * yours, your rivals' and the category's pooled — so a client cannot see
   * their own hooks separately from the field's. This is the client half of
   * CO7 over the month the rest of this page is stated against, on the
   * PUBLISHED clock (`videos.upload_date`), which is why it carries its own
   * basis line: "5 of the 9 you published in September" is a different figure
   * from anything dated by a gather, and printing the two under one heading
   * without saying so is decision D9's defect.
   *
   * Null where the month's own posts were not read.
   */
  sides: { formats: FormatMatrix; hooks: FormatMatrix; coverageLine: string; basisLine: string } | null
  unread: string | null
}

export interface CoverageBlock {
  /** The one line at the foot of the page. */
  line: string
  /** The privacy sentence the mock prints under it. */
  privacy: string
}

export interface WeekData {
  brand: string
  update: WeekUpdate
  window: WeekWindow | null
  /** The month the window ends in. */
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** "312 videos this week" — the page bar's own figure. Null when the
   *  windowed read is not available here. */
  windowVideos: number | null
  unusual: UnusualBlock
  subjects: WeekSubjectsBlock
  rising: RisingBlock
  cameIn: CameInBlock
  sales: ForSalesData
  worked: WorkedBlock
  coverage: CoverageBlock
  /**
   * The reading layer's own caveats about the months this page compares, said
   * ONCE for the page.
   *
   * `MonthSeriesSet.notes` — the change-log boundary and the stretches of
   * months whose clustering was never recorded — merged across every series
   * read here. The Block A convention is one collapsed sentence for a run of
   * months and never one per bar, so these are printed at the foot of the page
   * exactly as Overview prints its own, and not inside §3.
   */
  notes: MonthLabel[]
  laterLine: string
}

// ---- the pure half -----------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

/** "6–13 Sep 2026" — the window's own days, inclusive at the reader's end.
 *
 *  The window is half-open `[from, to)` everywhere it is arithmetic, and a
 *  reader does not read half-open intervals: "6–13 Sep" names the days the
 *  update covered. The end instant is printed as the day it falls ON, because
 *  a run that closed at 04:06 on the 13th covered comments written up to that
 *  moment and saying "6–12" would lose them. */
export function windowDays(w: WeekWindow | null): string | null {
  if (!w) return null
  return `${shortDate(w.from)} – ${shortDate(w.to)}`
}

/**
 * "this update's contribution to September so far: 205 of 449"
 *
 * THE SENTENCE THIS PAGE TURNS ON. Every other figure here is of a window, and
 * a window is not a period — so each count is handed back to the month it
 * belongs to, where the product's one clock can hold it. `of` is the month's
 * own denominator (a distinct-video count over the whole month, read from the
 * stored month rows) and `videos` is the part of it this update's window
 * carried, counted the same way over a narrower window. Neither is a sum of the
 * other, and that is why both come from a read rather than from arithmetic.
 */
export function contributionLine(month: string, videos: number, of: number): string {
  return `this update’s contribution to ${longMonth(month)} so far: ${fmtInt(videos)} of ${fmtInt(of)}`
}

/** "This update also covered 21 days of August." — printed only when the
 *  window reaches back past the month start, which a monthly cadence does
 *  every time (Sealand's newest update covers 11 Aug – 10 Sep). Without it the
 *  contribution line above silently drops two thirds of what was read. */
export function crossingLine(month: string, crossesInto: string): string {
  return `This update also covered days of ${longMonth(crossesInto)}; the contribution above counts only its ${longMonth(month)} days.`
}

/** "baseline forming — 1 of 3 months; the check starts with the November
 *  reading." — the design's wording, plus the one thing it leaves out: WHEN.
 *
 *  The month named is the month in which the third complete month will have
 *  been read, which is `monthsClearing` short of `required` counted forward
 *  from the month after the one being read. A reader told "forming" and nothing
 *  else has no way to know whether that is next month or next year. */
export function baselineFormingLine(baseline: BaselineState, month: string): string {
  const missing = Math.max(0, baseline.required - baseline.monthsClearing)
  let starts = month
  for (let i = 0; i < missing; i += 1) starts = nextMonth(starts)
  return `${baseline.label}; the check starts with the ${longMonth(starts)} reading.`
}

/** The month the check can first speak, or null when it already can. */
export function baselineStartsWith(baseline: BaselineState, month: string): string | null {
  if (baseline.ready) return null
  let starts = month
  for (let i = 0; i < Math.max(0, baseline.required - baseline.monthsClearing); i += 1) starts = nextMonth(starts)
  return starts
}

/**
 * What §4 says about themes first heard this update.
 *
 * Two sentences, and which one is printed is the whole point. Above the floor
 * it names what cleared; below it, it says the number it is NOT printing and
 * why — because "no new themes" would be false (303 were first heard) and "303
 * new themes" would be the clustering's churn dressed as a finding.
 */
export function newThemesLine(seen: number, shown: number, floor: number = NEW_THEME_FLOOR): string {
  if (seen === 0) return 'Nothing was heard for the first time in this update.'
  if (shown > 0) {
    return `${fmtInt(shown)} of the ${fmtInt(seen)} themes first heard in this update carried ${fmtInt(floor)} videos or more this month.`
  }
  return `${fmtInt(seen)} themes were heard for the first time in this update and none carried ${fmtInt(floor)} videos this month. The grouping is re-made over everything we have read for you every update, so most new names are the same conversation under a new label; below the floor there is nothing a reader can hold.`
}

/** "above typical" / "about typical" — the mock's tag on a subject row.
 *
 *  NOT A DIRECTION WORD. It compares this update's contribution with what an
 *  update of this workspace usually contributes, which is a level against a
 *  level, and it is printed inside a verdict node with its band. "Above" and
 *  "below" are not in the direction vocabulary for exactly this reason: they
 *  say where a number sits, not which way it is going. */
export function typicalTag(added: number | null, typical: number | null): string | null {
  if (added == null || typical == null || typical <= 0) return null
  const ratio = added / typical
  if (ratio >= 1.25) return 'above typical'
  if (ratio <= 0.75) return 'below typical'
  return 'about typical'
}

/** The foot of the page: who it is for, which update, what it covered.
 *
 *  Composed here rather than in the block so the weekly report's own coverage
 *  line (WR6) is the same sentence and not a second one. */
export function coverageLine(input: {
  brand: string
  update: string
  previous: string | null
  window: WeekWindow | null
  platformMix: PlatformMix
  videos: number | null
  comments: number | null
}): string {
  const parts = [`Prepared for ${input.brand} with Verbatim`, `update of ${shortDate(input.update)}`]
  parts.push(input.previous ? `previous ${shortDate(input.previous)}` : 'no previous update')
  const days = windowDays(input.window)
  if (days) parts.push(days)
  const mix = platformMixLine(input.platformMix)
  if (mix) parts.push(mix)
  if (input.videos != null) parts.push(`${fmtInt(input.videos)} videos`)
  if (input.comments != null) parts.push(`${fmtInt(input.comments)} comments`)
  return parts.join(' · ')
}

export const PRIVACY_LINE =
  'Commenters are never identified; quotes carry platform and date only.'

/**
 * The figures a block declares for one flag, by token. Exported so the
 * first-screen budget is counted over the same table the block prints.
 *
 * AND SO THE MODEL'S OWN KEYS RESOLVE. The explainer is told to cite every
 * figure as a `[[placeholder]]` and is handed the check's table
 * (`lib/pipeline/anomaly-check.ts anomalyFigures`), which is where
 * `flag_N_week_share` and `flag_N_baseline_share` come from — the two keys the
 * paragraph is most likely to cite, because the shares are what the flag IS.
 * A key this table lacks drops its sentence whole at render
 * (`substituteFigures`), so the two tables have to name the same things: these
 * are computed from the same k and n the check divided, not stored twice.
 */
export function flagFigures(flag: UnusualFlag, n: number): FigureTable {
  const k = `flag_${n}`
  return {
    [`${k}_week_share`]: { value: round1(share(flag.week.k, flag.week.n)), unit: 'pct', label: `${flag.label} — share of this update` },
    [`${k}_baseline_share`]: { value: round1(share(flag.baseline.k, flag.baseline.n)), unit: 'pct', label: `${flag.label} — share across the three months behind it` },
    [`${k}_week_videos`]: { value: flag.week.k, unit: 'videos', label: `${flag.label} — videos this update` },
    [`${k}_week_of`]: { value: flag.week.n, unit: 'videos', label: `${flag.label} — videos this update covered` },
    [`${k}_baseline_videos`]: { value: flag.baseline.k, unit: 'videos', label: `${flag.label} — videos across the three months behind it` },
    [`${k}_baseline_of`]: { value: flag.baseline.n, unit: 'videos', label: `${flag.label} — videos in those months` },
    [`${k}_change`]: { value: round1(flag.changePts), unit: 'pts', label: `${flag.label} — the difference` },
    [`${k}_band`]: { value: round1(flag.bandPts), unit: 'pts', label: `${flag.label} — the band it cleared` },
  }
}

// ---- the loader --------------------------------------------------------------

interface RunRow {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  window_start?: string | null
  window_end?: string | null
  window_basis?: string | null
}

interface CheckRow {
  run_id: string
  week_start: string | null
  week_end: string | null
  outcome: string
  reason: string | null
  note: string
  set_size: number | null
  tested: number | null
  flagged_count: number | null
  update_videos: number | null
  median_videos: number | null
}

interface FlagRow {
  run_id: string
  object_kind: string
  object_id: string
  label: string
  denominator: string
  week_k: number
  week_n: number
  baseline_k: number
  baseline_n: number
  baseline_months: string[] | null
  baseline_filling_months: string[] | null
  baseline_regime: string | null
  change_pts: number
  band_pts: number
  rank: number
  flagged_count: number
  explanation: { sentences?: string[] } | null
  explanation_model: string | null
  quote_refs: unknown
}

interface VideoRow {
  id: string
  platform: string
  video_id: string
  run_id: string | null
  analyzed_run_id: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  source: string | null
  engagement_rate: number | string | null
  hook_style: string | null
  classified_type: string | null
}

/**
 * This week, for one tenant.
 *
 * Null is the first-run empty state: a workspace with no delivered update has
 * no week to read, and the page says so rather than drawing seven refusals.
 */
export async function loadWeek(scope: Scope): Promise<WeekData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()

  // ── wave 1: who this is, and which update this is a reading of ─────────
  const [clientRes, runsRes, runningIds, rivals] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    // `select('*')` for the window columns, not a column list: they are applied
    // by hand and a deploy can reach a database that has not had them yet, in
    // which case an absent column arrives as an absent key rather than a 42703
    // that takes the page down (lib/reading/read.ts keeps the same rule). Two
    // rows and a plain `limit`, never `selectAll`: this page reads the newest
    // update and the one before it, and paging a query that already knows how
    // many rows it wants is a second round trip for nothing.
    supabase.from('pipeline_runs').select('*')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(2),
    fetchRunningRunIds(supabase, clientId, 'week'),
    loadRivals(supabase, clientId),
  ])
  const runsRaw = rows<RunRow>(runsRes, 'week.runs')
  const client = row<{ company_name: string | null }>(clientRes, 'week.client')
  const brand = client?.company_name ?? 'Your brand'
  const anchor = runsRaw[0]
  if (!anchor) return null

  const update: WeekUpdate = {
    id: anchor.id,
    date: anchor.completed_at ?? anchor.started_at ?? readingAt,
    previous: runsRaw[1]?.completed_at ?? runsRaw[1]?.started_at ?? null,
    status: anchor.status,
  }
  const stored = rowWindow(anchor)
  const window: WeekWindow | null = stored?.start && stored.end
    ? { from: stored.start, to: stored.end, basis: stored.basis }
    : null

  // THE MONTH IS THE ONE THE WINDOW ENDS IN, not the one it starts in. A
  // thirty-day window crosses a boundary every time, and the month a reader is
  // being told about is the one still filling.
  const month = monthStartOf(window?.to ?? update.date)
  const monthStatus = freezeStateFor(month, readingAt)
  const audiences = [CLIENT_AUDIENCE, ...rivals.map((r) => rivalKey(r.name)), INDUSTRY_AUDIENCE]

  // ── wave 2: the readings ───────────────────────────────────────────────
  const [check, flags, monthSet, windowRead, monthWindowRead, videos, themedRunId, subjects] =
    await Promise.all([
      loadCheck(supabase, clientId, anchor.id),
      loadFlags(supabase, clientId, anchor.id),
      // The month being read plus the three complete months behind it — the
      // baseline the anomaly check pools, and the baseline §3 reads a riser
      // against. Four months of stored rows is a cheap indexed read.
      loadMonthSeries(reading.client, clientId, { from: backMonths(month, BASELINE_MONTHS), to: month, audiences }),
      window ? loadWindowReading(reading.client, clientId, { from: window.from, to: window.to }) : null,
      // The window clipped to the month, which is what the contribution line
      // counts. Identical to the call above whenever the window sits inside one
      // month, and the only honest answer when it does not.
      window && window.from < month ? loadWindowReading(reading.client, clientId, { from: month, to: window.to }) : null,
      loadUpdateVideos(supabase, clientId, anchor.id),
      fetchThemedRunId(supabase, clientId, runningIds, 'week'),
      loadSubjects(supabase, clientId),
    ])

  const denominators = monthSet.denominators
  const monthVideos = sumMonth(denominators, month)
  const windowVideos = totalVideos(windowRead?.denominators ?? null)
  const contributionVideos = monthWindowRead
    ? totalVideos(monthWindowRead.denominators)
    : windowVideos

  // ── §§1-5, TOGETHER ────────────────────────────────────────────────────
  // Five sections, each of which reads. They were awaited one after another,
  // and not one of them takes another's output — every input below comes off
  // wave 2 or off the arithmetic between. Measured against production, §5's
  // cited comments alone are nine seconds of waiting; done in sequence behind
  // four other sections that also wait, This week took 13-20 s while its
  // database was idle most of it. (The reads they share are read once: the
  // reading layer's memo is keyed on the client, so two sections asking for the
  // same labels or the same change log ask once.)
  const baseline = pooledBaseline(denominators, month, windowVideos ?? 0)
  const [unusual, subjectsBlock, risingRead, cameIn, sales] = await Promise.all([
    // ── §1 · unusual this week ───────────────────────────────────────────
    buildUnusual({
      supabase, clientId, check, flags, baseline, month,
    }),
    // ── §2 · this week in your subjects ──────────────────────────────────
    buildSubjects({
      reading, clientId, subjects, month, window, audiences,
    }),
    // ── §3 · rising now ──────────────────────────────────────────────────
    buildRising({
      supabase, reading, clientId, month, window, themedRunId,
      monthOf: sumAudienceMonth(denominators, month, INDUSTRY_AUDIENCE),
      denominators,
    }),
    // ── §4 · what came in ────────────────────────────────────────────────
    buildCameIn({
      supabase, clientId, runId: anchor.id, window, month, videos, rivals,
      windowRead,
      // The window clipped to the month where it crosses one, and the window
      // itself where it does not — per audience, which is what the plan's
      // per-row contribution line needs and what the RPC already returns.
      contributionRead: (monthWindowRead ?? windowRead)?.denominators ?? null,
      contributionVideos, denominators, monthVideos, subjects, themedRunId,
    }),
    // ── §5 · for sales ───────────────────────────────────────────────────
    buildSales({ supabase, clientId, window, windowVideos, subjects }),
  ])

  // ── §6 · what worked ───────────────────────────────────────────────────
  // §6'S OWN SIDE — ONE NARROW READ, AFTER THE WAVE. The client's own posts in
  // the month are tens of rows on every tenant we have, and §6 is the only
  // section that wants them; a failure here leaves the pooled reading intact
  // and the split absent, which is the honest degradation.
  const ownPublished = await loadOwnPublishedVideos(supabase, clientId, month).catch(() => null)
  const worked = buildWorked(videos, ownPublished ? { month, brand, videos: ownPublished } : null)

  const coverage: CoverageBlock = {
    line: coverageLine({
      brand,
      update: update.date,
      previous: update.previous,
      window,
      platformMix: mergeMix(cameIn.rows.map((r) => r.platformMix)),
      videos: windowVideos,
      comments: cameIn.windowComments,
    }),
    privacy: PRIVACY_LINE,
  }

  return {
    brand,
    update,
    window,
    month,
    monthStatus,
    readingAt,
    windowVideos,
    unusual,
    subjects: subjectsBlock,
    rising: risingRead.block,
    cameIn,
    sales,
    worked,
    coverage,
    // EVERY SERIES READ HERE, SAID ONCE. `monthSet` is the denominator-only
    // set behind §1's baseline and §4's contribution; `risingRead.notes` are
    // §3's per-theme ones. `mergeSeriesNotes` collapses a run of months into
    // ONE sentence rather than repeating it per object, which is the whole
    // point of merging them here rather than printing each set's own.
    notes: mergeSeriesNotes([...monthSet.series, ...risingRead.series]),
    laterLine: LATER_LINE,
  }
}

// ---- §1 ----------------------------------------------------------------------

async function buildUnusual(input: {
  supabase: SupabaseClient
  clientId: string
  check: CheckRow | null | undefined
  flags: FlagRow[] | null
  baseline: BaselineState
  month: string
}): Promise<UnusualBlock> {
  const { check, flags, baseline, month } = input
  const base: UnusualBlock = {
    state: 'not_checked',
    note: null,
    flags: [],
    flaggedCount: 0,
    setSize: null,
    tested: null,
    baseline,
    startsWith: baselineStartsWith(baseline, month),
    updateVideos: null,
    medianVideos: null,
  }

  // THE BASELINE SENTENCE WINS OVER SILENCE, AND ONLY OVER SILENCE. A tenant
  // whose baseline is one month of three cannot be flagged and will not be for
  // months; saying "no check has run" there would be true and useless, and
  // saying "nothing was unusual" would be false. So when nothing has been
  // recorded, the page answers with the state of the instrument.
  if (check === undefined || check === null) {
    return { ...base, state: baseline.ready ? 'not_checked' : 'baseline_forming' }
  }

  const common = {
    ...base,
    note: check.note,
    setSize: check.set_size,
    tested: check.tested,
    updateVideos: check.update_videos,
    medianVideos: check.median_videos != null ? Number(check.median_videos) : null,
  }

  if (check.outcome === 'suppressed' || check.outcome === 'no_window' || check.outcome === 'missing_migration') {
    return { ...common, state: 'refused' }
  }
  if (check.outcome === 'nothing_unusual') {
    return { ...common, state: baseline.ready ? 'nothing_unusual' : 'baseline_forming' }
  }

  // THE CHECK'S ROW SAYS SOMETHING FIRED. If the flags cannot be read — an RLS
  // refusal, a network blip, a renamed column, a missing table — the honest
  // answer is that we could not look, and `nothing_unusual` would tell a paying
  // client their week was quiet on the strength of a failed read. That is the
  // exact conflation `anomaly_checks` exists to prevent, and one ternary is all
  // it takes to reintroduce it.
  if (flags == null || flags.length === 0) {
    return { ...common, state: 'unreadable', flaggedCount: check.flagged_count ?? 0 }
  }

  const rowsIn = [...flags].sort((a, b) => a.rank - b.rank)
  const built = await Promise.all(rowsIn.map((f) => buildFlag(input.supabase, input.clientId, f)))
  return {
    ...common,
    state: 'flagged',
    flags: built,
    flaggedCount: rowsIn[0]?.flagged_count ?? built.length,
  }
}

async function buildFlag(supabase: SupabaseClient, clientId: string, f: FlagRow): Promise<UnusualFlag> {
  const refs = refsOf(f.quote_refs)
  const quotes = await resolveRefs(supabase, clientId, refs.slice(0, 2))
  return {
    objectKind: f.object_kind,
    objectId: f.object_id,
    label: f.label,
    denominator: f.denominator,
    week: { k: f.week_k, n: f.week_n },
    baseline: { k: f.baseline_k, n: f.baseline_n },
    baselineMonths: f.baseline_months ?? [],
    baselineFilling: f.baseline_filling_months ?? [],
    baselineRegime: f.baseline_regime ?? null,
    changePts: Number(f.change_pts),
    bandPts: Number(f.band_pts),
    sentences: f.explanation?.sentences ?? [],
    explanationModel: f.explanation_model,
    quotes,
    rank: f.rank,
  }
}

/**
 * The refs inside `anomaly_flags.quote_refs`.
 *
 * THE COLUMN IS `[{ref, context}]`, NOT A STRING LIST. M7's own comment says
 * so — "comment ids and their context, never the text" — and a row written and
 * read back on a local PostgreSQL 17 cluster comes out
 * `[{"ref": "c:<comments.id>", "context": "tiktok"}]`, which is what
 * `lib/pipeline/anomaly-check.ts` writes. A reader that filtered for
 * `typeof r === 'string'` would therefore drop every ref there is and print a
 * flag with no evidence under it, silently, the day M7 lands. Both shapes are
 * accepted here because nothing has written the column in production yet and
 * the string form is the cheaper thing for a future writer to reach for;
 * anything else is dropped rather than rendered as `[object Object]`.
 */
export function refsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object' && typeof (item as { ref?: unknown }).ref === 'string') {
      out.push((item as { ref: string }).ref)
    }
  }
  return out
}

// ---- §2 ----------------------------------------------------------------------

const SUBJECTS_UNREAD =
  'No subjects are recorded for this workspace yet. Name what you care about in Settings and this update’s videos are counted against them from the next reading.'

async function buildSubjects(input: {
  reading: ReadingHandle
  clientId: string
  subjects: Subject[] | null
  month: string
  window: WeekWindow | null
  audiences: string[]
}): Promise<WeekSubjectsBlock> {
  const { reading, clientId, subjects, month, window } = input
  if (subjects == null) return { rows: [], unread: SUBJECTS_UNREAD, month }
  if (subjects.length === 0) return { rows: [], unread: SUBJECTS_UNREAD, month }

  const stored = await readSubjectMonths(reading, clientId, month)
  if (stored == null) return { rows: [], unread: SUBJECTS_UNREAD, month }

  const added = window ? await readSubjectWindow(reading, clientId, window) : null
  const denominator = await readClientMonthVideos(reading, clientId, month)

  const rowsOut: SubjectWeekRow[] = subjects
    .filter((s) => s.status === 'active')
    .map((s) => {
      const held = stored.filter((r) => r.subject_id === s.id && r.audience === CLIENT_AUDIENCE)
      const monthVideos = held.reduce((t, r) => t + (r.videos ?? 0), 0)
      const addedVideos = added ? added.filter((r) => r.subject_id === s.id && r.audience === CLIENT_AUDIENCE).reduce((t, r) => t + (r.videos ?? 0), 0) : null
      return {
        id: s.id,
        label: s.name,
        monthVideos,
        monthOf: denominator,
        addedVideos,
        verdict: null,
      }
    })
    .sort((a, b) => b.monthVideos - a.monthVideos)

  return { rows: rowsOut, unread: rowsOut.length > 0 ? null : SUBJECTS_UNREAD, month }
}

// ---- §3 ----------------------------------------------------------------------

const RISING_UNREAD =
  'The month’s themes have not been read for this workspace yet, so nothing can be said to be rising.'

/** No denominator row for the month means there is nothing for a theme to be a
 *  share OF — and the block used to print "of 0 category videos" beside
 *  "Nothing moved clearly", which reads as a measurement of an empty month
 *  rather than as an absent reading. */
const RISING_NO_DENOMINATOR =
  'This month’s category conversation has not been counted for this workspace yet, so there is nothing for a theme to be a share of.'

/**
 * §3 · the themes that moved in this month's reading.
 *
 * TWO READS, AND THE SECOND ONE IS THROUGH `lib/reading`. The first is a
 * DISCOVERY scan: which themes have a stored row in these four months at all,
 * and which thirty of them moved most. It is a raw `selectAll` because ranking
 * by difference is the one thing `loadTopObjects` cannot do — it ranks by
 * weight, and a small theme that moved most would never reach the pool.
 *
 * The second read is `loadMonthSeries` over those thirty ids, and every number
 * printed comes off it. That is not tidiness: the set is where the reading
 * layer puts its NOTES — the change-log boundary and the stretches of months
 * whose grouping was never recorded — and `MonthSeriesSet.notes` says in its
 * own contract that "a surface reading the set prints THESE". This block pools
 * three months into one comparison, which is exactly where a reader needs to be
 * told the three were not read under one clustering. It also brings each
 * theme's label, so there is no third read for those.
 */
async function buildRising(input: {
  supabase: SupabaseClient
  reading: ReadingHandle
  clientId: string
  month: string
  window: WeekWindow | null
  themedRunId: string | null
  monthOf: number
  denominators: readonly { month: string; audience: string; videos: number }[]
}): Promise<{ block: RisingBlock; series: MonthSeries[] }> {
  const { reading, clientId, month, monthOf } = input
  const base: RisingBlock = { rows: [], audience: INDUSTRY_AUDIENCE, month, monthOf, moved: 0, pooled: 0, pooledBaseline: true, unread: null }
  const nothing = (unread: string | null) => ({ block: { ...base, unread }, series: [] as MonthSeries[] })

  // NO DENOMINATOR, NO SHARE. `monthOf` is 0 when the month has no
  // `month_denominators` row for the category, and every figure this block
  // prints is a share of it — including the block's own meta, which read "of 0
  // category videos".
  if (monthOf <= 0) return nothing(RISING_NO_DENOMINATOR)

  const baselineMonths = trailingMonths(month, BASELINE_MONTHS)
  const summedBaselineOf = baselineMonths.reduce((t, m) => t + sumAudienceMonth(input.denominators, m, INDUSTRY_AUDIENCE), 0)

  // THE BASELINE IS READ OVER ITS WINDOW WHERE THE WINDOW CAN BE READ.
  //
  // `QuarterChangeInput` states the rule in the strongest terms the reading
  // layer has — "never from summing month rows: a video whose thread spans two
  // months is one member of a window and two of a sum, and the surplus runs to
  // +38.7% over twelve months on live data" — and this block summed three month
  // rows for the n its band is drawn on. It was fully disclosed (in the loader,
  // in the printed note, in a test and in f8e4895, which measured 449
  // video-months against 446 distinct videos on Sealand), so the digits were
  // fine; the defect was that the product held one banded comparison that sums
  // month rows and one that forbids it, ~600 lines apart, each arguing its own
  // case. Reconciled here, in the one that was summing.
  //
  // `window_denominators` / `window_theme_readings` are M3's and are NOT
  // applied on production, so this is the isMissing* guard shape: the read
  // comes back null, the sum stays, and the block prints the note that says so.
  // Where the read answers, the note is not printed, because it is not true.
  const baselineWindow = {
    from: `${baselineMonths[0] ?? month}T00:00:00.000Z`,
    to: `${month}T00:00:00.000Z`,
  }
  const windowRead = await loadWindowReading(reading.client, clientId, {
    ...baselineWindow,
    audiences: [INDUSTRY_AUDIENCE],
    runId: input.themedRunId,
  })
  const windowOf = windowRead.denominators?.find((d) => d.audience === INDUSTRY_AUDIENCE)?.videos ?? null
  const windowThemes = windowRead.themes
    ? new Map(windowRead.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE).map((t) => [t.theme_id, t.videos]))
    : null
  // BOTH SIDES OR NEITHER. A distinct-video numerator over a summed denominator
  // is a third number that is neither reading, so the window baseline is used
  // only when the window answered for the denominator AND for the theme.
  const pooledBaseline = windowOf == null || windowOf <= 0 || windowThemes == null
  const baselineOf = pooledBaseline ? summedBaselineOf : windowOf

  let stored: { month: string; audience: string; theme_id: string; videos: number }[]
  try {
    stored = await selectAll<{ month: string; audience: string; theme_id: string; videos: number }>(() =>
      reading.client
        .from('month_theme_readings')
        .select('month, audience, theme_id, videos')
        .eq('client_id', clientId)
        .eq('audience', INDUSTRY_AUDIENCE)
        .gte('month', baselineMonths[0] ?? month)
        .lte('month', month)
        .order('month', { ascending: true })
        .order('theme_id', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
    return nothing(RISING_UNREAD)
  }
  if (stored.length === 0) return nothing(RISING_UNREAD)

  const within = new Set(baselineMonths)
  const byTheme = new Map<string, { now: number; before: number }>()
  for (const r of stored) {
    const held = byTheme.get(r.theme_id) ?? { now: 0, before: 0 }
    if (r.month === month) held.now += r.videos ?? 0
    else if (within.has(r.month)) held.before += r.videos ?? 0
    byTheme.set(r.theme_id, held)
  }

  // RANKED BEFORE THE BAND IS DRAWN, so the three shown are the three largest
  // movements of the month rather than the first three that cleared a floor.
  const ranked = [...byTheme.entries()]
    .map(([id, v]) => ({
      id,
      now: v.now,
      before: v.before,
      delta: share(v.now, monthOf) - share(v.before, baselineOf),
    }))
    .sort((a, b) => b.delta - a.delta || b.now - a.now)
    .slice(0, RISER_POOL)

  const themeSet = await loadMonthSeries(reading.client, clientId, {
    from: baselineMonths[0] ?? month,
    to: month,
    audiences: [INDUSTRY_AUDIENCE],
    objectKind: 'theme',
    objectIds: ranked.map((r) => r.id),
  })
  const seriesOf = new Map(
    themeSet.series.filter((s) => s.objectId).map((s) => [s.objectId as string, s]),
  )

  // EVERY ONE OF THE POOL IS BANDED, not just enough of them to fill three
  // rows: the note under the rows is a claim about the ones that are not
  // printed, and a loop that breaks at three has never tested them.
  const moved: Riser[] = []
  for (const r of ranked) {
    const series = seriesOf.get(r.id)
    const points = series?.points ?? []
    const now = points.find((p) => p.month === month)
    const nowK = now?.k ?? r.now
    const nowN = now?.videos ?? monthOf
    let beforeK = 0
    let beforeN = 0
    if (!pooledBaseline) {
      beforeK = windowThemes.get(r.id) ?? 0
      beforeN = windowOf
    } else {
      for (const p of points) {
        if (p.month === month || !within.has(p.month)) continue
        beforeK += p.k ?? 0
        beforeN += p.videos ?? 0
      }
      if (beforeN === 0) { beforeK = r.before; beforeN = baselineOf }
    }
    const label = series?.objectLabel ?? 'An unnamed theme'
    const verdict = bandVerdict({
      objectKind: 'theme',
      objectId: r.id,
      objectLabel: label,
      audience: INDUSTRY_AUDIENCE,
      window: { kind: 'month', from: month, to: nextMonth(month) },
      basis: { from: baselineMonths[0] ?? month, to: month },
      value: { k: nowK, n: nowN },
      baseline: { k: beforeK, n: beforeN },
    })
    // A RISER IS A COMPARISON THAT WAS DRAWN AND CAME BACK LARGER. `moved` is
    // the only state that says so; `no_clear_change` is an answer and not a
    // rise, and the other three are the product declining to give one. The
    // design's "nothing moved clearly" is what an empty list means here.
    if (verdict.state !== 'moved' || (verdict.changePts ?? 0) <= 0) continue
    moved.push({
      id: r.id,
      label,
      month: { k: nowK, n: nowN },
      baseline: { k: beforeK, n: beforeN },
      verdict,
      addedVideos: null,
      quotes: [],
    })
  }

  // Quotes only for the rows a reader will see — the rest were banded to make
  // the sentence true, not to be printed.
  const risers = moved.slice(0, RISERS_SHOWN)
  if (risers.length > 0 && input.themedRunId) {
    const quoted = await Promise.all(
      risers.map((r) => loadThemeQuotes(input.supabase, clientId, input.themedRunId as string, r.id, 2)),
    )
    risers.forEach((r, i) => { r.quotes = quoted[i] })
  }

  return {
    block: { ...base, rows: risers, moved: moved.length, pooled: ranked.length, pooledBaseline },
    series: themeSet.series,
  }
}

// ---- §4 ----------------------------------------------------------------------

async function buildCameIn(input: {
  supabase: SupabaseClient
  clientId: string
  runId: string
  window: WeekWindow | null
  month: string
  videos: VideoRow[]
  rivals: { name: string; retiredAt: string | null }[]
  windowRead: Awaited<ReturnType<typeof loadWindowReading>> | null
  /** The window clipped to the month, per audience — the contribution's
   *  numerator, and never a sum of month rows. */
  contributionRead: { audience: string; videos: number }[] | null
  contributionVideos: number | null
  /** Every stored month row, for the contribution's per-audience denominator. */
  denominators: readonly { month: string; audience: string; videos: number }[]
  monthVideos: number
  subjects: Subject[] | null
  themedRunId: string | null
}): Promise<CameInBlock> {
  const { supabase, clientId, runId, window, month, videos, rivals, windowRead } = input

  const byAudience = new Map<string, AudienceRow>()
  const take = (audience: string): AudienceRow => {
    const held = byAudience.get(audience)
    if (held) return held
    const made: AudienceRow = { audience, label: audienceLabel(audience), gathered: 0, analysed: 0, platformMix: {}, contribution: null }
    byAudience.set(audience, made)
    return made
  }
  const addedBy = new Map((input.contributionRead ?? []).map((d) => [d.audience, d.videos]))
  for (const v of videos) {
    const audience = v.is_client ? CLIENT_AUDIENCE : v.is_competitor ? rivalKey(v.competitor_name) : INDUSTRY_AUDIENCE
    const rowOut = take(audience)
    if (v.run_id === runId) rowOut.gathered += 1
    if (v.analyzed_run_id === runId) {
      rowOut.analysed += 1
      rowOut.platformMix[v.platform] = (rowOut.platformMix[v.platform] ?? 0) + 1
    }
  }
  for (const rowOut of byAudience.values()) {
    if (input.contributionRead == null) continue
    rowOut.contribution = {
      videos: addedBy.get(rowOut.audience) ?? 0,
      of: sumAudienceMonth(input.denominators, month, rowOut.audience),
    }
  }
  const audienceRows = [...byAudience.values()].sort((a, b) => b.analysed - a.analysed || b.gathered - a.gathered)

  // POSTS BY A RIVAL AND POSTS ABOUT ONE ARE DIFFERENT FACTS, and the design's
  // "notable rival posts" does not say which. Both are printed, named: Össur
  // has zero competitor-owned videos in production, so the first is empty on
  // the paying tenant and would have read as "the rivals posted nothing".
  const everOwned = await loadOwnedRivalAudiences(supabase, clientId)
  const rivalRows: RivalPosts[] = rivals.map((r) => {
    const audience = rivalKey(r.name)
    const mine = videos.filter((v) => v.run_id === runId && v.is_competitor && rivalKey(v.competitor_name) === audience)
    return {
      audience,
      label: r.name,
      byThem: mine.filter((v) => v.source === 'competitor_owned').length,
      aboutThem: mine.filter((v) => v.source !== 'competitor_owned').length,
      comments: 0,
      // NOT "IS A HANDLE CONFIGURED" — that is a setting, and a setting is not
      // evidence. A configured handle that has never yielded a post is exactly
      // the readiness gap Phase 0 names on the prosthetics tenant, and a row
      // reading "0 posts of their own" there would tell a paying client their
      // rival went quiet. So the question asked is whether this workspace has
      // EVER captured a post of this rival's: never, and their own posts are
      // not being read; sometimes, and a zero this update is a real zero.
      ownPostsUnread: !everOwned.has(audience),
      retired: r.retiredAt != null,
    }
  })
  // A TRACKED RIVAL WITH NOTHING THIS UPDATE IS A ZERO, NOT AN ABSENCE. The
  // row used to be dropped unless something was found or their own posts were
  // unread, so a rival whose posts ARE read and who posted nothing reached the
  // reader as silence — "Freitag went quiet" is a fact about a rival and the
  // page said it by saying nothing. A RETIRED rival with nothing is different:
  // nobody is watching them any more, and a zero there is about us.
  .filter((r) => !r.retired || r.byThem > 0 || r.aboutThem > 0)
  .map(({ retired: _retired, ...r }) => r)

  const newThemes = await loadNewThemes(supabase, clientId, runId, month)
  const subjectQuotes = window
    ? await loadSubjectQuotes(supabase, clientId, input.subjects, window)
    : { shown: [], total: null, unread: QUOTES_NO_WINDOW }

  return {
    window,
    rows: audienceRows,
    gathered: audienceRows.reduce((t, r) => t + r.gathered, 0),
    analysed: audienceRows.reduce((t, r) => t + r.analysed, 0),
    windowComments: totalComments(windowRead?.denominators ?? null),
    contribution: input.contributionVideos != null
      ? { videos: input.contributionVideos, of: input.monthVideos }
      : null,
    crossesInto: window && window.from < month ? previousMonthOf(month) : null,
    newThemes: newThemes.shown,
    newThemesSeen: newThemes.seen,
    rivals: rivalRows,
    quotes: subjectQuotes.shown,
    quotesTotal: subjectQuotes.total,
    quotesUnread: subjectQuotes.unread,
    playbookHref: '/dashboard/market',
  }
}

const QUOTES_UNREAD =
  'Quotes are counted against your subjects once subjects are recorded for this workspace. Until then this update’s comments are read, grouped and counted — they are simply not yours to name.'

/** §4's own sentence for a run with no window. It used to borrow §5's, which
 *  is about objections, and printed it under the heading "New on your
 *  subjects" — one string, wrong noun. */
const QUOTES_NO_WINDOW =
  'This update covered no window, so there are no days for a new comment on your subjects to have been written in.'

/**
 * The comments this update's window carried that sit under one of the client's
 * subjects.
 *
 * MEMBERSHIP IS PER (INSIGHT, SUBJECT) AND IS A STORED JUDGEMENT (M4), so this
 * is a read of `subject_memberships` and never a keyword match: a quote filed
 * under "Durability" because the word appears in it is the thing the judge was
 * built to stop. Absent the table, the honest answer is that the instrument is
 * not installed — not that the week was quiet.
 */
async function loadSubjectQuotes(
  supabase: SupabaseClient,
  clientId: string,
  subjects: Subject[] | null,
  window: WeekWindow,
): Promise<{ shown: { subject: string; quote: Quote; cite: string; href: string | null }[]; total: number | null; unread: string | null }> {
  if (!subjects || subjects.length === 0) return { shown: [], total: null, unread: QUOTES_UNREAD }
  const nameById = new Map(subjects.map((s) => [s.id, s.name]))

  let members: { subject_id: string; audience_insight_id: string }[]
  try {
    members = await selectAll<{ subject_id: string; audience_insight_id: string }>(() =>
      supabase.from('subject_memberships').select('subject_id, audience_insight_id')
        .eq('client_id', clientId).eq('member', true)
        .order('audience_insight_id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return { shown: [], total: null, unread: QUOTES_UNREAD }
    throw error
  }
  if (members.length === 0) return { shown: [], total: 0, unread: null }

  const subjectOf = new Map<string, string>()
  for (const m of members) if (!subjectOf.has(m.audience_insight_id)) subjectOf.set(m.audience_insight_id, m.subject_id)

  const citations = await fetchQuoteCitationsByAudience(supabase, [...subjectOf.keys()])
  const pool: { subject: string; citation: QuoteCitation }[] = []
  for (const [insightId, list] of citations) {
    const subjectId = subjectOf.get(insightId)
    if (!subjectId) continue
    for (const c of [...list].sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      if (!text || !c.commentId) continue
      pool.push({ subject: nameById.get(subjectId) ?? 'A subject', citation: { ...c, quote: text } })
    }
  }
  if (pool.length === 0) return { shown: [], total: 0, unread: null }

  // THE WINDOW IS APPLIED TO THE COMMENT'S DATE and to nothing else. An
  // insight this update wrote out of a comment written in March is March's
  // comment, and "new quotes this update" means quotes written inside the days
  // this update covered.
  const dated = await inChunks<{ id: string }>(
    pool.map((p) => p.citation.commentId as string),
    (part) => () =>
      supabase.from('comments').select('id')
        .eq('client_id', clientId)
        .in('id', part)
        .gte('comment_date', window.from).lt('comment_date', window.to)
        .order('id', { ascending: true }),
  )
  const fresh = new Set(dated.map((c) => c.id))
  const kept = pool.filter((p) => p.citation.commentId && fresh.has(p.citation.commentId))
  const shown = kept.slice(0, NEW_QUOTES_SHOWN)
  const cited = await citeQuotes(supabase, clientId, shown.map((s) => s.citation))
  return {
    shown: cited.map((q, i) => ({ subject: shown[i].subject, ...q })),
    total: kept.length,
    unread: null,
  }
}

// ---- §5 ----------------------------------------------------------------------

/** The three categories a salesperson can act on. `objection` and
 *  `switching_signal` are what they are asked about; `praise` is what they can
 *  repeat. Every one of them is a Pass A category, so nothing here is a second
 *  classification of the same comment. */
const SALES_CATEGORIES = ['objection', 'praise', 'switching_signal'] as const

const SALES_UNREAD_NO_WINDOW =
  'This update covered no window, so there is nothing to read a week of objections out of.'

async function buildSales(input: {
  supabase: SupabaseClient
  clientId: string
  window: WeekWindow | null
  windowVideos: number | null
  subjects: Subject[] | null
}): Promise<ForSalesData> {
  const { supabase, clientId, window } = input
  // GROUPED BY THEME UNTIL SUBJECTS EXIST, AND THE BLOCK SAYS SO. A heading a
  // reader thinks they wrote, when they did not, is worse than a heading that
  // admits whose grouping it is (the thirteen words: a subject is theirs, a
  // theme is ours).
  const grouping: SalesGrouping = input.subjects && input.subjects.length > 0 ? 'subject' : 'theme'
  const base: ForSalesData = {
    window: window ? { from: window.from, to: window.to } : null,
    videos: input.windowVideos,
    grouping,
    objections: [],
    praise: [],
    switching: [],
    switchingTotal: null,
    rivalComplaints: [],
    brief: { href: '/dashboard/reports', label: 'Open the sales brief →' },
    unread: null,
  }
  if (!window) return { ...base, unread: SALES_UNREAD_NO_WINDOW }

  const cited = await loadSalesCitations(supabase, clientId, window)
  if (cited == null) return base

  const objections = groupCitations(cited.filter((c) => c.category === 'objection'))
  const rivalComplaints = groupCitations(
    cited.filter((c) => c.category === 'objection' && c.audience.startsWith('competitor:')),
    (c) => ({ id: c.audience, label: rivalNameOf(c.audience) ?? c.audience }),
  )
  // COUNTED BEFORE IT IS CAPPED. Slicing first and counting the slice is how
  // "2 comments · someone said they were moving between brands" came to be
  // printed on both tenants whatever the real number was.
  const switching = cited.filter((c) => c.category === 'switching_signal')
  // AND COUNTED AS COMMENTS, BECAUSE THAT IS WHAT IT SAYS. `cited` holds one
  // row per (insight × evidence) citation, so a comment two switching_signal
  // insights both cite was counted twice — and the number renders as "N
  // comments · someone said they were moving between brands" and freezes into
  // the snapshot as `switching_comments`. Measured read-only over the whole
  // corpus: Sealand 131 citation rows over 122 distinct comments, Össur 58 over
  // 57. Inside this update's window the two happen to agree today.
  const switchingComments = new Set(switching.map((c) => c.commentUuid)).size
  return {
    ...base,
    objections: objections.slice(0, SALES_GROUPS_SHOWN),
    praise: cited.filter((c) => c.category === 'praise').slice(0, SALES_PRAISE_SHOWN).map(toSalesQuote),
    switching: switching.slice(0, SALES_SWITCHING_SHOWN).map(toSalesQuote),
    switchingTotal: switchingComments,
    rivalComplaints: rivalComplaints.slice(0, SALES_GROUPS_SHOWN),
  }
}

interface SalesCitation {
  category: string
  themeId: string
  themeLabel: string
  audience: string
  videoUuid: string
  /** The comment this citation quotes. One comment can be cited by two
   *  insights, so a count of citations is not a count of comments. */
  commentUuid: string
  evidenceId: string
  quote: string
  lang: string | null
  english: string | null
  platform: string
  commentDate: string | null
  href: string | null
}

function toSalesQuote(c: SalesCitation): SalesQuote {
  return {
    quote: {
      ref: quoteRef.evidence(c.evidenceId),
      text: c.quote,
      ...(c.lang != null ? { lang: c.lang, english: c.english } : {}),
    },
    cite: [platformLabel(c.platform), c.commentDate ? shortDate(c.commentDate) : null, `under ${underWhose(c.audience)}`]
      .filter(Boolean).join(' · '),
    href: c.href,
  }
}

function underWhose(audience: string): string {
  if (audience === CLIENT_AUDIENCE) return 'your own post'
  if (audience === INDUSTRY_AUDIENCE) return 'a category video'
  return `a ${rivalNameOf(audience) ?? 'rival'} video`
}

/** Citations folded into groups, largest first, counted in DISTINCT VIDEOS.
 *  Comments would let one loud thread outrank a week. */
function groupCitations(
  cited: readonly SalesCitation[],
  keyOf: (c: SalesCitation) => { id: string; label: string } = (c) => ({ id: c.themeId, label: c.themeLabel }),
): SalesGroup[] {
  const held = new Map<string, { label: string; videos: Set<string>; quotes: SalesQuote[] }>()
  for (const c of cited) {
    const { id, label } = keyOf(c)
    const group = held.get(id) ?? { label, videos: new Set<string>(), quotes: [] }
    group.videos.add(c.videoUuid)
    if (group.quotes.length < SALES_QUOTES_PER_GROUP) group.quotes.push(toSalesQuote(c))
    held.set(id, group)
  }
  return [...held.entries()]
    .map(([id, g]) => ({ id, label: g.label, videos: g.videos.size, quotes: g.quotes }))
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
}

// ---- §6 ----------------------------------------------------------------------

/** Reddit carries no engagement rate this product can read, so it is excluded
 *  from the median everything here is measured against and the block says so
 *  (the mock's own footnote). */
const ENGAGEMENT_EXCLUDED = ['reddit']

const WORKED_UNREAD =
  'Too few of this update’s videos carry an engagement figure to read a format or a hook against the rest.'

function buildWorked(
  videos: readonly VideoRow[],
  own: { month: string; brand: string; videos: readonly PlaybookVideo[] } | null,
): WorkedBlock {
  const rated = videos.filter((v) => !ENGAGEMENT_EXCLUDED.includes(v.platform) && Number(v.engagement_rate) > 0)
  const perf = rated.map((v) => ({
    engagement_rate: Number(v.engagement_rate),
    hook_style: v.hook_style,
    classified_type: v.classified_type,
  }))
  const formats = perfVsMedian(perf, 'classified_type', { top: WORKED_SHOWN }).map(toWorkedRow)
  const hooks = perfVsMedian(perf, 'hook_style', { top: WORKED_SHOWN }).map(toWorkedRow)
  return {
    formats,
    hooks,
    rated: rated.length,
    excluded: ENGAGEMENT_EXCLUDED.map(platformLabel),
    sides: own ? ownSides(own) : null,
    unread: formats.length === 0 && hooks.length === 0 ? WORKED_UNREAD : null,
  }
}

/**
 * A classifier slug as a reader's label.
 *
 * MOSTLY `cap(pretty(…))`, AND THREE EXCEPTIONS THAT ARE NOT COSMETIC.
 * `hook_style` and `classified_type` are fixed enums (lib/pipeline/schemas.ts)
 * and one of their values — `trend-riding` — humanises to "Trend riding", which
 * carries a DIRECTION WORD: `trend` is in the shared movement vocabulary, so a
 * live Sealand render failed the copy contract with `[direction-word] "Trend"
 * outside a data-copy="verdict" node (D1)` while the block tests passed on
 * invented hook labels. The name of a hook is not a claim about where anything
 * is headed, and the honest answer is to call the hook what it is — it opens on
 * a current sound, format or meme, which is HOOK_STYLE_DEFS' own wording —
 * rather than to exempt one heading from the rule the rest of Phase 1 is built
 * on.
 *
 * The other two are plain readability: "Before after" and "How to" are the slug
 * showing through.
 */
const WORKED_LABELS: Readonly<Record<string, string>> = {
  'trend-riding': 'Riding what is current',
  'before-after': 'Before and after',
  'how-to': 'How-to',
}

export function workedLabel(slug: string): string {
  return WORKED_LABELS[slug] ?? cap(pretty(slug))
}

function toWorkedRow(p: PerfMultiple): WorkedRow {
  return { label: workedLabel(p.k), videos: p.count, engagement: p.avgEng, multiple: p.multiple }
}

// ---- the reads ---------------------------------------------------------------

/** The tenant's rivals, from `competitors` where M1 has landed and from the
 *  tracked list where it has not — one shape either way. */
async function loadRivals(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ name: string; retiredAt: string | null }[]> {
  try {
    const stored = await loadCompetitors(supabase, clientId)
    if (stored.length > 0) return stored.map((r) => ({ name: r.name, retiredAt: r.retired_at }))
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  const res = await supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  const tc = row<{ competitor_names: string[] | null }>(res, 'week.rivals')
  return (tc?.competitor_names ?? []).map((name) => ({ name, retiredAt: null }))
}

/** The rivals this workspace has EVER captured a post of, by audience key.
 *  Measured, not configured: Össur has a handle for Ottobock and zero
 *  competitor-owned videos in six months of gathering. */
async function loadOwnedRivalAudiences(supabase: SupabaseClient, clientId: string): Promise<Set<string>> {
  const held = await selectAll<{ competitor_name: string | null }>(() =>
    supabase.from('videos').select('competitor_name')
      .eq('client_id', clientId).eq('is_competitor', true).eq('source', 'competitor_owned')
      .order('competitor_name', { ascending: true }),
  )
  return new Set(held.map((v) => rivalKey(v.competitor_name)))
}

/** The check's own row for this update. `undefined` means the table is not
 *  installed here; `null` means it is and this update has no row — two
 *  different silences, and §1 prints them the same way only because both mean
 *  "nobody has looked at this update yet". */
async function loadCheck(supabase: SupabaseClient, clientId: string, runId: string): Promise<CheckRow | null | undefined> {
  try {
    const res = await supabase
      .from('anomaly_checks')
      .select('*')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .maybeSingle()
    if (res.error) throw res.error
    return (res.data as CheckRow | null) ?? null
  } catch (error) {
    if (isMissingAnomalyRecord(error)) return undefined
    console.error(`[pages] week.check: ${(error as { message?: string })?.message ?? String(error)}`)
    return undefined
  }
}

/** The flags this update raised. `null` means the read FAILED — the table is
 *  not installed, or the read was refused — and never "there were none": a
 *  check row that says `flagged` beside an empty list is a record disagreeing
 *  with itself, and §1 says so rather than reading it as silence. */
async function loadFlags(supabase: SupabaseClient, clientId: string, runId: string): Promise<FlagRow[] | null> {
  try {
    return await selectAll<FlagRow>(() =>
      supabase.from('anomaly_flags').select('*')
        .eq('client_id', clientId).eq('run_id', runId)
        .order('rank', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingAnomalyRecord(error)) {
      console.error(`[pages] week.flags: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return null
  }
}

/** Is this the error the anomaly record gives before M7 lands? Narrow, by the
 *  two table names, exactly as `isMissingMonthlyReading` is narrow: a missing
 *  table before the migration is the expected state and says nothing, and any
 *  other error is news. */
export function isMissingAnomalyRecord(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!/anomaly_(checks|flags)/.test(text)) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** The tenant's subjects, or null where M4 has not landed. */
async function loadSubjects(supabase: SupabaseClient, clientId: string): Promise<Subject[] | null> {
  try {
    return await selectAll<Subject>(() =>
      supabase.from(TABLE_SUBJECTS).select('*').eq('client_id', clientId).order('named_at', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

async function readSubjectMonths(
  reading: ReadingHandle,
  clientId: string,
  month: string,
): Promise<{ audience: string; subject_id: string; videos: number }[] | null> {
  try {
    return await selectAll<{ audience: string; subject_id: string; videos: number }>(() =>
      reading.client.from('month_subject_readings')
        .select('audience, subject_id, videos')
        .eq('client_id', clientId).eq('month', month)
        .order('audience', { ascending: true }).order('subject_id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error) || isMissingMonthTable(error)) return null
    throw error
  }
}

async function readSubjectWindow(
  reading: ReadingHandle,
  clientId: string,
  window: WeekWindow,
): Promise<{ audience: string; subject_id: string; videos: number }[] | null> {
  try {
    return await selectAll<{ audience: string; subject_id: string; videos: number }>(() =>
      reading.client.rpc('window_subject_readings', {
        p_client: clientId, p_from: window.from, p_to: window.to,
      }).order('audience', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error) || isMissingMonthlyReading(error)) return null
    throw error
  }
}

async function readClientMonthVideos(reading: ReadingHandle, clientId: string, month: string): Promise<number> {
  try {
    const held = await selectAll<{ videos: number }>(() =>
      reading.client.from('month_denominators').select('videos')
        .eq('client_id', clientId).eq('month', month).eq('audience', CLIENT_AUDIENCE),
    )
    return held.reduce((t, r) => t + (r.videos ?? 0), 0)
  } catch (error) {
    if (isMissingMonthTable(error)) return 0
    throw error
  }
}

/** Every video of this tenant this update touched, either as its discoverer or
 *  as its analyser. The two are different sets and §4 prints both. */
async function loadUpdateVideos(supabase: SupabaseClient, clientId: string, runId: string): Promise<VideoRow[]> {
  return selectAll<VideoRow>(() =>
    supabase.from('videos')
      .select('id, platform, video_id, run_id, analyzed_run_id, is_client, is_competitor, competitor_name, source, engagement_rate, hook_style, classified_type')
      .eq('client_id', clientId)
      .or(`run_id.eq.${runId},analyzed_run_id.eq.${runId}`)
      .order('id', { ascending: true }),
  )
}

/** Themes first heard in this update, and the ones that clear the floor. */
async function loadNewThemes(
  supabase: SupabaseClient,
  clientId: string,
  runId: string,
  month: string,
): Promise<{ seen: number; shown: NewTheme[] }> {
  const fresh = await selectAll<{ registry_id: string | null; label: string | null }>(() =>
    supabase.from('themes').select('registry_id, label')
      .eq('client_id', clientId).eq('run_id', runId).eq('first_seen', true)
      .order('id', { ascending: true }),
  )
  const ids = [...new Set(fresh.map((t) => t.registry_id).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return { seen: 0, shown: [] }

  let readings: { theme_id: string; videos: number }[] = []
  try {
    readings = await inChunks<{ theme_id: string; videos: number }>(ids, (part) => () =>
      supabase.from('month_theme_readings').select('theme_id, videos')
        .eq('client_id', clientId).eq('month', month).in('theme_id', part)
        .order('theme_id', { ascending: true }),
      // ONE THEME IS NOT ONE ROW HERE. `month_theme_readings` is keyed
      // (client_id, month, audience, theme_id) and this read names no audience,
      // so one month gives a row per theme PER AUDIENCE — the client, the
      // industry and every rival. What binds a chunk of this shape is the ROW
      // cap, not the URL cap: PostgREST answers 1,000 rows at a time and
      // `selectAll` pages the rest SERIALLY, inside a chunk that was going to be
      // one of several concurrent requests. lib/chunk.ts MULTI_ROW_IN_CHUNK has
      // the arithmetic — and `mapWithLimit` beside it has the other half: the
      // chunks go out together, so the `isMissingMonthTable` guard below learns
      // a missing table after up to min(chunks, READ_CONCURRENCY) requests
      // rather than after one. Bounded here: the themes first heard in one
      // update are tens of ids, which is a single chunk.
      MULTI_ROW_IN_CHUNK,
    )
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
    return { seen: ids.length, shown: [] }
  }

  const videosById = new Map<string, number>()
  for (const r of readings) videosById.set(r.theme_id, (videosById.get(r.theme_id) ?? 0) + (r.videos ?? 0))
  const labelById = new Map<string, string>()
  for (const t of fresh) if (t.registry_id && t.label) labelById.set(t.registry_id, t.label)

  const shown = ids
    .map((id) => ({ id, label: labelById.get(id) ?? 'An unnamed theme', videos: videosById.get(id) ?? 0 }))
    .filter((t) => t.videos >= NEW_THEME_FLOOR)
    .sort((a, b) => b.videos - a.videos)
  return { seen: ids.length, shown }
}

/** The citations behind one theme, as quotes with their cite line. */
async function loadThemeQuotes(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string,
  registryId: string,
  limit: number,
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  const themeRes = await supabase
    .from('themes').select('supporting_insight_ids')
    .eq('client_id', clientId).eq('run_id', themedRunId).eq('registry_id', registryId).limit(1)
  const theme = rows<{ supporting_insight_ids: string[] | null }>(themeRes, 'week.themeQuotes')[0]
  const insightIds = (theme?.supporting_insight_ids ?? []).slice(0, 40)
  if (insightIds.length === 0) return []

  const citations = await fetchQuoteCitationsByAudience(supabase, insightIds)
  const pool: QuoteCitation[] = []
  const seen = new Set<string>()
  for (const id of insightIds) {
    for (const c of (citations.get(id) ?? []).sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      const key = text.toLowerCase()
      if (!text || seen.has(key) || !readsAsHeroQuote(text, c)) continue
      seen.add(key)
      pool.push({ ...c, quote: text })
    }
  }
  return citeQuotes(supabase, clientId, pool.slice(0, limit))
}

/** Turn citations into quotes with a platform · date · link cite. */
async function citeQuotes(
  supabase: SupabaseClient,
  clientId: string,
  shown: readonly QuoteCitation[],
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  if (shown.length === 0) return []
  const commentIds = shown.map((c) => c.commentId).filter((id): id is string => Boolean(id))
  type Meta = { id: string; platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }
  const meta = new Map<string, Meta>()
  if (commentIds.length > 0) {
    const res = await supabase.from('comments')
      .select('id, platform, comment_date, video_id, comment_id')
      .eq('client_id', clientId).in('id', commentIds)
    for (const c of rows<Meta>(res, 'week.quoteComments')) meta.set(c.id, c)
  }
  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  if (nativeIds.length > 0) {
    const res = await supabase.from('videos').select('platform, video_id, video_url').eq('client_id', clientId).in('video_id', nativeIds)
    for (const v of rows<{ platform: string | null; video_id: string | null; video_url: string | null }>(res, 'week.quoteVideos')) {
      if (v.video_url && v.video_id) urlByKey.set(`${v.platform}::${v.video_id}`, v.video_url)
    }
  }
  return shown.map((c) => {
    const m = c.commentId ? meta.get(c.commentId) : undefined
    const url = m?.platform && m.video_id ? urlByKey.get(`${m.platform}::${m.video_id}`) ?? null : null
    return {
      quote: {
        ref: quoteRef.evidence(c.evidenceId),
        text: c.quote,
        ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
      },
      cite: [m?.platform ? platformLabel(m.platform) : null, m?.comment_date ? shortDate(m.comment_date) : null]
        .filter(Boolean).join(' · '),
      href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
    }
  })
}

/**
 * What a stored ref points AT, split by the door it has to be resolved through.
 *
 * THE WRITER SAYS `c:<comments.id>` AND THIS READER HAS TO SAY SO TOO. The
 * check builds a flag's refs out of the comments its explainer was shown
 * (lib/pipeline/anomaly-check.ts `candidateQuotes`), and a comment reaches an
 * evidence row through `insight_evidence.comment_id`, not through its id — so a
 * reader that only knew `e:` dropped every ref the shipped check writes and
 * printed the flag with nothing under it. Both prefixes are taken, and a BARE
 * uuid is taken as a comment id: the column was written bare until 2026-09-16
 * and nothing that reads it should care which deploy wrote the row.
 */
export function refTargets(refs: readonly string[]): { evidenceIds: string[]; commentIds: string[] } {
  const evidenceIds = new Set<string>()
  const commentIds = new Set<string>()
  for (const ref of refs) {
    const parsed = parseRef(ref)
    if (parsed && 'id' in parsed && parsed.kind === 'e') evidenceIds.add(parsed.id)
    else if (parsed && 'id' in parsed && (parsed.kind === 'c' || parsed.kind === 'm')) commentIds.add(parsed.id)
    else if (!parsed && ref.trim()) commentIds.add(ref.trim())
  }
  return { evidenceIds: [...evidenceIds], commentIds: [...commentIds] }
}

/** Resolve stored refs into quotes — the flags' own evidence. */
async function resolveRefs(
  supabase: SupabaseClient,
  clientId: string,
  refs: readonly string[],
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  if (refs.length === 0) return []
  const { evidenceIds, commentIds } = refTargets(refs)
  if (evidenceIds.length === 0 && commentIds.length === 0) return []
  const [byId, byComment] = await Promise.all([
    evidenceIds.length > 0
      ? supabase.from('insight_evidence').select('id, comment_id, audience_insight_id').in('id', evidenceIds)
      : null,
    commentIds.length > 0
      ? supabase.from('insight_evidence').select('id, comment_id, audience_insight_id').in('comment_id', commentIds)
      : null,
  ])
  type EvidenceRow = { id: string; comment_id: string | null; audience_insight_id: string }
  const found = [
    ...(byId ? rows<EvidenceRow>(byId, 'week.flagEvidence') : []),
    ...(byComment ? rows<EvidenceRow>(byComment, 'week.flagEvidenceByComment') : []),
  ]
  // SCOPED TO THE TENANT — ON THE PARENT, because `insight_evidence` carries no
  // `client_id` (schema-baseline.sql: nine columns, none of them a tenant) and
  // is scoped everywhere in this product through the insight above it. The ids
  // come off this tenant's own flag rows and the app path hands in an
  // RLS-scoped session client, so today this is belt and braces — but WP17 and
  // WP19 will hand this loader an ADMIN client for an export, and an unscoped
  // `in()` under one is a cross-tenant read waiting for the day the ids are not
  // ours. Filtering the parents is enough: the citations below are fetched for
  // these and nothing else.
  const parents = await tenantInsights(supabase, clientId, [...new Set(found.map((e) => e.audience_insight_id))])
  if (parents.length === 0) return []
  const citations = await fetchQuoteCitationsByAudience(supabase, parents)
  const wantedEvidence = new Set([...evidenceIds, ...found.filter((e) => e.comment_id && commentIds.includes(e.comment_id)).map((e) => e.id)])
  const wantedComments = new Set(commentIds)
  const pool: QuoteCitation[] = []
  for (const list of citations.values()) {
    for (const c of list) {
      if (!wantedEvidence.has(c.evidenceId) && !(c.commentId && wantedComments.has(c.commentId))) continue
      const text = cleanQuote(c.quote)
      if (text) pool.push({ ...c, quote: text })
    }
  }
  return citeQuotes(supabase, clientId, pool.slice(0, refs.length))
}

/** Of these insight ids, the ones that belong to this tenant. `audience_insights`
 *  is where the tenant lives; `insight_evidence` has no `client_id` of its own. */
async function tenantInsights(
  supabase: SupabaseClient,
  clientId: string,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return []
  const held = await inChunks<{ id: string }>(ids, (part) => () =>
    supabase.from('audience_insights').select('id').eq('client_id', clientId).in('id', part).order('id', { ascending: true }),
  )
  return held.map((r) => r.id)
}

/**
 * The comments this update's window carried that Pass A called an objection,
 * praise or a switch — with the video they sat under, so a group can be counted
 * in distinct videos and a rival's complaints told from the category's.
 *
 * `audience_insights_current`, never `eq('run_id')`: Pass A is incremental, and
 * "the insights this corpus currently holds" is the population a week is drawn
 * from (AGENTS.md). The WINDOW is applied to the COMMENT's date, which is the
 * one clock this product keeps — an insight written by this update out of a
 * comment written in March is March's.
 */
async function loadSalesCitations(
  supabase: SupabaseClient,
  clientId: string,
  window: WeekWindow,
): Promise<SalesCitation[] | null> {
  // THE CITED COMMENTS, NOT THE WINDOW'S. Reading every comment written in
  // these days and intersecting in memory is one paged read on a week and a
  // statement timeout on a thirty-day window (Sealand's, measured: 9,000-odd
  // rows). Reading only the comments a sales insight actually cites, with the
  // window applied in the database so each chunk comes back nearly empty, is
  // the same answer off a fraction of the rows.
  const insights = await selectAll<{ id: string; category: string; theme: string | null }>(() =>
    supabase.from('audience_insights_current')
      .select('id, category, theme')
      .eq('client_id', clientId)
      .in('category', [...SALES_CATEGORIES])
      .order('id', { ascending: true }),
  )
  if (insights.length === 0) return []
  const byInsight = new Map(insights.map((i) => [i.id, i]))

  const citations = await fetchQuoteCitationsByAudience(supabase, insights.map((i) => i.id))
  const citedComments = new Set<string>()
  for (const list of citations.values()) for (const c of list) if (c.commentId) citedComments.add(c.commentId)
  if (citedComments.size === 0) return []

  type CommentRow = { id: string; platform: string; video_id: string; comment_id: string; comment_date: string | null }
  const comments = await inChunks<CommentRow>([...citedComments], (part) => () =>
    supabase.from('comments').select('id, platform, video_id, comment_id, comment_date')
      .eq('client_id', clientId)
      .in('id', part)
      .gte('comment_date', window.from)
      .lt('comment_date', window.to)
      .order('id', { ascending: true }),
  )
  if (comments.length === 0) return []
  const byComment = new Map(comments.map((c) => [c.id, c]))

  const videos = await inChunks<{ id: string; platform: string; video_id: string; video_url: string | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }>(
    comments.map((c) => c.video_id),
    (part) => () =>
      supabase.from('videos')
        .select('id, platform, video_id, video_url, is_client, is_competitor, competitor_name')
        .eq('client_id', clientId)
        .in('video_id', part)
        .order('id', { ascending: true }),
  )
  const videoByKey = new Map(videos.map((v) => [`${v.platform}::${v.video_id}`, v]))

  const out: SalesCitation[] = []
  for (const [insightId, list] of citations) {
    const insight = byInsight.get(insightId)
    if (!insight) continue
    for (const c of [...list].sort((a, b) => a.rank - b.rank)) {
      const comment = c.commentId ? byComment.get(c.commentId) : undefined
      if (!comment) continue
      const video = videoByKey.get(`${comment.platform}::${comment.video_id}`)
      if (!video) continue
      const text = cleanQuote(c.quote)
      if (!text) continue
      out.push({
        category: insight.category,
        themeId: insight.theme ?? insightId,
        // A THEME SLUG IS NOT A HEADING. Pass A writes `brand_controversy`;
        // a salesperson reads "Brand controversy". Humanised here rather than
        // in the block, because the email arm has no stylesheet to capitalise
        // with and the report will want the same words.
        themeLabel: insight.theme ? cap(pretty(insight.theme)) : 'Unnamed',
        audience: video.is_client ? CLIENT_AUDIENCE : video.is_competitor ? rivalKey(video.competitor_name) : INDUSTRY_AUDIENCE,
        videoUuid: video.id,
        commentUuid: comment.id,
        evidenceId: c.evidenceId,
        quote: text,
        lang: c.lang ?? null,
        english: c.english ?? null,
        platform: comment.platform,
        commentDate: comment.comment_date,
        href: citationLink(comment.platform, video.video_url ?? null, comment.comment_id).href,
      })
    }
  }
  return out
}

/**
 * One `.in()` read, in chunks of a hundred ids, issued together.
 *
 * NOT A REFINEMENT — THE UNCHUNKED VERSION IS A 400 AND THE SERIAL VERSION IS A
 * TIMEOUT. PostgREST puts an `in()` list in the query string, and a thousand
 * uuids is a URL no gateway will take: this page's first run against production
 * came back "selectAll: Bad Request" from exactly that. Slicing the list
 * instead would be worse — the read would succeed and silently answer about the
 * first hundred rows. And chunking it serially cost five thousand ids fifty
 * round trips, measured at 17 s on Össur and a statement timeout on Sealand's
 * thirty-day window, so the chunks go out together (`Promise.all`, the shape
 * lib/engage.ts has used since the digest shipped). Chunks are disjoint and
 * concatenating them in chunk order keeps the output order a serial loop
 * produced.
 *
 * THE SIZE IS PART OF THE OUTPUT ORDER, SO CHANGING IT IS NOT ONLY A
 * PERFORMANCE CHANGE. The output is chunk order, then row order within a chunk,
 * so where the boundary falls decides the sequence — and `tenantInsights`'
 * sequence reaches `fetchQuoteCitationsByAudience`, whose Map is keyed in the
 * order the EVIDENCE ROWS arrive, and then `pool.slice(0, refs.length)`. That
 * chain is exactly how a chunk size in lib/quotes.ts turned out to be choosing
 * four of Sealand's "For sales" quotes (the note beside `fetchChunks`, which is
 * pinned at 120 for that reason). It is bounded here today — a flag's refs are
 * a handful, so a caller almost never has more than one chunk — but "bounded
 * today" is a thing to check, not to assume: anyone moving this size should
 * diff the loader's whole output on both tenants, because no test states what
 * the order should be.
 */
async function inChunks<T>(
  ids: readonly string[],
  build: (part: string[]) => Parameters<typeof selectAll<T>>[0],
  size: number = UUID_IN_CHUNK,
): Promise<T[]> {
  const parts = chunk([...new Set(ids)], size)
  const pages = await mapWithLimit(parts, READ_CONCURRENCY, (part) => selectAll<T>(build(part)))
  return pages.flat()
}

// ---- small arithmetic --------------------------------------------------------

const share = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)

/** The month start `n` months before this one. */
function backMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) - n, 1))
  return d.toISOString().slice(0, 10)
}

function previousMonthOf(month: string): string {
  return backMonths(month, 1)
}

/** The `n` complete months before this one, oldest first. */
function trailingMonths(month: string, n: number): string[] {
  const out: string[] = []
  for (let i = n; i >= 1; i -= 1) out.push(backMonths(month, i))
  return out
}

function sumMonth(denominators: readonly { month: string; videos: number }[], month: string): number {
  return denominators.reduce((t, d) => (d.month === month ? t + (d.videos ?? 0) : t), 0)
}

function sumAudienceMonth(
  denominators: readonly { month: string; audience: string; videos: number }[],
  month: string,
  audience: string,
): number {
  return denominators.reduce((t, d) => (d.month === month && d.audience === audience ? t + (d.videos ?? 0) : t), 0)
}

function totalVideos(denominators: { videos: number }[] | null): number | null {
  if (denominators == null) return null
  return denominators.reduce((t, d) => t + (d.videos ?? 0), 0)
}

function totalComments(denominators: { comments: number }[] | null): number | null {
  if (denominators == null) return null
  return denominators.reduce((t, d) => t + (d.comments ?? 0), 0)
}

function mergeMix(mixes: readonly PlatformMix[]): PlatformMix {
  const out: PlatformMix = {}
  for (const mix of mixes) for (const [k, v] of Object.entries(mix)) out[k] = (out[k] ?? 0) + v
  return out
}

/**
 * The pooled baseline this page states the check's readiness from.
 *
 * Every audience together, three complete months, the same slice the check
 * itself pools (decision S) — so the sentence "baseline forming — 1 of 3
 * months" on this page and the one the check writes into `anomaly_checks` are
 * the same reading and not two.
 */
export function pooledBaseline(
  denominators: readonly { month: string; videos: number }[],
  month: string,
  weekVideos: number,
): BaselineState {
  const months: DenominatorMonth[] = trailingMonths(month, BASELINE_MONTHS).map((m) => ({
    month: m,
    videos: sumMonth(denominators, m),
  }))
  return baselineStateOf({ name: 'every audience together', weekVideos, months })
}
