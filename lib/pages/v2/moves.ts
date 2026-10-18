import { marketConversationHref, marketSubjectHref } from '../../nav'
import { ADVICE_RECORD_PATH, MOVES_PATH, advicePath, movePath } from './moves-address'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { RecStatus } from '../../calibration'
import { currentTopLineage, recUpdateOf, recUpdateTimes } from '../../dashboard-tiles'
import { longMonth, platformLabel, shortDate } from '../../format'
import { distinctVideos } from '../../market-tiles'
import { PLAN_VERDICT_LABEL, loadPlanChecks, type PlanCheckCard, type PlanClaimRow } from '../../ask/plan-cards'
import { fetchInsightsByIds } from '../../quotes'
import { groundingFor, GROUNDED_BASIS } from '../../reading/afterwards'
import { pairedVerdict } from '../../reading/bands'
import { joins, pairOnVerdict } from '../../reading/comparability'
import { loadAppPairOn } from '../../reading/gather-flags'
import { marketAudiences, pooledDenominators } from '../../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { freezeStateFor } from '../../reading/monthly'
import { joinedRun, type PairOn } from '../../reading/pairs'
import { loadMonthSeries, type ReadingHandle } from '../../reading/read'
import { MONTH_PARAM } from '../../reading/reading-month'
import { inlineMonth, readingMonthLabel } from '../../reading/month-label'
import { loadDeliveredRuns, loadMarketRivalAudiences, loadReadingSchedule, readingViewFrom } from '../../reading/reading-view'
import type { MonthStatus } from '../../reading/types'
import { priorPrintable, type RefusedReason, type Verdict } from '../../reading/verdicts'
import { REFUSAL_WHY } from '../../reading/record'
import type { Quote, Scope } from '../../renderables/types'
import { selectAll } from '../../supabase-admin'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../../chunk'
import { FAILED_EXPLAINED, subjectCalibration } from '../../subjects/calibration-state'
import { earliestMoveDay } from '../../subjects/move-day'
import type { MoveStatus } from '../../subjects/types'
import { adviceShortlist, adviceVectors, currentAdvice } from '../advice-shortlist'
import { adviceTitle, streakLabel, UNTITLED_ADVICE, type AdviceHistory } from './advice-words'
import type { MoveDating } from '../date-move'
import { fetchRunningRunIds } from '../latest-video-run'
import { loadRegistryLabels } from '../registry-labels'
import {
  buildAdviceRows,
  buildQuestions,
  countAnalysedVideos,
  LEDGER_ALL_CAP,
  lineageKey,
  loadDecisions,
  loadMoveDatable,
  loadMoves,
  loadQuestionThemes,
  loadSubjects,
  orderedTargets,
  registryIdsByInsight,
  type AdviceRow,
  type DatedMove,
  type InsightRow,
  type RecCopy,
  type SubjectName,
} from '../market-surface'
import { marketCalibration, type SubjectCalibrationWord } from '../overview-market/subjects'
import { row } from '../read'
import { fetchThemedRunId } from '../themed-run'

// YOUR MOVES, DESIGN v2 (depth plan T7; boards E6-Moves and E6-Moves-Open).
//
// The page at /dashboard/moves, page key `market` unchanged (that key, its
// blocks, `MARKET_BLOCKS` and `MarketSurfacePage` stay registered for stored
// snapshots and share links; this loader feeds the live route only). Top to
// bottom, as the board draws it:
//
//   ADVICE TO DECIDE ON. The current advice nobody has decided on, one card
//   per idea (`adviceShortlist`), strongest first: the priority, the type, the
//   title, the argument's lead, the videos it rests on (all time) and how many
//   updates in a row have raised it. Accept, Not for us, and Why, which opens
//   the advice in place (`?advice=<lineage>`): the full argument, what it
//   rests on (`based_on` resolved to the conclusions and rival findings it
//   cites), every update that raised it, its one comment (the only quote on
//   the page, one click down), and Accept with the day the change was made.
//
//   YOUR MOVES, AND WHAT HAPPENED AFTER. Each dated move with its status (and
//   the control that sets it), the market's level on what the move is about
//   from two months before the move to the reading month, and ONE banded
//   sentence: the month before the move against the latest month read since,
//   through a `Verdict` under the month-pair judge, or the latest level alone
//   where the judge refuses the pair.
//
//   WHAT YOU SAY (statements, read by the route behind `maySeeStatements`) and
//   YOUR PLAN, CHECKED: the newest plan's counts, what changed since it was
//   uploaded, and its lead claims.
//
//   WHAT WE CONCLUDED: the latest update's market insights, each tagged with
//   the current advice that cites it, and the advice record
//   (`?advice=all`): every piece of advice and what you decided, as a list.
//
// "WOULD MOVE" (the parity pass, 13 Oct): each card names the conversation
// its evidence leads with, the one a move made on it is read on once dated
// (`adviceTargets`), with that conversation's level in the reading month: the
// board's "22% of this week's videos" read as the month's (decision 1). It
// shares the moves' reads (one themes read, one labels read, one month
// series), so it costs no extra round trip.
//
// WHAT IS NOT HERE, AND WHY. No quote at level 1 (Heinrich's v2 rule). No week
// figure (decision 1): nothing on this page is read over a week. No "See the
// 63 videos": no route lists a piece of advice's videos. No verdict WORD on a
// statement (a follow-up in the plan); the largest stance prints as a level
// instead.
//
// THE BOARD'S LAYOUT IS FIXED (the parity pass, 13 Oct): every section keeps
// its card in every data state, and the gap shows inside it. A move's chart
// is drawn on its axis whatever was read (`moveAxis`); the moves keep two
// across (the next move's card beside an odd last one); the advice keeps
// three across (the record's card in the columns left); the plan card is
// drawn with no plan; the conclusions keep their card.

// ---- the addresses ------------------------------------------------------------------
//
// NOTHING OPENS IN PLACE (levels as pages, 17 Oct; the G6 boards). A piece of
// advice, the advice record and a dated move are pages of their own, written
// once in ./moves-address.ts; an old `?advice=` (and the `?item=`, `?rec=`,
// `?ledger=` before it) lands on its page through `redirectFor` before the
// root reads anything.

export { MOVES_PATH }
/** A piece of advice's page (its lineage, or a recommendation id). Every
 *  link to one goes through here: the root's cards and conclusions, the
 *  switcher, the Dashboard's tile and the weekly email's line. */
export const adviceHref = advicePath
/** The advice record's page. */
export const RECORD_HREF = ADVICE_RECORD_PATH
/** The anchor a conclusion's row carries, so "what it rests on" can land on it. */
export const conclusionAnchor = (id: string): string => `conclusion-${id}`

// ---- the shapes ---------------------------------------------------------------------

/** The board's three advice cards. */
export const ADVICE_CARDS_SHOWN = 3

/**
 * The advice waiting for a decision: every idea the latest update raised that
 * nobody has decided on, one row per idea (`adviceShortlist`, folded by the
 * vectors where there are any), uncapped, in the ledger's order. Pure; the one
 * list the page's "N pieces of advice waiting" and the Dashboard tile both
 * count.
 */
export function waitingAdvice<R extends AdviceRow>(rows: readonly R[], vectors: ReadonlyMap<string, number[]> | null): R[] {
  const list = adviceShortlist(rows, vectors ? (id) => vectors.get(id) : null, { shown: Number.MAX_SAFE_INTEGER })
  const byLineage = new Map(rows.map((r) => [r.lineageId, r]))
  return list.lineages.map((id) => byLineage.get(id)).filter((r): r is R => r != null && r.status === 'new')
}


/** The dots under "updates in a row": the board's nine. */
export const HISTORY_DOTS = 9

/** One thing a piece of advice rests on: a conclusion about the market, or a
 *  finding about a rival. */
export interface RestsOnRow {
  id: string
  kind: 'market' | 'rival'
  /** Stored model prose: `pass_d_a_insight` or `pass_c_finding`. */
  title: string
  /** Distinct videos behind a market conclusion, all time. Null for a rival
   *  finding (nothing counts its videos) and where nothing resolved. */
  videos: number | null
  /** The conclusion's row on this page, where it is the latest update's. */
  anchor: string | null
}

