import type { SupabaseClient } from '@supabase/supabase-js'

import { ASK_MONTHLY_CAP } from '../config'
import { fmtInt, longMonth } from '../format'
import { capLine, monthStartIso } from '../ask/quota'
import { proseFigures } from '../prose/figures'
import { scrubProse, type ProseScrub } from '../prose/scrub'
import { audienceLabel } from '../readiness/types'
import { clearsFloor, monthChange, type Direction } from '../reading/bands'
import { isReadable, pointsByMonth, type MonthPoint, type MonthSeries } from '../reading/series'
import { prevMonth, monthStartOf } from '../reading/month-key'
import type { Counted, FigureTable, Verdict, VerdictFlag } from '../reading/verdicts'
import type { Scope } from '../renderables/types'
import { isThin, movementDirection } from './movement'

// Ask's MEASUREMENT half (Phase 1 Block D, package D8).
//
// WHAT WAS WRONG. Ask is the one reader in this product whose direction flag is
// true — `agent.movement`, flipped by WP21 the day Ask's movement block stopped
// reading `theme_observations` and started reading the comment-dated months —
// and none of that measurement reached the page. `loadMovement` computed the
// verdicts, `renderMovement` spent them on the PROMPT STRING, and what the
// client saw was the model's prose about them: "305 of 1,388 category videos
// this month — 22%, from 19% of 1,455 in August", typed by a model, checked by
// nothing. `PROSE_POLICY.agent_answer` has said `'both'` since WP7 and
// `scrubProse` was never called from `lib/agent/**` (grep: prose-rules, cover,
// documents/scrub — that is the whole list). The policy row drove nothing.
//
// SO THIS FILE DOES TWO THINGS AND THEY ARE THE SAME THING.
//
//  1. It MEASURES what the answer is about, off the same comment-dated months
//     the movement block reads: a finding's level with its own denominator, the
//     banded verdict beside it, the direction word only where three consecutive
//     readings in one regime earned it, and the month series the chart is drawn
//     from. Code rates.
//  2. It hands that measurement to the SCRUBBER as the figure table and the
//     verdict list, so the model's prose may name a figure only as a `[[key]]`
//     the table holds and a direction only for an object a verdict earned one
//     for. A digit the model typed drops its SENTENCE. The model explains.
//
// WHAT IT DELIBERATELY DOES NOT DO. Read a rival's months. Retrieval drops
// every rival voice before an answer is written (`scopeToClientVoices`),
// `loadMovement` takes `client` and `industry-other` only, and
// `readableMonthCount` filters `isRivalAudience` — precisely so a tenant is not
// told a rival's months stand behind a claim about their own audience. The mock
// draws a Freitag line on an Ask answer; that series belongs to Competitive,
// with its own denominator, and drawing it here would change what "N monthly
// readings" in the same tile means.
//
// AND IT SPENDS NO MODEL CALL. Every figure here is counted; every sentence is
// either the client's own model prose (scrubbed) or code's.

/** A month on a finding's chart. Both sides present, always: a month with no
 *  denominator row is not a zero and is left off the axis rather than drawn at
 *  the floor (`isReadable`, lib/reading/series.ts). */
export interface MeasuredPoint {
  month: string
  k: number
  n: number
  /** k as a percentage of n, one decimal. Null only where n is zero. */
  pct: number | null
}

export interface FindingMeasure {
  findingId: string
  /** The counted claim behind the paragraph. */
  value: Counted
  audience: string
  audienceLabel: string
  /** What the level is a level OF, in the reader's words. */
  label: string
  /** Its monthly series with denominators — the chart. */
  series: MeasuredPoint[]
  /** The banded comparison, where one was drawn. */
  verdict: Verdict | null
  /** Only where `directionWordsFor('agent.movement')` is true AND three
   *  consecutive readings in one regime earned it. */
  direction: Direction | null
  figures: FigureTable
}

export interface AnswerMeasure {
  findings: FindingMeasure[]
  /** Every verdict the answer's prose may name — the `verdicts` argument to
   *  scrubProse. */
  verdicts: Verdict[]
  /** Every figure its prose may name, by token. */
  figures: FigureTable
  /** "Interpretation, not counted." and the own-side thinness sentence. */
  caveats: string[]
}

/** One finding, as the caller names it: the registry ids its insights came off
 *  and the id the answer knows it by. */
