import type { SupabaseClient } from '@supabase/supabase-js'

import { recStatus, REC_STATUS_LABEL, type RecStatus } from '../calibration'
import { topRecommendation } from '../dashboard-tiles'
import { fmtInt, monthName, shortDate } from '../format'
import { inheritedStatus, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { composeInterpretation, type Interpretation } from '../prose/interpret'
import { proseFigures } from '../prose/figures'
import { cleanQuote, fetchQuoteCitationsByAudience, fetchQuoteResolutionsByRefs, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { citationLink } from '../evidence-cite'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import {
  CLIENT_AUDIENCE,
  INDUSTRY_AUDIENCE,
  isMissingCompetitors,
  loadCompetitors,
  rivalKey,
  type Competitor,
} from '../rivals'
import { audienceLabel } from '../readiness/types'
import {
  isMissingKindMoodAttention,
  attentionRowsOf,
  currentPanel,
  type AttentionPanel,
  type AttentionRow,
} from '../reading/attention'
import { directionWord, monthChange, QUARTER_UNLOCKS_AT, thinMonth, type Direction, type SeriesPoint } from '../reading/bands'
import { horizonWindow, parseHorizon, sinceStart, type Horizon, type HorizonWindow } from '../reading/horizon'
import { kindShares, redditRead, kindChange, type KindShare, type RedditRead } from '../reading/kinds'
import { freezeBoundary, freezeStateFor, isMissingMonthlyReading, isMissingMonthTable } from '../reading/monthly'
import { longMonth, monthStartOf, nextMonth, prevMonth as previousMonthOf } from '../reading/month-key'
import { moodChange, moodShares, framingShare, type MoodShare } from '../reading/mood'
import { loadMonthSeries, loadTopObjects, loadWindowReading, type ReadingHandle } from '../reading/read'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals, type RecordWindow } from '../reading/record'
import {
  mergeSeriesNotes,
  monthAxis,
  pointsByMonth,
  type MonthLabel,
  type MonthSeries,
  type Substrate,
} from '../reading/series'
import { buildStandings, NOT_OBSERVED, type StandingRow } from '../reading/standings'
import type { MonthStatus } from '../reading/types'
import { isAnswer, type FigureTable, type Verdict } from '../reading/verdicts'
import { isMissingSubjects, RPC_WINDOW_SUBJECT_READINGS, TABLE_MOVES, TABLE_SUBJECTS, type Move, type Subject } from '../subjects/types'
import { selectAll } from '../supabase-admin'
import { row, rows } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'

// Overview — the front page, and the first surface built on the comment-dated
// monthly reading (Phase 1 WP11, design §3 OV0–OV6).
//
// SEVEN BLOCKS, ONE LOADER. `components/pages/overview/` holds one `Block` per
// section and this file holds everything they print. The split is the block
// contract's (lib/blocks/types.ts): a block renders once, in three modes, out
// of data it is handed — so the same OV2 that draws the subjects table on
// screen draws it in the weekly email, and there is no second loader for the
// report to disagree with.
//
// WHAT THIS PAGE READS, AND WHAT IT REFUSES TO INVENT. Every figure comes off
// the stored month tables through lib/reading — never off a run. Five of the
// seven blocks depend on a migration that is authored and NOT YET APPLIED
// (subjects and moves on M4; kinds, mood, attention and the standings on M5;
// the "at this point last month" tick on M3; the anomaly line on M7). Each of
// those reads is guarded by its own named `isMissing*` test and degrades to a
// SENTENCE saying what is not recorded yet — the precedent every Block A
// package set, and the reason this page renders honestly on production today
// rather than throwing or, worse, printing zeros.
//
// Calibrated (lib/calibration.ts): a reading surface counts VIDEOS. No run, no
// pass, no window, no score. A direction word is only ever earned by
// `directionWord` over three consecutive months in one regime, and it travels
// as a `Verdict`/`Direction` so the renderer can mark it.

/** How many themes the movers lines are chosen from, per audience. */
export const MOVER_POOL = 20

/** Growing and fading, three each (design §3 OV3 b). */
export const MOVERS_SHOWN = 3

/** How many months a sparkline on a subject row draws. */
export const SPARK_MONTHS = 6

/** The two voices of OV1 (design §3 OV1). */
export const VOICES_SHOWN = 2

/** The page's whole number budget (the mock's "about 30 printed numbers above
 *  the fold"), asserted over the blocks' figure tables and not over rendered
 *  digits — the same count `figureCount` makes. */
export const NUMBER_BUDGET = 30

/**
 * How many rivals OV4 may DECLARE a figure for.
 *
 * The budget binds on one axis and not on the other: `SUBJECTS_MAX` caps the
 * subjects a tenant may name, and nothing caps `tracking_configs.
 * competitor_names`, so each rival a tenant adds spent another of the thirty
 * and "exactly 30 on the busiest page a tenant can have" was true of the
 * fixture rather than of a tenant.
 *
 * It caps the DECLARATION and not the rows: every rival keeps its line, which
 * is what the design asks OV4 for ("one line per rival"), and the largest few
 * are the ones a model may cite about this page. Which rivals matter enough to
 * drop a ROW is Competitive's decision to make (WP14), not this block's.
 */
export const RIVAL_FIGURES_MAX = 5

// ---- the shapes ---------------------------------------------------------------

/** One side of a subject row: you, your lead rival, or the category. */
export interface SideReading {
  /** The object's videos in this audience-month. Null where nothing was read. */
  k: number | null
  /** The audience's videos that month. */
  n: number | null
  pct: number | null
  /** The banded month-on-month change, or null where none was drawn. */
  verdict: Verdict | null
  /** False where this audience carried no row at all — "— not tracked". */
  observed: boolean
}

export interface SubjectRow {
  id: string
  label: string
  you: SideReading
  rival: SideReading | null
  category: SideReading
  /** Earned over three consecutive months in one regime, on the category side —
   *  the only side with the n to carry one on today's corpus. */
  direction: Direction | null
  /** The last `SPARK_MONTHS` category readings, nulls where unreadable. */
  spark: (number | null)[]
  /** The months `spark` is indexed by, same length — a chart that cannot be
   *  drawn says which months it had. */
  sparkMonths: string[]
  /** The category side at the same point LAST month, while this one is still
   *  filling (design §3 OV2, Time). The category side only: it is the only one
   *  of the three with the n to make the comparison mean anything, and the
   *  other two would print a pair of single figures as if they compared. Null
   *  when the month is complete, or when M4/M3 cannot answer the window. */
  categoryAtLastMonth: { k: number; n: number; pct: number | null } | null
  href: string
}

export interface SubjectCandidate {
  name: string
  origin: string
  /** Where it came from, in the reader's words. */
  because: string
}

export interface SubjectsBlock {
  /** `ready` — confirmed subjects with readings. `candidates` — the proposer
   *  has something to confirm. `none` — nothing named and nothing proposed.
   *  `not_recorded` — M4 is not applied here. */
  state: 'ready' | 'candidates' | 'none' | 'not_recorded'
  rows: SubjectRow[]
  candidates: SubjectCandidate[]
  rivalLabel: string | null
  categoryLabel: string
  /** The line under the table about which column carries the month. */
  note: string | null
}

export interface Mover {
  id: string
  label: string
  k: number
  n: number
  pct: number | null
  verdict: Verdict
  direction: Direction | null
  /** First month this object has a reading in, when it is this month. */
  isNew: boolean
}

export interface MoodBlock {
  shares: MoodShare[]
  judged: number
  verdict: Verdict | null
  /** How much of the month was judged on framing instead — the footnote. */
  framingPct: number | null
}

export interface AttentionBlock {
  /** Panel comments per month, oldest first. A month with no panel reading is
   *  ABSENT from this list and present on `axis` — the gap is the point. */
  months: { month: string; comments: number; videos: number }[]
  /** The calendar the line is drawn on: every month from the panel's first
   *  reading to this one, whether or not it carried one. */
  axis: string[]
  panel: AttentionPanel | null
  verdict: Verdict | null
}

export interface CategoryBlock {
  audience: string
  label: string
  denominator: number | null
  /** The three kinds printed, with the rest one click down. */
  kinds: KindShare[]
  kindVerdicts: Record<string, Verdict | null>
  reddit: RedditRead | null
  /** Said instead of the kinds when M5 is not applied here. */
  kindsNote: string | null
  growing: Mover[]
  fading: Mover[]
  moversNote: string | null
  mood: MoodBlock | null
  moodNote: string | null
  attention: AttentionBlock | null
  attentionNote: string | null
}

export interface RivalRow {
  audience: string
  label: string
  role: StandingRow['role']
  observed: boolean
  attention: StandingRow['attention']
  content: StandingRow['content']
  attentionVerdict: Verdict | null
  contentVerdict: Verdict | null
  /** What they said on their own posts, or the honest absence. */
  ownPosts: string | null
  /** The subject raised most under their content this month. */
  raisedMost: { label: string; k: number; n: number; pct: number | null } | null
  retiredAt: string | null
}

export interface RivalsBlock {
  rows: RivalRow[]
  /** Said instead of the shares when M5 is not applied here. */
  standingsNote: string | null
  /** Videos of the client's own that also name a tracked rival. */
  dualMention: number | null
  caveat: string
}

export interface MoveRow {
  id: string
  title: string
  kind: Move['kind']
  declaredAt: string
  line: string
}

export interface MovesBlock {
  rows: MoveRow[]
  /** The unlock, named on the block. */
  unlock: string
  masthead: string
  /** The one sentence when there is nothing dated, or M4 is not applied. */
  empty: string | null
  recorded: boolean
}

export interface LedgerRow {
  id: string
  title: string
  /** Months since the recommendation was first made; null until lineage has
   *  two runs behind it. */
  monthsOld: number | null
  status: RecStatus
  statusLabel: string
  decidedAt: string | null
  href: string
}

export interface AnomalyLine {
  label: string
  objectKind: string
  weekStart: string
  weekEnd: string
  k: number
  n: number
  changePts: number
  bandPts: number
  denominator: string
  /** The model's explanation, when one was written; sentences with figure
   *  tokens intact. */
  sentences: string[]
  quote: Quote | null
  href: string
}

export interface Voice {
  quote: Quote
  /** Platform · date · where it was said. */
  cite: string
  /** Where to go and read it. Null where the video carries no public URL —
   *  the cite is then printed without a link rather than with a dead one. */
  href: string | null
}

export interface SentenceBlock {
  /** The largest banded change this month among subjects and themes. */
  lead: Verdict | null
  /** The code sentence, with `[[token]]` figure placeholders. */
  body: string
  figures: FigureTable
  anomaly: AnomalyLine | null
  interpretation: Interpretation
  ledger: LedgerRow | null
  voices: Voice[]
  /** How many readable voices the sentence's videos held — the N of "2 of N
   *  voices" (disposition #18). NOT a figure: it is a count of the evidence
   *  behind a figure this block already declares, not a reading of the month,
   *  and the page's budget counts readings. */
  voicesFrom: number
  /** Every comparison this block may speak from. */
  verdicts: Verdict[]
}

export interface BarBlock {
  month: string
  status: MonthStatus
  /** Days of the month elapsed at the reading, or null on a complete month. */
  daysIn: number | null
  updates: number
  updateDates: string[]
  /** The month's videos so far, pooled across audiences (a video sits in
   *  exactly one audience). Null where nothing has been read. */
  videos: number | null
  /** The trailing median of the same quantity. */
  expected: number | null
  /** The same point last month, from one window call. Null when M3 is not
   *  applied here — told apart by `atLastMonthKnown`. */
  atLastMonth: number | null
  atLastMonthKnown: boolean
  thin: boolean
  /** The still-filling line, composed once. */
  line: string
  /** "your 3rd monthly reading" — the months of the GATHERED era that carry a
   *  reading. Not every stored month: Össur holds 119 denominator months and
   *  has been gathered for six, and "your 119th monthly reading" is a count of
   *  what we read back at setup, not of what we have delivered. */
  readings: number
  /** That count as the design's one counter, printed on OV0. */
  counter: string
}

export interface RecordBlock {
  line: string
  lines: string[]
  href: string
  /** The day this month stops moving — the one fact about this month that a
   *  window-shaped record does not hold, and the only line OV6 adds of its
   *  own. The refusals and their reasons are inside `lines`. */
  freezesOn: string
}

export interface OverviewData {
  brand: string
  /** The month the reading is of — the last month on the axis. */
  month: string
  monthStatus: MonthStatus
  readingAt: string
  horizon: Horizon
  window: HorizonWindow
  axis: string[]
  substrate: Substrate
  /** The reading's caveats, said once for the whole page. */
  notes: MonthLabel[]
  bar: BarBlock
  sentence: SentenceBlock
  subjects: SubjectsBlock
  category: CategoryBlock
  rivals: RivalsBlock
  moves: MovesBlock
  record: RecordBlock
}

// ---- the pure half ------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The month in full — "September", not "Sep".
 *
 * `monthName` (lib/format.ts) is the product's short form and is what the chart
 * axis and every caption use; this one line is the mock's own wording and reads
 * as a sentence, so it takes the long form (WP10: "a surface that wants the
 * long form writes it in its own caption"). Written here rather than widened in
 * lib/format, because one caption is not a vocabulary change.
 *
 * MOVED DOWN, NOT COPIED (WP17). The weekly report composes the same stamp and
 * must not drag this module's graph — a Supabase client, every reading loader —
 * into a pure composer to get a month's name, so the formatter now lives beside
 * the rest of the month arithmetic in lib/reading/month-key.ts and this stays
 * as the name every existing caller already imports.
 */
export { longMonth }

const pctOf = (k: number | null, n: number | null): number | null =>
  k == null || n == null || n <= 0 ? null : round1((k / n) * 100)

/** Days of `month` elapsed at `now`, or null when the month is behind us. */
export function daysInto(month: string, now: string): number | null {
  const start = monthStartOf(month)
  const next = nextMonth(start)
  const at = now.slice(0, 10)
  if (at >= next) return null
  if (at < start) return 0
  return Number(at.slice(8, 10))
}

/**
 * The window OV6 reads over: THE MONTH, and never the horizon's.
 *
 * OV6 asks "how sound is this MONTH" — the design's own list for it is "updates
 * this month and the dates; videos analysed against the trailing median…" — and
 * the block prints the day this month freezes underneath. Handing the record
 * the drawn axis instead made it answer a different question badly: the windowed
 * denominator function (M3) is unapplied, `loadCoverage` refuses to sum month
 * rows into a video count (a video whose thread spans two months belongs to
 * both), and the only window it can still answer exactly off a stored row is a
 * SINGLE MONTH. So on every horizon but "This month" the page bar read "9
 * updates · coverage not recorded yet" and OV6's paragraph read "The
 * month-by-month reading has not been recorded for this workspace yet" — under
 * a tile printing "437 category videos this month" off `month_denominators`,
 * and on the one block whose whole job is provenance. Production holds 119
 * denominator months for Össur and 95 for Sealand; the sentence was false.
 *
 * The month it is, then, which the stored rows answer exactly on every horizon,
 * and which is the month every other number on the page is about.
 */
export function recordWindow(month: string, readingAt: string): RecordWindow {
  const start = monthStartOf(month)
  const lastDay = new Date(Date.parse(`${nextMonth(start)}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10)
  const at = readingAt.slice(0, 10)
  return { kind: 'month', from: start, to: at < lastDay ? at : lastDay }
}

/** The median of the numbers that exist — a month with no row is not a zero. */
export function medianOf(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  if (present.length === 0) return null
  const mid = Math.floor(present.length / 2)
  return present.length % 2 === 1 ? present[mid] : (present[mid - 1] + present[mid]) / 2
}

export interface FillingLineInput {
  month: string
  status: MonthStatus
  daysIn: number | null
  updates: number
  videos: number | null
  expected: number | null
  atLastMonth: number | null
  atLastMonthKnown: boolean
  thin: boolean
  /** Under a third of the month gone (design §3 OV0's gate). */
  early?: boolean
}

/**
 * OV0's still-filling line (design §3 OV0).
 *
 * "September, 18 days in · 3 updates · 271 of an expected ~469 videos · last
 * month at this point: 244" — the growth of a month shown against the same
 * point in the month before it rather than against nothing, which is what makes
 * Overview worth opening between months without printing a weekly figure.
 *
 * THE LAST CLAUSE IS THREE DIFFERENT SENTENCES. A comparison that exists prints
 * it; a comparison the window functions cannot answer yet says so; a complete
 * month is not filling and says nothing at all. A zero here would read as "last
 * month we had nothing at this point", which is a claim about the conversation
 * and not about our own bookkeeping.
 */
export function fillingLine(input: FillingLineInput): string {
  const parts: string[] = []
  const name = longMonth(input.month)
  if (input.status === 'frozen' || input.daysIn == null) {
    parts.push(`${name}, complete`)
  } else {
    parts.push(`${name}, ${input.daysIn} ${input.daysIn === 1 ? 'day' : 'days'} in`)
  }
  parts.push(`${fmtInt(input.updates)} ${input.updates === 1 ? 'update' : 'updates'}`)
  if (input.videos == null) parts.push('nothing read into this month yet')
  else {
    parts.push(`${fmtInt(input.videos)} ${input.videos === 1 ? 'video' : 'videos'}`)
    // NOT "of an expected ~N". The design writes the median as a projection,
    // and on a corpus that is still growing it is not one: Sealand's three
    // gathered months are 50, 36 and 407, so "475 of an expected ~50" claims a
    // forecast the number cannot support. The median is stated as what it is —
    // the trailing months' middle — which is also the mock's own wording on
    // OV6 ("2,359 videos analysed (trailing median 2,240)").
    if (input.expected != null && input.expected > 0) parts.push(`trailing median ${fmtInt(Math.round(input.expected))}`)
  }
  if (input.status === 'filling') {
    parts.push(
      !input.atLastMonthKnown
        ? 'last month at this point: not recorded yet'
        : input.atLastMonth == null
          ? 'no reading of last month at this point'
          : `last month at this point: ${fmtInt(input.atLastMonth)}`,
    )
  }
  // THE DESIGN'S TWO GATES, IN ITS OWN WORDS. "A month under a third complete
  // prints its month-to-date figures with 'early in the month' beside them and
  // no banded change at all" (§3 OV0) is a different fact from a thin month
  // and gets a different sentence; the thin rule's own words win when both are
  // true, because a thin month is the worse of the two.
  if (input.thin) parts.push('thin month — every change below is suppressed')
  else if (input.early) parts.push('early in the month — every change below is suppressed')
  return parts.join(' · ')
}

/** How much of a month has to be gone before a band may be drawn over it
 *  (design §3 OV0's gate). */
export const EARLY_FRACTION = 1 / 3

/** Is this month under a third complete at `now`? A complete month never is. */
export function earlyInMonth(month: string, now: string): boolean {
  const days = daysInto(month, now)
  if (days == null) return false
  const lastDay = new Date(Date.parse(`${nextMonth(monthStartOf(month))}T00:00:00.000Z`) - 86_400_000).getUTCDate()
  return days / lastDay < EARLY_FRACTION
}

/**
 * OV0's one counter (design §3 OV0: "one counter only").
 *
 * "your 3rd monthly reading · the quarter view needs 6" — the one element of
 * OV0 that tells a new tenant where they are in the ramp, and the disposition
 * map's home for the old Dashboard's context line (#4, "one counter, not the
 * delivery record"). The second clause is dropped once the quarter unlocks,
 * because a need that is met is not news.
 *
 * SIX is `QUARTER_UNLOCKS_AT` (lib/reading/bands.ts), not a number typed here:
 * it is the count of monthly readings a window-against-window comparison needs
 * behind it before Last 3 may draw one at all.
 */
export function readingsCounter(readings: number): string {
  const n = Math.max(0, Math.floor(readings))
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  const counter = n === 0 ? 'no monthly reading yet' : `your ${fmtInt(n)}${suffix} monthly reading`
  return n >= QUARTER_UNLOCKS_AT ? counter : `${counter} · the quarter view needs ${QUARTER_UNLOCKS_AT}`
}

/**
 * A figure table key for one object.
 *
 * THE `o_` PREFIX IS LOad-BEARING. A key is substituted into prose by
 * `FIGURE_KEY_RE` (lib/prose/scrub.ts), which is `[a-z][a-z0-9_]*` — it must
 * START WITH A LETTER. Össur's largest mover this month is
 * `2418f4d7-54a2-…`, and without the prefix its token matched nothing and
 * `[[2418f4d7_54a2_…_share]]` reached the page verbatim. Caught by rendering
 * against production; a uuid beginning with a letter had hidden it.
 */
export const figureKey = (objectId: string, suffix: string): string =>
  `o_${objectId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`

export interface HeadlineInput {
  /** The verdicts OV1 chooses its sentence from — subjects and themes. */
  verdicts: readonly Verdict[]
}

/**
 * The audience a sentence names, taken from the verdict rather than assumed.
 *
 * OV1 is handed subject verdicts on YOUR audience beside theme verdicts on the
 * category's and picks the lead by the size of the banded change, so the
 * sentence cannot carry one hard-coded audience: the day your own side carries
 * the largest change, "Durability came up in 31% of the category's videos this
 * month — 26 of 84 videos" prints YOUR video count as the category's, in the
 * page's headline claim. A `Verdict` has said which audience it is a
 * proportion OF since WP3; this reads it.
 */
export function audienceInSentence(audience: string): string {
  if (audience === CLIENT_AUDIENCE) return 'your own videos'
  if (audience === INDUSTRY_AUDIENCE) return 'the category’s videos'
  return `${audienceLabel(audience)}’s videos`
}

/**
 * The audience a figure LABEL names.
 *
 * A label is what a token prints as when it is substituted, so it is read by a
 * reader and must be a noun rather than the sentence's possessive: the
 * denominator token was labelled `videos read for ${audienceInSentence(...)}`
 * and printed "videos read for the category's videos".
 */
export function audienceInLabel(audience: string): string {
  if (audience === CLIENT_AUDIENCE) return 'your own brand'
  if (audience === INDUSTRY_AUDIENCE) return 'the category'
  return audienceLabel(audience)
}

export interface Headline {
  lead: Verdict | null
  body: string
  figures: FigureTable
}

/**
 * The one sentence: the single largest BANDED change this month among subjects
 * and themes, with the figures left as tokens for the surface to substitute.
 *
 * `moved` only. A change that did not clear its band is not a change this
 * product will name, and the design's own gate sentence is what stands in its
 * place: "Nothing moved clearly this month. Here is where you stand." Neither
 * sentence carries a direction word — the word is the badge's, drawn from the
 * verdict beside it, which is the only place rule (c) allows one.
 */
export function headline(input: HeadlineInput): Headline {
  const moved = input.verdicts.filter((v) => v.state === 'moved' && v.changePts != null)
  const lead = [...moved].sort(
    (a, b) => Math.abs(b.changePts ?? 0) - Math.abs(a.changePts ?? 0) || a.objectId.localeCompare(b.objectId),
  )[0] ?? null

  if (!lead) {
    return { lead: null, body: 'Nothing moved clearly this month. Here is where you stand.', figures: {} }
  }

  const audience = audienceInSentence(lead.audience)
  const share = figureKey(lead.objectId, 'share')
  const videos = figureKey(lead.objectId, 'videos')
  const denominator = figureKey(lead.objectId, 'of')
  const figures: FigureTable = {
    [share]: { value: pctOf(lead.value.k, lead.value.n) ?? 0, unit: 'pct', label: `${lead.objectLabel}'s share of the month` },
    [videos]: { value: lead.value.k, unit: 'videos', label: `videos that raised ${lead.objectLabel}` },
    [denominator]: { value: lead.value.n, unit: 'videos', label: `videos read for ${audienceInLabel(lead.audience)}` },
  }
  const body =
    `${lead.objectLabel} came up in [[${share}]] of ${audience} this month — ` +
    `[[${videos}]] of [[${denominator}]] videos.`
  return { lead, body, figures }
}

/** Rank the movers of one audience: the largest banded changes, up and down. */
export function splitMovers(movers: readonly Mover[], shown: number = MOVERS_SHOWN): { growing: Mover[]; fading: Mover[] } {
  const answered = movers.filter((m) => m.verdict.state === 'moved' && m.verdict.changePts != null)
  const up = answered.filter((m) => (m.verdict.changePts ?? 0) > 0)
  const down = answered.filter((m) => (m.verdict.changePts ?? 0) < 0)
  const by = (a: Mover, b: Mover) =>
    Math.abs(b.verdict.changePts ?? 0) - Math.abs(a.verdict.changePts ?? 0) || a.label.localeCompare(b.label)
  return { growing: [...up].sort(by).slice(0, shown), fading: [...down].sort(by).slice(0, shown) }
}

/**
 * May this row say "first heard this month"?
 *
 * IT IS A CLAIM ABOUT THE THEME, NOT ABOUT THE WINDOW. It was read off the
 * first readable point on the DRAWN axis, which on the default horizon is two
 * months — so any theme absent in August and present in September would print
 * it inside a `data-copy="verdict"` node, the marker that asserts a reading is
 * behind the word. Measured read-only on production: of the category themes
 * with a September row and no August row, 7 on Össur and 19 on Sealand have a
 * reading in an earlier month. So the flag is stated only where the drawn axis
 * reaches the beginning of the tenant's readable record and the absence is the
 * theme's own. A claim the drawn months cannot support is not softened, it is
 * not made.
 *
 * (Today the flag cannot be reached on OV3's movers at all: a first-ever month
 * has a baseline of k = 0, `SHARE_BAND.minK` is 10, and the comparison reads
 * `too_little_data` — so the row is never one of the banded movers. The rule
 * is written here, tested here, and ready for the surfaces that print a level
 * rather than a change.)
 */
export function firstHeardThisMonth(input: {
  /** The first month DRAWN. */
  axisFrom: string
  /** The first month READABLE for this tenant (`sinceStart`). */
  recordFrom: string | null
  /** The months this object carried a reading in, ascending. */
  readableMonths: readonly string[]
  month: string
}): boolean {
  if (input.recordFrom == null || monthStartOf(input.axisFrom) > monthStartOf(input.recordFrom)) return false
  return input.readableMonths.length > 0 && monthStartOf(input.readableMonths[0]) === monthStartOf(input.month)
}

/**
 * The month a move declared today is first scored in: the month AFTER the one
 * it was declared in, because the month it was declared in is already part
 * filled when the declaration lands.
 *
 * A DECLARED DEVIATION FROM THE SPEC STRING. The design writes this line three
 * times — "…tracked 14 Sep · first scoring lands with the November reading"
 * (§3 OV5, §3 line 443, research/mock-spec.md §3 row 1) — naming the month the
 * reading of October is DELIVERED in rather than the month it is OF. This
 * product names a reading by the month its comments fall in, everywhere: the
 * page bar says "Sep 2026 · still filling", and AGENTS.md's rule is that a
 * period is dated by the comment and never by the run. "The November reading"
 * for October's comments dates a period by its delivery, which is the one
 * thing the reading layer exists to stop — so the line names October and the
 * deviation is recorded rather than improvised.
 */
export function firstScoringMonth(declaredAt: string): string {
  return nextMonth(monthStartOf(declaredAt.slice(0, 10)))
}

/** One move, on one line (design §3 OV5, Phase 1). The month in the reader's
 *  form — "the October reading", as the design writes it, not "Oct 2026". */
export function moveLine(move: Pick<Move, 'title' | 'declared_at'>): string {
  return `${move.title} · tracked ${shortDate(move.declared_at)} · first scoring lands with the ${longMonth(firstScoringMonth(move.declared_at))} reading.`
}

/** What OV5 says when nothing has been dated. */
export const MOVES_EMPTY =
  'Nothing dated yet. Press Track this on a subject or a theme and this block starts scoring it from the following month.'

/**
 * What OV5 says about what is not here yet.
 *
 * AND IT NAMES NO MONTH. The design writes the unlock as "…in {month}", and it
 * was filled with the month after the one being read — so production printed
 * "arrive with Market's bottom section in Oct 2026" in September and would
 * print November in November, for ever. A delivery date computed from the
 * calendar is not a delivery date: it is a promise to a paying client,
 * recomputed monthly, wrong the first time it is read. Scoring and the
 * pre-filled card are Phase 2 and nothing in the product knows their month, so
 * the unlock names what it waits for and not when — and gains a month here the
 * day there is one to name, beside OLD_PAGES_RETIRE_ON.
 */
export const MOVES_UNLOCK =
  'Scoring, and the pre-filled monthly card, arrive with Market’s bottom section.'

/** The masthead OV5 and Market both carry, code-written. */
export const MOVES_MASTHEAD = 'We report what the conversation did after you acted. We never claim you caused it.'

/**
 * What OV4 says under "on their own posts" until M8.
 *
 * `video_claims` has no tenant SELECT policy until M8 (WP16), so no tenant may
 * read a rival's own claims. The design's words for a side we cannot read are
 * "— not tracked", and the mock's fuller string names who fixes it
 * ("— not tracked · accounts not configured · digital director · by 15 Oct").
 * The owner is nameable and is named; the DATE is not — nothing in the product
 * holds one, and inventing a date on a client's page is the defect OV5's
 * unlock had.
 */
export const OWN_POSTS_UNREADABLE = '— not tracked · their own posts are not readable yet · Verbatim engineering'

/** The precedence caveat OV4 carries (§7, bucket precedence). */
export const RIVALS_CAVEAT =
  'A video that names both you and a rival counts in your audience only; the count of those is in the record.'

/**
 * What a row's "Monthly line" column says when it may not be a line.
 *
 * TWO READINGS ARE NOT A TREND, AND A SPARKLINE DRAWS THEM AS ONE. `Sparkline`
 * normalises to the min and max of the values it is handed, so 19.0% → 19.2%
 * and 5% → 40% draw the identical full-amplitude climb, with an end dot, no
 * axis, no denominator and no hover — the claim D1 bans in words, arriving as a
 * picture, under a column headed "Monthly line". The approved mock refuses
 * exactly this case and prints "Aug → Sep only" instead (`Main.dc.html`, four
 * rows of it), and the design asks for the line "at longer horizons".
 *
 * Null means the row has three readings or more and may be drawn.
 */
export function monthlyLineLabel(spark: readonly (number | null)[], months: readonly string[]): string | null {
  const read = months.filter((_, i) => spark[i] != null)
  if (read.length >= 3) return null
  if (read.length === 0) return 'no month reads'
  const short = (m: string) => monthName(m).split(' ')[0]
  return read.length === 1 ? `${short(read[0])} only` : `${short(read[0])} → ${short(read[read.length - 1])} only`
}

/** The subjects block's line about which column carries the month. */
export function subjectsNote(rows: readonly SubjectRow[]): string | null {
  if (rows.length === 0) return null
  const yourN = rows[0].you.n
  const thin = rows.every((r) => r.you.verdict == null || !isAnswer(r.you.verdict.state))
  if (!thin) return null
  return yourN == null
    ? 'Your own side carries no reading this month — the category column carries the month.'
    : `Your side reads "too few to compare" on ${fmtInt(yourN)} videos — the category column carries the month.`
}

/** The "not a blank form" line (design §3 OV2, empty state). */
export function candidateLine(candidates: readonly SubjectCandidate[]): string {
  return candidates.length === 0
    ? 'No subjects are named yet, and nothing has been proposed — name the five to eight things you want to be known for in Settings.'
    : `We have proposed ${fmtInt(candidates.length)} ${candidates.length === 1 ? 'subject' : 'subjects'} from your own claims and your category's top themes. Confirm, rename or replace them.`
}

// ---- the loader ---------------------------------------------------------------

interface RunRow {
  id: string
  started_at: string
}

interface RecRow {
  id: string
  title: string
  lineage_id: string | null
  status: string | null
  priority: string | null
  based_on: { insight_ids?: string[] } | null
}

interface AnomalyFlagRow {
  run_id: string
  week_start: string
  week_end: string
  object_kind: string
  object_id: string
  label: string
  denominator: string
  week_k: number
  week_n: number
  change_pts: number
  band_pts: number
  rank: number
  explanation: { sentences?: string[] } | null
  quote_refs: string[] | null
}

/** The tenant's rivals, from `competitors` where M1 has landed and from the
 *  tracked list where it has not. One shape either way, so nothing downstream
 *  has to know which of the two answered. */
async function loadRivals(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ name: string; retiredAt: string | null }[]> {
  let stored: Competitor[] = []
  try {
    stored = await loadCompetitors(supabase, clientId)
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  if (stored.length > 0) return stored.map((r) => ({ name: r.name, retiredAt: r.retired_at }))
  const res = await supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  const tc = row<{ competitor_names: string[] | null }>(res, 'overview.rivals')
  return (tc?.competitor_names ?? []).map((name) => ({ name, retiredAt: null }))
}

/** A stored month table, read straight (not recomputed). Null — never [] —
 *  when the migration that creates it has not been applied here. */
async function readStoredMonths<T>(
  client: SupabaseClient,
  table: string,
  clientId: string,
  months: readonly string[],
  order: readonly string[],
  missing: (error: unknown) => boolean,
): Promise<T[] | null> {
  if (months.length === 0) return []
  try {
    return await selectAll<T>(() => {
      let q = client
        .from(table)
        .select('*')
        .eq('client_id', clientId)
        .gte('month', months[0])
        .lte('month', months[months.length - 1])
      for (const col of order) q = q.order(col, { ascending: true })
      return q
    })
  } catch (error) {
    if (missing(error) || isMissingMonthTable(error)) return null
    throw error
  }
}

/** A stored `month_kind_readings` row, as the block builder takes it. */
export type StoredKindRow = {
  month: string
  audience: string
  kind: string
  videos: number
  comments: number
  platform_mix: Record<string, number> | null
  run_id: string | null
}

/** A stored `month_audience_stats` row, as the block builders take it. */
export type StoredStatsRow = {
  month: string
  audience: string
  judged: number
  positive: number
  negative: number
  neutral: number
  mixed: number
  judged_framing: number | null
  panel_videos: number | null
  attention_comments: number | null
  panel_platform_mix: Record<string, number> | null
  panel_id: string | null
}

/** A stored `month_subject_readings` row, as OV2 takes it. */
export type StoredSubjectRow = {
  month: string
  audience: string
  subject_id: string
  videos: number
  comments: number
}

/**
 * The Overview, for one tenant and one horizon.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * reading of anything, and the page says so rather than drawing seven blocks of
 * refusals.
 */
export async function loadOverview(scope: Scope): Promise<OverviewData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId, params } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()
  const horizon = parseHorizon(params.horizon)

  // ── wave 1: who this is, and what has been delivered ───────────────────
  const [clientRes, runsRaw, runningIds, rivals] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    selectAll<RunRow>(() =>
      supabase.from('pipeline_runs').select('id, started_at')
        .eq('client_id', clientId).in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true }),
    ),
    fetchRunningRunIds(supabase, clientId, 'overview'),
    loadRivals(supabase, clientId),
  ])
  const client = row<{ company_name: string | null }>(clientRes, 'overview.client')
  const brand = client?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  const updatesByMonth: Record<string, number> = {}
  for (const r of runsRaw) {
    const m = monthStartOf(r.started_at)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  const firstRunMonth = monthStartOf(runsRaw[0].started_at)

  // ── wave 2: the whole denominator history, for the axis ────────────────
  // Cheap (a hundred-odd rows) and it decides everything else: `sinceStart`
  // is what "since we started" means (decision M), and the horizon window is
  // computed from it rather than from the first month with any row at all.
  const history = await loadMonthSeries(reading.client, clientId, {
    from: '2019-01-01',
    to: readingAt,
    updatesByMonth,
    firstRunMonth,
  })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  const window = horizonWindow(horizon, readingAt, started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  // THE COMPARISON IS THE CALENDAR'S, NOT THE HORIZON'S. "This month" is a
  // one-month axis, and taking the previous month off the axis left the
  // default reading of the default page with no month-on-month comparison at
  // all — every badge silent on the horizon every reader opens first. The
  // horizon decides how much is DRAWN; the month before this one is always
  // read, so the page reads one month wider than it draws.
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]
  const monthStatus = freezeStateFor(month, readingAt)
  const themedRunId = await fetchThemedRunId(supabase, clientId, runningIds, 'overview')

  // ── wave 3: the readings ───────────────────────────────────────────────
  const rivalAudiences = rivals.map((r) => rivalKey(r.name))
  const audiences = [CLIENT_AUDIENCE, ...rivalAudiences, INDUSTRY_AUDIENCE]
  const top = themedRunId
    ? await loadTopObjects(reading.client, clientId, {
        objectKind: 'theme',
        // EVERY AUDIENCE, not just the category's. OV4's "raised most under
        // their content" is a reading of the RIVAL's audience, and asking only
        // for the category's top themes left every rival row with a dash while
        // Sealand's Cotopaxi carried 21 theme rows that month. `loadTopObjects`
        // ranks per audience, so one call answers for all of them.
        audiences,
        from: readAxis[0],
        to: month,
        limit: MOVER_POOL,
      })
    : []

  const [themeSet, kindRows, statsRows, subjectMonths, subjectRows, moveRows, panel, lastMonthSoFar, flags, subjectsAtLastMonth] =
    await Promise.all([
      loadMonthSeries(reading.client, clientId, {
        from: readAxis[0],
        to: month,
        audiences,
        objectKind: 'theme',
        objectIds: top.map((t) => t.objectId),
        updatesByMonth,
        firstRunMonth,
        changeLogFrom: history.changeLogFrom,
      }),
      readStoredMonths<StoredKindRow>(reading.client, 'month_kind_readings', clientId, readAxis, ['month', 'audience', 'kind'], isMissingKindMoodAttention),
      readStoredMonths<StoredStatsRow>(reading.client, 'month_audience_stats', clientId, readAxis, ['month', 'audience'], isMissingKindMoodAttention),
      readStoredMonths<StoredSubjectRow>(reading.client, 'month_subject_readings', clientId, readAxis, ['month', 'audience', 'subject_id'], isMissingSubjects),
      loadSubjects(supabase, clientId),
      loadMoves(supabase, clientId),
      currentPanel(reading.client, clientId).catch((error: unknown) => {
        if (isMissingKindMoodAttention(error)) return null
        throw error
      }),
      readAtThisPointLastMonth(reading, month, readingAt),
      loadFlags(supabase, clientId, month),
      readSubjectsAtThisPointLastMonth(reading, month, readingAt),
    ])

  // ── OV0 · the page bar and the still-filling line ──────────────────────
  const denominatorByMonth = new Map<string, number>()
  for (const d of history.denominators) {
    denominatorByMonth.set(d.month, (denominatorByMonth.get(d.month) ?? 0) + d.videos)
  }
  const monthVideos = denominatorByMonth.get(month) ?? null
  // THE TRAILING MEDIAN IS THE TENANT'S GATHERED ERA, not its whole history
  // and not the page's axis. Two ways to get this wrong and production showed
  // both: off the AXIS, "This month" has no trailing months at all and "Last
  // 3" has two (Össur read "449 of an expected ~429"); off the whole HISTORY,
  // the median is dominated by months that were read back at setup and never
  // gathered — six years of two-video months — and Össur read "449 of an
  // expected ~15". A month before the first update is not a month we
  // collected, and comparing a gathered month with one is comparing two
  // different things. It is the same era gate `thinMonth`'s updates arm
  // already applies, applied to its median arm.
  const historyMonths = [...denominatorByMonth.keys()].sort()
  // The counter counts the GATHERED era, for the reason the median does.
  const readingsSoFar = historyMonths.filter((m) => m >= firstRunMonth && m <= month).length
  const trailing = historyMonths
    .filter((m) => m < month && m >= firstRunMonth)
    .slice(-12)
    .map((m) => denominatorByMonth.get(m) ?? null)
  // One month is not a median. Under two, the line prints the count alone.
  const expected = trailing.length >= 2 ? medianOf(trailing) : null
  const daysIn = daysInto(month, readingAt)
  const early = earlyInMonth(month, readingAt)
  const thin = thinMonth(
    { month, videos: monthVideos, k: null },
    trailing,
    { updates: updatesByMonth[month] ?? 0, firstRunMonth },
  )
  const updateDates = runsRaw.filter((r) => monthStartOf(r.started_at) === month).map((r) => shortDate(r.started_at))
  // WHAT SUPPRESSES A BAND. Two gates, one answer for the builders: a thin
  // month, and a month under a third complete (design §3 OV0, "no banded
  // change at all"). The line says which it is; a builder only needs to know
  // that it may not draw one.
  const suppress = thin || early
  const bar: BarBlock = {
    month,
    status: monthStatus,
    daysIn,
    updates: updatesByMonth[month] ?? 0,
    updateDates,
    videos: monthVideos,
    expected,
    atLastMonth: lastMonthSoFar.videos,
    atLastMonthKnown: lastMonthSoFar.known,
    thin,
    line: fillingLine({
      month,
      status: monthStatus,
      daysIn,
      updates: updatesByMonth[month] ?? 0,
      videos: monthVideos,
      expected,
      atLastMonth: lastMonthSoFar.videos,
      atLastMonthKnown: lastMonthSoFar.known,
      thin,
      early,
    }),
    readings: readingsSoFar,
    counter: readingsCounter(readingsSoFar),
  }

  // ── OV2 · your subjects ────────────────────────────────────────────────
  const leadRival = rivals.find((r) => !r.retiredAt) ?? rivals[0] ?? null
  const subjects = buildSubjects({
    subjects: subjectRows,
    months: subjectMonths,
    denominators: denominatorByMonth,
    perAudience: audienceMonthVideos(history.denominators),
    axis: readAxis,
    month,
    prevMonth,
    leadRival: leadRival?.name ?? null,
    atLastMonth:
      monthStatus === 'filling' && subjectsAtLastMonth != null
        ? { bySubject: subjectsAtLastMonth, perAudience: lastMonthSoFar.perAudience }
        : null,
    thin: suppress,
  })

  // ── OV3 · what the category is saying ─────────────────────────────────
  const category = buildCategory({
    audience: INDUSTRY_AUDIENCE,
    axis: readAxis,
    month,
    prevMonth,
    series: themeSet.series,
    kindRows,
    statsRows,
    panel,
    perAudience: audienceMonthVideos(history.denominators),
    recordFrom: started.from,
    thin: suppress,
  })

  // ── OV4 · rivals ───────────────────────────────────────────────────────
  const dual = history.denominators.find((d) => d.month === month && d.audience === CLIENT_AUDIENCE) ?? null
  const rivalsBlock = buildRivals({
    rivals,
    statsRows,
    month,
    prevMonth,
    brand,
    series: themeSet.series,
    dualMention: (dual as { dual_mention?: number } | null)?.dual_mention ?? null,
  })

  // ── OV5 · your moves ───────────────────────────────────────────────────
  const moves: MovesBlock = {
    rows: (moveRows ?? []).filter((m) => m.status === 'active').map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      declaredAt: m.declared_at,
      line: moveLine(m),
    })),
    unlock: MOVES_UNLOCK,
    masthead: MOVES_MASTHEAD,
    empty: null,
    recorded: moveRows != null,
  }
  moves.empty = moveRows == null
    ? 'What you are doing about it is not recorded for this workspace yet.'
    : moves.rows.length === 0
      ? MOVES_EMPTY
      : null

  // ── OV1 · the one sentence ─────────────────────────────────────────────
  const sentenceVerdicts = [
    ...subjects.rows.flatMap((r) => [r.category.verdict, r.you.verdict].filter((v): v is Verdict => v != null)),
    ...category.growing.map((m) => m.verdict),
    ...category.fading.map((m) => m.verdict),
  ]
  const head = headline({ verdicts: suppress ? [] : sentenceVerdicts })
  const ledger = await loadLedger(supabase, clientId)
  const voices = await loadVoices(supabase, clientId, head.lead, top, themedRunId)
  const anomaly = flags.length > 0 ? await buildAnomaly(supabase, flags[0]) : null
  const interpretation = composeInterpretation(
    'interpretation_monthly',
    sentenceVerdicts,
    proseFigures(head.figures),
    voices.voices.map((v) => ({ ref: v.quote.ref })),
  )
  const sentence: SentenceBlock = {
    lead: head.lead,
    body: head.body,
    figures: head.figures,
    anomaly,
    interpretation,
    ledger,
    voices: voices.voices,
    voicesFrom: voices.from,
    verdicts: sentenceVerdicts,
  }

  // ── OV6 · how sound is this ────────────────────────────────────────────
  const pageVerdicts = [
    ...sentenceVerdicts,
    ...rivalsBlock.rows.flatMap((r) => [r.attentionVerdict, r.contentVerdict].filter((v): v is Verdict => v != null)),
    ...(category.mood?.verdict ? [category.mood.verdict] : []),
    ...Object.values(category.kindVerdicts).filter((v): v is Verdict => v != null),
  ]
  const recordInputs = await loadRecordInputs(
    reading.client,
    clientId,
    recordWindow(month, readingAt),
    { comparisonsRefused: countRefused(pageVerdicts), refusals: refusals(pageVerdicts), now: readingAt },
  )
  const record: RecordBlock = {
    line: howSoundLine(recordInputs),
    lines: recordLines(recordInputs),
    href: '/dashboard/settings',
    freezesOn: freezesOn(month),
  }

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    horizon,
    window,
    axis,
    substrate: themeSet.substrate,
    notes: mergeSeriesNotes(themeSet.series),
    bar,
    sentence,
    subjects,
    category,
    rivals: rivalsBlock,
    moves,
    record,
  }
}

