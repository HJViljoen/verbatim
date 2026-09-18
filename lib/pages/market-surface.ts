import type { SupabaseClient } from '@supabase/supabase-js'

import { recStatus, REC_STATUS_LABEL, type RecStatus } from '../calibration'
import { gateTier, type GateTier } from '../curation'
import { fmtInt, monthName, shortDate } from '../format'
import { distinctVideos, groundedTier, insightTiers, labelsBySlug, ledgerRows, themeChips, tierCounts, type GroundingThemeRow, type ThemeChip } from '../market-tiles'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { fetchInsightsByIds, type ThemeBucketRow } from '../quotes'
import { inheritedStatus, isMissingRecDecisions, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { methodLines, type MethodLines } from '../reading/method'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals, type RecordInputs } from '../reading/record'
import type { ReadingHandle } from '../reading/read'
import { freezeStateFor, monthStartOf } from '../reading/monthly'
import type { MonthStatus } from '../reading/types'
import type { Scope } from '../renderables/types'
import { selectAll } from '../supabase-admin'
import { isMissingSubjects, TABLE_MOVES, TABLE_SUBJECTS, type Move, type Subject } from '../subjects/types'
import { MOVES_MASTHEAD, MOVES_UNLOCK, firstScoringMonth, longMonth, recordWindow } from './overview'
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

/** What MK1's per-row video count is a count out of — said once, under the
 *  rows, because every row's chip is a share of the same thing. */
export const CONCLUSIONS_CORPUS_LINE =
  'The videos behind a conclusion are counted over everything we have read for you, not over this month alone.'

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
}

export interface ConclusionsBlock {
  rows: ConclusionRow[]
  /** Every video this workspace has analysed, ever — the denominator the video
   *  count on each row is a count OUT OF. Null where it could not be read. */
  corpusVideos: number | null
  /** What that denominator is, in the reader's words. */
  corpusLine: string
  counts: { confirmed: number; early: number; archive: number }
  /** The conclusions below the evidence bar. Labelled, never hidden. */
  belowBar: number
  /** The sort actually used, said on the block rather than implied. */
  sortedBy: string
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
  owner: string
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
 * answer to that is the oldest thing first.
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
      decidedAt: decided?.decided_at ?? null,
    })
  }
  return rows.sort((a, b) => a.firstMade.localeCompare(b.firstMade) || a.lineageId.localeCompare(b.lineageId))
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
  return `You have acted on ${fmtInt(acted)} of ${fmtInt(total)} — every piece of advice this product has ever given you.`
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

/** Said when the decision ledger itself could not be read. The statuses then
 *  come off `recommendations.status`, which the next update rewrites. */