export interface MeasureFinding {
  findingId: string
  /** `theme_registry.id` per insight behind the point — the ONLY cross-run key
   *  (AGENTS.md), and what `month_theme_readings.theme_id` is. */
  registryIds: string[]
}

export interface MeasureAnswerInput {
  findings: readonly MeasureFinding[]
  /**
   * Every month series read for this answer's topics, one per audience ×
   * object — the `MonthSeriesSet.series` `loadMovement` reads, handed over
   * whole rather than pre-filtered, because which side carries the n is this
   * file's decision and not the loader's.
   */
  series: readonly MonthSeries[]
  /** The calendar month being read, `YYYY-MM-01`. Dated by the COMMENT: it is
   *  the month the series is keyed by, never the month the answer was given
   *  in. */
  month: string
  /**
   * `directionWordsFor('agent.movement')`, taken as an ARGUMENT rather than
   * read here, so both answers stay tested (AGENTS.md: a gated pure function
   * takes the flag). False returns a measurement with every `direction` null
   * and every verdict carrying no direction — which is what the rest of the
   * product looks like today.
   */
  directionWords: boolean
  /** The client's own audience key. Its side of a finding is what the
   *  thinness caveat is about; omit it and no such caveat is written. */
  ownAudience?: string
  /** Does this answer carry a judgement register? The interpretation caveat is
   *  owed only where the model actually argued. */
  hasJudgement?: boolean
}

/** The sentence the product owes on a judgement register. Fixed, like the
 *  silence sentence: a promise about what a register IS is not something to let
 *  a model rephrase each time. */
export const INTERPRETATION_CAVEAT = 'Interpretation, not counted.'

/**
 * "too few to compare" — the agent path's existing word for `too_little_data`
 * (`movementLine`'s STATE_NOTE, which prints it into every prompt this surface
 * has ever sent). D11 rules that the product should pick ONE wording across
 * `lib/calibration.ts` and `components/delta-badge.tsx` ("too little data") and
 * change it once; both files belong to P0. Until that lands, Ask says one thing
 * to itself rather than two, and this constant is the single place to change
 * when P0 settles the word.
 */
export const TOO_FEW = 'too few to compare'

const pctOf = (k: number, n: number): number | null => (n > 0 ? Math.round((k / n) * 1000) / 10 : null)

/** A token base that `FIGURE_KEY_RE` will accept (`[a-z][a-z0-9_]*`). Derived
 *  from the finding's ORDINAL, not from its id: a model names points "G1",
 *  "point one" or nothing at all depending on the turn, and a figure key that
 *  depends on that is a key the table sometimes does not hold. */
const tokenBase = (index: number): string => `f${index + 1}`

/** Every point of the series a chart may draw: the months that actually carry
 *  a reading on both sides. */
function measuredPoints(series: MonthSeries): MeasuredPoint[] {
  const out: MeasuredPoint[] = []
  for (const p of series.points) {
    if (!isReadable(p)) continue
    if (p.videos == null || p.k == null) continue
    out.push({ month: p.month, k: p.k, n: p.videos, pct: pctOf(p.k, p.videos) })
  }
  return out
}

/**
 * Which side of a finding is drawn — "the side with the n".
 *
 * A finding rests on one or more registry ids and the answer has read two
 * audiences for each (the client's own and the rest of the category). The
 * client's own audience is the one a reader cares about and usually the one
 * that cannot carry a comparison: Sealand's own brand runs tens of videos a
 * month against a floor of a hundred. So the side that CLEARS THE FLOOR is
 * drawn, and the client's own side becomes the caveat underneath it. With
 * neither side clearing, the largest denominator is still drawn, because a
 * level with its "of N" is a real thing to print and the verdict beside it
 * will say `too_little_data` in its own words.
 */
function chooseSide(
  candidates: readonly MonthSeries[],
  month: string,
): { series: MonthSeries; curr: MonthPoint } | null {
  const rows = candidates
    .map((s) => ({ series: s, curr: pointsByMonth(s).get(month) }))
    .filter((r): r is { series: MonthSeries; curr: MonthPoint } => r.curr != null)
  if (rows.length === 0) return null
  const n = (r: { curr: MonthPoint }): number => r.curr.videos ?? 0
  const floored = rows.filter((r) => clearsFloor({ month: r.curr.month, videos: r.curr.videos, k: r.curr.k }))
  const pool = floored.length ? floored : rows
  return [...pool].sort((a, b) => n(b) - n(a) || a.series.audience.localeCompare(b.series.audience))[0]
}