/** The day a month stops moving, off the reading layer's own rule rather than
 *  a second copy of it: `freezeBoundary` reads FREEZE_AFTER_DAYS, which is
 *  what the `month_reading_frozen_guard` trigger enforces. A hand-rolled 30
 *  days here would drift from the database the day that constant moved. */
function freezesOn(month: string): string {
  return freezeBoundary(month).slice(0, 10)
}

/** Videos per audience per month, off the denominator rows. */
function audienceMonthVideos(
  denominators: readonly { month: string; audience: string; videos: number }[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const d of denominators) out.set(`${d.month}|${d.audience}`, d.videos)
  return out
}

/**
 * The window "at this point last month" means, composed once.
 *
 * OV0 states it for the page and OV2 states it per subject row, and two
 * arithmetics for one phrase is how they come to disagree. Null when the month
 * is behind us: a complete month is not still filling and has no "this point".
 */
export function atThisPointWindow(month: string, now: string): { from: string; to: string } | null {
  const days = daysInto(month, now)
  if (days == null) return null
  // COMPLETE DAYS ON BOTH SIDES. `daysInto` is the day of the month — 15 on
  // 15 September — and this month holds fourteen whole days plus part of a
  // fifteenth, so a previous-month window of [1 Aug, 16 Aug) put fifteen whole
  // days against them and flattered last month by up to a day's traffic in the
  // one comparison OV0 exists to make. Fourteen against fourteen. On the first
  // of the month nothing has elapsed to compare with, and the line says so
  // rather than drawing an empty window as a zero.
  const elapsed = days - 1
  if (elapsed <= 0) return null
  const prev = previousMonthOf(month)
  const to = new Date(`${prev}T00:00:00.000Z`)
  to.setUTCDate(to.getUTCDate() + elapsed)
  return { from: prev, to: to.toISOString() }
}

