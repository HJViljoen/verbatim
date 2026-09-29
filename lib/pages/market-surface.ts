import type { SupabaseClient } from '@supabase/supabase-js'

import { recStatus, REC_STATUS_LABEL, type RecStatus } from '../calibration'
import { gateTier, type GateTier } from '../curation'
import { currentTopLineage, recommendationOrder, recUpdateOf, recUpdateTimes } from '../dashboard-tiles'
import { fmtInt, monthName, shortDate } from '../format'
import { distinctVideos, groundedTier, insightTiers, labelsBySlug, ledgerRows, themeChips, tierCounts, type GroundingThemeRow, type ThemeChip } from '../market-tiles'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { cleanQuote, createCitedQuotePicker, fetchInsightsByIds, readingOf, readTranslations, type QuoteRow, type ThemeBucketRow } from '../quotes'
import { inheritedStatus, isMissingRecDecisions, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { methodLines, type MethodLines } from '../reading/method'
import { PLAN_EMPTY, loadPlanChecks, type PlanCheckCard } from '../ask/plan-cards'
import { scrubProse } from '../prose/scrub'
import { afterwardsFor, groundingFor, type Afterwards, type Grounding } from '../reading/afterwards'
import { recurrenceOf, type Recurrence } from '../reading/head-to-head'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals, type RecordInputs } from '../reading/record'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import { loadAppPairOn } from '../reading/gather-flags'
import type { PairOn } from '../reading/pairs'
import type { Verdict } from '../reading/verdicts'
import type { Quote } from '../renderables/types'
import { freezeStateFor, monthStartOf } from '../reading/monthly'
import { MONTH_PARAM, type ReadingMonth } from '../reading/reading-month'
import { loadDeliveredRuns, loadMarketRivalAudiences, loadReadingSchedule, readingViewFrom, type OtherMonth } from '../reading/reading-view'
import type { MonthStatus } from '../reading/types'
import type { Scope } from '../renderables/types'
import { isMissingColumnError, selectAll } from '../supabase-admin'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { isMissingSubjects, TABLE_MOVES, TABLE_SUBJECT_MEMBERSHIPS, TABLE_SUBJECTS, type Move, type Subject } from '../subjects/types'
import { subjectCalibration } from '../subjects/calibration-state'
import { MOVES_MASTHEAD, MOVES_UNLOCK, firstScoringMonth, loadMovesExtras, loadThemeSegmentRows, longMonth, makerRuleEnabled, recordWindow, themeSegmentsOf } from './overview'
import { ASK_ROWS, THEME_FLOOR, buildAsks, makerWords, namesABrand, stripUnevidencedBrand, type MarketTheme, type ThemeBoard } from './overview-market/board'
import { marketCalibration, type SubjectCalibrationWord } from './overview-market/subjects'
import { levelText } from '../reading/level'
import { marketAudiences, pooledDenominators } from '../reading/market'
import { nextMonth } from '../reading/month-key'
import {
  TABLE_OWN_POST_SUBJECTS, isMissingOwnPostSubjects, marketClaimEcho, marketEchoReading, ownPostFilings, postsTouching, touchWords,
  type ClaimEcho, type OwnPostFilings, type OwnPostSubjectRow, type TouchPost,
} from '../reading/own-posts'
import { INDUSTRY_AUDIENCE } from '../rivals'
import type { MoveCandidate, MoveReading } from '../reading/moves'
import { row } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'
import { quotesUntranslated } from './evidence-untranslated'
import { quoteGate } from '../quote-gate'
import { gateFor, readQuoteContext } from '../quote-context'
import { earliestMoveDay } from '../subjects/move-day'
import type { MoveDating } from './date-move'

// Market — the decision surface (Phase 1 WP14, design §3 MK1-MK7, item 42's
// second half).
//
// A SECOND MODULE BESIDE `lib/pages/market.ts`, NOT A REWRITE OF IT. That file
// is Market Intelligence, which WP9 parked at /dashboard/market-intel and which
// still answers until OLD_PAGES_RETIRE_ON; this one is the new surface at
// /dashboard/market. They read some of the same tables and say different
// things about them, and the difference is the whole point of the package:
//
//   - the parked page reads `recommendations … eq('run_id', runId)` and shows
//     FIVE rows, the ones this update happened to produce. This one reads the
//     whole table and groups by `coalesce(lineage_id, id)` — 56 rows on Össur,
//     64 on Sealand — because MK2 is a LEDGER ("one row per recommendation
//     identity"), and a ledger that forgets everything said before Sunday is a
//     list.
//   - the parked page's status column renders NOTHING on a row still marked
//     `new` (components/rec-status.tsx:67), which is 119 of 121 rows in
//     production. This one prints the word, because a ledger's whole subject is
//     what you did about each row and a blank cell is not an answer.
//
// WHAT IT DOES NOT READ. No `period_share_of_voice`, no `share_of_voice`, no
// run-indexed delta anywhere (D1, AGENTS.md): the only movement this surface
// prints is a move's month, and a move with one reading prints the month its
// first comparison lands in rather than a direction.
//
// AND NO HORIZON. This is a reading and it is not a reading of a WINDOW: the
// conclusions are the latest update's, the ledger is deliberately all-time
// ("every piece of advice this product has ever given you"), the moves are all
// moves and the claims are the latest update's. The loader parsed `?horizon=`
// and carried it on `MarketSurfaceData` where nothing read it, while the page
// bar drew the four-link control — so a client pressing "Last 12 months" got a
// byte-identical page. Both are gone: `lib/nav.ts` marks this surface
// `horizon: false`, and the type no longer carries a field nothing means.

/** The URL parameters this surface honours. `?rec=` is the legacy deep link
 *  four sent emails and every digest until WP17 still carry; it selects a
 *  LINEAGE here, resolved from the recommendation id it names. */
export type MarketSurfaceParams = { rec?: string; item?: string; ledger?: string }

/** `?ledger=all`: the ledger's "Show all" link (the preview's footer). */
export const LEDGER_ALL_PARAM = 'ledger'
export const LEDGER_ALL_VALUE = 'all'
/** The most rows "Show all" draws. Both tenants hold under 70 identities. */
export const LEDGER_ALL_CAP = 200

/** How many ledger rows are drawn before the rest are counted. 64 rows of
 *  advice nobody has acted on is a filing cabinet, not a page; the current
 *  recommendation and the newest after it are the ones a reader opens the
 *  ledger for (market-first WP1.9). */
export const LEDGER_SHOWN = 12

/** How many conclusions MK1 prints in full. Both tenants produce six per
 *  update, so this caps nothing today — it caps the day a prompt change makes
 *  twenty. */
export const CONCLUSIONS_SHOWN = 8

/**
 * What the "First time" chip in the Repeated column means, said once under the
 * table.
 *
 * TWO "NEW"S ONE COLUMN APART IS ONE WORD TOO MANY. The artboard's chip in the
 * Repeated column is the word "New", and the cell beside it — Your decision —
 * prints "New" for a row nobody has decided on (119 of 121 rows in
 * production). Rendered, row 3 read "… Sep · New · New · not recorded": two
 * words spelled the same, meaning "raised this month" and "you have not
 * decided". `REC_STATUS_LABEL` is the one the brief pins, so the chip is the
 * one that moves.
 *
 * AND IT NAMES ITS CLOCK. The chip compares `AdviceRow.firstMade` — a
 * recommendation's creation date, the UPDATE's clock — against the page's
 * comment-dated month, which is the one place on this page the two clocks meet.
 * A basis a reader can only reach with a mouse is not a stated basis, so it is
 * printed under the table rather than left in a `title`.
 */
export const LEDGER_FIRST_TIME_LINE =
  'First time marks advice the latest update raised for the first time: the ledger’s own dates are the update’s clock, not the comment’s.'

/** What the ledger's "Grounded in" column counts, said once under the table
 *  because every row's cell is counted the same way (D8, and the same shape as
 *  `CONCLUSIONS_CORPUS_LINE` two blocks above it). */
export const GROUNDED_CORPUS_LINE =
  'Grounded in counts the videos behind a piece of advice over everything we have read for you up to this month, never over one month.'

/** Quotes shown under a claim in MK5. */
export const CLAIM_ROWS = 5

// ---- the shapes ---------------------------------------------------------------

export interface ConclusionRow {
  id: string
  title: string
  description: string
  kind: string
  tier: GateTier
  /** Distinct videos behind it — the size of the evidence, measured. */
  videos: number
  themes: ThemeChip[]
  /**
   * Whether the theme behind this conclusion has been read in an earlier month
   * — the mock's "New" flag (D4; the open item wave 1 left to this package).
   *
   * IT IS A FACT ABOUT THE RECORD, NOT A DIRECTION. `recurrenceOf` says so in
   * its own docstring: `isNew` means the identity has no earlier month, and it
   * says nothing about where anything is headed. The block prints the mock's
   * chip off `isNew`, states the basis once, and never turns the count of
   * months into a word about the conversation.
   *
   * KEYED ON `theme_registry.id`, never a label — labels churn ~88% run to run
   * (AGENTS.md), so a flag keyed on one would mark nine conclusions in ten as
   * new every month and would be measuring our own naming. The identity is the
   * LEADING one of the conclusion's cited themes, by `orderedTargets`, for the
   * same reason the ledger's afterwards reading takes one: several identities
   * cannot be pooled into one answer.
   *
   * Null where the conclusion cites no theme we follow month by month, or where
   * the month tables could not be read — neither of which is "new".
   */
  recurrence: Recurrence | null
}

export interface ConclusionsBlock {
  rows: ConclusionRow[]
  /** Every video this workspace has analysed, ever — the denominator the video
   *  count on each row is a count OUT OF. Null where it could not be read. */
  corpusVideos: number | null
  counts: { confirmed: number; early: number; archive: number }
  /** The conclusions below the evidence bar. Labelled, never hidden. */
  belowBar: number
  /** Every conclusion this update reached, drawn or not — the "of 9 concluded"
   *  the header's count of those above the bar is a count OUT OF. */
  total: number
  /** The sort actually used, said on the block rather than implied. */
  sortedBy: string
  /**
   * When these conclusions were reached — `pipeline_runs.started_at` of the
   * update that wrote them, the mock's "concluded with the update of 27 Sep".
   *
   * AN UPDATE'S OWN DATE, AND LABELLED AS ONE. It is the one thing on this
   * block that is dated by the RUN rather than by the comment, which is exactly
   * why it is printed with the word "update" on it (D9): the conclusions are
   * this update's, they are not a period reading, and a reader has to be able
   * to tell the two apart. Null where the run carried no date.
   */
  concludedOn: string | null
  empty: string | null
}

export interface AdviceRow {
  /** `coalesce(lineage_id, id)` — the identity, never a run's row id. */
  lineageId: string
  /** The row the status control writes to: the newest copy of this identity. */
  recommendationId: string
  title: string
  kind: string
  /** The day this advice was first made, `YYYY-MM-DD`. */
  firstMade: string
  /** How many updates have carried it. */
  timesMade: number
  /**
   * The lineage first appears in the latest update that carried advice: every
   * copy of it is that update's (deploy 1 review, the lead's R10). What MK2's
   * "First time" chip marks. OPTIONAL, so a copy stored before it renders
   * with no chip.
   */
  firstInLatest?: boolean
  /** How many CALENDAR MONTHS have carried it — the design's column. Two
   *  updates three days apart is one month, and the ledger says one. */
  monthsRepeated: number
  /** Repeated inside one calendar month and never since: the state the design
   *  has no column for, and production's only repeat. */
  repeatedWithinMonth: boolean
  status: RecStatus
  statusLabel: string
  /** When the client set it, from `rec_decisions`. Null when they have not. */
  decidedAt: string | null
  /**
   * The identity's place in the ledger's own order, 1-based (D4, the mock's
   * `#` column).
   *
   * NOT A ROW ID. The ledger puts the current recommendation first and the
   * newest after it (market-first WP1.9), and the number is read off THAT
   * order, as the preview draws it ("1 · current recommendation"). It moves
   * when an update raises new advice, which is what an order led by the
   * current advice does. A `recommendations.id` changes every update (Pass D-b
   * deletes and reinserts), and a lineage uuid is not something a person says.
   * It is counted over every identity, not over the twelve drawn, so the
   * number on a deep-linked row is its real place.
   */
  number: number
  /** The evidence ids the advice follows from — `based_on.insight_ids` of the
   *  newest copy. What "Grounded in" is counted from, and what a quote is
   *  vouched for against. */
  basedOn: string[]
  /** Distinct videos behind the advice. Null where nothing was recorded, which
   *  is not the same as zero. */
  grounded: Grounding | null
  /** What the conversation did after the client decided. Never blank and never
   *  a dash — the four states each carry a sentence. */
  afterwards: Afterwards
  /** Pass D-b's argument, scrubbed. Null where the row carries none. */
  why: string | null
  /** The advice's one real comment, as its own node with its own ref. */
  quote: Quote | null
}

export interface AdviceBlock {
  rows: AdviceRow[]
  /**
   * The lineage of the current recommendation: the top of the newest update's
   * advice by `topRecommendation`'s rule (`currentTopLineage`). The ledger's
   * first row, tagged "current recommendation": `buildAdviceRows` sorts this
   * lineage first by name, so the tag and the first row cannot part on a tie.
   * OPTIONAL, so a copy stored before WP1.9 renders as it was, with no tag.
   */
  current?: string | null
  /** The lineage the URL named, when the ledger holds it. The row is drawn
   *  whether or not it is among the twelve shown, and it is marked. */
  highlight: string | null
  /** One sentence about the link the reader followed, or null when they
   *  followed none. */
  requestedLine: string | null
  /** Every identity, drawn or not. */
  total: number
  /** Identities the client has moved off New. */
  acted: number
  actedLine: string
  /** The one sentence about repeats, or null when nothing has repeated. */
  repeatLine: string
  /** False when `rec_decisions` could not be read here — the statuses are then
   *  the column copy, which the next update may not carry. */
  recorded: boolean
  /** What this ledger cannot say yet, named on the block. */
  unlock: string
  empty: string | null
}

export interface MoveRow {
  id: string
  title: string
  kind: Move['kind']
  /** What the move is on, in the reader's words. */
  on: string
  declaredAt: string
  line: string
}

export interface MovesBlock {
  rows: MoveRow[]
  masthead: string
  unlock: string
  empty: string | null
  /** False when `moves` (M4) is not applied here. */
  recorded: boolean
  /** This month's card, pre-filled from the client's own posts — the same
   *  shape Overview's OV5 carries, built by the same function so the two
   *  surfaces cannot count one month two ways (Block D · D2). */
  card: MoveCandidate | null
  /** One reading per active move: the one banded movement claim a move earns,
   *  with the untouched audiences beside it as a control. */
  readings: MoveReading[]
  /** WP3.6 Y4: each dated move read in the MARKET afterwards, as levels (the
   *  move's month, the month after, the month after that). Never a verdict and
   *  never a cause. OPTIONAL: a stored copy renders its `readings` as sent. */
  market?: MoveMarketRead[]
  /** What "Date a move" offers here (WP3.6 wave 2): the subjects, question
   *  themes and advice a move can be dated on, the day's window, and whether
   *  MF5 is applied. OPTIONAL: absent on a stored copy and where moves (M4)
   *  are not recorded; the app draws no control without it. */
  dating?: MoveDating
}