export const ADVICE_UNRECORDED =
  'Your decisions are not being written down for this workspace yet — a status set here survives only as long as the next update re-finds the row it is on.'

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
  'Declared moves are not recorded for this workspace yet, so this block has nothing to list — not even an empty list.'

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
export function waysOfMoving(acceptable: WaysBlock['acceptable']): WayRow[] {
  return [
    {
      key: 'card',
      title: 'Confirm this month’s card',
      how: 'Everything you published this month, with the claims you made in it, confirmed in one press as a move dated to the first of the month.',
      href: null,
      live: false,
      unlock: 'This month’s card is not built yet.',
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
      key: 'plan',
      title: 'Upload a plan',
      how: 'A campaign brief, re-checked against the conversation each month.',
      href: null,
      live: false,
      unlock: 'Plans re-checked are not built yet.',
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
export function unlockRows(): UnlockRow[] {
  return [
    {
      section: 'MK3',
      title: 'This month’s card',
      line: 'Everything you published this month that drew enough comment to read, the claims you made in it, and what those subjects did in each audience — confirmed in one press as a move.',
      owner: 'Verbatim engineering',
    },
    {
      section: 'MK6',
      title: 'Plans re-checked',
      line: 'An uploaded plan, its claims with their current verdicts, and what moved since — printed only where a verdict has held for two consecutive updates.',
      owner: 'Verbatim engineering',
    },
  ]
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
      // NO `reasoning`. It was selected, typed onto `AdviceRow` and rendered by
      // nothing: the mock's expanded ledger row with its "why" is not in this
      // package's plan, and a column carried into a page bundle for a field
      // nobody draws is weight with no reader. It comes back with the row that
      // draws it.
      supabase.from('recommendations')
        .select('id, lineage_id, title, type, status, created_at, run_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
    loadDecisions(supabase, clientId),
    supabase.from('run_summary').select('say_vs_hear').eq('client_id', clientId).eq('run_id', runId).maybeSingle(),
    selectAll<ThemeBucketRow & GroundingThemeRow>(() =>
      supabase.from('themes')
        .select('bucket, supporting_insight_ids, label, member_themes, evidence_count, video_evidence_count, rank_score')
        .eq('client_id', clientId).eq('run_id', themedRunId ?? runId).order('id'),
    ),
    loadMoves(supabase, clientId),
    loadSubjects(supabase, clientId),
    loadRegistryLabels(supabase, clientId),
    countAnalysedVideos(supabase, clientId),
  ])

  const insights = (insightRes.data ?? []) as InsightRow[]
  const summary = row<{ say_vs_hear: SayVsHearEntry[] | null }>(summaryRes, 'market-surface.runSummary')

  // ── MK1 · what we concluded ────────────────────────────────────────────
  const citedIds = new Set<string>()
  for (const mi of insights) for (const id of mi.evidence?.supporting_theme_ids ?? []) citedIds.add(id)
  const audienceRows = citedIds.size > 0
    ? await fetchInsightsByIds<{ id: string; theme: string; source_video_id: string | null }>(
        supabase, [...citedIds], 'id, theme, source_video_id',
      )
    : []
  const themeSlugById = new Map(audienceRows.map((a) => [a.id, a.theme]))
  const videoByInsight = new Map(audienceRows.map((a) => [a.id, a.source_video_id]))
  const chipLabels = labelsBySlug(bucketRows)

  const tierById = insightTiers(insights)
  const conclusionRows: ConclusionRow[] = insights.map((mi) => {
    const ids = mi.evidence?.supporting_theme_ids ?? []
    const slugs = new Set<string>()
    for (const id of ids) { const s = themeSlugById.get(id); if (s) slugs.add(s) }
    const videos = distinctVideos(ids, videoByInsight)
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

  const conclusions: ConclusionsBlock = {
    rows: conclusionRows.slice(0, CONCLUSIONS_SHOWN),
    corpusVideos,
    corpusLine: CONCLUSIONS_CORPUS_LINE,
    counts,
    belowBar: counts.archive,
    sortedBy: 'strongest evidence first, then by how many videos are behind it',
    empty: conclusionRows.length === 0 ? 'Conclusions land with your next update.' : null,
  }

  // ── MK2 · the advice, and what you decided ─────────────────────────────
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
  const advice: AdviceBlock = {
    rows: ledgerRowsShown(adviceRows, requestedRow?.lineageId ?? null),
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
  const movesBlock: MovesBlock = {
    rows: moveRows,
    masthead: MOVES_MASTHEAD,
    unlock: MOVES_UNLOCK,
    recorded: moves != null,
    empty: moves == null ? MOVES_UNRECORDED : moveRows.length === 0 ? MOVES_EMPTY_MK4 : null,
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
  const ways: WaysBlock = {
    ways: waysOfMoving(acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null),
    claims,
    claimsLine: claims.length === 0
      ? 'Nothing you have said in your own posts has been read against the conversation this update.'
      : `${fmtInt(claims.length)} ${claims.length === 1 ? 'claim' : 'claims'} of yours, read against what the conversation said back.`,
    claimsCaveat: CLAIMS_CAVEAT,
    acceptable: acceptable ? { lineageId: acceptable.lineageId, recommendationId: acceptable.recommendationId, title: acceptable.title } : null,
    empty: null,
  }

  // ── the record ─────────────────────────────────────────────────────────
  // NO VERDICTS TO REFUSE. Nothing on this surface is a banded comparison — the
  // conclusions are the model's, the ledger's dates are dates, and a move with
  // one reading prints a month rather than a direction — so the refusal counter
  // is zero honestly rather than unset.
  const recordInputs: RecordInputs = {
    ...(await recordAhead),
    comparisonsRefused: countRefused([]),
    refusals: refusals([]),
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
    unlocks: { rows: unlockRows() },
    record: { line: howSoundLine(recordInputs), lines: recordLines(recordInputs), href: '/dashboard/settings' },
    method: methodLines(recordInputs, { brand }),
  }
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