/** "At this point last month", in one window call (design §3 OV0). The
 *  per-audience row is kept, not just the pooled total, because OV2's own
 *  version of the comparison divides by the category's n and not by the
 *  page's. */
async function readAtThisPointLastMonth(
  reading: ReadingHandle,
  month: string,
  now: string,
): Promise<{ videos: number | null; known: boolean; perAudience: Map<string, number> }> {
  const window = atThisPointWindow(month, now)
  if (!window) return { videos: null, known: true, perAudience: new Map() }
  const answer = await loadWindowReading(reading.client, reading.clientId, window)
  if (answer.denominators == null) return { videos: null, known: false, perAudience: new Map() }
  const perAudience = new Map<string, number>()
  for (const d of answer.denominators) perAudience.set(d.audience, d.videos ?? 0)
  return {
    videos: answer.denominators.reduce((total, d) => total + (d.videos ?? 0), 0),
    known: true,
    perAudience,
  }
}

/**
 * Each subject's videos at the same point last month, per audience.
 *
 * Through `window_subject_readings`, never by taking last month's whole row:
 * "at this point last month" is a part-month, and the stored month row is the
 * whole of it. Null — never an empty map — when M4 is not applied here, which
 * is also when OV2 itself is refusing.
 */
async function readSubjectsAtThisPointLastMonth(
  reading: ReadingHandle,
  month: string,
  now: string,
): Promise<Map<string, number> | null> {
  const window = atThisPointWindow(month, now)
  if (!window) return null
  try {
    const rows = await selectAll<{ audience: string; subject_id: string; videos: number | null }>(() =>
      reading.client
        .rpc(RPC_WINDOW_SUBJECT_READINGS, { p_client: reading.clientId, p_from: window.from, p_to: window.to })
        .order('audience', { ascending: true })
        .order('subject_id', { ascending: true }),
    )
    const out = new Map<string, number>()
    for (const r of rows) out.set(`${r.audience}|${r.subject_id}`, r.videos ?? 0)
    return out
  } catch (error) {
    if (isMissingSubjects(error) || isMissingMonthlyReading(error)) return null
    throw error
  }
}