/** The figures one finding publishes. Values, with their units and the labels
 *  the surface prints when it substitutes them — never handed to a model as
 *  anything but a key (`verdictBlock`, lib/prose/interpret.ts). */
function findingFigures(
  base: string,
  label: string,
  audience: string,
  month: string,
  curr: Counted,
  verdict: Verdict | null,
): FigureTable {
  const when = longMonth(month)
  const who = audienceLabel(audience)
  const figures: FigureTable = {
    [`${base}_k`]: { value: curr.k, unit: 'videos', label: `videos naming ${label} in ${when}` },
    [`${base}_n`]: { value: curr.n, unit: 'videos', label: `videos read in ${who} in ${when}` },
  }
  const pct = pctOf(curr.k, curr.n)
  if (pct != null) figures[`${base}_pct`] = { value: pct, unit: 'pct', label: `${label}’s share of ${who} in ${when}` }
  if (verdict?.baseline) {
    const prev = verdict.baseline
    figures[`${base}_prev_k`] = { value: prev.k, unit: 'videos', label: `videos naming ${label} the month before` }
    figures[`${base}_prev_n`] = { value: prev.n, unit: 'videos', label: `videos read in ${who} the month before` }
    const prevPct = pctOf(prev.k, prev.n)
    if (prevPct != null) figures[`${base}_prev_pct`] = { value: prevPct, unit: 'pct', label: `${label}’s share the month before` }
  }
  if (verdict?.changePts != null) figures[`${base}_change`] = { value: verdict.changePts, unit: 'pts', label: `change in ${label}’s share` }
  if (verdict?.bandPts != null) figures[`${base}_band`] = { value: verdict.bandPts, unit: 'pts', label: `the band ${label}’s change is judged against` }
  return figures
}

/**
 * Measure one answer.
 *
 * Pure. Every read the measurement needs has already happened — the series are
 * handed in — so this is arguable in a test rather than in production, which is
 * the point of splitting it from the loader.
 */
export function measureAnswer(input: MeasureAnswerInput): AnswerMeasure {
  const month = monthStartOf(input.month)
  const prevKey = prevMonth(month)
  const findings: FindingMeasure[] = []
  const caveats: string[] = []
  let figures: FigureTable = {}

  input.findings.forEach((finding, index) => {
    const ids = new Set(finding.registryIds.filter(Boolean))
    if (ids.size === 0) return
    const mine = input.series.filter((s) => s.objectId && ids.has(s.objectId))
    const chosen = chooseSide(
      // The client's own side is never the drawn side when another side has the
      // n; it is the caveat. Filtering it out of the choice keeps `chooseSide`
      // about denominators rather than about audience politics.
      mine.filter((s) => s.audience !== input.ownAudience).length ? mine.filter((s) => s.audience !== input.ownAudience) : mine,
      month,
    )
    if (!chosen) return
    const { series, curr } = chosen
    const label = series.objectLabel ?? series.objectId ?? finding.findingId
    const objectId = series.objectId as string
    const byMonth = pointsByMonth(series)
    const prev = byMonth.get(prevKey)
    const thin = isThin(curr)
    const verdict: Verdict = monthChange({
      object: { kind: 'theme', id: objectId, label },
      audience: series.audience,
      ...(thin ? { flags: ['thin' as VerdictFlag] } : {}),
      curr,
      // A month with no row on the other side is not skipped: `monthChange`
      // answers `too_little_data`, which is the honest verdict for a theme's
      // first month (the voice-surface precedent, and `loadMovement`'s).
      prev: prev ?? { month: prevKey, videos: null, k: null, audience: series.audience },
    })
    // THE DIRECTION IS WRITTEN ONTO THE VERDICT, not only onto the finding.
    // `dropUnverdictedDirection` licenses a sentence by `Verdict.direction`
    // being non-null on an object whose LABEL the sentence names; a direction
    // carried beside the verdict and not on it would leave every earned
    // sentence unlicensed and delete the one thing this reader is allowed to
    // say.
    const direction = input.directionWords ? movementDirection(curr, series.points) : null
    verdict.direction = direction

    const value: Counted = { k: curr.k ?? 0, n: curr.videos ?? 0 }
    const base = tokenBase(index)
    const own = findingFigures(base, label, series.audience, month, value, verdict)
    figures = { ...figures, ...own }
    findings.push({
      findingId: finding.findingId,
      value,
      audience: series.audience,
      audienceLabel: audienceLabel(series.audience),
      label,
      series: measuredPoints(series),
      verdict,
      direction,
      figures: own,
    })

    // THE OWN SIDE, where the tenant has one and it cannot carry a comparison.
    // This is the mock's sentence and the product owed it anyway: a reader shown
    // the category's 22% is owed the fact that their own audience is 26 videos
    // and that 26 videos compare to nothing.
    if (input.ownAudience && series.audience !== input.ownAudience) {
      const ownSeries = mine.find((s) => s.audience === input.ownAudience)
      const ownCurr = ownSeries ? pointsByMonth(ownSeries).get(month) : undefined
      if (ownSeries && ownCurr && ownCurr.videos != null && ownCurr.k != null) {
        const thinSide = !clearsFloor({ month: ownCurr.month, videos: ownCurr.videos, k: ownCurr.k })
        if (thinSide) {
          caveats.push(
            `Your own side of ${label} is ${fmtInt(ownCurr.k)} of ${fmtInt(ownCurr.videos)} videos in ${longMonth(month)} — ${TOO_FEW}.`,
          )
        }
      }
    }
  })

  if (input.hasJudgement) caveats.unshift(INTERPRETATION_CAVEAT)

  return {
    findings,
    verdicts: findings.map((f) => f.verdict).filter((v): v is Verdict => v != null),
    figures,
    caveats,
  }
}