/** One month of a move read in the market: a level, or why there is none. */
export interface MoveMarketMonth {
  month: string
  role: 'move' | 'after' | 'after_that'
  /** `read`: a level. `not_yet`: the month is after the reading month.
   *  `not_read`: the month has no market reading (none, or not this object). */
  state: 'read' | 'not_yet' | 'not_read'
  k: number | null
  n: number | null
}

export interface MoveMarketRead {
  moveId: string
  title: string
  /** What the move is on, as `MoveRow.on`. */
  on: string
  declaredAt: string
  /** The day the change was made, where it was dated earlier than declared
   *  (MF5 `moves.dated_on`). The move's month is this day's. */
  datedOn?: string
  /** The object read: a subject's name or a theme's label. Null where the
   *  move names nothing the market is read on month by month. */
  label: string | null
  /** A subject's calibration (decision C): a provisional one prints its market
   *  figure marked; a failed one is not read. */
  calibration: SubjectCalibrationWord | null
  months: MoveMarketMonth[]
}

export interface ClaimRow {
  id: string
  youSay: string
  theySay: string | null
  gap: string
  audience: string
  verdictLabel: string
  /**
   * The claim's echo COUNTED IN THE MARKET (WP3.6 Y3, IO F48): of the reading
   * month's market videos, how many carry what the market said back. The
   * count decides the state and the stance only its sign (`claimEcho`), so a
   * stance nothing carried reads "Not talked about". OPTIONAL: a copy stored
   * before WP3.6 has none and prints the stance alone, as it was sent.
   */
  echo?: ClaimEcho
}

/**
 * Your claims read to date, by the subject the post-and-claim judge filed each
 * under (WP3.6 Y3, MF3 `own_post_subjects`). A subject's count of 0 prints only
 * when every claim was filed for it; a claim the judge has not filed is "not
 * checked yet", never counted as about nothing (done-when 6).
 */
export interface ClaimSubjects {
  /** Your claims read to date (`video_claims`, entity client). */
  claims: number
  /** Active subjects (not being re-described), by claims filed as about each. */
  subjects: { subjectId: string; name: string; k: number }[]
  /** Claims the judge has not filed for every one of those subjects. */
  unfiled: number
  state: 'checked' | 'partial' | 'unchecked'
}

export interface WayRow {
  key: 'card' | 'track' | 'advice' | 'claim' | 'plan'
  title: string
  how: string
  /** Where the one click goes, or null when this way is not live yet. */
  href: string | null
  live: boolean
  /** Why it is not live, for the ways that are not. */
  unlock: string | null
}

export interface WaysBlock {
  ways: WayRow[]
  claims: ClaimRow[]
  claimsLine: string
  /** The hold MK5's per-month verdict does not have, said once. */
  claimsCaveat: string
  /** The lineage "accept this advice" acts on, when there is one to accept. */
  acceptable: { lineageId: string; recommendationId: string; title: string } | null
  empty: string | null
  /** WP3.6 Y3: your claims by subject. OPTIONAL: absent on a stored copy, and
   *  null where your claims could not be read. */
  claimSubjects?: ClaimSubjects | null
}

export interface MarketRecord {
  line: string
  lines: string[]
  href: string
}

export interface MarketSurfaceData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** The reading month (market-first decision A) and the bar's other months
   *  (default M-d), newest first. Always set by the loader; optional because a
   *  stored snapshot taken before WP1.2 has neither. */
  reading?: ReadingMonth
  otherMonths?: OtherMonth[]
  masthead: string
  conclusions: ConclusionsBlock
  advice: AdviceBlock
  moves: MovesBlock
  ways: WaysBlock
  record: MarketRecord
  /**
   * The method footnote, composed once for every surface (block D, D9).
   *
   * ONE FIELD, ONE CALL LINE, ON EVERY PAGE, from the `RecordInputs` this page
   * already loads — so the language share and the read-depth basis cannot come
   * to be worded differently here and on the next surface. Null only where the
   * record behind it could not be read. See lib/reading/method.ts.
   */
  method: MethodLines | null
  /** MK6 · the plans this workspace has had re-checked, newest first. */
  plans: PlanCheckCard[]
  /** What MK6 says when there is no plan to show. Null when there is one — an
   *  absence this page names rather than draws as a hole. */
  plansEmpty: string | null
  /** WP3.6 Y1 · questions to answer (`market.questions`). OPTIONAL: a stored
   *  copy taken before WP3.6 has none, and the block prints its empty state. */
  questions?: QuestionsBlock
}

// ---- Y1 · questions to answer (market-first WP3.6, plan §2.6) ---------------

/** Whether your posts touched a question, and how that was checked. */
export interface QuestionTouch {
  /** Your posts in the period the row is read over. Null: not readable. */
  posts: number | null
  /** Each post that touched it, with the words it shared (`words`: the WP2.5
   *  word check; `judge`: the post-and-claim judge's filing). */
  matched: { id: string; postedOn: string | null; href: string | null; words: string[]; by: 'words' | 'judge' }[]
  /** The question's words a post had to share, printed where none did. */
  checked: string[]
  /**
   * `touched`: a post shared two or more of its words, or the judge filed one
   *   as about it.
   * `none`: no post did, and nothing is left unchecked.
   * `unchecked`: no post shared its words, and the judge has not filed every
   *   post for this subject (before MF3, none): "not checked yet", never a
   *   false "none" (WP3.6 done-when 6). Subject rows only.
   * `unread`: your posts could not be read.
   */
  state: 'touched' | 'none' | 'unchecked' | 'unread'
  /** Subject rows: posts the judge has not filed for the subject. */
  unfiled?: number
}

/** A question theme the market raised in the reading month. */
export interface QuestionThemeRow {
  registryId: string
  label: string
  /** Its videos in the month, in the category (the block's "of N"). */
  videos: number
  /** "about a third makers" at a fifth or more (decision F); else null. */
  makers: string | null
  touch: QuestionTouch
}

/** A subject the market asked about over the last three months. */
export interface QuestionSubjectRow {
  subjectId: string
  name: string
  calibration: 'ready' | 'provisional'
  /** Videos (not yours) that asked something about it in the window. */
  videos: number
  /** Its question groups, largest first, as the Subjects page names them. */
  groups: { label: string; videos: number }[]
  /** Groups beyond those printed. */
  moreGroups: number
  touch: QuestionTouch
}

export interface QuestionsBlock {
  month: string
  /** The category's videos in the month: the theme rows' base (decision E:
   *  themes are grouped within the category). Null where it was not read. */
  n: number | null
  /** Your posts in the month, dated by the post. Null: not readable. */
  monthPosts: number | null
  themes: QuestionThemeRow[]
  /** The three months the subject rows are read over: `from` the first
   *  month's start, `to` the reading month's. */
  window: { from: string; to: string }
  windowPosts: number | null
  subjects: QuestionSubjectRow[]
  empty: string | null
  /** Whether the makers rule was read for the month's themes (`measured`),
   *  so "not led by makers" is known rather than assumed. OPTIONAL: a copy
   *  stored before the hero read it has none, and says nothing about makers. */
  segments?: ThemeBoard['segments']
}

// ---- the pure half ------------------------------------------------------------

/**
 * One recommendation identity, folded from every copy of it.
 *
 * `coalesce(lineage_id, id)` IS THE KEY, and the coalesce is not defensive
 * tidiness: `20260915093000_rec_decisions.sql` backfills `lineage_id = id` on
 * every row, so a null today means a write that landed between the deploy and
 * the migration, and giving that row its own id is exactly what the backfill
 * would have done. `id` is never the key on its own — Pass D-b deletes and
 * reinserts every recommendation each update, so the same advice has a
 * different `id` every week.
 */
export interface RecCopy {
  id: string
  lineage_id: string | null
  title: string
  type: string
  status: string | null
  created_at: string | null
  run_id: string | null
  /** Pass D-b's own ranking of the advice inside its update ('high' ·
   *  'medium' · 'low'). The ledger ranks the rows one update raised by it,
   *  with `topRecommendation`'s rule (WP1.9). */
  priority?: string | null
  /** The market and competitive insights this advice follows from. The ledger's
   *  "Grounded in" column is counted from these (D4). */
  based_on?: { insight_ids?: string[] } | null
  /** Pass D-b's own argument for the advice. Model prose; see `buildAdviceRows`
   *  for what happens to it on the way to a page. */
  reasoning?: string | null
  /** One real comment, validated at write time against the quotes the model was
   *  shown (`validateQuote`, lib/pipeline/pass-d.ts). It is never rendered
   *  inside the reasoning: a number inside a quotation is still refused, so a
   *  quote is a sibling node with its own ref. */
  hero_quote?: string | null
}

export const lineageKey = (r: Pick<RecCopy, 'id' | 'lineage_id'>): string => r.lineage_id ?? r.id

/** The calendar months a set of copies was made in, as month starts. A copy
 *  with no `created_at` contributes no month rather than today's. */
export function monthsMadeIn(copies: readonly RecCopy[]): string[] {
  const months = new Set<string>()
  for (const c of copies) if (c.created_at) months.add(monthStartOf(c.created_at.slice(0, 10)))
  return [...months].sort()
}

// The current recommendation, `currentTopLineage`, is decided in
// lib/dashboard-tiles.ts beside `topRecommendation`, so Overview can name the
// same advice without importing this page. Re-exported for this page's callers.
export { currentTopLineage }

/**
 * The ledger's rows: the current recommendation first, then the newest first
 * (market-first WP1.9, GR F34).
 *
 * THE FIRST ROW IS `currentTopLineage`'S ANSWER, SORTED THERE BY NAME. It is
 * not left to fall out of the order below: two of the newest update's copies
 * can tie on priority and on cited insights, and the row that leads and the
 * row tagged "current recommendation" must be one row whichever way a tie
 * breaks. So the one decision is taken once and both read it.
 *
 * NEWEST MEANS LAST RAISED. After the first row, a row is dated by the update
 * that last carried it (its newest copy), so advice an update repeats is
 * current advice however long ago it was first made. Inside one update the
 * rows keep that update's own ranking, `topRecommendation`'s (priority, then
 * how well grounded). Its ties fall to the newest copy's id, ascending, which
 * is the order `topRecommendation` is handed its copies in, then to the
 * lineage id, so the order is stable.
 *
 * THE LEDGER USED TO RUN OLDEST FIRST, and on Sealand that drew twelve June
 * rows marked "evidence replaced" and left out the advice the headline was
 * showing (GR F34). `number` is read off the order once the sort has happened,
 * see `AdviceRow.number`.
 *
 * THE REASONING IS SCRUBBED AGAIN HERE, AND THE COST IS REAL. Pass D-b already
 * runs this slot's policy at write time WITH the run's allow-list, so a second
 * pass with no allow-list can only remove more. It is still run, because the
 * first pass has not always been there: 26 of the 121 stored reasonings on
 * production carry a digit (measured 2026-09-18), and they are two different
 * kinds of sentence. Most are prescriptions — "scheduled 30/60/90-day
 * check-ins", "first-90-days guides" — which are instructions to the reader and
 * not claims about the conversation, and those sentences are lost. One is a
 * genuine leak: *"Industry-other holds 81."*, a model-typed figure with no
 * denominator, naming an internal bucket string, written on 2026-08-09 and
 * still in the table. A ledger row that prints that is the defect the rule
 * exists for, and the rule drops the SENTENCE rather than the paragraph, so the
 * rest of a 436-character argument survives either way.
 *
 * AN EMPTY FIGURE TABLE IS THE RIGHT ONE. The model was never handed figures
 * for this slot, so there is no `[[key]]` for it to have used; the grounding
 * count is printed by the table's own column, not named in the prose.
 */
export function buildAdviceRows(
  copies: readonly RecCopy[],
  decisions: RecDecision[] | null,
): AdviceRow[] {
  const byLineage = new Map<string, RecCopy[]>()
  for (const c of copies) {
    const key = lineageKey(c)
    const arr = byLineage.get(key) ?? []
    arr.push(c)
    byLineage.set(key, arr)
  }

  const times = recUpdateTimes(copies)
  // The latest update that carried advice: the one written last.
  const latestUpdate = [...times.entries()].reduce<[string, string] | null>(
    (best, e) => (best == null || e[1] > best[1] || (e[1] === best[1] && e[0] > best[0]) ? e : best), null)?.[0] ?? null
  /** What the order reads off each row: when it was last raised, and the
   *  newest copy's own rank inside that update. */
  const orderOf = new Map<string, { raisedAt: string; newest: RecCopy }>()
  const rows: AdviceRow[] = []
  for (const [lineageId, group] of byLineage) {
    // Newest copy first: its words are the current wording of the advice and
    // its id is what a status write must name, because it is the only copy the
    // next update's lineage matcher will find.
    const sorted = [...group].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id))
    const newest = sorted[0]
    const oldest = sorted[sorted.length - 1]
    const months = monthsMadeIn(group)
    const runs = new Set(group.map((c) => c.run_id ?? c.id)).size
    const decided = decisions
      ? decisions.filter((d) => d.lineage_id === lineageId).sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '') || b.id.localeCompare(a.id))[0] ?? null
      : null
    const inherited = decisions ? inheritedStatus(lineageId, decisions) : null
    const status = recStatus(inherited ?? newest.status)
    const decidedAt = decided?.decided_at ?? null
    const why = scrubProse('pass_d_b_recommendation', newest.reasoning ?? '').text
    orderOf.set(lineageId, { raisedAt: times.get(recUpdateOf(newest)) ?? newest.created_at ?? '', newest })
    rows.push({
      lineageId,
      recommendationId: newest.id,
      title: newest.title,
      kind: newest.type,
      firstMade: (oldest.created_at ?? '').slice(0, 10),
      timesMade: runs,
      firstInLatest: latestUpdate != null && group.every((c) => recUpdateOf(c) === latestUpdate),
      monthsRepeated: months.length,
      repeatedWithinMonth: runs > 1 && months.length <= 1,
      status,
      statusLabel: REC_STATUS_LABEL[status],
      decidedAt,
      // Overwritten by the sort below, which is where the order is decided.
      number: 0,
      basedOn: [...new Set(newest.based_on?.insight_ids ?? [])],
      grounded: null,
      // The honest default for a row nothing has been read for. The loader
      // replaces it on the rows the ledger draws; a row it does not draw keeps
      // a state and a sentence rather than an undefined.
      // No months are read for it, so no month pair applies (`pair: null`).
      afterwards: afterwardsFor({ decidedAt, targetIds: [], series: [], audience: 'client', pair: null }),
      why: why || null,
      quote: null,
    })
  }
  const key = (r: AdviceRow) => orderOf.get(r.lineageId) as { raisedAt: string; newest: RecCopy }
  const current = currentTopLineage(copies)
  return rows
    .sort((a, b) =>
      (a.lineageId === current ? -1 : b.lineageId === current ? 1 : 0) ||
      key(b).raisedAt.localeCompare(key(a).raisedAt) ||
      recommendationOrder(key(a).newest, key(b).newest) ||
      key(a).newest.id.localeCompare(key(b).newest.id) ||
      a.lineageId.localeCompare(b.lineageId))
    .map((r, i) => ({ ...r, number: i + 1 }))
}