/** The tenant's named subjects. Null — never [] — before M4 is applied. */
async function loadSubjects(supabase: SupabaseClient, clientId: string): Promise<Subject[] | null> {
  try {
    return await selectAll<Subject>(() =>
      supabase
        .from(TABLE_SUBJECTS)
        .select('id, client_id, name, description, origin, source_ref, named_at, status, superseded_by, embedded_at, embed_input_version, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
        .eq('client_id', clientId)
        .in('status', ['active', 'proposed'])
        .order('named_at', { ascending: true })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** The moves this tenant has dated. Null — never [] — before M4 is applied. */
async function loadMoves(supabase: SupabaseClient, clientId: string): Promise<Move[] | null> {
  try {
    return await selectAll<Move>(() =>
      supabase
        .from(TABLE_MOVES)
        .select('*')
        .eq('client_id', clientId)
        .order('declared_at', { ascending: false })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** The top row of Market's ledger, with its age and the decision on it. */
async function loadLedger(supabase: SupabaseClient, clientId: string): Promise<LedgerRow | null> {
  const [recRows, decisionRes] = await Promise.all([
    // THROUGH selectAll, like every other list read: a bare `.select()` caps
    // at 1000 rows silently (AGENTS.md). 56 and 65 rows on production today,
    // so nothing truncates — the rule is about the read, not about today's
    // count, and `rec_decisions` beside it already obeys it.
    selectAll<RecRow>(() =>
      supabase
        .from('recommendations')
        // THE COLUMNS THE TABLE ACTUALLY HAS. There is no `first_seen_run_date`
        // and no `rank_score`: Pass D-b deletes and reinserts every
        // recommendation each update, so the row carries no history at all and
        // `lineage_id` is the only thing about it that survives. Ordering is
        // `topRecommendation`'s — priority, then how well grounded — so Overview
        // and Market name the same top row.
        .select('id, title, lineage_id, status, priority, based_on')
        .eq('client_id', clientId)
        .order('id', { ascending: true }),
    ).catch((error: unknown) => {
      console.error(`[pages] overview.recommendation: ${(error as { message?: string })?.message ?? String(error)}`)
      return [] as RecRow[]
    }),
    selectAll<RecDecision>(() =>
      supabase
        .from(REC_DECISIONS_TABLE)
        .select('id, lineage_id, status, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200),
    ).catch(() => [] as RecDecision[]),
  ])
  const rec = topRecommendation(recRows)
  if (!rec) return null
  const decided = rec.lineage_id
    ? [...decisionRes].filter((d) => d.lineage_id === rec.lineage_id).sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1))[0] ?? null
    : null
  const inherited = rec.lineage_id ? inheritedStatus(rec.lineage_id, decisionRes) : null
  return {
    id: rec.id,
    title: rec.title,
    // NO AGE, AND THAT IS THE HONEST ANSWER TODAY. "First raised N months ago"
    // needs a lineage with history behind it; every stored row was written by
    // the newest update and `lineage_id` was backfilled to the row's own id in
    // 20260915093000, so dating one from what is stored would date it from its
    // newest copy. The earliest DECISION is a real date and a different claim
    // (when you first acted, not when we first said it), so it is printed as
    // itself below and never as an age. Market's ledger (WP14) is where the
    // age arrives, once two updates have carried one lineage.
    monthsOld: null,
    status: recStatus(inherited ?? rec.status),
    statusLabel: REC_STATUS_LABEL[recStatus(inherited ?? rec.status)],
    decidedAt: decided?.decided_at ?? null,
    href: '/dashboard/market',
  }
}

/** The flags that fired this month, largest first. Empty before M7 lands. */
async function loadFlags(supabase: SupabaseClient, clientId: string, month: string): Promise<AnomalyFlagRow[]> {
  try {
    return await selectAll<AnomalyFlagRow>(() =>
      supabase
        .from('anomaly_flags')
        .select('run_id, week_start, week_end, object_kind, object_id, label, denominator, week_k, week_n, change_pts, band_pts, rank, explanation, quote_refs')
        .eq('client_id', clientId)
        .gte('week_start', monthStartOf(month))
        .order('week_start', { ascending: false })
        .order('rank', { ascending: true }),
    )
  } catch (error) {
    // DEGRADE, BUT SAY SO. The flag line is decoration on a page whose every
    // other block stands on its own, so a failed read costs the line and
    // nothing else — but a bare `catch {}` made an RLS failure, a network
    // error and a column rename indistinguishable from "M7 is not applied",
    // with nothing written anywhere. That is exactly the failure lib/pages/
    // read.ts was written against: a broken read and an empty table are the
    // same value, and the server log is the only place either can surface.
    //
    // Narrow by NAME here rather than importing WP8's own guard, which lives
    // beside the writer and would pull the OpenAI client into a page bundle:
    // a missing table before M7 is the expected state and says nothing; any
    // other error is news.
    if (!isMissingAnomalyFlags(error)) {
      console.error(`[pages] overview.flags: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return []
  }
}

/** Is `anomaly_flags` (M7) simply not applied here? The same shape
 *  `isMissingMonthlyReading` tests, asked about one table by name. */
export function isMissingAnomalyFlags(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes('anomaly_flags')) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

async function buildAnomaly(supabase: SupabaseClient, flag: AnomalyFlagRow): Promise<AnomalyLine> {
  const refs = (flag.quote_refs ?? []).filter((r): r is string => typeof r === 'string').slice(0, 1)
  let quote: Quote | null = null
  if (refs.length > 0) {
    const resolved = await fetchQuoteResolutionsByRefs(supabase, refs, { onReadError: 'degrade' })
    const one = resolved.get(refs[0])
    if (one) quote = { ref: refs[0], text: one.text, lang: one.lang ?? null, english: one.english ?? null }
  }
  return {
    label: flag.label,
    objectKind: flag.object_kind,
    weekStart: flag.week_start,
    weekEnd: flag.week_end,
    k: flag.week_k,
    n: flag.week_n,
    changePts: Number(flag.change_pts),
    bandPts: Number(flag.band_pts),
    denominator: flag.denominator,
    sentences: flag.explanation?.sentences ?? [],
    quote,
    href: '/dashboard/week',
  }
}

/** Two voices from the videos behind the sentence (design §3 OV1). */
async function loadVoices(
  supabase: SupabaseClient,
  clientId: string,
  lead: Verdict | null,
  top: readonly { objectId: string }[],
  themedRunId: string | null,
): Promise<{ voices: Voice[]; from: number }> {
  if (!themedRunId) return { voices: [], from: 0 }
  const registryId = lead?.objectKind === 'theme' ? lead.objectId : top[0]?.objectId
  if (!registryId) return { voices: [], from: 0 }
  // EVERY READ CARRIES THE TENANT, even where the ids came from the tenant's
  // own run. The session client is RLS-scoped, so this changes nothing for a
  // signed-in reader — but `loadOverview` takes any SupabaseClient, and a
  // service-role caller (a report build, a scratchpad, this package's own
  // verification) is scoped by what the query says and by nothing else.
  const themeRes = await supabase
    .from('themes')
    .select('id, label, supporting_insight_ids')
    .eq('client_id', clientId)
    .eq('run_id', themedRunId)
    .eq('registry_id', registryId)
    .limit(1)
  const theme = rows<{ id: string; label: string; supporting_insight_ids: string[] | null }>(themeRes, 'overview.voicesTheme')[0]
  const insightIds = (theme?.supporting_insight_ids ?? []).slice(0, 40)
  if (insightIds.length === 0) return { voices: [], from: 0 }

  const citations = await fetchQuoteCitationsByAudience(supabase, insightIds)
  const pool: QuoteCitation[] = []
  const seen = new Set<string>()
  for (const id of insightIds) {
    for (const c of (citations.get(id) ?? []).sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      const key = text.toLowerCase()
      if (!text || seen.has(key)) continue
      // THE ONE ENGLISH-AND-LENGTH GATE (lib/quotes.ts, item 8). Without it
      // production offered "must buyyy" and "must buy" as Sealand's two
      // voices: two near-identical four-character comments, on the block that
      // is supposed to be the month's evidence. It reads the cache's own
      // language answer where there is one and the heuristic where there is
      // not, so a translated quote is kept and an unreadable one is not.
      if (!readsAsHeroQuote(text, c)) continue
      seen.add(key)
      pool.push({ ...c, quote: text })
    }
  }
  const shown = pool.slice(0, VOICES_SHOWN)
  const commentIds = shown.map((c) => c.commentId).filter((id): id is string => Boolean(id))
  type CommentMeta = { platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }
  const meta = new Map<string, CommentMeta>()
  if (commentIds.length > 0) {
    const res = await supabase
      .from('comments')
      .select('id, platform, comment_date, video_id, comment_id')
      .eq('client_id', clientId)
      .in('id', commentIds)
    for (const c of rows<CommentMeta & { id: string }>(res, 'overview.voiceComments')) meta.set(c.id, c)
  }
  // WHERE TO GO AND READ IT. The design asks the cite for "platform · date ·
  // link" and the block printed no link at all. `citationLink` is the product's
  // one answer for that (lib/evidence-cite.ts): YouTube deep-links to the
  // comment, TikTok and Instagram have no public per-comment URL and land on
  // the post. A video with no stored URL gets no link rather than a dead one.
  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  if (nativeIds.length > 0) {
    const res = await supabase.from('videos').select('platform, video_id, video_url').eq('client_id', clientId).in('video_id', nativeIds)
    for (const v of rows<{ platform: string | null; video_id: string | null; video_url: string | null }>(res, 'overview.voiceVideos')) {
      if (v.video_url && v.video_id) urlByKey.set(`${v.platform}::${v.video_id}`, v.video_url)
    }
  }
  const voices = shown.map((c) => {
    const m = c.commentId ? meta.get(c.commentId) : undefined
    const cite = [
      m?.platform ? m.platform : null,
      m?.comment_date ? shortDate(m.comment_date) : null,
      'under a video we read',
    ].filter(Boolean).join(' · ')
    const url = m?.platform && m.video_id ? urlByKey.get(`${m.platform}::${m.video_id}`) ?? null : null
    return {
      quote: {
        ref: quoteRef.evidence(c.evidenceId),
        text: c.quote,
        ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
      },
      cite,
      href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
    }
  })
  return { voices, from: pool.length }
}

// ---- the blocks' own shaping ---------------------------------------------------

interface SubjectsInput {
  subjects: Subject[] | null
  months: StoredSubjectRow[] | null
  denominators: Map<string, number>
  perAudience: Map<string, number>
  axis: readonly string[]
  month: string
  prevMonth: string
  leadRival: string | null
  /** Each `<audience>|<subject id>` at the same point last month, and the
   *  audiences' own denominators there. Null where the window cannot be read. */
  atLastMonth: { bySubject: Map<string, number>; perAudience: Map<string, number> } | null
  thin: boolean
}

/** The category side of one subject at the same point last month, or null. */
function atLastMonthFor(input: SubjectsInput, subjectId: string) {
  const at = input.atLastMonth
  if (!at) return null
  const n = at.perAudience.get(INDUSTRY_AUDIENCE) ?? null
  if (n == null || n <= 0) return null
  const k = at.bySubject.get(`${INDUSTRY_AUDIENCE}|${subjectId}`) ?? 0
  return { k, n, pct: pctOf(k, n) }
}

export function buildSubjects(input: SubjectsInput): SubjectsBlock {
  const categoryLabel = audienceLabel(INDUSTRY_AUDIENCE)
  const rivalLabel = input.leadRival
  if (input.subjects == null || input.months == null) {
    return { state: 'not_recorded', rows: [], candidates: [], rivalLabel, categoryLabel, note: null }
  }
  const active = input.subjects.filter((s) => s.status === 'active')
  const proposed = input.subjects.filter((s) => s.status === 'proposed')
  if (active.length === 0) {
    const candidates = proposed.map((s) => ({
      name: s.name,
      origin: s.origin,
      because:
        s.origin === 'own_claims'
          ? 'you said this in your own posts'
          : s.origin === 'category_theme'
            ? 'the category raised it in the videos we read'
            : 'you named it',
    }))
    return {
      state: candidates.length > 0 ? 'candidates' : 'none',
      rows: [],
      candidates,
      rivalLabel,
      categoryLabel,
      note: candidateLine(candidates),
    }
  }

  const byKey = new Map<string, StoredSubjectRow>()
  for (const r of input.months) byKey.set(`${monthStartOf(r.month)}|${r.audience}|${r.subject_id}`, r)
  const rivalAudience = input.leadRival ? rivalKey(input.leadRival) : null
  // AN ABSENT ROW IS A ZERO ONLY WHERE THE MONTH WAS READ AT ALL.
  // `monthly_subject_readings` writes no zero rows, so a subject missing from
  // an audience-month that OTHER subjects have rows in really did come up in
  // no video. A month with no subject rows at all was never computed, and
  // reading that as zero prints "0.0% 0 of 388" for a month nothing looked at
  // — and produces a real banded change out of it next month. The two readers
  // disagreed about which was which: the table said 0 wherever a denominator
  // existed and the sparkline said "no reading" for the same cell.
  const readMonths = new Set(input.months.map((r) => `${monthStartOf(r.month)}|${r.audience}`))
  const kOf = (subjectId: string, audience: string, month: string): number | null => {
    const row = byKey.get(`${month}|${audience}|${subjectId}`)
    if (row) return row.videos
    return readMonths.has(`${month}|${audience}`) ? 0 : null
  }

  const side = (subjectId: string, audience: string, month: string | null): SideReading => {
    if (!month) return { k: null, n: null, pct: null, verdict: null, observed: false }
    const n = input.perAudience.get(`${month}|${audience}`) ?? null
    const k = n == null ? null : kOf(subjectId, audience, month)
    return { k, n, pct: pctOf(k, n), verdict: null, observed: n != null && k != null }
  }

  const rows: SubjectRow[] = active.map((s) => {
    const you = side(s.id, CLIENT_AUDIENCE, input.month)
    const rival = rivalAudience ? side(s.id, rivalAudience, input.month) : null
    const category = side(s.id, INDUSTRY_AUDIENCE, input.month)
    const point = (audience: string, month: string): SeriesPoint => ({
      month,
      videos: input.perAudience.get(`${month}|${audience}`) ?? null,
      k: kOf(s.id, audience, month),
      audience,
      // A subject's membership is not a clustering artefact, so its months are
      // comparable across a boundary a theme's are not (lib/subjects/read.ts).
      regime: 'n/a',
    })
    const compare = (audience: string, reading: SideReading): Verdict | null => {
      if (input.thin || !input.prevMonth || !reading.observed) return null
      return monthChange({
        object: { kind: 'subject', id: s.id, label: s.name },
        audience,
        curr: point(audience, input.month),
        prev: point(audience, input.prevMonth),
      })
    }
    you.verdict = compare(CLIENT_AUDIENCE, you)
    if (rival && rivalAudience) rival.verdict = compare(rivalAudience, rival)
    category.verdict = compare(INDUSTRY_AUDIENCE, category)

    const axisPoints = input.axis.map((m) => point(INDUSTRY_AUDIENCE, m))
    return {
      id: s.id,
      label: s.name,
      you,
      rival,
      category,
      direction: input.thin ? null : directionWord(axisPoints),
      spark: axisPoints.slice(-SPARK_MONTHS).map((p) => pctOf(p.k, p.videos)),
      sparkMonths: axisPoints.slice(-SPARK_MONTHS).map((p) => p.month),
      categoryAtLastMonth: atLastMonthFor(input, s.id),
      href: `/dashboard/subjects?item=${encodeURIComponent(s.id)}`,
    }
  })

  return {
    state: 'ready',
    rows,
    candidates: [],
    rivalLabel,
    categoryLabel,
    note: subjectsNote(rows),
  }
}

interface CategoryInput {
  audience: string
  axis: readonly string[]
  month: string
  prevMonth: string | null
  series: readonly MonthSeries[]
  kindRows: StoredKindRow[] | null
  statsRows: StoredStatsRow[] | null
  panel: AttentionPanel | null
  perAudience: Map<string, number>
  /** The first month of this tenant's readable record (`sinceStart`). "First
   *  heard this month" may be said only when the drawn axis reaches it. */
  recordFrom: string | null
  thin: boolean
}

export function buildCategory(input: CategoryInput): CategoryBlock {
  const label = audienceLabel(input.audience)
  const denominator = input.perAudience.get(`${input.month}|${input.audience}`) ?? null

  // (a) the kinds
  let kinds: KindShare[] = []
  let reddit: RedditRead | null = null
  const kindVerdicts: Record<string, Verdict | null> = {}
  let kindsNote: string | null = null
  if (input.kindRows == null) {
    kindsNote = 'What kind of thing is being said is not recorded month by month for this workspace yet.'
  } else {
    const thisMonth = input.kindRows.filter((r) => monthStartOf(r.month) === input.month && r.audience === input.audience)
    const lastMonth = input.prevMonth
      ? input.kindRows.filter((r) => monthStartOf(r.month) === input.prevMonth && r.audience === input.audience)
      : []
    const all = kindShares(
      thisMonth.map((r) => ({ kind: r.kind, videos: r.videos, comments: r.comments, platform_mix: r.platform_mix ?? {} })),
      denominator,
    )
    kinds = all.slice(0, 3)
    reddit = redditRead(thisMonth.map((r) => ({ kind: r.kind, videos: r.videos, platform_mix: r.platform_mix ?? {} })))
    if (all.length === 0) kindsNote = 'Nothing was read into this month’s kinds yet.'
    for (const k of kinds) {
      const prev = lastMonth.find((r) => r.kind === k.kind)
      const prevN = input.prevMonth ? input.perAudience.get(`${input.prevMonth}|${input.audience}`) ?? null : null
      kindVerdicts[k.kind] =
        input.thin || prev == null || prevN == null || denominator == null
          ? null
          : kindChange({
              kind: k.kind,
              audience: input.audience,
              curr: { month: input.month, k: k.videos, videos: denominator },
              prev: { month: input.prevMonth as string, k: prev.videos, videos: prevN },
            })
    }
  }

  // (b) growing and fading
  const movers: Mover[] = []
  let moversNote: string | null = null
  const audienceSeries = input.series.filter((s) => s.audience === input.audience && s.objectId)
  if (audienceSeries.length === 0) {
    moversNote = 'No theme carried enough of this month to be compared.'
  }
  for (const s of audienceSeries) {
    const byMonth = pointsByMonth(s)
    const curr = byMonth.get(input.month)
    const prev = input.prevMonth ? byMonth.get(input.prevMonth) : null
    if (!curr || !prev || curr.k == null || curr.videos == null) continue
    const verdict = monthChange({
      object: { kind: 'theme', id: s.objectId as string, label: s.objectLabel ?? (s.objectId as string) },
      audience: s.audience,
      curr,
      prev,
    })
    const readable = s.points.filter((p) => p.k != null && p.k > 0)
    movers.push({
      id: s.objectId as string,
      label: s.objectLabel ?? (s.objectId as string),
      k: curr.k,
      n: curr.videos,
      pct: curr.pct,
      verdict,
      direction: input.thin ? null : directionWord(s.points),
      isNew: firstHeardThisMonth({
        axisFrom: input.axis[0] ?? input.month,
        recordFrom: input.recordFrom,
        readableMonths: readable.map((p) => p.month),
        month: input.month,
      }),
    })
  }
  const { growing, fading } = input.thin ? { growing: [], fading: [] } : splitMovers(movers)
  if (!moversNote && growing.length === 0 && fading.length === 0) {
    moversNote = input.thin
      ? 'Too little conversation this month to say what moved.'
      : 'Nothing moved clearly this month.'
  }

  // (c) mood and (d) attention
  let mood: MoodBlock | null = null
  let moodNote: string | null = null
  let attention: AttentionBlock | null = null
  let attentionNote: string | null = null
  if (input.statsRows == null) {
    moodNote = 'How the month was received is not recorded month by month for this workspace yet.'
    attentionNote = 'Attention under a fixed panel is not recorded for this workspace yet.'
  } else {
    const curr = input.statsRows.find((r) => monthStartOf(r.month) === input.month && r.audience === input.audience) ?? null
    const prev = input.prevMonth
      ? input.statsRows.find((r) => monthStartOf(r.month) === input.prevMonth && r.audience === input.audience) ?? null
      : null
    if (!curr) moodNote = 'Nothing in this month has been judged yet.'
    else {
      const counts = {
        judged: curr.judged,
        positive: curr.positive,
        negative: curr.negative,
        neutral: curr.neutral,
        mixed: curr.mixed,
        judged_framing: curr.judged_framing ?? 0,
      }
      mood = {
        shares: moodShares(counts),
        judged: curr.judged,
        framingPct: framingShare(counts),
        verdict:
          input.thin || !prev || !input.prevMonth
            ? null
            : moodChange({
                audience: input.audience,
                curr: { month: input.month, ...counts },
                prev: {
                  month: input.prevMonth,
                  judged: prev.judged,
                  positive: prev.positive,
                  negative: prev.negative,
                  neutral: prev.neutral,
                  mixed: prev.mixed,
                  judged_framing: prev.judged_framing ?? 0,
                },
              }),
      }
    }

    const panelMonths = input.axis
      .map((m) => {
        const r = input.statsRows?.find((x) => monthStartOf(x.month) === m && x.audience === input.audience)
        return r && r.panel_videos != null && r.attention_comments != null
          ? { month: m, comments: r.attention_comments, videos: r.panel_videos }
          : null
      })
      .filter((m): m is { month: string; comments: number; videos: number } => m != null)
    if (panelMonths.length === 0) {
      attentionNote = input.panel
        ? 'The panel has no reading in this window yet.'
        : 'No panel has been frozen for this workspace yet, so attention is not read.'
    } else {
      // THE PANEL LINE KEEPS ITS OWN AXIS, AND THE AXIS IS A CALENDAR.
      // `panelMonths` is already filtered to the months that carried a panel
      // reading, and `calendarGeometry` positions by INDEX into whatever axis
      // it is handed — so passing the filtered months drew a June reading and a
      // September one side by side, closing the gap and misdating every point
      // after it. That is the defect components/charts/calendar-line.tsx exists
      // to end. The axis is generated as a calendar from the panel's first
      // reading to this month; `CalendarSeries` matches its points to it by
      // month key, so a month with no reading is simply absent from the line.
      attention = {
        months: panelMonths,
        axis: monthAxis(panelMonths[0].month, input.month),
        panel: input.panel,
        verdict: null,
      }
    }
  }

  return {
    audience: input.audience,
    label,
    denominator,
    kinds,
    kindVerdicts,
    reddit,
    kindsNote,
    growing,
    fading,
    moversNote,
    mood,
    moodNote,
    attention,
    attentionNote,
  }
}

interface RivalsInput {
  rivals: readonly { name: string; retiredAt: string | null }[]
  statsRows: StoredStatsRow[] | null
  month: string
  prevMonth: string | null
  brand: string
  series: readonly MonthSeries[]
  dualMention: number | null
}

export function buildRivals(input: RivalsInput): RivalsBlock {
  const caveat = RIVALS_CAVEAT
  const retiredBy = new Map(input.rivals.map((r) => [rivalKey(r.name), r.retiredAt]))

  /** The subject raised most under this rival's content this month. */
  const raisedMost = (audience: string) => {
    let best: { label: string; k: number; n: number; pct: number | null } | null = null
    for (const s of input.series) {
      if (s.audience !== audience || !s.objectId) continue
      const point = pointsByMonth(s).get(input.month)
      if (!point || point.k == null || point.k <= 0 || point.videos == null) continue
      if (!best || point.k > best.k) {
        best = { label: s.objectLabel ?? s.objectId, k: point.k, n: point.videos, pct: point.pct }
      }
    }
    return best
  }

  if (input.statsRows == null) {
    return {
      rows: input.rivals.map((r) => ({
        audience: rivalKey(r.name),
        label: r.name,
        role: 'rival' as const,
        observed: false,
        attention: null,
        content: null,
        attentionVerdict: null,
        contentVerdict: null,
        ownPosts: null,
        raisedMost: raisedMost(rivalKey(r.name)),
        retiredAt: r.retiredAt,
      })),
      standingsNote:
        'How much attention each brand drew is not recorded month by month for this workspace yet — what is printed here is what was raised under their content.',
      dualMention: input.dualMention,
      caveat,
    }
  }

  const rowsOf = (month: string): AttentionRow[] =>
    attentionRowsOf(
      (input.statsRows ?? [])
        .filter((r) => monthStartOf(r.month) === month)
        .map((r) => ({
          audience: r.audience,
          panel_videos: r.panel_videos,
          attention_comments: r.attention_comments,
          panel_platform_mix: r.panel_platform_mix,
        })),
    )
  const panelIdOf = (month: string): string | null =>
    (input.statsRows ?? []).find((r) => monthStartOf(r.month) === month)?.panel_id ?? null

  const standings = buildStandings({
    month: input.month,
    rows: rowsOf(input.month),
    prevRows: input.prevMonth ? rowsOf(input.prevMonth) : undefined,
    prevMonth: input.prevMonth,
    rivals: input.rivals.map((r) => ({ name: r.name })),
    clientLabel: input.brand,
    categoryLabel: audienceLabel(INDUSTRY_AUDIENCE),
    dualMention: input.dualMention,
    panelId: panelIdOf(input.month),
    prevPanelId: input.prevMonth ? panelIdOf(input.prevMonth) : null,
  })

  return {
    rows: standings.map((s) => ({
      audience: s.audience,
      label: s.label,
      role: s.role,
      observed: s.observed,
      attention: s.attention,
      content: s.content,
      attentionVerdict: s.attentionVerdict,
      contentVerdict: s.contentVerdict,
      // Their own posts are read through `video_claims`, which no tenant may
      // select until M8 adds the policy (WP16), so this is null on every row
      // today and the block says why. It is a field for a CLAIM; the absence
      // is the block's to word (OWN_POSTS_UNREADABLE), and it is printed on
      // rivals only — your own brand and the category are not rivals with
      // posts of their own to read, and "— not tracked" against them said
      // nothing about anything.
      ownPosts: null,
      raisedMost: raisedMost(s.audience),
      retiredAt: retiredBy.get(s.audience) ?? null,
    })),
    standingsNote: standings.every((s) => !s.observed) ? `Nothing was ${NOT_OBSERVED} on this month’s panel.` : null,
    dualMention: input.dualMention,
    caveat,
  }
}