/**
 * The scrubbed answer: sentences with a stray digit dropped, tokens intact.
 *
 * `agent_answer` is `'both'` — the digit rule and the direction rule — and this
 * is the call that was missing. The figure table crosses the two shapes exactly
 * once, through `proseFigures` (lib/prose/figures.ts): the reading layer holds a
 * figure as measured, the prose layer as printed, and three hand-rolled
 * conversions is how "3.4%", "3%" and "3.4 pct" reach one product.
 */
export function scrubAnswer(raw: string, measure: AnswerMeasure): ProseScrub {
  return scrubProse('agent_answer', raw, {
    figures: proseFigures(measure.figures),
    verdicts: measure.verdicts,
  })
}

/** An answer's prose, as the page gets it. */
export interface ScrubbedAnswer<T> {
  answer: string
  grounded: T[]
  scrub: { dropped: number; droppedDigits: number; droppedDirection: number; leaked: boolean }
}

/**
 * Scrub an answer's PROSE NODES and nothing else.
 *
 * THE QUOTES ARE SIBLINGS AND STAY WHOLE. 7.4% of stored quotes carry a digit
 * and 41% are non-ASCII; inside scrubbed prose a quote would take its sentence
 * with it, and the magnitude strip has already eaten `vast` out of a Dutch "dat
 * staat vast". A commenter's own words are not a claim of ours however they are
 * punctuated, so a quote travels as its own node with its own ref and is never
 * handed to the scrubber (AGENTS.md, `data-copy="quote"`). What the rule still
 * refuses is a number the MODEL typed inside quotation marks in its own
 * sentence — that is `dropDigitSentences`' job and it does it here.
 */
export function scrubThreadAnswer<T extends { text: string }>(
  answer: { answer: string; grounded: T[] },
  measure: AnswerMeasure,
): ScrubbedAnswer<T> {
  const head = scrubAnswer(answer.answer, measure)
  let dropped = head.dropped
  let droppedDigits = head.droppedDigits
  let droppedDirection = head.droppedDirection
  let leaked = head.leaked
  const grounded = answer.grounded.map((g) => {
    const s = scrubAnswer(g.text, measure)
    dropped += s.dropped
    droppedDigits += s.droppedDigits
    droppedDirection += s.droppedDirection
    leaked = leaked || s.leaked
    return { ...g, text: s.text }
  })
  return { answer: head.text, grounded, scrub: { dropped, droppedDigits, droppedDirection, leaked } }
}

/** What the page says when the scrubbers empty an answer's own sentences. The
 *  saying-so is the honest half: a reader who cannot tell our sentence from the
 *  model's cannot calibrate either (lib/prose/interpret.ts's rule, one surface
 *  over). */
export const FALLBACK_NOTE = 'The answer’s own sentences named figures we did not measure, so this is the reading itself.'

/**
 * The answer the product writes for itself when nothing of the model's
 * survives.
 *
 * Composed from the verdicts alone, and the digits in it are CODE's — the rule
 * is about a figure a model typed, not about a figure the product counted. Null
 * where nothing was measured either, which is a page with an empty state rather
 * than a page with a sentence about nothing.
 */