/**
 * The design's "You acted on 7 of 22 this quarter", with the quarter taken
 * out.
 *
 * The quarter is a lie on this data and would be one on any tenant for its
 * first three months: a decision carries `decided_at`, so "this quarter" is
 * answerable, but the DENOMINATOR is every identity ever recommended, which has
 * no quarter at all — 64 of Sealand's 64 lineages were first made across four
 * months, and scoping the numerator to a quarter against an all-time
 * denominator prints a fraction of two different populations. So the line says
 * what it counts.
 */
export function actedLine(acted: number, total: number): string {
  if (total === 0) return 'Nothing has been recommended yet.'
  // The figure alone (copy de-clutter ruling D): "of 64" is the denominator
  // and stays; the all-time scope is defined once in Settings › How to read.
  return `You have acted on ${fmtInt(acted)} of ${fmtInt(total)}.`
}

/**
 * What the ledger says about repeats.
 *
 * THE DESIGN'S SENTENCE IS "nothing has been recommended twice yet" AND ON
 * SEALAND IT IS ALREADY FALSE. One lineage has two copies — 2026-09-10 and
 * 2026-09-13 — and the design has no prose for a repeat inside one calendar
 * month, which is the only kind production has. The column is "how many MONTHS
 * it has been repeated", so that row still reads one month, and printing
 * "repeated 1 month" beside "recommended twice" would be the page arguing with
 * itself. It says both facts instead, in one sentence.
 */
export function repeatLine(rows: readonly AdviceRow[]): string {
  const acrossMonths = rows.filter((r) => r.monthsRepeated > 1)
  const withinMonth = rows.filter((r) => r.repeatedWithinMonth)
  if (acrossMonths.length === 0 && withinMonth.length === 0) {
    return 'Nothing has been recommended twice yet, so no row carries a repeat count.'
  }
  const parts: string[] = []
  if (acrossMonths.length > 0) {
    parts.push(`${fmtInt(acrossMonths.length)} ${acrossMonths.length === 1 ? 'piece of advice has' : 'pieces of advice have'} come back in a later month.`)
  }
  if (withinMonth.length > 0) {
    parts.push(
      `${fmtInt(withinMonth.length)} ${withinMonth.length === 1 ? 'was' : 'were'} recommended twice inside one calendar month, which the repeat count reads as one month.`,
    )
  }
  return parts.join(' ')
}

/** What MK2 cannot say yet, named on the block rather than left to be noticed.
 *  The after-line needs two monthly readings of the subject or theme behind the
 *  advice, and nothing marked Done has one yet. */
export const ADVICE_UNLOCK =
  'What the conversation did after you acted arrives once a piece of advice you marked Done has two monthly readings behind it.'

/**
 * Said in the Afterwards column for a row that HAS no afterwards reading —
 * which on a live page is impossible and in a frozen artefact is not.
 *
 * `AdviceRow.afterwards` is required and wave 1 added it; `market.advice` is a
 * named brief section (`lib/reports/documents/sections.ts`, `ct.advice`) at
 * 017fc6e and at HEAD, so a `report_snapshots` row whose `surfaces.market`
 * froze before Block D reaches this block with the field simply absent. The
 * cell then has nothing recorded, which is a different fact from every one of
 * the four states `afterwardsFor` produces, and it says so rather than printing
 * one of them. Same reasoning, same shape, as `MovesBlock.readings ?? []`.
 */
export const ADVICE_AFTERWARDS_UNRECORDED =
  'This was saved before we recorded what happened afterwards, so nothing is recorded in this column for it.'

/** Said when the decision ledger itself could not be read. The statuses then
 *  come off `recommendations.status`, which the next update rewrites. */
export const ADVICE_UNRECORDED =
  'Your decisions are not being written down for this workspace yet: a status set here lasts only until the next update.'

export const ADVICE_EMPTY = 'Advice lands with your next update.'

export const ADVICE_REQUESTED_LINE = 'This is the piece of advice your link named.'

export const ADVICE_REQUESTED_GONE =
  'The link you followed names a piece of advice this ledger no longer holds.'

/**
 * The rows the ledger draws: the first twelve in its order (the current
 * recommendation, then the newest), plus the one a link named.
 *
 * THE DEEP LINK USED TO RESOLVE AND THEN VANISH. `?rec=<id>` is carried by four
 * sent emails and every digest until WP17; the loader resolved it to a lineage
 * and the only thing that lineage reached was MK5's accept button. MK2 drew
 * twelve of 56 or 64 with no anchor and no highlight, so a reader following a
 * link from a digest landed on a ledger that did not contain the row they had
 * clicked.
 *
 * The named row is ADDED rather than promoted, and keeps its place in the
 * ledger's order (`number`), so the current recommendation stays first.
 */
export function ledgerRowsShown(
  rows: readonly AdviceRow[],
  requestedLineage: string | null,
  shown = LEDGER_SHOWN,
): AdviceRow[] {
  const first = rows.slice(0, shown)
  if (!requestedLineage) return first
  const named = rows.find((r) => r.lineageId === requestedLineage)
  if (!named || first.some((r) => r.lineageId === named.lineageId)) return first
  return [...first, named].sort((a, b) => a.number - b.number)
}

/** A ledger row's anchor, so a link can land on the row it names. */
export const adviceAnchor = (lineageId: string): string => `advice-${lineageId}`

/**
 * The row "Accept this advice" acts on.
 *
 * MK5's sentence is "the oldest piece of advice you have not decided on", and
 * the row a link named was taken with no status check at all — so a digest
 * link to a row already marked Done or Dismissed printed that sentence over it
 * and offered to accept it a second time. A named row is taken only while it
 * is still undecided; otherwise the sentence and the button agree with each
 * other again, on the oldest row nobody has decided.
 */
export function acceptableRow(
  rows: readonly AdviceRow[],
  requested: AdviceRow | null,
): AdviceRow | null {
  if (requested && requested.status === 'new') return requested
  // THE OLDEST BY AGE, NOT THE LEDGER'S FIRST. MK5 prints "The oldest you have
  // not decided on", and since WP1.9 the ledger runs current-first, so the age
  // order is taken here rather than inherited from the rows' order.
  const byAge = [...rows].sort((a, b) => a.firstMade.localeCompare(b.firstMade) || a.lineageId.localeCompare(b.lineageId))
  return byAge.find((r) => r.status === 'new') ?? null
}

/**
 * What a move is on, in the reader's words.
 *
 * `moves.kind` is the discriminator the database CHECKs (one target per move),
 * and this is the only place it becomes a noun phrase — so a subject-move and a
 * theme-move read as the same kind of sentence.
 */
export function moveTargetLabel(
  move: Pick<Move, 'kind' | 'registry_ids'>,
  subjectName: string | null,
  themeLabel: string | null,
): string {
  if (move.kind === 'subject') return subjectName ? `on the subject ${subjectName}` : 'on a subject'
  if (move.kind === 'theme') {
    const n = move.registry_ids?.length ?? 0
    if (themeLabel && n <= 1) return `on the theme ${themeLabel}`
    return n > 1 ? `on ${fmtInt(n)} themes` : 'on a theme'
  }
  return 'on a piece of advice'
}

/**
 * One move on one line (design §3 MK4's row form, Phase 1's half of it).
 *
 * MONTH-BASED, AND THAT IS THE WHOLE REASON THIS IS A SECOND FUNCTION beside
 * OV5's `moveLine`. OV5 prints `title · tracked {date} · first scoring lands
 * with the {month} reading`; MK4's row adds "what it is on", which OV5 does not
 * carry because its rows are one line in a tile. Neither counts UPDATES: a
 * sentence like "tracked for 3 updates" indexes a period by delivery, which is
 * the axis D1 withdraws, and `trackedLine` in lib/initiatives/measure.ts is
 * exactly that sentence — which is why nothing here calls it.
 */
export function moveLedgerLine(move: { title: string; declared_at: string }, on: string): string {
  return `${move.title} · ${on} · tracked ${shortDate(move.declared_at)} · first scoring lands with the ${longMonth(firstScoringMonth(move.declared_at))} reading.`
}

export const MOVES_EMPTY_MK4 =
  'Nothing dated yet. Press Track this on a subject or a theme and this block starts scoring it from the following month.'

/** Your moves' empty state on a page read in the market (WP3.6 Y4, the
 *  preview's words): nothing is dated yet, and a dated move reads what the
 *  market said after it as a level, never as a cause. */
export const MOVES_EMPTY_MARKET = 'No move dated yet.'
export const MOVES_MARKET_HOW =
  'Date something you change, such as a post series, a product page or a price, and this reads what your market said in the months after, as a level.'

/** Said when `moves` (M4) is not applied here. Not the same fact as "nothing
 *  dated yet", and the page must not say the second when it means the first. */
export const MOVES_UNRECORDED =
  'Declared moves are not recorded for this workspace yet.'

/**
 * The five ways a move is made (design §3 MK5), and which of them work today.
 *
 * TWO ARE LIVE AND THREE NAME THEIR UNLOCK. "Track this" is live but not HERE:
 * it needs a subject or a theme in hand, and Market has neither, so its one
 * click is the link to the surface that does. "Accept this advice" is the one
 * button on this page that writes a move, and it writes one against the ledger
 * row's LINEAGE rather than against a recommendation id, because the id is
 * deleted and reinserted every update.
 */
export function waysOfMoving(acceptable: WaysBlock['acceptable'], plansChecked = 0, month: string | null = null): WayRow[] {
  // THE CARD'S MONTH BY NAME (deploy 1 review): on 1–15 Oct the page reads
  // September, and "Confirm this month's card", dated to the first of the
  // month, reads as October's.
  const which = month ? `${longMonth(month)}’s` : 'the month’s'
  return [
    {
      key: 'card',
      title: `Confirm ${which} card`,
      how: `Everything you published ${month ? `in ${longMonth(month)}` : 'in the month'}, with the claims you made in it, confirmed in one press as a move dated to the first of the month.`,
      href: null,
      live: false,
      // THE CARD IS BUILT AND THE PRESS IS NOT, so the unlock names the press.
      // `MovesBlock.card` carries this month's counted card on this very page
      // (Phase 1 D2), and a row saying the card is not built would be a copy
      // claim the code beside it contradicts — the defect AGENTS.md names.
      // `live` stays false, because what this row offers is the one press.
      unlock: 'The card is filled in and can be read; confirming it in one press is not built yet.',
    },
    {
      key: 'track',
      title: 'Track this',
      how: 'Press Track this on a subject or a theme, and this page starts scoring it from the following month.',
      href: '/dashboard/subjects',
      live: true,
      unlock: null,
    },
    {
      key: 'advice',
      title: 'Accept a piece of advice',
      how: acceptable
        ? 'Accepting a row of the ledger dates a move to today and keeps the advice’s own identity on it.'
        : 'Accepting a row of the ledger dates a move to today. There is nothing in the ledger to accept yet.',
      href: null,
      live: acceptable != null,
      unlock: acceptable ? null : 'Advice lands with your next update.',
    },
    {
      key: 'claim',
      title: 'Register a claim you make',
      how: 'Your own-voice claims, each with its verdict per month: echoed · pushed back · not taken up.',
      href: null,
      live: false,
      unlock: 'Registering a claim, and a claim’s identity across updates, are not built yet.',
    },
    {
      // LIVE SINCE D4, AND THE SENTENCE CHANGED WITH IT. This row said "Plans
      // re-checked are not built yet" while three checks and eight
      // re-evaluations sat in the database and Ask read them — the page naming
      // as absent a feature the product had. The way in is Ask, which is where
      // a document is uploaded; what is new here is that Market reads the
      // result back.
      key: 'plan',
      title: 'Upload a plan',
      how: 'A campaign brief, re-read against the conversation with every update: each claim supported, contradicted or untested.',
      href: '/dashboard/agent',
      live: true,
      unlock: plansChecked > 0 ? null : 'Nothing has been uploaded for this workspace yet.',
    },
  ]
}

/**
 * The hold MK5's claim verdicts do not have.
 *
 * Measured on production (gap-05 §5): 6 of the 8 say-vs-hear claims that have
 * recurred have already flipped their verdict, which is the same coin-flip MK6
 * is withheld for. MK6's own rule is "only when a verdict has held for two
 * consecutive updates" and MK5 carries no such rule, so this surface prints the
 * CURRENT reading and says it is a current reading — it does not print a
 * verdict-per-month it cannot hold.
 */
export const CLAIMS_CAVEAT =
  'This is how each claim reads in the latest update. A claim’s verdict per month, held across two updates before it is printed, is not built yet.'

// ---- Y1 · questions to answer: the pure half (WP3.6) -------------------------
//
// QUESTIONS FROM THE MARKET, EACH MARKED BY YOUR POSTS. Two lists, as the
// preview draws them: the reading month's question themes not led by makers
// (the front page's "Asked" list, `buildAsks`, ranked by videos in the
// category), and the subjects the market asked about most over the last three
// months (the Subjects page's question videos, SU3). Each row says whether one
// of your posts touched it (two or more non-generic words, the post and the
// words), or, where none did, which words were checked.
//
// A SUBJECT ROW HAS A SECOND CHECK, THE JUDGE's. What a post and its claims are
// ABOUT is filed by the post-and-claim judge (MF3 `own_post_subjects`); a post
// it filed as about the subject touches it, and a post it has not filed leaves
// the row "not checked yet" rather than "none" (done-when 6). Before MF3 every
// post is unfiled, so a subject no post shared words with reads "not checked
// yet", with the words that were checked beside it.

/** Subject rows printed (the preview's three). */
export const QUESTION_SUBJECTS_SHOWN = ASK_ROWS
/** Question groups printed under a subject row. */
export const QUESTION_GROUPS_SHOWN = 2
/** The groups a subject row's word check reads: the Subjects page's top three
 *  (SU3), the same the front page's questions line reads (WP2.5). */
export const QUESTION_GROUPS_CHECKED = 3
/** Months the subject rows are read over, the reading month included. */
export const QUESTION_WINDOW_MONTHS = 3

/** The block's empty state: nothing reached the floor and nothing was asked. */
export const questionsEmpty = (month: string): string =>
  `No question theme in your market reached ${fmtInt(THEME_FLOOR)} videos in ${longMonth(month)}, and no subject was asked about over the last three months.`

/** One of your posts as the question rows read it: what it is about
 *  (`videos.topics`), the day it was posted, and where it lives. */
export interface QuestionPost extends TouchPost {
  upload_date: string | null
  video_url: string | null
}

/** The first month of the three the subject rows read. */
export const questionWindowFrom = (month: string): string => monthsBack(month, QUESTION_WINDOW_MONTHS - 1)

/**
 * One row's touch: the word check over `labels` (a post touches on two or more
 * of one label's words), and for a subject row the judge's filing.
 *
 * Pure. `posts` null is "could not read your posts": the row says so and
 * claims nothing either way.
 */
