import type { SupabaseClient } from '@supabase/supabase-js'

import { recStatus, REC_STATUS_LABEL, type RecStatus } from '../calibration'
import { gateTier, type GateTier } from '../curation'
import { fmtInt, monthName, shortDate } from '../format'
import { distinctVideos, groundedTier, insightTiers, labelsBySlug, ledgerRows, themeChips, tierCounts, type GroundingThemeRow, type ThemeChip } from '../market-tiles'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { cleanQuote, createCitedQuotePicker, fetchInsightsByIds, fetchQuotesByAudience, type ThemeBucketRow } from '../quotes'
import { inheritedStatus, isMissingRecDecisions, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { methodLines, type MethodLines } from '../reading/method'
import { PLAN_EMPTY, loadPlanChecks, type PlanCheckCard } from '../ask/plan-cards'
import { scrubProse } from '../prose/scrub'
// The client-facing half of the readiness vocabulary — what a surface says
// where the readiness page names the team. See `CLOSED_BY_US`'s own docblock.
import { CLOSED_BY_US } from '../readiness/types'
import { afterwardsFor, groundingFor, type Afterwards, type Grounding } from '../reading/afterwards'
import { recurrenceOf, type Recurrence } from '../reading/head-to-head'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals, type RecordInputs } from '../reading/record'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import type { Verdict } from '../reading/verdicts'
import type { Quote } from '../renderables/types'
import { freezeStateFor, monthStartOf } from '../reading/monthly'
import type { MonthStatus } from '../reading/types'
import type { Scope } from '../renderables/types'
import { selectAll } from '../supabase-admin'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { isMissingSubjects, TABLE_MOVES, TABLE_SUBJECTS, type Move, type Subject } from '../subjects/types'
import { MOVES_MASTHEAD, MOVES_UNLOCK, firstScoringMonth, loadMovesExtras, longMonth, recordWindow } from './overview'
import type { MoveCandidate, MoveReading } from '../reading/moves'
import { row } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'

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
export type MarketSurfaceParams = { rec?: string; item?: string }

/** How many ledger rows are drawn before the rest are counted. 64 rows of
 *  advice nobody has acted on is a filing cabinet, not a page; the oldest are
 *  the ones a ledger is read for. */
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
  'First time marks a row first raised by an update inside this month: the ledger’s own dates are the update’s clock, not the comment’s.'

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
   * NOT A RANK AND NOT A ROW ID. The ledger is sorted oldest-first and the
   * number is read off THAT order, so "number 3" said out loud names the same
   * row for as long as the order holds — which is what the mock's "# is the
   * identity, kept for life" is reaching for. A `recommendations.id` changes
   * every update (Pass D-b deletes and reinserts), and a lineage uuid is not
   * something a person says. It is counted over every identity, not over the
   * twelve drawn, so the number on a deep-linked row is its real place.
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
  /** The lineage the URL named, when the ledger holds it. The row is drawn
   *  whether or not it is among the oldest, and it is marked. */
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
}

export interface ClaimRow {
  id: string
  youSay: string
  theySay: string | null
  gap: string
  audience: string
  verdictLabel: string
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
}

export interface UnlockRow {
  section: string
  title: string
  line: string
  /**
   * WHO THE READER CAN GO TO, and null where that is nobody they can go to —
   * Competitive's `CompetitiveUnlockRow.closes`, same field, same reason, and
   * the two renderers print it the same way.
   *
   * It was `owner` and carried "Verbatim engineering", a readiness OWNER on a
   * paying reader's page (`CLOSED_BY_US`, lib/readiness/types.ts). Null means
   * the row is ours, and the row's `line` then ends in the sentence that says
   * what closes it.
   */
  closes: string | null
}