export function answerFallback(measure: AnswerMeasure): string | null {
  if (measure.findings.length === 0) return null
  const lines = measure.findings.slice(0, 3).map((f) => {
    const v = f.verdict
    const level = `${f.label}: ${fmtInt(f.value.k)} of ${fmtInt(f.value.n)} videos in ${f.audienceLabel.toLowerCase()}`
    if (!v || v.changePts == null || v.bandPts == null) return `${level}, ${TOO_FEW} with the month before.`
    const sign = v.changePts > 0 ? '+' : ''
    return `${level}, ${v.state === 'moved' ? 'moved' : 'no clear change'} (${sign}${v.changePts} pts, band ${v.bandPts} pts).`
  })
  return [FALLBACK_NOTE, ...lines].join(' ')
}

// ── What was not answered, and what the workspace may still spend ───────────

export interface NotAnswered {
  month: string
  /** Wall-clock month — the ONE budget clock, from lib/ask/quota.ts. */
  asked: number
  cap: number
  /** Questions the engine declined, with the reason in the reader's words. */
  declined: { question: string; why: string }[]
  line: string
  href: string
}

/** Why a question came back without an answer, in the reader's words. Both are
 *  real results rather than failures: the corpus genuinely does not speak to
 *  some questions, and it structurally cannot see a client's own numbers. */
export const DECLINED_WHY = {
  silent: 'nothing in the conversation we read speaks to this',
  out_of_corpus: 'this asks about your own numbers, which we do not read',
} as const

/** Where "What we track →" points. Settings is where the tracked list, the
 *  rivals and the accounts are named, which is what a refusal of this kind is
 *  usually about. */
export const NOT_ANSWERED_HREF = '/dashboard/settings'

interface AskRow {
  role: string
  content: string
  outcome: string | null
  result: { notice?: string | null } | null
  created_at: string
}

/**
 * The month's questions, its refusals and the workspace's budget.
 *
 * ONE QUERY, and one month of rows. `agent_messages` carries
 * `(client_id, role, created_at desc)` already and a workspace's month is tens
 * of rows, so the pairing of a question with its reply is done here rather than
 * in two round trips — round trips are the cost on this database, not rows.
 *
 * THE MONTH IS THE WALL CLOCK'S, and it is the only month in this product that
 * is. A period is dated by the comment (AGENTS.md); a spend limit is dated by
 * the day the money is spent, and `monthStartIso` is deliberately eight lines
 * in `lib/ask/quota.ts` rather than an import of the reading layer. This reads
 * that clock and never the reading layer's.
 *
 * IT IS NOT `silentQuestions`. That is a thread-scoped list of questions the
 * corpus was silent on, printed on an export slide; this is the WORKSPACE's
 * month, and the two would disagree the first time a reader compared them.
 */
export async function loadNotAnswered(scope: Scope, now: Date = new Date()): Promise<NotAnswered> {
  const supabase = scope.supabase as SupabaseClient
  const from = monthStartIso(now)
  const { data } = await supabase
    .from('agent_messages')
    .select('role, content, outcome, result, created_at')
    .eq('client_id', scope.clientId)
    .gte('created_at', from)
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as AskRow[]
  return notAnsweredFrom(rows, from)
}

/** The pure half, so the pairing rule is arguable in a test. */
export function notAnsweredFrom(rows: readonly AskRow[], monthStart: string, cap = ASK_MONTHLY_CAP): NotAnswered {
  let asked = 0
  const declined: { question: string; why: string }[] = []
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i]
    if (m.role !== 'user') continue
    asked += 1
    const reply = rows[i + 1]?.role === 'agent' ? rows[i + 1] : null
    if (!reply) continue
    if (reply.outcome === 'silent') declined.push({ question: m.content, why: DECLINED_WHY.silent })
    else if (reply.result?.notice) declined.push({ question: m.content, why: DECLINED_WHY.out_of_corpus })
  }
  const tail =
    declined.length === 0
      ? 'Every one was answered from the conversation.'
      : `${fmtInt(declined.length)} of them could not be answered from the conversation.`
  return {
    month: monthStart.slice(0, 10),
    asked,
    cap,
    declined,
    line: `${capLine(asked, cap)} this month. ${tail}`,
    href: NOT_ANSWERED_HREF,
  }
}