export function questionTouch(input: {
  labels: readonly string[]
  posts: readonly QuestionPost[] | null
  /** A subject row: the subject, and the judge's filings (null: MF3 is not
   *  applied, so nothing is filed). Absent on a theme row. */
  judge?: { subjectId: string; filings: OwnPostFilings | null }
}): QuestionTouch {
  // ONE WORD ONCE ACROSS THE LABELS: "Price and sale questions" and a group
  // naming "prices" check one word, and it prints once, as the first label
  // spelled it (the rule's own stem, `touchWords`).
  const stem = (w: string): string => touchWords(w)[0] ?? w
  const merge = (held: readonly string[], more: readonly string[]): string[] => {
    const out = [...held]
    const seen = new Set(out.map(stem))
    for (const w of more) if (!seen.has(stem(w))) { seen.add(stem(w)); out.push(w) }
    return out
  }
  let checked: string[] = []
  const byPost = new Map<string, string[]>()
  for (const label of input.labels) {
    const r = postsTouching(label, input.posts ?? [])
    checked = merge(checked, r.checked)
    for (const m of r.matched) byPost.set(m.id, merge(byPost.get(m.id) ?? [], m.words))
  }
  if (input.posts == null) return { posts: null, matched: [], checked, state: 'unread' }
  const posts = input.posts
  const postOf = new Map(posts.map((p) => [p.id, p]))
  const matched: QuestionTouch['matched'] = [...byPost.entries()].map(([id, words]) => ({
    id, postedOn: postOf.get(id)?.upload_date?.slice(0, 10) ?? null, href: postOf.get(id)?.video_url ?? null, words, by: 'words' as const,
  }))
  let unfiled: number | undefined
  if (input.judge) {
    const { subjectId, filings } = input.judge
    const touching = filings?.touching.get(subjectId)
    for (const p of posts) {
      if (byPost.has(p.id)) continue
      const words = touching?.get(p.id)
      if (words) matched.push({ id: p.id, postedOn: p.upload_date?.slice(0, 10) ?? null, href: p.video_url ?? null, words, by: 'judge' })
    }
    unfiled = filings == null ? posts.length : posts.filter((p) => !filings.postFiled.has(`${p.id}|${subjectId}`)).length
  }
  matched.sort((a, b) => (a.postedOn ?? '').localeCompare(b.postedOn ?? '') || a.id.localeCompare(b.id))
  const state: QuestionTouch['state'] = matched.length > 0 ? 'touched' : (unfiled ?? 0) > 0 ? 'unchecked' : 'none'
  return { posts: posts.length, matched, checked, state, ...(unfiled != null ? { unfiled } : {}) }
}

/** A subject the market asked about in the window, as the loader reads it. */
export interface SubjectAsked {
  id: string
  name: string
  calibration: SubjectCalibrationWord
  videos: number
  /** Its question groups, any order: the builder ranks them. */
  groups: { label: string; videos: number }[]
}

/**
 * Y1's block, from the reading month's category themes, the subjects asked
 * about over three months, your posts over the same three months and the
 * judge's filings. Pure.
 *
 * The theme rows are `buildAsks`' question list (not led by makers, at the
 * floor, three), read against your posts OF THE MONTH; the subject rows are
 * read against your posts of the three months. A subject being re-described
 * (decision C, failed) is not listed. A theme label naming a brand no
 * evidence on this page vouches for reads "a brand" (the front page's rule,
 * with no evidence read here).
 */
export function buildQuestions(input: {
  month: string
  themes: readonly MarketTheme[]
  segments: ThemeBoard['segments']
  n: number | null
  brandNames: readonly string[]
  /** Your posts over the three months; null where they could not be read. */
  posts: readonly QuestionPost[] | null
  subjects: readonly SubjectAsked[]
  filings: OwnPostFilings | null
}): QuestionsBlock {
  const month = monthStartOf(input.month)
  const from = questionWindowFrom(month)
  const monthPosts = input.posts ? input.posts.filter((p) => p.upload_date != null && monthStartOf(p.upload_date.slice(0, 10)) === month) : null
  const asked = buildAsks(input.themes, month, input.segments).lists.find((l) => l.kind === 'question')?.rows ?? []
  const shareOf = new Map(input.themes.map((t) => [t.registryId, t.makerShare]))
  const themes: QuestionThemeRow[] = asked.map((r) => {
    const label = namesABrand(r.label, input.brandNames) ? stripUnevidencedBrand(r.label, input.brandNames, []).label : r.label
    return {
      registryId: r.registryId,
      label,
      videos: r.k,
      makers: input.segments === 'measured' ? makerWords(shareOf.get(r.registryId)) : null,
      touch: questionTouch({ labels: [label], posts: monthPosts }),
    }
  })
  const subjects: QuestionSubjectRow[] = input.subjects
    .filter((x) => x.calibration !== 'failed' && x.videos > 0)
    .sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
    .slice(0, QUESTION_SUBJECTS_SHOWN)
    .map((x) => {
      const groups = [...x.groups].sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
      const labels = groups.length > 0 ? groups.slice(0, QUESTION_GROUPS_CHECKED).map((g) => g.label) : [x.name]
      return {
        subjectId: x.id,
        name: x.name,
        calibration: x.calibration === 'ready' ? 'ready' as const : 'provisional' as const,
        videos: x.videos,
        groups: groups.slice(0, QUESTION_GROUPS_SHOWN),
        moreGroups: Math.max(0, groups.length - QUESTION_GROUPS_SHOWN),
        touch: questionTouch({ labels, posts: input.posts, judge: { subjectId: x.id, filings: input.filings } }),
      }
    })
  return {
    month,
    n: input.n,
    monthPosts: monthPosts ? monthPosts.length : null,
    themes,
    window: { from, to: month },
    windowPosts: input.posts ? input.posts.length : null,
    subjects,
    empty: themes.length === 0 && subjects.length === 0 ? questionsEmpty(month) : null,
    segments: input.segments,
  }
}

/** A touch's words, as the row prints them: each touching post's words, or
 *  (none touched) the words that were checked. */
export const QUESTION_CHECKED_SHOWN = 4

// ---- Y3 · your claims, by subject (WP3.6) ---------------------------------------

const normClaimText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Your claims read to date, by the subject the judge filed each under. Rows of
 * `video_claims` repeat a claim across updates (Sealand, staging: 120 rows,
 * 98 distinct on 16 posts), so a claim is one post's one sentence: its rows
 * are one claim, filed if any of them is filed, about a subject if any of them
 * is. Pure; null where your claims could not be read.
 */
export function buildClaimSubjects(input: {
  claims: readonly { id: string; source_video_id: string; claim: string }[] | null
  subjects: readonly { id: string; name: string; calibration: SubjectCalibrationWord }[]
  filings: OwnPostFilings | null
}): ClaimSubjects | null {
  if (input.claims == null) return null
  const groups = new Map<string, string[]>()
  for (const c of input.claims) {
    const key = `${c.source_video_id}|${normClaimText(c.claim)}`
    if (!normClaimText(c.claim)) continue
    groups.set(key, [...(groups.get(key) ?? []), c.id])
  }
  const active = input.subjects.filter((x) => x.calibration !== 'failed')
  const f = input.filings
  let unfiled = 0
  const k = new Map(active.map((x) => [x.id, 0]))
  for (const ids of groups.values()) {
    // NO SUBJECT, NOTHING TO FILE: the judge files a claim against subjects,
    // and with none named (Össur) a claim is never "not checked yet".
    if (active.length > 0 && (!f || active.some((x) => !ids.some((id) => f.claimFiled.has(`${id}|${x.id}`))))) unfiled++
    if (!f) continue
    for (const x of active) if (ids.some((id) => f.claimTouches.get(id)?.has(x.id))) k.set(x.id, (k.get(x.id) ?? 0) + 1)
  }
  const claims = groups.size
  return {
    claims,
    subjects: active
      .map((x) => ({ subjectId: x.id, name: x.name, k: k.get(x.id) ?? 0 }))
      .sort((a, b) => b.k - a.k || a.name.localeCompare(b.name)),
    unfiled,
    state: claims > 0 && unfiled === claims ? 'unchecked' : unfiled > 0 ? 'partial' : 'checked',
  }
}

// ---- Y4 · a move, read in the market (WP3.6) -------------------------------------

/**
 * Each dated move, read in the MARKET afterwards as levels: the market's
 * videos on the move's subject or theme in the move's month, the month after
 * and the month after that, each of the market's videos that month. No
 * comparison is drawn between them (decision D keeps month against month for
 * pairs read the same way) and nothing here says the move did it: a level
 * after a date is where the market stood, not what moved it. Pure.
 *
 * `levels(kind, id, month)` is the pooled market k for the object in the month
 * (null: no reading for it); `n(month)` is the market's videos that month
 * (null: the month was not read).
 */
export function moveMarketReads(input: {
  moves: readonly (Pick<Move, 'id' | 'kind' | 'subject_id' | 'registry_ids' | 'lineage_id' | 'title' | 'declared_at'> & { dated_on?: string | null })[]
  month: string
  on: (move: { id: string }) => string
  subjects: ReadonlyMap<string, { name: string; calibration: SubjectCalibrationWord }>
  themes: ReadonlyMap<string, string>
  /** The advice a move was made on, to the theme its evidence leads with. */
  adviceTargets: ReadonlyMap<string, string>
  levels: (kind: 'subject' | 'theme', id: string, month: string) => number | null
  n: (month: string) => number | null
}): MoveMarketRead[] {
  const reading = monthStartOf(input.month)
  return input.moves.map((m) => {
    // THE MOVE'S MONTH IS THE DAY IT WAS MADE (MF5), else the day it was
    // declared: every move before MF5, and one dated today.
    const moveMonth = monthStartOf(moveDayOf(m))
    const subject = m.kind === 'subject' && m.subject_id ? input.subjects.get(m.subject_id) ?? null : null
    const themeId = m.kind === 'theme' ? (m.registry_ids ?? [])[0] ?? null
      : m.kind === 'advice' && m.lineage_id ? input.adviceTargets.get(m.lineage_id) ?? null : null
    const object: { kind: 'subject' | 'theme'; id: string } | null =
      subject && m.subject_id ? { kind: 'subject', id: m.subject_id }
        : themeId && (m.kind === 'advice' || (m.registry_ids ?? []).length === 1) ? { kind: 'theme', id: themeId } : null
    const label = subject?.name ?? (object?.kind === 'theme' ? input.themes.get(object.id) ?? null : null)
    const failed = subject?.calibration === 'failed'
    const roles: MoveMarketMonth['role'][] = ['move', 'after', 'after_that']
    let at = moveMonth
    const months: MoveMarketMonth[] = roles.map((role) => {
      const month = at
      at = nextMonth(at)
      if (month > reading) return { month, role, state: 'not_yet', k: null, n: null }
      const n = input.n(month)
      const k = object && !failed ? input.levels(object.kind, object.id, month) : null
      return n != null && n > 0 && k != null ? { month, role, state: 'read', k, n } : { month, role, state: 'not_read', k: null, n: null }
    })
    return {
      moveId: m.id,
      title: m.title,
      on: input.on(m),
      declaredAt: m.declared_at,
      ...(m.dated_on ? { datedOn: m.dated_on.slice(0, 10) } : {}),
      label: object ? label : null,
      calibration: subject?.calibration ?? null,
      months,
    }
  })
}

/** The day a move is read from: `dated_on` (MF5), else `declared_at`. */
export const moveDayOf = (m: { declared_at: string; dated_on?: string | null }): string => (m.dated_on ?? m.declared_at).slice(0, 10)

/** A month of a move's market read, in words: "104 of 655 (16%)", or why not.
 *  "of N" always rides with the figure (copy rule: every level prints of N). */
export function moveMonthLevel(m: MoveMarketMonth): string {
  if (m.state === 'not_yet') return `reads with the ${longMonth(m.month)} reading`
  if (m.state === 'not_read' || m.k == null || m.n == null) return 'no reading'
  const lvl = levelText(m.k, m.n)
  return lvl?.kind === 'share' ? `${fmtInt(m.k)} of ${fmtInt(m.n)} (${lvl.text})` : `${fmtInt(m.k)} of ${fmtInt(m.n)}`
}

// ---- the loader ---------------------------------------------------------------

interface InsightRow {
  id: string
  insight_type: string
  title: string
  description: string
  evidence: { supporting_theme_ids?: string[]; supporting_competitive_insight_ids?: string[] } | null
  confidence_score: number | null
  opportunity_score: number | null
}

/**
 * The Market surface, for one tenant.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * conclusions, no advice and no decisions, and the page says so once rather
 * than drawing five blocks of absences.
 */