export interface UnlocksBlock {
  rows: UnlockRow[]
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
  masthead: string
  conclusions: ConclusionsBlock
  advice: AdviceBlock
  moves: MovesBlock
  ways: WaysBlock
  unlocks: UnlocksBlock
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

/**
 * The ledger's rows, oldest first.
 *
 * SORTED BY AGE, which is the design's word and not `orderAgenda`'s. The parked
 * page sorts by evidence tier and priority, which is the right order for "what
 * should we do next"; a ledger answers "what has been sitting here", and the
 * answer to that is the oldest thing first. `number` is read off that order
 * once the sort has happened — see `AdviceRow.number`.
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
    rows.push({
      lineageId,
      recommendationId: newest.id,
      title: newest.title,
      kind: newest.type,
      firstMade: (oldest.created_at ?? '').slice(0, 10),
      timesMade: runs,
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
      afterwards: afterwardsFor({ decidedAt, targetIds: [], series: [], audience: 'client' }),
      why: why || null,
      quote: null,
    })
  }
  return rows
    .sort((a, b) => a.firstMade.localeCompare(b.firstMade) || a.lineageId.localeCompare(b.lineageId))
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
 * The rows the ledger draws: the oldest, plus the one a link named.
 *
 * THE DEEP LINK USED TO RESOLVE AND THEN VANISH. `?rec=<id>` is carried by four
 * sent emails and every digest until WP17; the loader resolved it to a lineage
 * and the only thing that lineage reached was MK5's accept button. MK2 drew the
 * twelve oldest of 56 or 64 with no anchor and no highlight, so a reader
 * following a link from a digest landed on a ledger that did not contain the
 * row they had clicked.
 *
 * The named row is ADDED rather than promoted, and the list stays sorted by
 * age: the block's own meta line says "oldest first", and a newer row at the
 * top would make that sentence false to save a reader one glance.
 */
export function ledgerRowsShown(
  rows: readonly AdviceRow[],
  requestedLineage: string | null,
  shown = LEDGER_SHOWN,
): AdviceRow[] {
  const oldest = rows.slice(0, shown)
  if (!requestedLineage) return oldest
  const named = rows.find((r) => r.lineageId === requestedLineage)
  if (!named || oldest.some((r) => r.lineageId === named.lineageId)) return oldest
  return [...oldest, named].sort((a, b) => a.firstMade.localeCompare(b.firstMade) || a.lineageId.localeCompare(b.lineageId))
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
  return rows.find((r) => r.status === 'new') ?? null
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
export function waysOfMoving(acceptable: WaysBlock['acceptable'], plansChecked = 0): WayRow[] {
  return [
    {
      key: 'card',
      title: 'Confirm this month’s card',
      how: 'Everything you published this month, with the claims you made in it, confirmed in one press as a move dated to the first of the month.',
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

/** MK3 and MK6: the two sections of this surface that are not built, each
 *  naming what it waits for and who owns it. Neither invents a date — a
 *  delivery date computed from the calendar is wrong the first time it is read
 *  (the defect OV5's unlock had). */
export function unlockRows(plansChecked = 0): UnlockRow[] {
  const rows: UnlockRow[] = [
    {
      // WHAT IS NOT BUILT IS THE PRESS. The card itself is read on this page
      // now (Phase 1 D2) and the renderer prints "— not built yet" under every
      // row here, so this row names the confirming rather than the card.
      section: 'MK3',
      title: 'Confirming this month’s card',
      // AND THE OWNER IS OFF THE CLIENT'S PAGE (the vocabulary ruling). The
      // renderer printed "— not built yet · Verbatim engineering" under this
      // row: an internal team name in front of the paying reader, with no link
      // and nothing they could do with it. The row keeps the WP19 shape the
      // briefs have used since — what is missing, then what closes it — and
      // the sentence is `CLOSED_BY_US`'s, not a second wording of it.
      line: `The card is read above — everything you published this month, how much of it drew enough comment to read, and the claims you made in it. Turning it into a move in one press is what is missing. ${CLOSED_BY_US.engineering}`,
      closes: null,
    },
  ]
  // MK6 LEAVES THIS LIST WHEN IT HAS SOMETHING TO SHOW. The row's own sentence
  // promised a verdict "held for two consecutive updates", which D4 measured
  // and refused: claims flip between readings often enough that holding one
  // back for two would print almost nothing. What the block prints instead is
  // the current reading, the date each verdict last moved and how many readings
  // have carried it — with `PLAN_HOLD_CAVEAT` saying the hold is not there. A
  // workspace with no uploaded plan keeps the row, because for them it really
  // is absent.
  if (plansChecked === 0) {
    rows.push({
      section: 'MK6',
      title: 'Plans re-checked',
      line: 'Upload a campaign brief on Ask and it is re-read against every update — each claim supported, contradicted or untested, with what moved since you uploaded it.',
      // UNTOUCHED BY THE RULING: "You, on Ask" is the reader and a page of
      // theirs, which is the client branch of WP19's split — the act, named
      // where they do it. The ruling is about OUR queue names.
      closes: 'You, on Ask',
    })
  }
  return rows
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
  const month = monthStartOf(readingAt)
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

  // AFTER THE EMPTY STATE, NOT BEFORE IT. The record's window is this month
  // whatever the page finds, so it can start as soon as the page is going to be
  // drawn at all — but not sooner: a tenant with no delivered update returns
  // above, and starting the record there would spend eight service-role reads
  // on a page that draws nothing and would force `readingHandle`'s lazily built
  // service-role client (lib/reading/read.ts) into existence to do it. Overview
  // makes the same call in the same place, for the same reason.
  const recordAhead = loadRecordInputs(reading.client, clientId, recordWindow(month, readingAt), { now: readingAt })
  recordAhead.catch(() => {})

  const runId = latestRun.id
  const monthStatus = freezeStateFor(month, readingAt)

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
        .select('id, lineage_id, title, type, status, created_at, run_id, based_on, reasoning, hero_quote')
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
  const shownRows = ledgerRowsShown(adviceRows, requestedRow?.lineageId ?? null)

  // The market insights the drawn rows follow from. BY ID, not by run: a piece
  // of advice first made in June cites June's insights, and reading only the
  // latest update's would leave eleven of the twelve oldest rows with no
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
  const withAfterwards = readAfterwards(groundedRows, monthPoints, themeLabels)

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
    rows: await attachQuotes(supabase, withAfterwards, heroByLineage, evidenceByInsight, themeSlugById),
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
  const extras = await loadMovesExtras({
    supabase,
    reading,
    clientId,
    month,
    moves,
    subjectNames: new Map((subjects ?? []).filter((x) => x.status === 'active').map((x) => [x.id, x.name])),
    themeLabels,
  })
  const movesBlock: MovesBlock = {
    rows: moveRows,
    masthead: MOVES_MASTHEAD,
    unlock: MOVES_UNLOCK,
    recorded: moves != null,
    empty: moves == null ? MOVES_UNRECORDED : moveRows.length === 0 ? MOVES_EMPTY_MK4 : null,
    card: extras.card,
    readings: extras.readings,
  }

  // ── MK5 · how a move is made ───────────────────────────────────────────
  const claimEntries = ledgerRows(summary?.say_vs_hear ?? [], CLAIM_ROWS)
  const claims: ClaimRow[] = claimEntries.map((e, i) => ({
    id: `c${i}`,
    youSay: e.you_say,
    theySay: e.they_say,
    gap: e.gap,
    audience: e.audience,
    verdictLabel: e.audience === 'echoes' ? 'Echoed' : e.audience === 'contradicts' ? 'Pushed back' : 'Not taken up',
  }))
  // What the button acts on — see `acceptableRow`.
  const acceptable = acceptableRow(adviceRows, requestedRow)
  const plans = await plansAhead
  const ways: WaysBlock = {
    ways: waysOfMoving(
      acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null,
      plans.length,
    ),
    claims,
    claimsLine: claims.length === 0
      ? 'Nothing you have said in your own posts has been read against the conversation this update.'
      : `${fmtInt(claims.length)} ${claims.length === 1 ? 'claim' : 'claims'} of yours, read against what the conversation said back.`,
    claimsCaveat: CLAIMS_CAVEAT,
    acceptable: acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null,
    empty: null,
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
    masthead: MOVES_MASTHEAD,
    conclusions,
    advice,
    moves: movesBlock,
    ways,
    unlocks: { rows: unlockRows(plans.length) },
    record: { line: howSoundLine(recordInputs), lines: recordLines(recordInputs), href: '/dashboard/settings' },
    method: methodLines(recordInputs, { brand }),
    plans,
    plansEmpty: plans.length === 0 ? PLAN_EMPTY : null,
  }
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
): Promise<AdviceRow[]> {
  const audienceIdsFor = (r: AdviceRow) => [...new Set(r.basedOn.flatMap((id) => evidenceByInsight.get(id) ?? []))]
  const heroOf = (r: AdviceRow) => (heroByLineage.get(r.lineageId) ?? '').trim()
  const ids = [...new Set(rows.filter((r) => heroOf(r).length > 0).flatMap(audienceIdsFor))]
  if (ids.length === 0) return [...rows]

  const byAudience = await fetchQuotesByAudience(supabase, ids).catch((error: unknown) => {
    console.error(`[pages] market-surface.adviceQuotes: ${error instanceof Error ? error.message : String(error)}`)
    return new Map()
  })
  const pick = createCitedQuotePicker(byAudience, themeSlugById)
  return rows.map((r) => {
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
async function loadMoves(supabase: SupabaseClient, clientId: string): Promise<Move[] | null> {
  try {
    return await selectAll<Move>(() =>
      supabase.from(TABLE_MOVES).select('*').eq('client_id', clientId)
        .order('declared_at', { ascending: false }).order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** The tenant's subjects, for a move's "on what". Null before M4.
 *
 *  NAME AND ID ONLY. A move's row needs the subject's name and nothing else,
 *  and a `select('*')` here would pull the calibration columns into a page
 *  bundle for a string. */
type SubjectName = Pick<Subject, 'id' | 'name' | 'status'>

async function loadSubjects(supabase: SupabaseClient, clientId: string): Promise<SubjectName[] | null> {
  try {
    return await selectAll<SubjectName>(() =>
      supabase.from(TABLE_SUBJECTS).select('id, name, status').eq('client_id', clientId).order('id', { ascending: true }),
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