export interface AdviceCard {
  lineageId: string
  /** The newest copy: what a status write names. */
  recommendationId: string
  /** Stored, `pass_d_b_recommendation` (`adviceTitle`): the stored title,
   *  else its body's first clause, else `UNTITLED_ADVICE` (`untitled`). */
  title: string
  /** The stored title and body were both blank: the words are the page's,
   *  not the model's. */
  untitled?: boolean
  kind: string
  priority: string | null
  /** Pass D-b's whole argument, scrubbed at write time and again at read. */
  why: string | null
  status: RecStatus
  statusLabel: string
  decidedAt: string | null
  /** `YYYY-MM-DD`. */
  firstMade: string
  /** Distinct videos behind it, all time; null where nothing was recorded;
   *  `pruned` where the evidence was replaced by a later update. */
  grounded: { videos: number; pruned: boolean } | null
  history: AdviceHistory
  restsOn: RestsOnRow[]
  /** Its one comment, vouched and through the quote gate: the open panel's
   *  only, so null on every card that is not open. */
  quote: Quote | null
  /** Where and when that comment was written ("Instagram · 8 Oct"): the
   *  comment's video's platform and its day. Absent with no quote. */
  quoteCite?: { platform: string | null; date: string | null } | null
  /** "Would move" (board E6-Moves): the conversation its evidence leads with,
   *  which is the one a move made on it is read on once dated
   *  (`adviceTargets`), with that conversation's level in the market in the
   *  reading month. Null where its evidence leads to no conversation read
   *  month by month; absent in a dump from before it (nothing is drawn). */
  aim?: AdviceAim | null
}

/** What a piece of advice would move, and where that stands this month. */
export interface AdviceAim {
  /** A theme's label: stored model prose, `pass_b_theme`. */
  label: string
  /** The reading month, `YYYY-MM-01`. */
  month: string
  /** Its videos out of the market's that month; null where the month has no
   *  reading of it. */
  level: { k: number; n: number } | null
}

/** A month on a move's line. */
export interface MovePoint {
  month: string
  role: 'before' | 'move' | 'after'
  k: number
  n: number
  /** The month is still under way: drawn hollow, "so far". */
  soFar: boolean
}

export interface MoveCard {
  id: string
  /** The client's own words. */
  title: string
  kind: 'subject' | 'theme' | 'advice'
  status: MoveStatus
  /** `YYYY-MM-DD`: the day the change was made (MF5), else declared. */
  day: string
  /** What it is on: a subject's name or a theme's label. Null where the move
   *  names nothing the market is read on month by month. */
  label: string | null
  /** The move's own page (`/dashboard/moves/<id>`): its title and Open go
   *  there. */
  href: string
  /** Where what it is on opens (board G6, decision 4): Market's subject page,
   *  or the conversation's (a theme move's one theme, an advice move's
   *  leading theme), on the month view of the reading month. Null where the
   *  move names nothing Market reads. */
  onHref: string | null
  /** What its line is read on: a subject's id or a theme's registry id
   *  (an advice move's leading theme). Null where it names nothing read
   *  month by month; absent in a dump from before it. */
  object?: { kind: 'subject' | 'theme'; id: string } | null
  /** More of this (`up`) or less (`down`): the badge's favourable side. */
  direction: 'up' | 'down'
  /** The months a reader may print side by side (`joinedRun` around the
   *  move's month), from two before the move to the reading month. */
  points: MovePoint[]
  /** The month before the move against the latest month read since, banded.
   *  Null where either side was not read. */
  compare: { before: MovePoint; after: MovePoint; verdict: Verdict } | null
  /** Why there is no line: a subject that is not ready, several themes, or
   *  nothing the market is read on. Null where there is one. */
  unread: 'not_measured' | 'not_ready' | 'several' | 'nothing' | 'no_reading' | null
  /** The move's own month, where it is after the reading month: the line
   *  holds the months before it, and its month reads with its own reading. */
  pending: string | null
  /** The months on the line's axis, up to the reading month, that are not
   *  drawn, and why: `cut` (read, but not the same way as the months drawn:
   *  `joinedRun` stopped at it) or `unread` (no reading of it). Absent in a
   *  dump from before it. */
  gaps?: { month: string; why: 'cut' | 'unread'; reason?: RefusedReason | null }[]
}

export interface ConclusionView {
  id: string
  /** Stored, `pass_d_a_insight`. */
  title: string
  /** Distinct videos behind it, all time. */
  videos: number
  /** The current advice that cites it. */
  advice: { lineageId: string; title: string }[]
}

export interface RecordRow {
  lineageId: string
  title: string
  kind: string
  firstMade: string
  /** Updates that have raised it. */
  updates: number
  status: RecStatus
  statusLabel: string
  decidedAt: string | null
  /** The latest update raised it. */
  current: boolean
}

export interface MovesPageData {
  brand: string
  /** The reading month, `YYYY-MM-01`. */
  month: string
  /** Decision 3: "the last full month" where `month` is not the current
   *  calendar month at `readingAt` (`readingMonthLabel`), else null: the
   *  bar and each move's latest month print it. Optional: a dump from before
   *  it carries none. */
  monthLabel?: string | null
  monthStatus: MonthStatus
  readingAt: string
  /** The reader may accept, decline, date and set a move's status. */
  canDecide: boolean
  counts: { waiting: number; dated: number; plans: number }
  advice: {
    /** The first `ADVICE_CARDS_SHOWN` pieces waiting (the board's three). */
    cards: AdviceCard[]
    /** Pieces waiting past the cards: "N more waiting", into the record. */
    more: number
    /** Every piece of advice, and how many have been decided. */
    total: number
    acted: number
  }
  moves: { cards: MoveCard[]; recorded: boolean }
  plan: PlanCheckCard | null
  conclusions: ConclusionView[]
  dating: MoveDating | null
  /** The reads that failed on this load: each section says so in one line
   *  rather than print the failure as an absence ("no plan", "no
   *  conclusions", "would move nothing"). Absent in a dump from before it. */
  failed?: Partial<Record<'moves' | 'aims' | 'plan' | 'conclusions', true>>
}

// ---- the pure half ------------------------------------------------------------------

/**
 * How long one piece of advice has been raised, in updates.
 *
 * AN UPDATE IS ONE THAT CARRIED ADVICE: its copies' `run_id` (`recUpdateOf`),
 * dated by when it wrote them (`recUpdateTimes`). "In a row" is counted back
 * from the latest such update, so a run whose advice step wrote nothing is not
 * a break, and advice the latest update did not raise has no streak. Pure.
 */