export async function loadMarketSurface(scope: Scope): Promise<MarketSurfaceData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const params = scope.params as MarketSurfaceParams
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()

  // THE THEMED RUN JOINS WAVE 1 (WP23). It waits on the running-run ids and on
  // nothing else, and was a serial wait beside the one Promise.all this loader
  // had. The record starts below, as soon as the empty state is ruled out.
  const [clientRes, latestRunRes, themedRunId] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('pipeline_runs').select('id, started_at')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    fetchRunningRunIds(supabase, clientId, 'market-surface').then((ids) =>
      fetchThemedRunId(supabase, clientId, ids, 'market-surface'),
    ),
  ])
  const client = row<{ company_name: string | null }>(clientRes, 'market-surface.client')
  const brand = client?.company_name ?? 'Your brand'
  const latestRun = row<{ id: string; started_at: string }>(latestRunRes, 'market-surface.latestRun')
  if (!latestRun) return null

  // THE READING MONTH (market-first decision A). This page read the calendar
  // month the clock was in (`monthStartOf(new Date())`), so on 1 October its
  // card and its record were an October with nothing in it. It now reads the
  // month every other page reads: the runs, the schedule and the denominator
  // history (the same whole-history ask the reading pages make, memoised),
  // after the empty state so a tenant with nothing delivered pays for none.
  // The rivals too: the market every page pools is the one list
  // (`marketRivalAudiences`), not whatever rival audiences have a row.
  const [runs, schedule, history, rivalAudiences] = await Promise.all([
    loadDeliveredRuns(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
    loadMonthSeries(reading.client, clientId, { from: '2019-01-01', to: readingAt, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, clientId),
  ])
  const view = readingViewFrom({
    now: readingAt,
    runs,
    denominators: history.denominators,
    rivalAudiences,
    schedule,
    explicit: scope.params[MONTH_PARAM] ?? null,
  })
  const rm = view.reading
  const month = rm.month

  // AFTER THE EMPTY STATE, NOT BEFORE IT. The record's window is this month
  // whatever the page finds, so it can start as soon as the page is going to be
  // drawn at all — but not sooner: a tenant with no delivered update returns
  // above, and starting the record there would spend eight service-role reads
  // on a page that draws nothing and would force `readingHandle`'s lazily built
  // service-role client (lib/reading/read.ts) into existence to do it. Overview
  // makes the same call in the same place, for the same reason.
  const recordAhead = loadRecordInputs(reading.client, clientId, recordWindow(month, readingAt), { now: readingAt })
  // THE MONTH-PAIR JUDGE (decision D, WP1.3): "Afterwards" and every move
  // reading compare two months only when both were read the same way.
  const judgeAhead = loadAppPairOn(reading, readingAt)
  recordAhead.catch(() => {})

  const runId = latestRun.id
  // Frozen once an UPDATE has passed its freeze line, not the clock.
  const monthStatus = freezeStateFor(month, rm.asAt ?? readingAt)

  // ── WP3.6's reads, started beside the page's main wave ─────────────────
  // Y1's themes and posts, the judge's filings, your claims and the month's
  // market videos (Y3) depend on nothing the wave below returns, so they run
  // beside it. Each fails to its own honest absence, never the page.
  const rivals = rivalAudiences ?? []
  const marketCounts = pooledDenominators(history.denominators, rivals)
  const brandNames = [brand, ...rivals.filter((a) => a.startsWith('competitor:')).map((a) => a.slice('competitor:'.length))]
  const questionThemesAhead = loadQuestionThemes(reading, supabase, clientId, month, themedRunId ?? runId)
  const postsAhead = loadRecentOwnPosts(supabase, clientId, questionWindowFrom(month), nextMonth(month))
  const filingsAhead = loadOwnPostSubjects(supabase, clientId)
  const claimsAhead = loadClientClaims(supabase, clientId)
  const marketVideosAhead = loadMarketMonthVideos(reading, clientId, month)
  // "Date a move" takes a day once MF5 is applied (WP3.6 wave 2).
  const datableAhead = loadMoveDatable(supabase, clientId)
  for (const p of [questionThemesAhead, postsAhead, filingsAhead, claimsAhead, marketVideosAhead, datableAhead]) p.catch(() => {})

  const [insightRes, recRows, decisions, summaryRes, bucketRows, moves, subjects, themeLabels, corpusVideos] = await Promise.all([
    supabase.from('market_insights')
      .select('id, insight_type, title, description, evidence, confidence_score, opportunity_score')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('opportunity_score', { ascending: false }),
    // EVERY UPDATE'S ROWS, through selectAll. A ledger is one row per identity
    // and the identities live across runs; a bare `.select()` caps at 1000
    // silently (AGENTS.md) and 121 rows today is not the reason to obey that
    // rule, the read is.
    selectAll<RecCopy>(() =>
      // `reasoning`, `hero_quote` AND `based_on` COME BACK (D4). They were
      // dropped in WP14 with the reason written here — "a column carried into a
      // page bundle for a field nobody draws is weight with no reader… it comes
      // back with the row that draws it" — and this is that row: the expanded
      // "Why" line, its quote, and the "Grounded in" column are what D4 builds.
      // Three text columns over 121 rows is the weight; the ledger is what
      // reads them.
      supabase.from('recommendations')
        .select('id, lineage_id, title, type, status, priority, created_at, run_id, based_on, reasoning, hero_quote')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
    loadDecisions(supabase, clientId),
    supabase.from('run_summary').select('say_vs_hear').eq('client_id', clientId).eq('run_id', runId).maybeSingle(),
    // `registry_id` JOINS THE SELECT (D4). It is the only bridge there is from
    // a piece of advice to the monthly reading: a recommendation cites
    // `audience_insights` ids, the month tables are keyed on `theme_registry`
    // ids, and `themes.supporting_insight_ids` is what connects the two. The
    // gap document recorded "nothing joins a recommendation to a theme_registry
    // id"; this column is the join, and `afterwardsFor` is what it is for.
    // NO `embedding` — `themes.embedding` is readable in bulk (AGENTS.md) but
    // this read wants an id, not a vector.
    selectAll<ThemeBucketRow & GroundingThemeRow & { registry_id?: string | null }>(() =>
      supabase.from('themes')
        .select('bucket, supporting_insight_ids, label, member_themes, evidence_count, video_evidence_count, rank_score, registry_id')
        .eq('client_id', clientId).eq('run_id', themedRunId ?? runId).order('id'),
    ),
    loadMoves(supabase, clientId),
    loadSubjects(supabase, clientId),
    loadRegistryLabels(supabase, clientId),
    countAnalysedVideos(supabase, clientId),
  ])

  const insights = (insightRes.data ?? []) as InsightRow[]
  const summary = row<{ say_vs_hear: SayVsHearEntry[] | null }>(summaryRes, 'market-surface.runSummary')

  // ── MK6 · the plans, started here and awaited at the end ───────────────
  // It depends on nothing above except the corpus count (the denominator every
  // claim's count is a count of), so it runs BESIDE the two evidence waves
  // below rather than after them — round trips are the cost on this database,
  // not rows. A failure loses the card and keeps the page.
  const plansAhead = loadPlanChecks(scope, corpusVideos).catch((error: unknown) => {
    console.error(`[pages] market-surface.plans: ${error instanceof Error ? error.message : String(error)}`)
    return [] as PlanCheckCard[]
  })

  // ── MK4's card and readings, started here and awaited below ───────────
  // Everything they take is in hand now: the moves, the subjects and the
  // registry labels off the wave above, and the month-pair judge. They were
  // awaited after MK1 and MK2's evidence chain (the older insights, the cited
  // insights, the month read, the quotes), which they take nothing from, and
  // then made four sequential reads of their own: 0.9 s at the end of the page
  // on staging (27 Sep, Sealand). The catch only keeps a failure that
  // lands before the await from being an unhandled rejection; the await
  // still rejects with it.
  const subjectsActive = (subjects ?? []).filter((x) => x.status === 'active')
  const extrasAhead = judgeAhead.then((pair) => loadMovesExtras({
    supabase,
    reading,
    clientId,
    month,
    moves,
    subjectNames: new Map(subjectsActive.map((x) => [x.id, x.name])),
    subjectCalibrations: new Map(subjectsActive.map((x) => [x.id, subjectCalibration(x)])),
    themeLabels,
    pair,
  }))
  extrasAhead.catch(() => {})

  // ── the ledger's rows, decided BEFORE the evidence is fetched ──────────
  //
  // THE ORDER IS THE POINT. MK2's rows are pure (`buildAdviceRows`,
  // `ledgerRowsShown`) and are computed here, ahead of MK1's evidence read, so
  // that the two new reads below are bounded by the TWELVE ROWS THE LEDGER
  // DRAWS rather than by 64 identities: a ledger row that is not on the page
  // needs no grounding, no quote and no month series. The deep link is resolved
  // here for the same reason — it adds one row to the twelve, and that row's
  // evidence has to be in the same fetch.
  const adviceRows = buildAdviceRows(recRows, decisions)
  const acted = adviceRows.filter((r) => r.status !== 'new').length
  // The legacy deep link, resolved once and read by both blocks below. `?rec=`
  // names a recommendation ROW id, which is deleted and reinserted every
  // update; the lineage it belongs to is what survives, and is what the ledger
  // and the accept button are both keyed on.
  const requested = params.rec ?? params.item
  const requestedRow = requested
    ? adviceRows.find((r) => r.recommendationId === requested || r.lineageId === requested) ?? null
    : null
  // "Show all" (the preview's footer link): every identity, to a cap.
  const showAll = params.ledger === LEDGER_ALL_VALUE
  const shownRows = ledgerRowsShown(adviceRows, requestedRow?.lineageId ?? null, showAll ? LEDGER_ALL_CAP : LEDGER_SHOWN)

  // The market insights the drawn rows follow from. BY ID, not by run: a piece
  // of advice first made in June cites June's insights, and reading only the
  // latest update's would leave every row an older update raised with no
  // grounding at all. Measured on production 2026-09-18: every recommendation
  // carrying any `based_on` keeps at least one id that still resolves, on both
  // tenants, so every drawn row can state a grounding.
  const adviceInsightIds = [...new Set(shownRows.flatMap((r) => r.basedOn))]
  const known = new Set(insights.map((i) => i.id))
  const missing = adviceInsightIds.filter((id) => !known.has(id))
  const olderInsights = await fetchOlderInsights(supabase, clientId, missing)
  const evidenceByInsight = new Map<string, string[]>([
    ...insights.map((mi) => [mi.id, mi.evidence?.supporting_theme_ids ?? []] as const),
    ...olderInsights.map((mi) => [mi.id, mi.evidence?.supporting_theme_ids ?? []] as const),
  ])

  // ── MK1 · what we concluded ────────────────────────────────────────────
  //
  // ONE FETCH FOR TWO BLOCKS. The conclusions' cited ids and the ledger rows'
  // are unioned before the read: both want `id, theme, source_video_id` off the
  // same table, and two waves would be two round trips for one answer.
  const citedIds = new Set<string>()
  for (const mi of insights) for (const id of mi.evidence?.supporting_theme_ids ?? []) citedIds.add(id)
  const adviceCitedIds = new Set<string>()
  for (const id of adviceInsightIds) for (const a of evidenceByInsight.get(id) ?? []) adviceCitedIds.add(a)
  const allCitedIds = new Set<string>([...citedIds, ...adviceCitedIds])
  const audienceRows = allCitedIds.size > 0
    ? await fetchInsightsByIds<{ id: string; theme: string; source_video_id: string | null }>(
        supabase, [...allCitedIds], 'id, theme, source_video_id',
      )
    : []
  const themeSlugById = new Map(audienceRows.map((a) => [a.id, a.theme]))
  const videoByInsight = new Map(audienceRows.map((a) => [a.id, a.source_video_id]))
  const chipLabels = labelsBySlug(bucketRows)
  // MOVED AHEAD OF MK1 (this package). The registry bridge was built in MK2's
  // section because the ledger was the only block that crossed it; the "New"
  // chip on a conclusion crosses the same bridge, and building it twice would
  // be two answers to "which identity is this row about".
  const registryByInsight = registryIdsByInsight(bucketRows)

  const tierById = insightTiers(insights)
  // The leading identity behind each conclusion, by the SAME rule the ledger
  // uses (`orderedTargets`) — one object per row, most-cited first.
  const conclusionTarget = new Map<string, string | null>()
  const conclusionRows: ConclusionRow[] = insights.map((mi) => {
    const ids = mi.evidence?.supporting_theme_ids ?? []
    const slugs = new Set<string>()
    for (const id of ids) { const s = themeSlugById.get(id); if (s) slugs.add(s) }
    const videos = distinctVideos(ids, videoByInsight)
    conclusionTarget.set(mi.id, orderedTargets(ids, registryByInsight)[0] ?? null)
    return {
      id: mi.id,
      title: mi.title,
      description: mi.description,
      kind: mi.insight_type,
      // THE COUNT DECIDES THE TIER WHEN THE COUNT IS ZERO. `gateTier` reads the
      // model's confidence and a source count, and falls through to
      // 'early_signal' on confidence alone — so a conclusion citing nothing was
      // badged as evidence beside the very number that says it has none.
      tier: groundedTier(tierById.get(mi.id) ?? gateTier(mi.confidence_score, 0), videos),
      videos,
      themes: themeChips(slugs, chipLabels),
      // Filled below, once the page's one month read has come back. Null until
      // then, and null after it for a conclusion whose theme the month tables
      // hold nothing for — which is not "new".
      recurrence: null,
    }
  })
  // COUNTED OFF THE ROWS, NOT OFF THE RAW TIERS, so the header's "N below the
  // evidence bar" is a count of the rows the page actually badges that way.
  const counts = tierCounts(new Map(conclusionRows.map((r) => [r.id, r.tier])))
  // TIER FIRST, THEN THE SIZE OF THE EVIDENCE. The design asks for "tier, then
  // the size of the movement behind them", and the movement behind a conclusion
  // is not computable: a conclusion cites `audience_insights` ids, the monthly
  // reading is keyed on `theme_registry` ids, and nothing joins the two. The
  // size of the evidence IS computable and IS what the tier is drawn on, so
  // that is the second key — and the block prints which sort it used rather
  // than letting a reader assume the other one.
  const TIER_RANK: Record<GateTier, number> = { confirmed: 0, early_signal: 1, archive: 2 }
  conclusionRows.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.videos - a.videos || a.id.localeCompare(b.id))

  const shownConclusions = conclusionRows.slice(0, CONCLUSIONS_SHOWN)

  // ── MK2 · the advice, and what you decided ─────────────────────────────
  //
  // The rows were built above; this is the three columns they did not have.
  const groundedRows = shownRows.map((r) => {
    const cited = r.basedOn.flatMap((id) => evidenceByInsight.get(id) ?? [])
    return {
      ...r,
      grounded: groundingFor({
        basedOn: [...new Set(cited)],
        videoByInsight,
        themeIds: cited.map((a) => themeSlugById.get(a)).filter((s): s is string => Boolean(s)),
        audience: LEDGER_AUDIENCE,
        month,
        // What the ROW recorded, before anything was resolved — so a row whose
        // market insights are themselves gone reads as pruned rather than as
        // never having written its evidence down.
        cited: r.basedOn.length,
      }),
      targetIds: orderedTargets(cited, registryByInsight),
    }
  })
  // THE PAGE'S ONE MONTH READ, over both blocks' identities. The ledger asks
  // only for rows that have been decided on and name something (an undecided
  // row's answer is a sentence); the conclusions ask for the leading theme of
  // every row they draw. One query, two blocks — see `loadTargetPoints`.
  const monthPoints = await loadTargetPoints(reading, clientId, month, [
    ...groundedRows.filter((r) => r.decidedAt && r.targetIds.length > 0).map((r) => r.targetIds[0]),
    ...shownConclusions.map((c) => conclusionTarget.get(c.id)).filter((t): t is string => Boolean(t)),
  ])
  const pair = await judgeAhead
  const withAfterwards = readAfterwards(groundedRows, monthPoints, themeLabels, pair)

  const conclusions: ConclusionsBlock = {
    rows: shownConclusions.map((c) => ({
      ...c,
      recurrence: recurrenceForTarget(conclusionTarget.get(c.id) ?? null, monthPoints, month),
    })),
    corpusVideos,
    counts,
    belowBar: counts.archive,
    total: conclusionRows.length,
    sortedBy: 'strongest evidence first, then by how many videos are behind it',
    // THE RUN'S OWN DATE, and the only one on this block. See
    // `ConclusionsBlock.concludedOn`.
    concludedOn: latestRun.started_at ?? null,
    empty: conclusionRows.length === 0 ? 'Conclusions land with your next update.' : null,
  }

  // The NEWEST copy's hero quote per identity — the ledger prints the current
  // wording of a piece of advice, so it prints the current copy's quote. Kept
  // off `AdviceRow` on purpose: an unvouched hero quote must not ride into the
  // page bundle beside the `quote` field that refused it.
  const heroByLineage = new Map<string, string>()
  for (const c of [...recRows].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))) {
    heroByLineage.set(lineageKey(c), c.hero_quote ?? '')
  }
  const advice: AdviceBlock = {
    rows: await attachQuotes(supabase, withAfterwards, heroByLineage, evidenceByInsight, themeSlugById, clientId),
    // The ledger's first row: `buildAdviceRows` sorts this same answer first.
    current: currentTopLineage(recRows),
    highlight: requestedRow?.lineageId ?? null,
    requestedLine: !requested ? null : requestedRow ? ADVICE_REQUESTED_LINE : ADVICE_REQUESTED_GONE,
    total: adviceRows.length,
    acted,
    actedLine: actedLine(acted, adviceRows.length),
    repeatLine: repeatLine(adviceRows),
    recorded: decisions != null,
    unlock: ADVICE_UNLOCK,
    empty: adviceRows.length === 0 ? ADVICE_EMPTY : null,
  }

  // ── MK4 · declared moves ───────────────────────────────────────────────
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const moveRows: MoveRow[] = (moves ?? []).map((m) => {
    const on = moveTargetLabel(m, m.subject_id ? subjectById.get(m.subject_id) ?? null : null, themeLabels.get((m.registry_ids ?? [])[0] ?? '') ?? null)
    return { id: m.id, title: m.title, kind: m.kind, on, declaredAt: m.declared_at, line: moveLedgerLine(m, on) }
  })
  // THE CARD AND THE READINGS ARE COMPOSED ONCE, IN OVERVIEW'S LOADER (Block D
  // · D2). Market draws them differently — a card tile and a chart per move
  // where OV5 has a card and a row — and the DATA is the same data, so a second
  // composition here would be a second way to count one month. This surface
  // holds no verdicts of its own, so it passes no `movementFor` and the helper
  // bands the matched subject's own two months with `monthChange`.
  const extras = await extrasAhead
  // ── Y4 · each move, read in the market afterwards ──────────────────────
  const calibrationOf = new Map((subjects ?? []).filter((x) => x.status === 'active').map((x) => [x.id, marketCalibration(subjectCalibration(x))]))
  const market = await loadMoveMarketReads({
    reading,
    clientId,
    month,
    moves: moves ?? [],
    rivalAudiences: rivals,
    counts: marketCounts,
    on: (m) => moveRows.find((r) => r.id === m.id)?.on ?? '',
    subjects: new Map((subjects ?? []).filter((x) => x.status === 'active').map((x) => [x.id, { name: x.name, calibration: calibrationOf.get(x.id) ?? 'provisional' }])),
    themes: themeLabels,
    adviceTargets: new Map(groundedRows.filter((r) => r.targetIds.length > 0).map((r) => [r.lineageId, r.targetIds[0]])),
  })
  const movesBlock: MovesBlock = {
    rows: moveRows,
    masthead: MOVES_MASTHEAD,
    unlock: MOVES_UNLOCK,
    recorded: moves != null,
    empty: moves == null ? MOVES_UNRECORDED : moveRows.length === 0 ? MOVES_EMPTY_MARKET : null,
    card: extras.card,
    readings: extras.readings,
    market,
  }

  // ── Y1 · questions to answer ───────────────────────────────────────────
  const [questionThemes, posts, filings, clientClaims, marketVideos] = await Promise.all([
    questionThemesAhead.catch(logAs('questions.themes', { themes: [] as MarketTheme[], segments: 'unknown' as ThemeBoard['segments'] })),
    postsAhead.catch(logAs('questions.posts', null)),
    filingsAhead.catch(logAs('questions.filings', null)),
    claimsAhead.catch(logAs('claims', null)),
    marketVideosAhead.catch(logAs('claims.marketVideos', null)),
  ])
  const askable = (subjects ?? []).filter((x) => x.status === 'active' && calibrationOf.get(x.id) !== 'failed')
  const asked = await loadSubjectQuestions(supabase, clientId, askable.map((x) => x.id), {
    from: questionWindowFrom(month),
    to: nextMonth(month),
  }).catch(logAs('questions.subjects', null))
  const groupOf = questionGroupsOf(bucketRows)
  const questions = buildQuestions({
    month,
    themes: questionThemes.themes,
    segments: questionThemes.segments,
    n: marketCounts.get(month)?.category ?? null,
    brandNames,
    posts,
    subjects: askable.map((x) => {
      const held = asked?.get(x.id)
      const groups = new Map<string, { label: string; videos: Set<string> }>()
      for (const i of held?.insights ?? []) {
        const at = groupOf.get(i.id)
        if (!at) continue
        const g = groups.get(at.registryId) ?? { label: at.label, videos: new Set<string>() }
        g.videos.add(i.videoId)
        groups.set(at.registryId, g)
      }
      return {
        id: x.id,
        name: x.name,
        calibration: calibrationOf.get(x.id) ?? 'provisional',
        videos: held?.videos.size ?? 0,
        groups: [...groups.values()].map((g) => ({ label: g.label, videos: g.videos.size })),
      }
    }),
    filings: filings ? ownPostFilings(filings) : null,
  })

  // ── "Date a move" (WP3.6 wave 2): what a move can be dated on, and when ──
  // Only where moves are recorded (M4). The subjects are the ones the page
  // asks about (active, none being re-described), the themes the month's
  // questions, the advice the current recommendation. The day's window is
  // the database's (UTC), and a day is offered once MF5 is applied.
  const today = readingAt.slice(0, 10)
  const currentAdvice = advice.current ? adviceRows.find((r) => r.lineageId === advice.current) ?? null : null
  const dating: MoveDating | undefined = moves == null ? undefined : {
    datable: await datableAhead.catch(() => false),
    today,
    earliest: earliestMoveDay(today),
    month,
    subjects: askable.map((x) => ({ id: x.id, name: x.name })),
    themes: questions.themes.map((t) => ({ registryId: t.registryId, label: t.label })),
    advice: currentAdvice ? { lineageId: currentAdvice.lineageId, title: currentAdvice.title } : null,
  }

  // ── MK5 · how a move is made ───────────────────────────────────────────
  const claimEntries = ledgerRows(summary?.say_vs_hear ?? [], CLAIM_ROWS)
  // Y3 · EACH CLAIM COUNTED IN THE MARKET (IO F48): the videos behind the
  // evidence Pass D-a cited for it, inside the month's market videos.
  const supportIds = [...new Set(claimEntries.flatMap((e) => e.supporting_theme_ids ?? []))]
  const supportVideo = supportIds.length > 0 && marketVideos != null
    ? new Map((await fetchInsightsByIds<{ id: string; source_video_id: string | null }>(supabase, supportIds, 'id, source_video_id')
        .catch(logAs('claims.support', [] as { id: string; source_video_id: string | null }[])))
        .map((r) => [r.id, r.source_video_id]))
    : new Map<string, string | null>()
  const claims: ClaimRow[] = claimEntries.map((e, i) => ({
    id: `c${i}`,
    youSay: e.you_say,
    theySay: e.they_say,
    gap: e.gap,
    audience: e.audience,
    verdictLabel: e.audience === 'echoes' ? 'Echoed' : e.audience === 'contradicts' ? 'Pushed back' : 'Not taken up',
    echo: marketClaimEcho({
      stance: e.audience,
      reading: marketEchoReading(
        (e.supporting_theme_ids ?? []).map((id) => supportVideo.get(id)).filter((v): v is string => Boolean(v)),
        marketVideos,
      ),
    }),
  }))
  const claimSubjects = buildClaimSubjects({
    claims: clientClaims,
    subjects: (subjects ?? []).filter((x) => x.status === 'active').map((x) => ({ id: x.id, name: x.name, calibration: calibrationOf.get(x.id) ?? 'provisional' })),
    filings: filings ? ownPostFilings(filings) : null,
  })
  // What the button acts on — see `acceptableRow`.
  const acceptable = acceptableRow(adviceRows, requestedRow)
  const plans = await plansAhead
  const ways: WaysBlock = {
    ways: waysOfMoving(
      acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null,
      plans.length,
      month,
    ),
    claims,
    claimsLine: claims.length === 0
      ? 'Nothing you have said in your own posts has been read against the conversation this update.'
      : `${fmtInt(claims.length)} ${claims.length === 1 ? 'claim' : 'claims'} of yours, read against what the conversation said back.`,
    claimsCaveat: CLAIMS_CAVEAT,
    acceptable: acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null,
    empty: null,
    claimSubjects,
  }

  // ── the record ─────────────────────────────────────────────────────────
  // THIS SURFACE NOW HAS VERDICTS, AND THE RECORD COUNTS THEM. It used to say
  // "nothing on this surface is a banded comparison" and pass an empty list on
  // purpose — the conclusions are the model's and the ledger's dates are dates.
  // D4's "Afterwards" column changed that: every drawn row that has been
  // decided on and has months either side of the decision produces a `Verdict`,
  // and one that comes back `too_little_data` is a comparison this page drew
  // and could not answer. A refusal counter that stayed at zero while the table
  // above it printed unanswered comparisons would be the method note
  // disagreeing with the page — mock-gap's deviation 8 in reverse. The states
  // that produce NO verdict (`too_soon`, `no_target`, `refused`) are not
  // counted here, because nothing was compared: they say their own sentence in
  // their own cell.
  const ledgerVerdicts = advice.rows.map((r) => r.afterwards.verdict).filter((v): v is Verdict => v != null)
  const recordInputs: RecordInputs = {
    ...(await recordAhead),
    comparisonsRefused: countRefused(ledgerVerdicts),
    refusals: refusals(ledgerVerdicts),
  }

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    reading: rm,
    otherMonths: view.others,
    masthead: MOVES_MASTHEAD,
    conclusions,
    advice,
    moves: dating ? { ...movesBlock, dating } : movesBlock,
    ways,
    record: { line: howSoundLine(recordInputs), lines: recordLines(recordInputs), href: '/dashboard/settings' },
    method: methodLines(recordInputs, { brand }),
    plans,
    plansEmpty: plans.length === 0 ? PLAN_EMPTY : null,
    questions,
  }
}

/** A read's failure, logged and turned into its honest absence. */
function logAs<T>(what: string, fallback: T): (error: unknown) => T {
  return (error: unknown) => {
    console.error(`[pages] market-surface.${what}: ${error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error)}`)
    return fallback
  }
}

// ---- WP3.6's reads -------------------------------------------------------------

/**
 * The reading month's category themes at the floor, with their label and kind
 * off the latest themed update and their maker shares (MF1): what `buildAsks`
 * ranks. The front page's own read of the same rows is private to its loader,
 * so this is the question list's copy of it: month tables through the reading
 * client, the observations through the tenant's.
 */
async function loadQuestionThemes(
  reading: ReadingHandle,
  supabase: SupabaseClient,
  clientId: string,
  month: string,
  themedRunId: string | null,
): Promise<{ themes: MarketTheme[]; segments: ThemeBoard['segments'] }> {
  const segmentsAhead = makerRuleEnabled(clientId)
    ? loadThemeSegmentRows(reading.client, clientId, month, themedRunId)
    : Promise.resolve(null)
  const res = await reading.client
    .from('month_theme_readings')
    .select('theme_id, videos')
    .eq('client_id', clientId)
    .eq('month', month)
    .eq('audience', INDUSTRY_AUDIENCE)
    .gte('videos', THEME_FLOOR)
    .order('videos', { ascending: false })
    .order('theme_id', { ascending: true })
    .limit(200)
  const segmentRows = await segmentsAhead
  const segments: ThemeBoard['segments'] = !makerRuleEnabled(clientId) ? 'no_rule' : segmentRows ? 'measured' : 'unknown'
  if (res.error) {
    console.error(`[pages] market-surface.questions.months: ${res.error.message}`)
    return { themes: [], segments }
  }
  const rowsNow = (res.data ?? []) as { theme_id: string; videos: number }[]
  if (rowsNow.length === 0) return { themes: [], segments }
  const ids = rowsNow.map((r) => String(r.theme_id))
  const labels = new Map<string, { label: string | null; kind: string | null }>()
  if (themedRunId) {
    const obs = await supabase
      .from('theme_observations')
      .select('theme_id, label, category')
      .eq('client_id', clientId)
      .eq('run_id', themedRunId)
      .in('theme_id', ids)
    for (const r of (obs.data ?? []) as { theme_id: string; label: string | null; category: string | null }[]) {
      labels.set(String(r.theme_id), { label: r.label?.trim() || null, kind: r.category ?? null })
    }
  }
  const shares = segmentRows ? themeSegmentsOf(segmentRows) : null
  const n = 0
  return {
    segments,
    themes: rowsNow.flatMap((r) => {
      const o = labels.get(String(r.theme_id))
      if (!o?.label) return []
      return [{
        registryId: String(r.theme_id),
        label: o.label,
        labelStripped: false,
        kind: o.kind,
        k: Number(r.videos),
        n,
        prev: null,
        makerShare: shares?.maker.get(String(r.theme_id)) ?? null,
        noiseShare: shares?.noise.get(String(r.theme_id)) ?? null,
        identityNewThisRun: false,
        flags: [],
        provenance: null,
      }]
    }),
  }
}

/** Your posts over the window, dated by the post (`upload_date`), with what
 *  each is about (`videos.topics`): the question rows' haystack. Null where the
 *  read failed. Five columns, never `*`. */
async function loadRecentOwnPosts(supabase: SupabaseClient, clientId: string, from: string, to: string): Promise<QuestionPost[] | null> {
  return selectAll<QuestionPost>(() =>
    supabase
      .from('videos')
      .select('id, upload_date, topics, video_url')
      .eq('client_id', clientId)
      .eq('is_client', true)
      .gte('upload_date', from)
      .lt('upload_date', to)
      .order('id', { ascending: true }),
  )
}

/**
 * Every subject's question videos over the window (not yours, placed by the day
 * posted), and the question insights behind them: the Subjects page's SU3
 * count, one read for every subject (an embedded select through the
 * memberships). Null where the subjects tables are not applied.
 */