export function adviceHistory(lineageId: string, copies: readonly RecCopy[]): AdviceHistory {
  const times = recUpdateTimes(copies)
  const updates = [...times.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  const carried = new Set(copies.filter((c) => lineageKey(c) === lineageId).map(recUpdateOf))
  const dates = updates.filter(([u]) => carried.has(u)).map(([, t]) => t.slice(0, 10))
  let streak = 0
  for (let i = updates.length - 1; i >= 0 && carried.has(updates[i][0]); i--) streak++
  const since = streak > 0 ? updates[updates.length - streak][1].slice(0, 10) : null
  const recent = updates.slice(-HISTORY_DOTS).map(([u]) => carried.has(u))
  return { dates, streak, since, recent }
}

/**
 * What a piece of advice rests on, in the order it cites them: each market
 * conclusion with the videos behind it (all time), each rival finding by its
 * title. An id that resolves to neither (pruned by a later update) is left
 * out. Pure.
 */
export function restsOnRows(input: {
  basedOn: readonly string[]
  market: ReadonlyMap<string, { title: string; evidence: readonly string[] }>
  rival: ReadonlyMap<string, { title: string }>
  videoByInsight: Map<string, string | null>
  /** The latest update's conclusions, drawn on this page. */
  onPage: ReadonlySet<string>
}): RestsOnRow[] {
  const out: RestsOnRow[] = []
  for (const id of [...new Set(input.basedOn)]) {
    const m = input.market.get(id)
    if (m) {
      const videos = distinctVideos(m.evidence, input.videoByInsight)
      out.push({ id, kind: 'market', title: m.title, videos: videos > 0 ? videos : null, anchor: input.onPage.has(id) ? conclusionAnchor(id) : null })
      continue
    }
    const r = input.rival.get(id)
    if (r) out.push({ id, kind: 'rival', title: r.title, videos: null, anchor: null })
  }
  return out
}

/** The latest update's conclusions, each with the current advice citing it,
 *  most videos first. Pure. */
export function conclusionViews(
  insights: readonly { id: string; title: string; evidence: InsightRow['evidence'] }[],
  advice: readonly (Pick<AdviceRow, 'lineageId' | 'title' | 'basedOn'> & { why?: string | null })[],
  videoByInsight: Map<string, string | null>,
  shown = CONCLUSIONS_MAX,
): ConclusionView[] {
  return insights
    .map((mi) => ({
      id: mi.id,
      title: mi.title,
      videos: distinctVideos(mi.evidence?.supporting_theme_ids ?? [], videoByInsight),
      advice: advice.filter((a) => a.basedOn.includes(mi.id)).map((a) => ({ lineageId: a.lineageId, title: adviceTitle(a.title, a.why) })),
    }))
    .sort((a, b) => (b.advice.length > 0 ? 1 : 0) - (a.advice.length > 0 ? 1 : 0) || b.videos - a.videos || a.id.localeCompare(b.id))
    .slice(0, shown)
}

export const CONCLUSIONS_MAX = 8

/** The advice record: every piece of advice, in the ledger's order. Pure. */
export function recordRows(rows: readonly AdviceRow[], cap = LEDGER_ALL_CAP): RecordRow[] {
  return rows.slice(0, cap).map((r) => ({
    lineageId: r.lineageId,
    title: adviceTitle(r.title, r.why),
    kind: r.kind,
    firstMade: r.firstMade,
    updates: r.timesMade,
    status: r.status,
    statusLabel: r.statusLabel,
    decidedAt: r.decidedAt,
    current: r.inLatest === true,
  }))
}

/** A move as the page reads it: `select('*')` plus MF5's day and its status. */
type MoveRowIn = Pick<DatedMove, 'id' | 'kind' | 'subject_id' | 'registry_ids' | 'lineage_id' | 'title' | 'declared_at' | 'status' | 'direction'> & { dated_on?: string | null }

/** Months drawn before a move's own month. */
export const MOVE_MONTHS_BEFORE = 2
/** Months drawn after it, at most (the line stops at the reading month). */
export const MOVE_MONTHS_AFTER = 6

/**
 * Each move, read in the market from two months before it to the reading
 * month, with the one comparison it earns. Pure.
 *
 * THE LEVELS ARE Y4's (lib/pages/market-surface.ts `moveMarketReads`): the
 * market's videos on the move's subject or theme each month, pooled over the
 * category and the tracked brands, out of the market's videos that month. A
 * subject that is not ready is not read; a theme move names one theme or none;
 * an advice move reads the theme its evidence leads with.
 *
 * WHAT MAY BE PRINTED SIDE BY SIDE (T0a, the one condition): the run of months
 * around the move's month that no refused step crosses (`joinedRun`), so a
 * month across a change of ours, or a month still under way, is not drawn
 * beside the move's. The move's month always prints.
 *
 * THE ONE SENTENCE: the month before the move against the latest month in
 * that run, through `pairedVerdict` under the month-pair judge for the span.
 * A refused pair keeps its later level and no earlier one (`priorPrintable`).
 * Nothing here says the move did it.
 */
export function moveCards(input: {
  moves: readonly MoveRowIn[]
  /** The reading month. */
  month: string
  /** Now, for "so far". */
  now: string
  subjects: ReadonlyMap<string, { name: string; calibration: SubjectCalibrationWord }>
  themes: ReadonlyMap<string, string>
  adviceTargets: ReadonlyMap<string, string>
  levels: (kind: 'subject' | 'theme', id: string, month: string) => number | null
  n: (month: string) => number | null
  /** One calendar step on the market read the same way. Omitted: every step. */
  joined?: (prevMonth: string, month: string) => boolean
  /** The month-pair judge on the market, for the comparison's span. */
  pair?: PairOn | null
}): MoveCard[] {
  const reading = monthStartOf(input.month)
  const joined = input.joined ?? (() => true)
  const order: Record<string, number> = { active: 0, done: 1, dropped: 2 }
  // Why a failed subject shows no figure is said once a page (14 Oct, the
  // lead's ruling): its first card here says FAILED_EXPLAINED, any later one
  // on the same subject only that it is not measured yet.
  const explained = new Set<string>()
  return [...input.moves]
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || moveDay(b).localeCompare(moveDay(a)) || a.id.localeCompare(b.id))
    .map((m): MoveCard => {
      const day = moveDay(m)
      const moveMonth = monthStartOf(day)
      const subject = m.kind === 'subject' && m.subject_id ? input.subjects.get(m.subject_id) ?? null : null
      const themeIds = m.registry_ids ?? []
      const themeId = m.kind === 'theme' ? (themeIds.length === 1 ? themeIds[0] : null)
        : m.kind === 'advice' && m.lineage_id ? input.adviceTargets.get(m.lineage_id) ?? null : null
      const object: { kind: 'subject' | 'theme'; id: string } | null =
        subject && m.subject_id ? { kind: 'subject', id: m.subject_id } : themeId ? { kind: 'theme', id: themeId } : null
      const label = subject?.name ?? (object?.kind === 'theme' ? input.themes.get(object.id) ?? null : null)
      const notReady = subject != null && subject.calibration !== 'ready'
      // What it is on opens on Market (decision 4), on the reading month's
      // view: the month a move's line is read to.
      const onMarket = { period: 'month', month: reading }
      const onHref = object?.kind === 'subject' ? marketSubjectHref(object.id, onMarket)
        : object?.kind === 'theme' ? marketConversationHref(object.id, onMarket) : null
      const base = {
        id: m.id,
        title: m.title,
        kind: m.kind,
        status: (m.status ?? 'active') as MoveStatus,
        day,
        label,
        href: movePath(m.id),
        onHref,
        object,
        direction: (m.direction === 'down' ? 'down' : 'up') as 'up' | 'down',
      }
      if (!object || notReady) {
        // Ruling U6: a subject whose check is open is "not measured yet"; only
        // a failed one is being re-described.
        const failedFirst = notReady && subject?.calibration === 'failed' && m.subject_id != null && !explained.has(m.subject_id)
        if (failedFirst) explained.add(m.subject_id!)
        const unread: MoveCard['unread'] = notReady ? (failedFirst ? 'not_ready' : 'not_measured')
          : m.kind === 'theme' && themeIds.length > 1 ? 'several' : 'nothing'
        return { ...base, points: [], compare: null, unread, pending: null }
      }
      // Two months before the move to the reading month, at most six after.
      const months: { month: string; role: MovePoint['role'] }[] = []
      let at = moveMonth
      for (let i = 0; i < MOVE_MONTHS_BEFORE; i++) at = prevMonth(at)
      for (let i = 0; at <= reading && i < MOVE_MONTHS_BEFORE + 1 + MOVE_MONTHS_AFTER; i++) {
        months.push({ month: at, role: at < moveMonth ? 'before' : at === moveMonth ? 'move' : 'after' })
        at = nextMonth(at)
      }
      const read: MovePoint[] = months.flatMap((x) => {
        const n = input.n(x.month)
        const k = input.levels(object.kind, object.id, x.month)
        return n != null && n > 0 && k != null ? [{ ...x, k, n, soFar: monthOpen(x.month, input.now) }] : []
      })
      // A move dated after the reading month (an October move while the page
      // reads September) draws the months before it, run back from the
      // newest, and reads its own month once that month is read.
      const pending = moveMonth > reading
      const anchor = pending ? read[read.length - 1]?.month ?? null : moveMonth
      const points = anchor ? joinedRun(read, anchor, joined) : []
      // The axis's months that are not drawn, and why (the line's one quiet
      // line under it says so).
      const drawn = new Set(points.map((p) => p.month))
      const wasRead = new Set(read.map((p) => p.month))
      // A month read but not drawn is cut by the refused step at the run's
      // near edge; that step's reason is the record's (`pairOnVerdict`).
      const first = points[0]?.month ?? null
      const last = points[points.length - 1]?.month ?? null
      const stepReason = (prev: string, next: string): RefusedReason | null =>
        input.pair ? pairOnVerdict(input.pair(prev, next, 'market')).refused : null
      const gaps = months.filter((x) => !drawn.has(x.month)).map((x) => {
        if (!wasRead.has(x.month)) return { month: x.month, why: 'unread' as const }
        const reason = first && x.month < first ? stepReason(prevMonth(first), first)
          : last && x.month > last ? stepReason(last, nextMonth(last)) : null
        return { month: x.month, why: 'cut' as const, reason }
      })
      if (pending) return { ...base, points, compare: null, unread: null, pending: moveMonth, gaps }
      if (points.length === 0) return { ...base, points: [], compare: null, unread: 'no_reading' as const, pending: null }
      const before = points.find((p) => p.month === prevMonth(moveMonth)) ?? null
      const after = [...points].reverse().find((p) => p.role !== 'before') ?? null
      const compare = before && after
        ? {
            before,
            after,
            verdict: pairedVerdict({
              objectKind: object.kind,
              objectId: object.id,
              objectLabel: label ?? object.id,
              audience: 'market',
              window: { kind: 'month', from: after.month, to: nextMonth(after.month) },
              basis: { from: before.month, to: nextMonth(before.month) },
              value: { k: after.k, n: after.n },
              baseline: { k: before.k, n: before.n },
            }, input.pair ? input.pair(before.month, after.month, 'market') : null),
          }
        : null
      return { ...base, points, compare, unread: null, pending: null, gaps }
    })
}

/** One month slot on a move's axis. */
export interface MoveSlot {
  month: string
  /** The month's reading, where it is drawn. */
  point: MovePoint | null
  /** Why a slot is empty: after the reading month (`pending`), not read the
   *  same way as the months drawn (`cut`), no reading (`unread`), a move with
   *  no line at all (`move`: its own sentence says why), or a dump that does
   *  not say (`unknown`). Null on a drawn slot. */
  why: 'pending' | 'cut' | 'unread' | 'move' | 'unknown' | null
  /** A cut month's refusal, where the record names it. */
  reason?: RefusedReason | null
}

/**
 * A move's axis, as the board draws it whatever the data: two months before
 * the move's month to the later of the reading month and the move's own (at
 * most `MOVE_MONTHS_BEFORE + 1 + MOVE_MONTHS_AFTER` slots), each month with
 * its reading where it is drawn and, where it is not, why. A move with one
 * month read, or none, keeps the board's chart: the months it has on the
 * axis, the rest as empty slots. Pure; it reads the card alone, so a dump from
 * before `gaps` draws too.
 */
export function moveAxis(card: Pick<MoveCard, 'day' | 'points' | 'unread' | 'gaps'>, readingMonth: string): MoveSlot[] {
  const moveMonth = monthStartOf(card.day)
  const reading = monthStartOf(readingMonth)
  let at = moveMonth
  for (let i = 0; i < MOVE_MONTHS_BEFORE; i++) at = prevMonth(at)
  const last = [moveMonth, reading, ...card.points.map((p) => p.month)].reduce((a, b) => (b > a ? b : a))
  const byMonth = new Map(card.points.map((p) => [p.month, p]))
  const gap = new Map((card.gaps ?? []).map((g) => [g.month, g]))
  const out: MoveSlot[] = []
  for (let i = 0; at <= last && i < MOVE_MONTHS_BEFORE + 1 + MOVE_MONTHS_AFTER; i++) {
    const point = byMonth.get(at) ?? null
    const g = gap.get(at)
    out.push({
      month: at,
      point,
      why: point ? null : card.unread ? 'move' : at > reading ? 'pending' : g?.why ?? 'unknown',
      ...(!point && g?.reason ? { reason: g.reason } : {}),
    })
    at = nextMonth(at)
  }
  return out
}

/** The quiet line under a move's chart: why its empty months are empty, in
 *  the record's words (`REFUSAL_WHY`, the badge's and the record's clause for
 *  a refused comparison) and the page's own for a month still to read
 *  (`pendingLine`). A move with no line at all says why in its own sentence.
 *  Null where every slot is drawn. */