async function loadSubjectQuestions(
  supabase: SupabaseClient,
  clientId: string,
  subjectIds: readonly string[],
  window: { from: string; to: string },
): Promise<Map<string, { videos: Set<string>; insights: { id: string; videoId: string }[] }> | null> {
  if (subjectIds.length === 0) return new Map()
  type Video = { is_client: boolean | null; upload_date: string | null }
  type Row = {
    subject_id: string
    audience_insight_id: string
    audience_insights: { source_video_id: string | null; videos: Video | Video[] | null } | null
  }
  try {
    const rows = await selectAll<Row>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('subject_id, audience_insight_id, audience_insights!inner(source_video_id, videos(is_client, upload_date))')
        .eq('client_id', clientId)
        .in('subject_id', [...subjectIds])
        .eq('member', true)
        .eq('audience_insights.category', 'question')
        .order('audience_insight_id', { ascending: true })
        .order('subject_id', { ascending: true }) as never,
    )
    const from = window.from.slice(0, 10)
    const to = window.to.slice(0, 10)
    const out = new Map(subjectIds.map((id) => [id, { videos: new Set<string>(), insights: [] as { id: string; videoId: string }[] }]))
    for (const r of rows) {
      const ai = r.audience_insights
      const v = Array.isArray(ai?.videos) ? ai?.videos[0] ?? null : ai?.videos ?? null
      const day = v?.upload_date?.slice(0, 10) ?? null
      if (!ai?.source_video_id || !v || v.is_client || !day || day < from || day >= to) continue
      const held = out.get(r.subject_id)
      if (!held) continue
      held.videos.add(ai.source_video_id)
      held.insights.push({ id: r.audience_insight_id, videoId: ai.source_video_id })
    }
    return out
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** Which grouped question each insight belongs to, off the themed update's
 *  themes this page already reads (`supporting_insight_ids`, first theme by id
 *  wins, keyed on the registry id; the Subjects page's `nameQuestions` rule). */
export function questionGroupsOf(
  themes: readonly { supporting_insight_ids?: string[] | null; registry_id?: string | null; label?: string | null }[],
): Map<string, { registryId: string; label: string }> {
  const out = new Map<string, { registryId: string; label: string }>()
  for (const t of themes) {
    if (!t.registry_id || !t.label?.trim()) continue
    for (const id of t.supporting_insight_ids ?? []) if (!out.has(id)) out.set(id, { registryId: t.registry_id, label: t.label.trim() })
  }
  return out
}

/** The judge's rows (MF3 `own_post_subjects`). Null before MF3: nothing is
 *  filed, which the rows read as "not checked yet". */
async function loadOwnPostSubjects(supabase: SupabaseClient, clientId: string): Promise<OwnPostSubjectRow[] | null> {
  try {
    return await selectAll<OwnPostSubjectRow>(() =>
      supabase
        .from(TABLE_OWN_POST_SUBJECTS)
        .select('video_id, claim_id, subject_id, touches, matched_words, method, judge_version, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: true })
        .order('video_id', { ascending: true })
        .order('subject_id', { ascending: true })
        .order('claim_id', { ascending: true, nullsFirst: true }),
    )
  } catch (error) {
    if (isMissingOwnPostSubjects(error)) return null
    throw error
  }
}

/** Your claims read to date (`video_claims`, entity client: the tenant's own
 *  SELECT policy admits these, M8). Null where they could not be read. */
async function loadClientClaims(supabase: SupabaseClient, clientId: string): Promise<{ id: string; source_video_id: string; claim: string }[] | null> {
  return selectAll<{ id: string; source_video_id: string; claim: string }>(() =>
    supabase
      .from('video_claims')
      .select('id, source_video_id, claim')
      .eq('client_id', clientId)
      .eq('entity', 'client')
      .order('id', { ascending: true }),
  )
}

/** The reading month's market videos (MF1 `market_month_videos`), as a set.
 *  Null where the function is not there or the read failed: Y3 then counts
 *  nothing and says so. */
async function loadMarketMonthVideos(reading: ReadingHandle, clientId: string, month: string): Promise<Set<string> | null> {
  const rows = await selectAll<{ video_id: string }>(() =>
    reading.client.rpc('market_month_videos', { p_client: clientId, p_month: month }).select('video_id').order('video_id', { ascending: true }) as never,
  )
  return new Set(rows.map((r) => String(r.video_id)))
}

/**
 * Y4's reads: each move's subject or theme, month by month in the market
 * audiences (the category and the tracked brands, decision E), pooled. One
 * read per object kind, and none where nothing is dated.
 */
async function loadMoveMarketReads(input: {
  reading: ReadingHandle
  clientId: string
  month: string
  moves: readonly DatedMove[]
  rivalAudiences: readonly string[]
  counts: ReadonlyMap<string, { videos: number | null }>
  on: (m: { id: string }) => string
  subjects: ReadonlyMap<string, { name: string; calibration: SubjectCalibrationWord }>
  themes: ReadonlyMap<string, string>
  adviceTargets: ReadonlyMap<string, string>
}): Promise<MoveMarketRead[]> {
  if (input.moves.length === 0) return []
  const audiences = marketAudiences(input.rivalAudiences)
  const from = input.moves.reduce((m, x) => (monthStartOf(moveDayOf(x)) < m ? monthStartOf(moveDayOf(x)) : m), monthStartOf(input.month))
  const subjectIds = [...new Set(input.moves.filter((m) => m.kind === 'subject' && m.subject_id).map((m) => m.subject_id as string))]
  const themeIds = [...new Set(input.moves.flatMap((m) => m.kind === 'theme' ? (m.registry_ids ?? []).slice(0, 1) : m.kind === 'advice' && m.lineage_id && input.adviceTargets.get(m.lineage_id) ? [input.adviceTargets.get(m.lineage_id) as string] : []))]
  const levels = new Map<string, number>()
  const read = new Set<string>()
  const take = async (kind: 'subject' | 'theme', ids: string[]) => {
    if (ids.length === 0) return
    try {
      const set = await loadMonthSeries(input.reading.client, input.clientId, { audiences, objectKind: kind, objectIds: ids, from, to: input.month })
      for (const series of set.series) {
        if (!series.objectId) continue
        for (const p of series.points) {
          if (p.k == null) continue
          read.add(`${kind}:${series.objectId}`)
          const key = `${kind}:${series.objectId}:${p.month}`
          levels.set(key, (levels.get(key) ?? 0) + p.k)
        }
      }
    } catch (error) {
      console.error(`[pages] market-surface.moveMarket: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  await Promise.all([take('subject', subjectIds), take('theme', themeIds)])
  return moveMarketReads({
    moves: input.moves,
    month: input.month,
    on: input.on,
    subjects: input.subjects,
    themes: input.themes,
    adviceTargets: input.adviceTargets,
    // A MONTH THE OBJECT HAS ROWS IN SOME MONTH OF, WITH NO ROW OF ITS OWN, IS
    // ZERO: the market was read and nothing on it carried the object. An
    // object with no row in any month was never read, which is not zero.
    levels: (kind, id, m) => levels.get(`${kind}:${id}:${m}`) ?? (read.has(`${kind}:${id}`) && input.counts.get(m)?.videos != null ? 0 : null),
    n: (m) => input.counts.get(m)?.videos ?? null,
  })
}

/**
 * The market insights an older ledger row follows from.
 *
 * BY ID, AND ONLY THE ONES THE LATEST RUN DOES NOT ALREADY HOLD. The loader
 * reads this update's `market_insights` anyway for MK1; a piece of advice first
 * made in June cites June's, which that read does not contain. Never a read per
 * row and never the whole table.
 *
 * CHUNKED, THOUGH THE SET IS SMALL TODAY. This docstring used to argue the
 * `.in()` safe because it is "bounded by the twelve rows the ledger draws"
 * (`LEDGER_SHOWN`) — which is true and is a bound held somewhere else, one
 * constant and one deep-linked row away from the read that depends on it. The
 * PostgREST URL cap is measured, not theoretical (lib/chunk.ts: a `.in()` of
 * 500 uuids works and 700 fails), so the read carries its own bound:
 * `UUID_IN_CHUNK` over a key column, one row per id, the chunks out together
 * because they are disjoint. Through `selectAll` for the reason `loadLabels`
 * states — `UUID_IN_CHUNK` is shared and its own docstring invites raising it,
 * and past 1,000 rows PostgREST truncates SILENTLY.
 *
 * Failure is degradation, not an error: a row whose evidence cannot be read
 * prints no grounding, which is what an unrecorded grounding prints too. A
 * failing chunk costs only its own ids, so the rest of the ledger still shows
 * its grounding.
 */
async function fetchOlderInsights(
  supabase: SupabaseClient,
  clientId: string,
  ids: readonly string[],
): Promise<{ id: string; evidence: InsightRow['evidence'] }[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const parts = await mapWithLimit(chunk(unique, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    try {
      return await selectAll<{ id: string; evidence: InsightRow['evidence'] }>(() =>
        supabase
          .from('market_insights')
          .select('id, evidence')
          .eq('client_id', clientId)
          .in('id', part)
          .order('id', { ascending: true }),
      )
    } catch (error) {
      console.error(`[pages] market-surface.olderInsights: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  })
  return parts.flat()
}

/**
 * The bridge from a cited `audience_insights` id to the `theme_registry`
 * identities the monthly reading is keyed on.
 *
 * THIS IS THE JOIN THE GAP DOCUMENT SAID DID NOT EXIST — "nothing joins a
 * recommendation to a `theme_registry` id or a subject id". It exists in one
 * direction only, through this run's `themes` rows: a theme lists the insights
 * it was built from (`supporting_insight_ids`) and carries the stable identity
 * (`registry_id`). An insight can feed more than one theme, so the map is
 * one-to-many and `afterwardsFor` takes the first as its object.
 *
 * NEVER BY LABEL. Labels churn ~88% run to run (AGENTS.md); `registry_id` is
 * the identity and a null one contributes nothing rather than a guess.
 */
export function registryIdsByInsight(
  themes: readonly { supporting_insight_ids?: string[] | null; registry_id?: string | null }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const t of themes) {
    if (!t.registry_id) continue
    for (const id of t.supporting_insight_ids ?? []) {
      const arr = out.get(id) ?? []
      if (!arr.includes(t.registry_id)) arr.push(t.registry_id)
      out.set(id, arr)
    }
  }
  return out
}

/**
 * The identities a ledger row is about, MOST-CITED FIRST.
 *
 * ONE ROW, ONE OBJECT. `registryIdsByInsight` is one-to-many — an insight
 * feeds every theme built from it — so a row routinely names several
 * identities, and the reading can only be about one of them: "the newest month
 * after against the newest month before" over a concatenation of two themes'
 * series takes the after side from whichever theme happened to have a recent
 * month and the before side from the other, bands two different objects
 * against each other, and labels the result with the first one. A rise in
 * Durability printed as Zips, with a band beside it to make it look checkable.
 *
 * SO THE ORDER IS THE ANSWER AND IT IS MEASURED, NOT ARBITRARY: the identity
 * the most of this row's own cited insights point at leads, ties broken by id
 * so the choice is stable between renders. `afterwardsFor` reads
 * `targetIds[0]` as its object and the loader reads that one identity's
 * series; the rest stay on the row so a `no_target` state still knows the
 * difference between "several" and "none".
 */
export function orderedTargets(
  citedInsightIds: readonly string[],
  registryByInsight: Map<string, string[]>,
): string[] {
  const weight = new Map<string, number>()
  for (const id of citedInsightIds) {
    for (const reg of registryByInsight.get(id) ?? []) weight.set(reg, (weight.get(reg) ?? 0) + 1)
  }
  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

/** The audience the ledger's afterwards reading is taken in. The advice is
 *  addressed to the client, so what it did afterwards is a reading of the
 *  CLIENT's own audience — not the category's. Named once rather than typed
 *  into three calls. */
export const LEDGER_AUDIENCE = 'client'

/** How far back the afterwards reading looks for a "before" month. */
export const LEDGER_MONTHS_BACK = 13

/** A month start N months before another. Month starts are day 01, so there is
 *  no day-of-month overflow to guard against. */
function monthsBack(month: string, n: number): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

type RowWithTargets = AdviceRow & { targetIds: string[] }

/** One month of one identity, in one audience. */
export interface TargetPoint {
  month: string
  k: number
  n: number
  clusteringKey: string | null
  audience: string | null
}

/** The key a target's months are held under — the audience AND the identity,
 *  never the identity alone. Two audiences of one theme are two series
 *  (`MonthSeries.audience`), and a map keyed on `objectId` silently keeps
 *  whichever of them the loop reached last. */
const targetKey = (audience: string, objectId: string): string => `${audience}|${objectId}`

/** The audiences the page's one month read covers: the client's, which is what
 *  a piece of advice's afterwards is a reading of (`LEDGER_AUDIENCE`), and the
 *  category's, which is where a conclusion about the conversation at large was
 *  heard. Both come back from one query. */
export const MARKET_AUDIENCES = [LEDGER_AUDIENCE, 'industry-other'] as const

/**
 * Every month this page reads, in ONE query.
 *
 * ONE MONTH-SERIES READ FOR THE WHOLE PAGE, over the union of the drawn ledger
 * rows' target identities and the drawn conclusions' — two blocks that each
 * wanted the same table for the same themes, and would otherwise have been two
 * round trips for one answer on a database where round trips are the cost
 * (AGENTS.md's ration).
 *
 * `loadMonthSeries` is the only way in (AGENTS.md: a reader reads the series,
 * it never sums videos across months). Where the numerator table is not applied
 * — `substrate` / `numeratorSubstrate` `missing`, which is how a fresh database
 * and a tenant mid-migration both look — the map is empty, every ledger row
 * falls to `too_soon` and every conclusion's recurrence is null, and both
 * blocks say so in words.
 *
 * THE CLUSTERING KEY AND THE AUDIENCE TRAVEL WITH THE POINT. Dropping them
 * would hand `afterwardsFor` two months it cannot tell apart — see
 * `AfterwardsInput.series`.
 */
async function loadTargetPoints(
  reading: ReadingHandle,
  clientId: string,
  month: string,
  targets: readonly string[],
): Promise<Map<string, TargetPoint[]>> {
  const points = new Map<string, TargetPoint[]>()
  if (targets.length === 0) return points
  try {
    const set = await loadMonthSeries(reading.client, clientId, {
      audiences: [...MARKET_AUDIENCES],
      objectKind: 'theme',
      objectIds: [...new Set(targets)],
      from: monthsBack(month, LEDGER_MONTHS_BACK),
      to: month,
    })
    for (const series of set.series) {
      if (!series.objectId) continue
      points.set(
        targetKey(series.audience, series.objectId),
        series.points
          .filter((p) => p.k != null && p.videos != null)
          .map((p) => ({
            month: p.month,
            k: p.k as number,
            n: p.videos as number,
            clusteringKey: p.clusteringKey,
            audience: p.audience,
          })),
      )
    }
  } catch (error) {
    // The month tables arrive with a migration and a deploy can land first.
    // Every row then reads `too_soon`, which is the honest answer for "we have
    // no months to read", and the page keeps its other blocks.
    console.error(`[pages] market-surface.months: ${error instanceof Error ? error.message : String(error)}`)
  }
  return points
}

/**
 * Which months a conclusion's leading theme was heard in — the mock's "New"
 * chip, as a fact about the record.
 *
 * THE TWO AUDIENCES THIS PAGE READS, AND THE SENTENCE UNDER THE ROWS SAYS SO.
 * A conclusion is not scoped to one audience — "Durability is the category's
 * rising subject" is about the category and "Freitag's audience discusses
 * smell" is about a rival's — but `loadTargetPoints` asks for
 * `MARKET_AUDIENCES` (the client's and the category's) and a rival's months
 * are not in the map at all. So the chip means "not heard in YOUR audience or
 * the category before", `CONCLUSIONS_NEW_LINE` prints exactly that, and
 * widening the read to every tracked rival is a bigger query and a product
 * decision, not a silent one. A month counts as heard only where the theme
 * actually carried a reading in it (`k > 0`); a month whose denominator we
 * read and whose theme nobody mentioned is not a month it was heard in.
 *
 * Pure.
 */
export function recurrenceForTarget(
  targetId: string | null,
  points: Map<string, TargetPoint[]>,
  month: string,
): Recurrence | null {
  if (!targetId) return null
  const months = new Set<string>()
  let read = false
  for (const audience of MARKET_AUDIENCES) {
    const series = points.get(targetKey(audience, targetId))
    if (!series) continue
    read = true
    for (const p of series) if (p.k > 0) months.add(p.month)
  }
  // NOTHING READ IS NOT "NEW". A theme the month tables hold nothing for has no
  // record either way, and `recurrenceOf` would call that first-heard-this-month
  // — a claim about the conversation made out of a gap in our own bookkeeping.
  if (!read) return null
  return recurrenceOf(targetId, [...months], month)
}

/**
 * "Afterwards", for the rows that can have one.
 *
 * Reads the page's one month map (`loadTargetPoints`) and computes nothing of
 * its own. Only rows that have actually been decided on and name an identity
 * contribute a target to that read: an undecided row's answer is a sentence,
 * not a reading, and reading months for it would spend the query to print the
 * same words.
 *
 * Pure.
 */
function readAfterwards(
  rows: readonly RowWithTargets[],
  points: Map<string, TargetPoint[]>,
  themeLabels: Map<string, string>,
  pair: PairOn,
): AdviceRow[] {
  return rows.map(({ targetIds, ...r }) => {
    // THE SERIES IS ONE OBJECT'S, and it is the object the verdict is labelled
    // with. See `orderedTargets`: pooling every target's months takes the two
    // sides of the comparison from two different themes.
    const target = targetIds[0] ?? null
    return {
      ...r,
      afterwards: afterwardsFor({
        decidedAt: r.decidedAt,
        targetIds,
        objectLabel: target ? themeLabels.get(target) ?? target : undefined,
        series: target ? points.get(targetKey(LEDGER_AUDIENCE, target)) ?? [] : [],
        audience: LEDGER_AUDIENCE,
        pair: (prevMonth, month) => pair(prevMonth, month, LEDGER_AUDIENCE),
      }),
    }
  })
}

/**
 * Ask the cited-quote picker for the hero quote AND NOTHING ELSE.
 *
 * The picker takes its lead quote before it checks how many were asked for, so
 * zero means "return the hero if the evidence can vouch for it, and take
 * nothing from the pool if it cannot". Any other number lets the heuristic path
 * consume a candidate for a row that will not print it — and the picker's
 * `used` set is shared across every row on the page, so the candidate it burns
 * is one another row could have been vouched by. Pinned in
 * `market-surface.test.ts` against the picker itself, because it rests on the
 * picker's order and not on a comment.
 *
 * `heroEvidence` below reads the English only for the rows a hero can match,
 * and that is correct only while this is zero: raise it and the heuristic
 * path scores every row by its reading, so `heroEvidence` has to read them all.
 */
const HERO_ONLY = 0

/**
 * Each drawn row's one real comment, as its own node with its own ref.
 *
 * A HERO QUOTE IS ONLY SHOWN WHERE THE EVIDENCE CAN VOUCH FOR IT.
 * `recommendations.hero_quote` is validated against the quotes the model was
 * shown at write time (`validateQuote`), but it is stored as a COPY of the
 * words with no evidence id, and a quote with no ref cannot be frozen into a
 * snapshot or erased when the comment behind it is (lib/renderables/quotes-
 * freeze.ts). So the picker is asked to find the evidence row carrying the same
 * words; where it cannot, the row shows no quote rather than an unfreezable
 * one.
 *
 * AND IT IS A SIBLING OF THE "WHY", NEVER A SPAN INSIDE IT. A digit inside a
 * quotation is still refused (AGENTS.md), so a quote spliced into scrubbed
 * prose would either lose the speaker's own number or smuggle it past the rule.
 * Two fields, two nodes.
 */
async function attachQuotes(
  supabase: SupabaseClient,
  rows: readonly AdviceRow[],
  heroByLineage: Map<string, string>,
  evidenceByInsight: Map<string, string[]>,
  themeSlugById: Map<string, string>,
  clientId: string,
): Promise<AdviceRow[]> {
  const audienceIdsFor = (r: AdviceRow) => [...new Set(r.basedOn.flatMap((id) => evidenceByInsight.get(id) ?? []))]
  const heroOf = (r: AdviceRow) => (heroByLineage.get(r.lineageId) ?? '').trim()
  const ids = [...new Set(rows.filter((r) => heroOf(r).length > 0).flatMap(audienceIdsFor))]
  if (ids.length === 0) return [...rows]

  const byAudience = await heroEvidence(supabase, ids, rows.map(heroOf)).catch((error: unknown) => {
    console.error(`[pages] market-surface.adviceQuotes: ${error instanceof Error ? error.message : String(error)}`)
    return new Map<string, QuoteRow[]>()
  })
  const pick = createCitedQuotePicker(byAudience, themeSlugById)
  const vouchedRows = rows.map((r) => {
    const hero = heroOf(r)
    if (!hero) return r
    // THE HERO AND NOTHING ELSE — see `HERO_ONLY`. Asking for one quote made
    // the picker fall through to its heuristic path whenever the hero could
    // not be vouched, and `take` marks what it picks as used: the row threw the
    // result away, and a later row whose own hero was that same sentence could
    // no longer be vouched for it and lost a quote it had earned.
    const picked = pick(audienceIdsFor(r), HERO_ONLY, r.title, hero)[0]
    const vouched = picked != null && cleanQuote(picked.text).toLowerCase() === cleanQuote(hero).toLowerCase()
    return { ...r, quote: vouched ? picked : null }
  })
  // THE QUOTE GATE (walkthrough, 29 Sep; lib/quote-gate.ts): a vouched hero
  // is printed only where it is a buyer's or a commenter's on the market —
  // not a maker's audience, not a seller's post, readable — and the list
  // prints one quote per thread. A comment under the client's own post may
  // stand (advice is often about the client's own audience).
  const evidenceIds = vouchedRows.map((r) => (r.quote?.ref.startsWith('e:') ? r.quote.ref.slice(2) : null))
  if (!evidenceIds.some(Boolean)) return vouchedRows
  const ctx = await readQuoteContext(supabase, clientId, { evidenceIds }).catch((error: unknown) => {
    console.error(`[pages] market-surface.adviceQuoteContext: ${error instanceof Error ? error.message : String(error)}; no quote printed`)
    return null
  })
  const threads = new Set<string>()
  return vouchedRows.map((r, i) => {
    const q = r.quote
    const id = evidenceIds[i]
    if (!q || !id) return r
    const verdict = ctx
      ? quoteGate({ text: q.text, lang: q.lang ?? null, english: q.english ?? null, video: ctx.forEvidence(id) }, gateFor(clientId, { claim: r.title, allowOwn: true }))
      : null
    if (!verdict?.ok || (verdict.thread && threads.has(verdict.thread))) return { ...r, quote: null }
    if (verdict.thread) threads.add(verdict.thread)
    return r
  })
}

/**
 * The evidence behind the drawn rows, with the English read ONLY for the rows
 * whose words are a hero quote's — which are the only rows `attachQuotes`'
 * picker reads a reading off.
 *
 * WHY THAT IS ENOUGH, AND WHAT WOULD MAKE IT WRONG. The picker is called with
 * `HERO_ONLY`: it finds the first evidence row whose cleaned, lower-cased words
 * equal the hero quote's, copies that row's reading onto the quote, and
 * returns before its heuristic path — the path that scores every row by its
 * reading (`quoteScore`). So a reading on any other row is never read. If
 * `HERO_ONLY` ever stops being zero, this must read the English for every row
 * again (`fetchQuotesByAudience`), or the heuristic will score rows as unread.
 *
 * WHY. `fetchQuotesByAudience` read the English of every quote behind the
 * drawn rows (Sealand: about 4,000 texts, 25 requests) to vouch for a handful
 * of hero quotes, and it was the last read on the page: 1.1 s on staging
 * (27 Sep). The evidence read itself is `quotesUntranslated`, that function's
 * read line for line (lib/pages/evidence-untranslated.ts says why it is a copy
 * and why the copy's order matters).
 */
async function heroEvidence(
  supabase: SupabaseClient,
  ids: string[],
  heroes: readonly string[],
): Promise<Map<string, QuoteRow[]>> {
  const untranslated = await quotesUntranslated(supabase, ids)
  const wanted = new Set(heroes.filter(Boolean).map((h) => cleanQuote(h).toLowerCase()))
  const vouching: string[] = []
  for (const list of untranslated.values()) {
    for (const q of list) if (wanted.has(cleanQuote(q.quote).toLowerCase())) vouching.push(q.quote)
  }
  const translations = await readTranslations(supabase, vouching)
  return new Map([...untranslated].map(([id, list]) => [id, list.map((q) => ({ ...q, ...readingOf(translations, q.quote) }))]))
}

/** The decision ledger. NULL — never [] — when `rec_decisions` is not applied
 *  here, so the block can tell "nobody has decided anything" apart from "we are
 *  not writing decisions down", which are different sentences. */
async function loadDecisions(supabase: SupabaseClient, clientId: string): Promise<RecDecision[] | null> {
  try {
    // NO `.limit()` HERE. `REC_DECISIONS_READ_LIMIT` is PostgREST's silent
    // 1,000-row cap written down for a caller that uses a bare `.select()`;
    // `selectAll` pages past that cap with `.range(from, from + 999)`, and
    // range OVERWRITES limit in postgrest-js — so the constant did nothing and
    // the read was already fetching the whole table. The ledger wants the
    // whole table: `inheritedStatus` needs the newest decision per lineage and
    // a cap would answer for the newest thousand rows instead. The order is a
    // total one (`id` is unique), which is what range paging needs.
    return await selectAll<RecDecision>(() =>
      supabase.from(REC_DECISIONS_TABLE)
        .select('id, lineage_id, status, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: false })
        .order('id', { ascending: false }),
    )
  } catch (error) {
    if (isMissingRecDecisions(error)) return null
    throw error
  }
}

/** The moves this tenant has dated. Null — never [] — before M4 is applied. */
/** A move as `select('*')` reads it: with MF5's `dated_on` once it is applied
 *  (lib/subjects/types.ts `Move` is on the freeze path, so the column rides
 *  here). */
type DatedMove = Move & { dated_on?: string | null }

async function loadMoves(supabase: SupabaseClient, clientId: string): Promise<DatedMove[] | null> {
  try {
    return await selectAll<DatedMove>(() =>
      supabase.from(TABLE_MOVES).select('*').eq('client_id', clientId)
        .order('declared_at', { ascending: false }).order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/**
 * Whether MF5 is applied here, so "Date a move" may take a day: a zero-row
 * read of `moves.dated_on` on the session client. A column PostgREST does not
 * know answers 42703; so does a table it does not know (M4), and neither is an
 * error worth logging.
 */
async function loadMoveDatable(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  const { error } = await supabase.from(TABLE_MOVES).select('dated_on').eq('client_id', clientId).limit(0)
  if (!error) return true
  if (!isMissingColumnError(error, 'dated_on') && !isMissingSubjects(error)) {
    console.error(`[pages] market-surface.moveDatable: ${(error as { message?: string }).message ?? String(error)}`)
  }
  return false
}

/** The tenant's subjects, for a move's "on what". Null before M4.
 *
 *  THE NAME, AND THE FOUR CALIBRATION COLUMNS (decision C, WP1.1): the card
 *  counts a subject's match on your own posts, and a move on a subject is
 *  read, only when the subject is ready, so the loader needs its state. Still
 *  no `select('*')`: nothing else on the row is printed here. */
type SubjectName = Pick<Subject, 'id' | 'name' | 'status' | 'calibrated_at' | 'calibration_precision' | 'calibration_n' | 'calibration_judge_version'>

async function loadSubjects(supabase: SupabaseClient, clientId: string): Promise<SubjectName[] | null> {
  try {
    return await selectAll<SubjectName>(() =>
      supabase.from(TABLE_SUBJECTS)
        .select('id, name, status, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
        .eq('client_id', clientId).order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** Registry labels, for a theme-move's "on what". A registry id is the stable
 *  identity (AGENTS.md); the label is what a reader is shown. */
async function loadRegistryLabels(supabase: SupabaseClient, clientId: string): Promise<Map<string, string>> {
  const rows = await selectAll<{ id: string; label: string | null }>(() =>
    supabase.from('theme_registry').select('id, label').eq('client_id', clientId).order('id', { ascending: true }),
  ).catch(() => [] as { id: string; label: string | null }[])
  return new Map(rows.filter((r) => r.label).map((r) => [r.id, r.label as string]))
}

/** The ledger's own deep link, so the digest's `?rec=<id>` keeps landing on the
 *  row it names once that link points here. */
export function marketSurfaceHref(lineageId?: string | null, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v !== '' && k !== 'item' && k !== 'rec') q.set(k, v)
  if (lineageId) q.set('item', lineageId)
  const s = q.toString()
  return s ? `/dashboard/market?${s}` : '/dashboard/market'
}

/**
 * Every video this workspace has analysed, ever.
 *
 * THE DENOMINATOR MK1's ROW COUNT NEEDED AND DID NOT HAVE. `distinctVideos`
 * counts the source videos of a conclusion's cited insights over the WHOLE
 * CORPUS — Össur has 1,699 analysed videos — and the chip printed "301 videos
 * behind it" directly under "What we concluded this month", beside a page bar
 * reading "September 2026 · still filling", on a product whose Competitive
 * surface says September held 449. A client reads that as a share of the month
 * and the share does not exist. The copy contract cannot catch it: the node is
 * a `figure`, and only a `level` must carry its "of N".
 *
 * A head count, so nothing is transferred to count rows. Null on failure —
 * "we could not read it" is not "zero", and the block says the honest one.
 */
async function countAnalysedVideos(supabase: SupabaseClient, clientId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('analyzed_run_id', 'is', null)
  if (error) {
    console.error(`[pages] market-surface.corpusVideos: ${error.message}`)
    return null
  }
  return count ?? null
}

/** The month a ledger row's first-made date falls in, in the reader's form. */
export const madeInMonth = (firstMade: string): string => monthName(monthStartOf(firstMade))

/**
 * How long a piece of advice has been standing, in whole calendar months — the
 * artboard's "3 months" under the month it was first raised.
 *
 * CALENDAR MONTHS, NOT DAYS DIVIDED BY THIRTY, and the ledger's own unit: the
 * column beside it counts the months an identity was repeated in
 * (`monthsMadeIn`), so an age counted any other way would make two adjacent
 * cells two different clocks. Advice first raised this month has an age of
 * zero and prints nothing — "0 months" under "September" is a reader doing
 * arithmetic to learn what the cell above already says.
 *
 * NOT A PERIOD KEY. It is the distance between two dates the client can see on
 * the row, not a reading of anything, so it takes the reading's own clock
 * rather than a month table.
 *
 * Pure. Null where there is no age to state.
 */
export function ageInMonths(firstMade: string, readingAt: string): string | null {
  if (!firstMade) return null
  const from = new Date(`${monthStartOf(firstMade)}T00:00:00.000Z`)
  const to = new Date(`${monthStartOf(readingAt.slice(0, 10))}T00:00:00.000Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (months <= 0) return null
  return `${fmtInt(months)} ${months === 1 ? 'month' : 'months'}`
}

/**
 * The repeat cell, in UPDATES (D9).
 *
 * `AdviceRow.timesMade` IS THE UPDATE COUNT and the word "updates" goes on it.
 * The column used to print `monthsRepeated` — calendar months — with nothing
 * saying so, which is the quieter of the two mistakes: a reader of "2 months"
 * under a heading reading "Repeated" believes the advice came back in a second
 * month, and on production's only repeat it came back three days later. So the
 * updates lead, because that is what the number counts, and the months follow
 * ONLY where there is more than one of them — the two facts are different and
 * the cell states whichever it holds. "New" is the artboard's chip and is
 * decided by the caller off the reading's own month, not here.
 *
 * Pure.
 */
export function repeatCell(row: Pick<AdviceRow, 'timesMade' | 'monthsRepeated'>): { updates: string; months: string | null } {
  const updates = row.timesMade === 1 ? '1 update' : `${fmtInt(row.timesMade)} updates running`
  return { updates, months: row.monthsRepeated > 1 ? `in ${fmtInt(row.monthsRepeated)} months` : null }
}