export function axisLine(slots: readonly MoveSlot[]): string | null {
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const names = (xs: readonly MoveSlot[]) => list(xs.map((s) => longMonth(s.month)))
  const be = (xs: readonly unknown[]) => (xs.length === 1 ? 'is' : 'are')
  const parts: string[] = []
  const cut = slots.filter((s) => s.why === 'cut' || s.why === 'unknown')
  // One sentence per reason: "August is left off the line: what we track
  // changed inside this window."
  const byReason = new Map<string, MoveSlot[]>()
  for (const s of cut) byReason.set(s.reason ?? '', [...(byReason.get(s.reason ?? '') ?? []), s])
  for (const [reason, xs] of byReason) {
    const why = reason ? REFUSAL_WHY[reason as RefusedReason] : null
    parts.push(`${names(xs)} ${be(xs)} left off the line${why ? `: ${why}` : ''}`)
  }
  const unread = slots.filter((s) => s.why === 'unread')
  if (unread.length > 0) parts.push(`${names(unread)} ${unread.length === 1 ? 'has' : 'have'} no reading`)
  const pending = slots.filter((s) => s.why === 'pending')
  if (pending.length > 0) parts.push(pending.length === 1 ? pendingLine(pending[0].month).slice(0, -1) : `${names(pending)} read once each month has been read`)
  if (parts.length === 0) return null
  return parts.map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)}.`).join(' ')
}

/**
 * What each piece of advice would move (board E6-Moves' "Would move"): the
 * conversation its evidence leads with (`targets`, the read an advice move
 * makes once dated), named by its label, with its level in the market in the
 * reading month. Null where the evidence leads to no conversation, or to one
 * with no label. Pure.
 */
export function adviceAims(input: {
  lineages: readonly string[]
  targets: ReadonlyMap<string, string>
  labels: ReadonlyMap<string, string>
  levels: (kind: 'theme', id: string, month: string) => number | null
  n: (month: string) => number | null
  month: string
}): Map<string, AdviceAim | null> {
  const month = monthStartOf(input.month)
  const out = new Map<string, AdviceAim | null>()
  for (const lineage of input.lineages) {
    const theme = input.targets.get(lineage)
    const label = theme ? input.labels.get(theme)?.trim() : null
    if (!theme || !label) {
      out.set(lineage, null)
      continue
    }
    const k = input.levels('theme', theme, month)
    const n = input.n(month)
    out.set(lineage, { label, month, level: k != null && n != null && n > 0 ? { k, n } : null })
  }
  return out
}

/** The day a move is read from: `dated_on` (MF5), else `declared_at`. */
export const moveDay = (m: { declared_at: string; dated_on?: string | null }): string => (m.dated_on ?? m.declared_at).slice(0, 10)

/** Whether a month has not ended yet at `now`. */
function monthOpen(month: string, now: string): boolean {
  return Date.parse(`${nextMonth(month)}T00:00:00.000Z`) > Date.parse(now)
}

// ---- the words ----------------------------------------------------------------------

export const PAGE_TITLE = 'Your moves'
export const ADVICE_TITLE = 'Advice to decide on'
export const ADVICE_SUB = 'For the business, not only for posting. Strongest first.'
export const ADVICE_NONE = 'Nothing is waiting for a decision'
export const ADVICE_GONE = 'The link you followed names a piece of advice this page no longer holds.'
/** The record's card, where fewer than three pieces wait (the board's row). */
export const ADVICE_REST = {
  kind: 'The advice record',
  title: 'Nothing else is waiting for a decision',
  lead: 'Every piece of advice we have given, and what you decided on each.',
}
/** "Would move:" where the evidence leads to no conversation read month by month. */
export const WOULD_MOVE_NOTHING = 'no conversation read month by month yet'
/** One section's line where its read failed on this load. */
export const READ_FAILED = 'could not be read just now'
/** The open panel's comment row where the advice carries no comment we can show. */
export const NO_QUOTE = 'No comment behind this advice can be shown here.'
export const MOVES_TITLE = 'Your moves, and what happened after'
export const MOVES_SUB = 'We show what the conversation did after a move. We never claim the move caused it.'
export const CONCLUSIONS_TITLE = 'What we concluded'
export const CONCLUSIONS_SUB = 'What the latest update concluded about your market, and the advice built on each'
export const NO_ADVICE_YET = 'No advice yet'
export const NO_CONCLUSIONS = 'The latest update drew no conclusions about your market.'
export const PLAN_TITLE = 'Your plan, checked against the market'
/** Where a plan is checked: the Agent's upload. */
export const CHECK_A_PLAN_HREF = '/dashboard/agent'
export const STATEMENTS_TITLE = 'What you say, and what comes back'
export const ASK_ABOUT = 'Ask the Agent about this'

// The advice's words a card, the Dashboard tile and the weekly email's line
// share, in a module that reads nothing (./advice-words.ts).
export { adviceTitle, streakLabel, UNTITLED_ADVICE, type AdviceHistory }


/** "3 pieces of advice waiting · 2 moves dated · 1 plan checked", as parts:
 *  each count is a figure the page marks. */
export function headerParts(c: MovesPageData['counts']): { n: number; words: string }[] {
  return [
    { n: c.waiting, words: c.waiting === 1 ? 'piece of advice waiting' : 'pieces of advice waiting' },
    { n: c.dated, words: c.dated === 1 ? 'move dated' : 'moves dated' },
    { n: c.plans, words: c.plans === 1 ? 'plan checked' : 'plans checked' },
  ]
}


/** What the card's status chip says. `dropped` is the stored value and a
 *  direction word (lib/calibration.ts), so the page calls it stopped. */
export const MOVE_STATUS_LABEL: Record<MoveStatus, string> = { active: 'Active', done: 'Done', dropped: 'Stopped' }


/** "Jul", "Oct so far": a line's month under its point. */
export const pointMonth = (p: Pick<MovePoint, 'month' | 'soFar'>): string => `${longMonth(p.month).slice(0, 3)}${p.soFar ? ' so far' : ''}`

/** A share as the line prints it: whole points, "11%". */
export const sharePct = (k: number, n: number): string => (n > 0 ? `${Math.round((100 * k) / n)}%` : '0%')

/** What a move with no line says instead. */
export const MOVE_UNREAD: Record<NonNullable<MoveCard['unread']>, string> = {
  // SUBJECT_NOT_MEASURED's words (ruling U6), in a sentence.
  not_measured: 'This subject is not measured yet: its line is drawn once its check has passed.',
  // A failed subject's one reason, the words every surface prints for it (14
  // Oct: displayed as a pending one is, FAILED_EXPLAINED where
  // SUBJECT_NOT_MEASURED would go).
  not_ready: FAILED_EXPLAINED,
  several: 'This move is on several themes, so no one line can be drawn for it.',
  nothing: 'This move names nothing the market is read on month by month.',
  no_reading: 'Your market has no reading of this yet.',
}

/** The page's reading month and its label (decision 3), as a move's
 *  sentence takes it. */
export interface ReadingLabel {
  month: string
  label?: string | null
}

/** The label a month on a move's line carries: the reading month's own,
 *  where the line's month IS the reading month (the latest month read). An
 *  earlier month on the line is named alone: "the month before" already says
 *  which it is. */
export function monthLabelOn(month: string, reading: ReadingLabel | null | undefined): string | null {
  if (!reading?.label) return null
  return monthStartOf(month) === monthStartOf(reading.month) ? reading.label : null
}

/** "the month before" or "in September, the month before"; the later month
 *  labelled where it is the reading month and not the current calendar month
 *  ("September, the last full month", decision 3). */
export function compareMonths(c: NonNullable<MoveCard['compare']>, moveMonth: string, reading?: ReadingLabel | null): { before: string; after: string } {
  const label = monthLabelOn(c.after.month, reading)
  const name = longMonth(c.after.month)
  const after = c.after.month === moveMonth
    ? (label ? `${inlineMonth(name, label)} and the month of the move` : `${name}, the month of the move`)
    : inlineMonth(`${name}${c.after.soFar ? ' so far' : ''}`, label)
  return { before: `${longMonth(c.before.month)}, the month before`, after }
}

/** The move card's frame where there is no move to fill it: beside an odd
 *  last move (the board's two across), or alone where none is dated. */
export const NEXT_MOVE = {
  title: 'Your next move',
  sub: 'Not dated yet',
  /** Said only where the reader may date one (an owner or an admin, where
   *  moves are recorded): no invitation otherwise. */
  line: 'Date a change when you make it, and its months are drawn here.',
}
/** The moves' card where the moves could not be read on this load. */
export const MOVES_UNREAD_TITLE = 'Your dated moves'
export const NO_MOVE_YET = {
  title: 'No move dated yet',
  sub: 'Your first move',
}

/**
 * Where there is no move, in Your moves' own words, for the Dashboard's
 * "After your move" panel (the merge, 13 Oct): the card's title, and its
 * invitation only where the reader may date a move (an owner or an admin,
 * where moves are recorded: `TopMoves.invite`). A member is told no move is
 * dated, never to accept or date anything. Pure.
 */
export function noMoveWords(invite: boolean): string {
  return invite ? `${NO_MOVE_YET.title}. ${NEXT_MOVE.line}` : `${NO_MOVE_YET.title}.`
}

/** What a move dated after the reading month says under its line. */
export const pendingLine = (month: string): string => `${longMonth(month)} reads once the month has been read.`

/** A quote's cite, "Instagram · 8 Oct", or null with nothing to say. */
export function quoteCiteLine(cite: AdviceCard['quoteCite']): string | null {
  if (!cite) return null
  const parts = [cite.platform ? platformLabel(cite.platform) : null, cite.date ? shortDate(cite.date) : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Whether the earlier month may print beside the later (the one condition). */
export const comparePrintable = (c: MoveCard['compare']): c is NonNullable<MoveCard['compare']> => c != null && priorPrintable(c.verdict)

/** The Agent, asked about one piece of advice. */
export const askAboutHref = (title: string): string =>
  `/dashboard/agent?ask=${encodeURIComponent(`What is behind the advice "${title}", and what would it change?`.slice(0, 300))}`

/** The plan card's lead claims: contradicted, then supported, then the rest,
 *  in the plan's order inside each. */
export function leadClaims(plan: PlanCheckCard, shown = PLAN_CLAIMS_SHOWN): PlanClaimRow[] {
  const rank: Record<string, number> = { contradicts: 0, echoes: 1, silent: 2 }
  return plan.claims
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (rank[a.c.verdict] ?? 3) - (rank[b.c.verdict] ?? 3) || a.i - b.i)
    .slice(0, shown)
    .map((x) => x.c)
}
export const PLAN_CLAIMS_SHOWN = 3
export { PLAN_VERDICT_LABEL, GROUNDED_BASIS }

/** The largest stance on a statement, as a level: "11 of 20 back it up". */
export function largestStance(s: { base: number; backs: number; doubts: number; asks: number } | null): { k: number; n: number; words: string } | null {
  if (!s || s.base <= 0) return null
  const parts = [
    { k: s.backs, words: 'back it up' },
    { k: s.doubts, words: 'doubt it' },
    { k: s.asks, words: 'ask about it' },
  ].sort((a, b) => b.k - a.k)
  return parts[0].k > 0 ? { ...parts[0], n: s.base } : null
}

// ---- the loader ---------------------------------------------------------------------

/** What the page's reads have in common with the Dashboard's tile. */
export interface Core {
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  readingAt: string
  brand: string
  latestRunId: string
  month: string
  monthStatus: MonthStatus
  copies: RecCopy[]
  adviceRows: AdviceRow[]
  moves: DatedMove[] | null
  subjects: SubjectName[] | null
  rivals: string[]
  marketN: (month: string) => number | null
  pair: PairOn
}

export const RECOMMENDATION_COLUMNS = 'id, lineage_id, title, type, status, priority, created_at, run_id, based_on, reasoning, hero_quote'

export async function readCore(scope: Scope): Promise<Core | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading = scope.reading
  const readingAt = new Date().toISOString()
  const [clientRes, latestRes, runs, schedule, history, rivalAudiences, copies, decisions, moves, subjects, pair] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('pipeline_runs').select('id, started_at')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    loadDeliveredRuns(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
    loadMonthSeries(reading.client, clientId, { from: '2019-01-01', to: readingAt, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, clientId),
    selectAll<RecCopy>(() =>
      supabase.from('recommendations').select(RECOMMENDATION_COLUMNS)
        .eq('client_id', clientId).order('created_at', { ascending: true }).order('id', { ascending: true }),
    ),
    loadDecisions(supabase, clientId),
    loadMoves(supabase, clientId),
    loadSubjects(supabase, clientId),
    loadAppPairOn(reading, readingAt),
  ])
  const latest = row<{ id: string; started_at: string }>(latestRes, 'moves-v2.latestRun')
  if (!latest) return null
  const client = row<{ company_name: string | null }>(clientRes, 'moves-v2.client')
  const view = readingViewFrom({
    now: readingAt,
    runs,
    denominators: history.denominators,
    rivalAudiences,
    schedule,
    explicit: scope.params[MONTH_PARAM] ?? null,
  })
  const month = view.reading.month
  const rivals = rivalAudiences ?? []
  const counts = pooledDenominators(history.denominators, rivals)
  return {
    supabase,
    clientId,
    reading,
    readingAt,
    brand: client?.company_name?.trim() || 'your brand',
    latestRunId: latest.id,
    month,
    monthStatus: freezeStateFor(month, view.reading.asAt ?? readingAt),
    copies,
    adviceRows: buildAdviceRows(copies, decisions),
    moves,
    subjects,
    rivals,
    marketN: (m) => counts.get(monthStartOf(m))?.videos ?? null,
    pair,
  }
}

/** The market insights and rival findings a set of advice cites, by id. A
 *  failed read is logged and read as none; `onError` lets a page that rests
 *  on it (a piece of advice's, a move's) say so instead. */
export async function readCited(supabase: SupabaseClient, clientId: string, ids: readonly string[], onError?: () => void): Promise<{
  market: Map<string, { title: string; evidence: string[] }>
  rival: Map<string, { title: string }>
}> {
  const unique = [...new Set(ids)]
  const market = new Map<string, { title: string; evidence: string[] }>()
  const rival = new Map<string, { title: string }>()
  if (unique.length === 0) return { market, rival }
  const parts = await mapWithLimit(chunk(unique, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const [m, c] = await Promise.all([
      selectAll<{ id: string; title: string; evidence: InsightRow['evidence'] }>(() =>
        supabase.from('market_insights').select('id, title, evidence').eq('client_id', clientId).in('id', part).order('id', { ascending: true }),
      ).catch((error: unknown) => {
        onError?.()
        return logAs('cited.market', [] as { id: string; title: string; evidence: InsightRow['evidence'] }[])(error)
      }),
      selectAll<{ id: string; title: string }>(() =>
        supabase.from('competitive_insights').select('id, title').eq('client_id', clientId).in('id', part).order('id', { ascending: true }),
      ).catch((error: unknown) => {
        onError?.()
        return logAs('cited.rival', [] as { id: string; title: string }[])(error)
      }),
    ])
    return { m, c }
  })
  for (const p of parts) {
    for (const r of p.m) market.set(r.id, { title: r.title, evidence: r.evidence?.supporting_theme_ids ?? [] })
    for (const r of p.c) if (!market.has(r.id)) rival.set(r.id, { title: r.title })
  }
  return { market, rival }
}

/** Each audience insight's video and theme slug, for the ids given. A failed
 *  read is logged and read as none; `onError` lets a page that rests on it
 *  say so instead. */
export async function readAudience(supabase: SupabaseClient, clientId: string, ids: readonly string[], opts: { kinds?: boolean; onError?: () => void } = {}): Promise<{ videoByInsight: Map<string, string | null>; slugById: Map<string, string>; kindById: Map<string, string | null> }> {
  type Row = { id: string; theme: string; source_video_id: string | null; category?: string | null }
  const rows = ids.length > 0
    ? await fetchInsightsByIds<Row>(supabase, [...new Set(ids)], opts.kinds ? 'id, theme, source_video_id, category' : 'id, theme, source_video_id', clientId)
      .catch((error: unknown) => {
        opts.onError?.()
        return logAs('audience', [] as Row[])(error)
      })
    : []
  return {
    videoByInsight: new Map(rows.map((r) => [r.id, r.source_video_id])),
    slugById: new Map(rows.map((r) => [r.id, r.theme])),
    kindById: new Map(rows.map((r) => [r.id, r.category ?? null])),
  }
}

/** Each move's object, month by month in the market, pooled (Y4's read). */
export async function readMoveLevels(core: Core, moves: readonly DatedMove[], adviceTargets: ReadonlyMap<string, string>, alsoThemes: readonly string[] = [], onError?: () => void, fromMonth?: string): Promise<(kind: 'subject' | 'theme', id: string, month: string) => number | null> {
  const audiences = marketAudiences(core.rivals)
  // From two months before the earliest move (or `fromMonth`, the advice
  // page's would-move line) to the reading month.
  const from = moves.reduce((m, x) => {
    let at = monthStartOf(moveDay(x))
    for (let i = 0; i < MOVE_MONTHS_BEFORE; i++) at = prevMonth(at)
    return at < m ? at : m
  }, monthStartOf(fromMonth && fromMonth < core.month ? fromMonth : core.month))
  const subjectIds = [...new Set(moves.filter((m) => m.kind === 'subject' && m.subject_id).map((m) => m.subject_id as string))]
  const themeIds = [...new Set([...moves.flatMap((m) =>
    m.kind === 'theme' && (m.registry_ids ?? []).length === 1 ? [(m.registry_ids as string[])[0]]
      : m.kind === 'advice' && m.lineage_id && adviceTargets.get(m.lineage_id) ? [adviceTargets.get(m.lineage_id) as string] : []), ...alsoThemes])]
  const levels = new Map<string, number>()
  const read = new Set<string>()
  const take = async (kind: 'subject' | 'theme', ids: string[]) => {
    if (ids.length === 0) return
    try {
      const set = await loadMonthSeries(core.reading.client, core.clientId, { audiences, objectKind: kind, objectIds: ids, from, to: core.month })
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
      onError?.()
      logAs('moveLevels', null)(error)
    }
  }
  await Promise.all([take('subject', subjectIds), take('theme', themeIds)])
  // A month the object has rows in some month of, with no row of its own, is
  // zero: the market was read and nothing on it carried the object. An object
  // with no row in any month was never read, which is not zero (Y4's rule).
  return (kind, id, m) => levels.get(`${kind}:${id}:${m}`) ?? (read.has(`${kind}:${id}`) && core.marketN(m) != null ? 0 : null)
}

/** Each piece of advice named (an advice move's, or a card's "Would move"),
 *  to the theme its evidence leads with. Reads the themed update's themes only
 *  where some lineage is named. */
export async function readAdviceTargets(core: Core, named: readonly string[], cited: Map<string, { evidence: string[] }>, onError?: () => void): Promise<Map<string, string>> {
  const lineages = [...new Set(named)]
  if (lineages.length === 0) return new Map()
  const themedRunId = await fetchRunningRunIds(core.supabase, core.clientId, 'moves-v2').then((ids) => fetchThemedRunId(core.supabase, core.clientId, ids, 'moves-v2'))
  const themes = await selectAll<{ supporting_insight_ids: string[] | null; registry_id: string | null }>(() =>
    core.supabase.from('themes').select('supporting_insight_ids, registry_id')
      .eq('client_id', core.clientId).eq('run_id', themedRunId ?? core.latestRunId).order('id'),
  ).catch((error: unknown) => {
    onError?.()
    return logAs('adviceTargets.themes', [] as { supporting_insight_ids: string[] | null; registry_id: string | null }[])(error)
  })
  const registryByInsight = registryIdsByInsight(themes)
  const out = new Map<string, string>()
  for (const lineageId of lineages) {
    const r = core.adviceRows.find((x) => x.lineageId === lineageId)
    if (!r) continue
    const target = orderedTargets(r.basedOn.flatMap((id) => cited.get(id)?.evidence ?? []), registryByInsight)[0]
    if (target) out.set(lineageId, target)
  }
  return out
}

/**
 * The moves' cards: each advice move's leading theme, then the labels of the
 * themes the moves name (only those: `loadRegistryLabels` by id) beside each
 * object's months in the market. With `aimAt` (the advice cards' lineages),
 * each card's "Would move" off the same reads: one themes read, one labels
 * read and one month series for the moves and the cards together.
 */
export async function readMoveCards(core: Core, moves: readonly DatedMove[], cited: Map<string, { evidence: string[] }>, aimAt: readonly string[] = []): Promise<{ cards: MoveCard[]; aims: Map<string, AdviceAim | null>; aimsFailed: boolean }> {
  if (moves.length === 0 && aimAt.length === 0) return { cards: [], aims: new Map(), aimsFailed: false }
  // A failed read under the aims is said as one ("could not be read just
  // now"), never printed as "no conversation".
  let aimsFailed = false
  const failed = () => { aimsFailed = true }
  const moveLineages = moves.filter((m) => m.kind === 'advice' && m.lineage_id).map((m) => m.lineage_id as string)
  const targets = await readAdviceTargets(core, [...moveLineages, ...aimAt], cited, failed)
  const aimThemes = aimAt.map((l) => targets.get(l)).filter((t): t is string => Boolean(t))
  const themeIds = [...moves.flatMap((m) => (m.kind === 'theme' ? m.registry_ids ?? [] : [])), ...targets.values()]
  const [themes, levels] = await Promise.all([
    loadRegistryLabels(core.supabase, core.clientId, themeIds, failed),
    readMoveLevels(core, moves, targets, aimThemes, failed),
  ])
  const aims = aimsFailed ? new Map<string, AdviceAim | null>() : adviceAims({ lineages: aimAt, targets, labels: themes, levels, n: core.marketN, month: core.month })
  const cards = moveCards({
    moves,
    month: core.month,
    now: core.readingAt,
    subjects: subjectsOf(core),
    themes,
    adviceTargets: targets,
    levels,
    n: core.marketN,
    joined: (prev, m) => joins(core.pair(prev, m, 'market')),
    pair: core.pair,
  })
  return { cards, aims, aimsFailed }
}

export function subjectsOf(core: Pick<Core, 'subjects'>): Map<string, { name: string; calibration: SubjectCalibrationWord }> {
  return new Map((core.subjects ?? []).filter((x) => x.status === 'active').map((x) => [x.id, { name: x.name, calibration: marketCalibration(subjectCalibration(x)) }]))
}

/** A read's failure, logged and turned into its honest absence. */
export function logAs<T>(what: string, fallback: T): (error: unknown) => T {
  return (error: unknown) => {
    console.error(`[pages] moves-v2.${what}: ${error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error)}`)
    return fallback
  }
}

/**
 * Your moves, for one tenant. Null is the first-run empty state: no delivered
 * update, so no advice, no conclusions and no reading month.
 *
 * `params.advice` is the page's one selection (a lineage, a recommendation id
 * from an old `?rec=` link, or `all`); `options.canDecide` is the reader's
 * role (`mayDecideMoves`), which decides whether the controls are drawn.
 */
export async function loadMovesPage(scope: Scope, options: { canDecide: boolean }): Promise<MovesPageData | null> {
  const core = await readCore(scope)
  if (!core) return null
  const { supabase, clientId } = core

  // ── the second wave: everything that waits only on the first ───────────
  const corpusAhead = countAnalysedVideos(supabase, clientId)
  const plansAhead = corpusAhead.then((corpus) => loadPlanChecks(scope, corpus, { quotes: false })).catch(logAs('plans', null as PlanCheckCard[] | null))
  const plansCountAhead = Promise.resolve(supabase.from('plan_checks').select('id', { count: 'exact', head: true }).eq('client_id', clientId))
    .then((r) => (r.error ? null : r.count ?? null)).catch(() => null)
  const insightsAhead = selectAll<{ id: string; title: string; evidence: InsightRow['evidence'] }>(() =>
    supabase.from('market_insights').select('id, title, evidence').eq('client_id', clientId).eq('run_id', core.latestRunId).order('id', { ascending: true }),
  ).catch(logAs('insights', null as { id: string; title: string; evidence: InsightRow['evidence'] }[] | null))
  const questionsAhead = core.moves == null ? Promise.resolve(null)
    : fetchRunningRunIds(supabase, clientId, 'moves-v2')
      .then((ids) => fetchThemedRunId(supabase, clientId, ids, 'moves-v2'))
      .then((themed) => loadQuestionThemes(core.reading, supabase, clientId, core.month, themed ?? core.latestRunId))
      .catch(logAs('questions', null))
  const datableAhead = core.moves == null ? Promise.resolve(false) : loadMoveDatable(supabase, clientId).catch(() => false)
  // The short list folds advice that says the same thing (one embedding call).
  const vectorsAhead = adviceVectors(core.adviceRows).catch(logAs('vectors', null))
  for (const p of [plansAhead, plansCountAhead, insightsAhead, questionsAhead, datableAhead, vectorsAhead]) p.catch(() => {})

  const vectors = await vectorsAhead
  const byLineage = new Map(core.adviceRows.map((r) => [r.lineageId, r]))
  // THE ONE "WAITING" COUNT (the bar's, and the Dashboard tile's through
  // `topMoves`): every idea the latest update raised that nobody has decided
  // on, folded, uncapped. The board's three cards are its first three.
  const waitingAll = waitingAdvice(core.adviceRows, vectors)
  const waiting = waitingAll.slice(0, ADVICE_CARDS_SHOWN)
  const current = currentAdvice(core.adviceRows).filter((r) => r.inLatest === true)
  const moveLineages = (core.moves ?? []).filter((m) => m.kind === 'advice' && m.lineage_id).map((m) => m.lineage_id as string)
  // What the drawn cards and the advice moves cite; the conclusions' tags
  // read `based_on` alone and cite nothing here.
  const evidenceRows = [...new Map([...waiting, ...moveLineages.map((id) => byLineage.get(id)).filter((r): r is AdviceRow => r != null)].map((r) => [r.lineageId, r])).values()]

  // ── the third wave: what the drawn advice cites, and the conclusions ───
  const [cited, insightsRead] = await Promise.all([
    readCited(supabase, clientId, evidenceRows.flatMap((r) => r.basedOn)),
    insightsAhead,
  ])
  const insights = insightsRead ?? []
  const audienceIds = [
    ...evidenceRows.flatMap((r) => r.basedOn.flatMap((id) => cited.market.get(id)?.evidence ?? [])),
    ...insights.flatMap((mi) => mi.evidence?.supporting_theme_ids ?? []),
  ]
  // The moves' lines and the cards' "Would move" share their reads.
  const aimAt = waiting.map((r) => r.lineageId)
  const movesAhead = readMoveCards(core, core.moves ?? [], cited.market, aimAt)
    .catch(logAs('moves', null as { cards: MoveCard[]; aims: Map<string, AdviceAim | null>; aimsFailed: boolean } | null))
  const { videoByInsight, slugById } = await readAudience(supabase, clientId, audienceIds)

  const onPage = new Set(insights.map((i) => i.id))
  const [movesRead, plansRead, plansCount, questions, datable] = await Promise.all([movesAhead, plansAhead, plansCountAhead, questionsAhead, datableAhead])
  const moveCardsRead = movesRead?.cards ?? []
  const plans = plansRead ?? []
  // A card's "Would move": absent where its read failed (the card then says
  // so in one line, `failed.aims`).
  const withAim = (c: AdviceCard): AdviceCard => (movesRead?.aims.has(c.lineageId) ? { ...c, aim: movesRead.aims.get(c.lineageId) ?? null } : c)
  // WHAT FAILED, SAID AS SUCH. `loadPlanChecks` logs a failed `plan_checks`
  // read and returns none, so plans counted with none read is a failure too.
  const failed: NonNullable<MovesPageData['failed']> = {
    ...(movesRead == null && (core.moves ?? []).length > 0 ? { moves: true as const } : {}),
    ...(movesRead == null || movesRead.aimsFailed ? { aims: true as const } : {}),
    ...(plansRead == null || (plans.length === 0 && (plansCount ?? 0) > 0) ? { plan: true as const } : {}),
    ...(insightsRead == null ? { conclusions: true as const } : {}),
  }

  const cards = waiting.map((r) => withAim(adviceCardOf(core, r, { cited, videoByInsight, slugById, onPage })))

  // "Date a move": the subjects, the month's most-asked questions and the
  // current recommendation, as Your moves has offered them since WP3.6.
  const subjects = subjectsOf(core)
  // Every active subject may be dated (14 Oct: a tracked subject is never
  // hidden); one whose check has not passed draws its line once it does.
  const askable = [...subjects.entries()].map(([id, s]) => ({ id, name: s.name }))
  const asked = questions
    ? buildQuestions({
        month: core.month,
        themes: questions.themes,
        segments: questions.segments,
        n: null,
        brandNames: [core.brand, ...core.rivals.filter((a) => a.startsWith('competitor:')).map((a) => a.slice('competitor:'.length))],
        posts: null,
        subjects: [],
        filings: null,
      }).themes
    : []
  const top = currentTopLineage(core.copies)
  const topRow = top ? byLineage.get(top) ?? null : null
  const today = core.readingAt.slice(0, 10)
  const dating: MoveDating | null = core.moves == null ? null : {
    datable,
    today,
    earliest: earliestMoveDay(today),
    month: core.month,
    subjects: askable,
    themes: asked.map((t) => ({ registryId: t.registryId, label: t.label })),
    advice: topRow ? { lineageId: topRow.lineageId, title: adviceTitle(topRow.title, topRow.why) } : null,
  }

  return {
    brand: core.brand,
    month: core.month,
    monthLabel: readingMonthLabel(core.month, core.readingAt),
    monthStatus: core.monthStatus,
    readingAt: core.readingAt,
    canDecide: options.canDecide,
    counts: { waiting: waitingAll.length, dated: (core.moves ?? []).length, plans: plansCount ?? plans.length },
    advice: {
      cards,
      more: waitingAll.length - cards.length,
      total: core.adviceRows.length,
      acted: core.adviceRows.filter((r) => r.status !== 'new').length,
    },
    moves: { cards: moveCardsRead, recorded: core.moves != null },
    plan: plans[0] ?? null,
    conclusions: conclusionViews(insights, current, videoByInsight),
    dating,
    ...(Object.keys(failed).length > 0 ? { failed } : {}),
  }
}

/** One piece of advice as its card and its page read it: the stored words,
 *  its grounding (all time), its history and what it rests on. No quote: a
 *  card is level 1, and the advice's page reads its own comments. */
export function adviceCardOf(core: Pick<Core, 'month' | 'copies'>, r: AdviceRow, reads: {
  cited: { market: Map<string, { title: string; evidence: string[] }>; rival: Map<string, { title: string }> }
  videoByInsight: Map<string, string | null>
  slugById: Map<string, string>
  onPage: ReadonlySet<string>
}): AdviceCard {
  const evidence = [...new Set(r.basedOn.flatMap((id) => reads.cited.market.get(id)?.evidence ?? []))]
  const grounded = groundingFor({
    basedOn: evidence,
    videoByInsight: reads.videoByInsight,
    themeIds: evidence.map((a) => reads.slugById.get(a)).filter((s): s is string => Boolean(s)),
    audience: 'client',
    month: core.month,
    cited: r.basedOn.length,
  })
  return {
    lineageId: r.lineageId,
    recommendationId: r.recommendationId,
    title: adviceTitle(r.title, r.why),
    ...(adviceTitle(r.title, r.why) === UNTITLED_ADVICE ? { untitled: true } : {}),
    kind: r.kind,
    priority: r.priority ?? null,
    why: r.why,
    status: r.status,
    statusLabel: r.statusLabel,
    decidedAt: r.decidedAt,
    firstMade: r.firstMade,
    grounded: grounded ? { videos: grounded.videos, pruned: grounded.pruned } : null,
    history: adviceHistory(r.lineageId, core.copies),
    restsOn: restsOnRows({ basedOn: r.basedOn, market: reads.cited.market, rival: reads.cited.rival, videoByInsight: reads.videoByInsight, onPage: reads.onPage }),
    quote: null,
  }
}

// ---- the Dashboard's tile (T8) ---------------------------------------------------------

/** What the Dashboard's Your moves tile draws (board E1): the advice to decide
 *  on first, and the move whose market moved, each linking to its place here. */
export interface TopMoves {
  /** The first piece waiting for a decision: Your moves' first card. Null:
   *  nothing waiting. */
  advice: {
    lineageId: string
    recommendationId: string
    title: string
    kind: string
    priority: string | null
    grounded: { videos: number; pruned: boolean } | null
    history: AdviceHistory
    /** Its page on Your moves (`/dashboard/moves/advice/<lineage>`). */
    href: string
  } | null
  /** The advice waiting for a decision, folded and uncapped: the number Your
   *  moves' bar prints (`waitingAdvice`). */
  waiting: number
  /** OPTIONAL (the weekly read v3, 18 Oct): the first `TOP_MOVES_LISTED`
   *  pieces of that list, in its order (the first is `advice`), each with its
   *  page and the updates that raised it. A dump from before it carries none. */
  list?: { lineageId: string; title: string; href: string; history: AdviceHistory }[]
  /** The move whose comparison cleared its band (the largest change), else the
   *  newest move with a comparison that may print. Null: none. */
  move: (Pick<MoveCard, 'id' | 'title' | 'kind' | 'label' | 'day' | 'direction'> & {
    compare: NonNullable<MoveCard['compare']>
    moved: boolean
    /** The move's own page (`/dashboard/moves/<id>`). */
    href: string
  }) | null
  /** Whether the reader may Accept / Not for us on the tile. */
  canDecide: boolean
  /** OPTIONAL. Whether the panel invites dating a move where there is none:
   *  the reader may decide and moves are recorded, as Your moves invites it
   *  (`noMoveWords`). A dump from before it carries none: no invitation. */
  invite?: boolean
  /** The reading month and its label (decision 3): the move's later month
   *  prints it where it is the reading month. Optional: a dump from before it
   *  carries none. */
  reading?: ReadingLabel
  /** OPTIONAL (parity pass, 13 Oct): where no move has a comparison to print
   *  (`move` null), the newest move, and the one level its sentence on Your
   *  moves prints (`point`, by `MoveSentence`'s branches): none where no line
   *  can be drawn (`unread`); the latest month before it where its own month
   *  has not been read (`pending`); else the latest month read alone (a
   *  refused comparison's later side, or the last point), never beside an
   *  earlier one. The tile keeps its "After your move" panel on it. Null: no
   *  move at all. A dump from before it carries none. */
  newest?: (Pick<MoveCard, 'id' | 'title' | 'kind' | 'label' | 'day' | 'direction' | 'pending' | 'unread'> & {
    point: MovePoint | null
    href: string
  }) | null
}

/** The newest move, for the tile's panel where none has a comparison to
 *  print, with the level Your moves' sentence prints for it. Pure. */
export function newestMove(cards: readonly MoveCard[]): TopMoves['newest'] {
  const card = [...cards].sort((a, b) => b.day.localeCompare(a.day))[0]
  if (!card) return null
  const last = card.points[card.points.length - 1] ?? null
  const point = card.unread ? null : card.pending ? last : card.compare?.after ?? last
  return {
    id: card.id, title: card.title, kind: card.kind, label: card.label, day: card.day, direction: card.direction,
    pending: card.pending, unread: card.unread, point, href: card.href,
  }
}

/** How many pieces of advice `topMoves` lists (`TopMoves.list`): the weekly
 *  read's full read prints them (18 Oct). */
export const TOP_MOVES_LISTED = 4

/** The move the tile shows, from the page's cards. Pure. */
export function movedMove(cards: readonly MoveCard[]): MoveCard | null {
  const printable = cards.filter((c) => comparePrintable(c.compare))
  const moved = printable
    .filter((c) => c.compare!.verdict.state === 'moved')
    .sort((a, b) => Math.abs(b.compare!.verdict.changePts ?? 0) - Math.abs(a.compare!.verdict.changePts ?? 0) || b.day.localeCompare(a.day))[0]
  return moved ?? [...printable].sort((a, b) => b.day.localeCompare(a.day))[0] ?? null
}

/**
 * The Dashboard's Your moves tile (T8, wave 2b), light: the first wave this
 * page reads and the short list's embedding call (cached per server; no
 * quote, no plan, no conclusions), then the top advice's evidence and the
 * moves' months beside each other, then its videos. Null where the tenant has
 * no delivered update.
 */
export async function topMoves(scope: Scope, options: { canDecide: boolean }): Promise<TopMoves | null> {
  const core = await readCore(scope)
  if (!core) return null
  // THE PAGE'S LIST AND COUNT (`waitingAdvice`): the same embedding call,
  // cached per server (lib/pages/advice-shortlist.ts), and the page's first
  // card is the tile's advice.
  const latest = waitingAdvice(core.adviceRows, await adviceVectors(core.adviceRows))
  const top = latest[0] ?? null
  const moves = core.moves ?? []
  const lineages = [...new Set([...(top ? [top.lineageId] : []), ...moves.filter((m) => m.kind === 'advice' && m.lineage_id).map((m) => m.lineage_id as string)])]
  const cited = await readCited(core.supabase, core.clientId, lineages.flatMap((id) => core.adviceRows.find((r) => r.lineageId === id)?.basedOn ?? []))
  const evidence = top ? [...new Set(top.basedOn.flatMap((id) => cited.market.get(id)?.evidence ?? []))] : []
  const [audience, cards] = await Promise.all([
    readAudience(core.supabase, core.clientId, evidence),
    readMoveCards(core, moves, cited.market).then((r) => r.cards).catch(logAs('top.moves', [] as MoveCard[])),
  ])
  const grounded = top
    ? groundingFor({ basedOn: evidence, videoByInsight: audience.videoByInsight, themeIds: [], audience: 'client', month: core.month, cited: top.basedOn.length })
    : null
  const move = movedMove(cards)
  return {
    advice: top
      ? {
          lineageId: top.lineageId,
          recommendationId: top.recommendationId,
          title: adviceTitle(top.title, top.why),
          kind: top.kind,
          priority: top.priority ?? null,
          grounded: grounded ? { videos: grounded.videos, pruned: grounded.pruned } : null,
          history: adviceHistory(top.lineageId, core.copies),
          href: adviceHref(top.lineageId),
        }
      : null,
    waiting: latest.length,
    list: latest.slice(0, TOP_MOVES_LISTED).map((r) => ({ lineageId: r.lineageId, title: adviceTitle(r.title, r.why), href: adviceHref(r.lineageId), history: adviceHistory(r.lineageId, core.copies) })),
    move: move && move.compare
      ? {
          id: move.id, title: move.title, kind: move.kind, label: move.label, day: move.day, direction: move.direction,
          compare: move.compare, moved: move.compare.verdict.state === 'moved', href: move.href,
        }
      : null,
    canDecide: options.canDecide,
    invite: options.canDecide && core.moves != null,
    reading: { month: core.month, label: readingMonthLabel(core.month, core.readingAt) },
    newest: move && move.compare ? null : newestMove(cards),
  }
}

/** A move card's anchor. */
export const moveAnchor = (id: string): string => `move-${id}`

/** "{N} videos it rests on, all time" as the card's cell label. */
export const groundedLabel = `videos it rests on, ${GROUNDED_BASIS}`
