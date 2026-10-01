import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import { COMMENTS_READ_LANE } from '../pipeline/pass-a'
import { rowWindow, type WindowColumns } from '../pipeline/run-bookkeeping'
import { HEADLINE_MAX_MAKER_SHARE, loadRegimeOpened } from '../pages/overview'
import { THEME_FLOOR, themeFlags } from '../pages/overview-market/board'
import { accountKey } from '../pages/overview-market/voices'
import { loadMemberInsightIdsBySubject } from '../pages/subjects'
import { loadRegrouped } from '../pages/voice-surface'
import { embedInput } from '../pipeline/cluster'
import { gateFor } from '../quote-context'
import { pickEligible, quoteGate, readableEnglish, threadOf, type GateOptions } from '../quote-gate'
import { marketAudiences, pooledDenominators } from '../reading/market'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { readingMonthOf } from './month'
import { loadMonthSeries, loadWindowReading } from '../reading/read'
import { loadMarketRivalAudiences } from '../reading/reading-view'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { loadActiveSubjects } from '../subjects/membership'
import { isMissingSubjects } from '../subjects/types'
import { gateInputOf, judge, loadDatedEvidence, loadTrackedBrands, passes, refOf, type DatedEvidence } from './evidence'
import { quoteForm, type QuoteSubstance } from './substance'
import type { Lens, PoolCandidate, QuoteOption, QuoteRef, WeekMarketFigures, WeekPool } from './types'

// The week pool (plan T1): the themes a week's written findings may be built
// from, each with the evidence code stands behind.
//
// WHAT A CANDIDATE IS (widened in T3b, 30 Sep). A theme of the run's own
// clustering (`theme_observations`, keyed by `theme_registry.id`) that at
// least three distinct CATEGORY videos on the READ LANE cite in the run's
// window, each with a citation the product's LENIENT gate passes (`quoteGate`
// with `gateFor(clientId)` and the label as the claim, no relevance required
// and no kind: research C's "lenient" replay, 13 to 17 themes a week against
// 6 to 9 strict ones), AND at least one video with a quote the STRICT theme
// gate passes (the theme block's options: `claim` the label,
// `requireRelevance`, `kind` the theme's kind), so every candidate has a quote
// that may print. What prints stays strict: `quoteRefs` and `quoteOptions`
// are strict-gated. A video a maker posted (`segments_for_videos` says
// 'maker') never counts: it is set aside before the gate, which refuses it
// anyway. A theme whose window videos are more than a quarter makers' is not
// a candidate at all (`isMakerLed`, the front page's own line). And a
// commenter who says they work for a tracked brand passes no gate
// (lib/written/evidence.ts `saysTheyWorkFor`).
//
// COUNTED THE WAY THE PRODUCT COUNTS (research C §1), and by the product's own
// functions where one exists:
//  · the week is the run's frozen `[window_start, window_end)` (`rowWindow`),
//    which This week and the anomaly check use; on the Sunday cadence it is
//    the ISO week's comment dates;
//  · `weekVideos` is `window_theme_readings` on the category
//    (`loadWindowReading`, lib/reading/read.ts): the cited-comment chain plus
//    the on-camera arm, exactly as `monthly_theme_readings` counts a month, so
//    the week and its month are one measure. The window's size is
//    `window_denominators` on the same audience;
//  · the month is the one the window ends in (This week's rule,
//    lib/pages/week.ts `loadWeek`), and its figures are the stored month rows
//    the pages print (`loadMonthSeries`) when this run wrote them, else the
//    window read `[month start, window end)` under this run: the month as this
//    run left it. A week that STARTED in the month before is restated against
//    that month IN FULL instead, read to its own end (the lead's ruling on
//    review M2, lib/written/month.ts `readingMonthOf`: "16 in September", not
//    "0 in October so far");
//  · dated by the comment, audience by the videos' CASE (client, then a
//    tracked rival, else the category), lane `analyzed_lane = 'full'` (M13);
//  · the MARKET's week and month (v3, the Dashboard's figures) are the same
//    two reads pooled over the category and the tracked brands' audiences
//    (`pooledDenominators`, decision E), the base the standing levels are
//    stated on ("of 852"); the candidates stay the category's, where themes
//    are grouped.
//
// NOTHING HERE IS A COMMENT'S WORDS. Quotes leave as refs with `text: ''`, and
// `notes` are Pass A's insight descriptions. The texts are read so the gate
// can judge them and go no further (lib/written/evidence.ts).

/** A candidate needs this many distinct videos with a citation the LENIENT
 *  gate passes; a finding needs as many across the candidates it cites. */
export const POOL_MIN_VIDEOS = 3
/** …and at least this many with a quote the STRICT gate passes, so every
 *  candidate has a quote that may print. */
export const POOL_MIN_STRICT = 1
/** Quotes a candidate offers a finding to choose from (by fit, T3b). */
export const POOL_QUOTE_OPTIONS = 8
/** The most candidates a pool carries. */
export const POOL_CAP = 12
/** Fewer eligible candidates than this is a thin week. */
export const POOL_THIN_BELOW = 3
/** Quotes kept per candidate, one per thread. */
export const POOL_QUOTES = 3
/** Insight descriptions kept per candidate. */
export const POOL_NOTES = 8
/**
 * A theme is part of a subject when the subject holding the most of the
 * theme's member insights holds at least this many of them AND at least this
 * share (the lead's ruling, 30 Sep). Membership is precision-first, so its
 * recall is low: on Sealand's 27 Sep run only 3 of the 16 insights in "Price
 * feels hard to justify" are Price members, and a 30% floor left four of six
 * candidates with no subject at all.
 */
export const SUBJECT_MIN_MEMBERS = 3
export const SUBJECT_SHARE_FLOOR = 0.15
/** Where the month rows are read from: every stored month, so "heard before"
 *  can look at all of them (lib/reading/reading-view.ts reads from here too). */
const FIRST_MONTH = '2019-01-01'

// ---- Lenses -------------------------------------------------------------------

/** The department a kind of comment is read by. Leadership reads every
 *  candidate. `buying_trigger` (the why-now) is a sales signal, as research C
 *  mapped it. `misinformation` names no department of its own. */
const LENS_OF_KIND: Readonly<Record<string, Lens>> = {
  purchase_intent: 'sales',
  objection: 'sales',
  buying_trigger: 'sales',
  pain_point: 'product',
  feature_request: 'product',
  question: 'content',
  praise: 'marketing',
  switching_signal: 'marketing',
  demographic_signal: 'marketing',
}
const LENS_ORDER: readonly Lens[] = ['sales', 'marketing', 'content', 'product', 'leadership']

/** The lenses a candidate's kinds reach, in a fixed order; leadership always. */
export function lensesOf(kinds: readonly string[]): Lens[] {
  const reached = new Set<Lens>(['leadership'])
  for (const k of kinds) {
    const lens = LENS_OF_KIND[k]
    if (lens) reached.add(lens)
  }
  return LENS_ORDER.filter((l) => reached.has(l))
}

// ---- Kinds -------------------------------------------------------------------------

/** Kinds a quote may never come from when a theme's evidence is mostly the
 *  other: praise against objection and pain point, both ways. The gate's own
 *  text rule (`contradictsKind`) only guards a problem block from pure praise;
 *  this guards the praise block too, by the insight's kind. */
const CONTRADICTING_KINDS: Readonly<Record<string, readonly string[]>> = {
  praise: ['objection', 'pain_point'],
  objection: ['praise'],
  pain_point: ['praise'],
}

/** Does a citation of kind `kind` contradict a theme whose evidence is mostly
 *  `dominant`? */
export function contradictsDominant(kind: string | null | undefined, dominant: string | null | undefined): boolean {
  if (!kind || !dominant) return false
  return (CONTRADICTING_KINDS[dominant] ?? []).includes(kind)
}

/**
 * The most common insight kind among these citations, counted in distinct
 * videos (the product's unit). A tie goes to the theme's own kind, then to the
 * name, so the answer never depends on how the rows came back. Null where no
 * citation carries a kind. Pure.
 */
export function dominantKindOf(evidence: readonly Pick<DatedEvidence, 'kind' | 'video'>[], themeKind: string | null = null): string | null {
  const videosByKind = new Map<string, Set<string>>()
  for (const e of evidence) {
    if (!e.kind) continue
    const set = videosByKind.get(e.kind) ?? new Set<string>()
    set.add(e.video.uuid)
    videosByKind.set(e.kind, set)
  }
  let best: string | null = null
  let bestN = 0
  for (const [kind, set] of [...videosByKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = set.size
    if (n > bestN || (n === bestN && kind === themeKind)) {
      best = kind
      bestN = n
    }
  }
  return best
}

// ---- One theme's week, judged -----------------------------------------------------

/** A theme of the run, as the pool reads it. */
export interface PoolTheme {
  themeId: string
  /** `theme_observations.label`: the label this run gave it (Pass B). */
  label: string
  /** `themes.description` on this run (Pass B). */
  description: string | null
  /** `theme_observations.category`: the theme's kind. */
  kind: string | null
  /** `theme_observations.match_kind`: 'new' where this run minted it. */
  matchKind: string | null
  /** `theme_observations.member_insight_ids`. */
  memberIds: readonly string[]
  /** The category's videos in the window (`window_theme_readings`). */
  weekVideos: number
}

export interface ThemeJudgement {
  theme: PoolTheme
  /** Videos with a citation the lenient gate passes, and their ids, sorted. */
  lenientVideos: number
  lenientVideoIds: string[]
  /** Videos with a quote the strict gate passes, and their ids, sorted. */
  gatedVideos: number
  gatedVideoIds: string[]
  quoteRefs: QuoteRef[]
  quoteOptions: QuoteOption[]
  kinds: string[]
  dominantKind: string | null
  notes: string[]
  /** The category videos on the read lane with a citation dated in the
   *  window, makers' included: the maker share's denominator. */
  seenVideos: number
  /** …of which a reader marked the video a maker's (`segments_for_videos`). */
  makerVideos: number
}

/** A theme's maker share of its window videos (0 where none were seen). */
export const makerShareOf = (j: Pick<ThemeJudgement, 'seenVideos' | 'makerVideos'>): number =>
  j.seenVideos > 0 ? j.makerVideos / j.seenVideos : 0

/**
 * Is the theme maker-led? Its maker share of the window's videos over the
 * product's own line for what may lead the front page (`HEADLINE_MAX_MAKER_SHARE`,
 * lib/pages/overview.ts). A maker's video never counts toward a theme's gated
 * videos anyway; this takes out the theme whose conversation is mostly makers
 * talking to makers, however many market videos it also reaches ("Admiration
 * for handmade bag design", 27 Sep: 25 of 42).
 */
export const isMakerLed = (j: Pick<ThemeJudgement, 'seenVideos' | 'makerVideos'>): boolean =>
  makerShareOf(j) > HEADLINE_MAX_MAKER_SHARE

/** May this citation count toward a theme's week at all? A category video on
 *  the read lane (M13: `analyzed_lane = 'full'`, `COMMENTS_READ_LANE`) that no
 *  reader has marked a maker's. */
export function countsForTheWeek(e: DatedEvidence): boolean {
  return e.video.audience === INDUSTRY_AUDIENCE && e.video.lane === COMMENTS_READ_LANE && e.context?.segment !== 'maker'
}

/** A creator answering under their own post is the video talking, not the
 *  market (the theme voices' rule, lib/pages/overview-market/voices.ts
 *  `quotable`). Applied to the quotes a candidate offers, never to its count. */
export function isOwnAccount(e: Pick<DatedEvidence, 'author' | 'video'>): boolean {
  const author = accountKey(e.author)
  return author !== '' && author === accountKey(e.video.accountName)
}

/** The strict theme gate (the theme block's): what may print. */
export const strictGateFor = (clientId: string, theme: Pick<PoolTheme, 'label' | 'kind'>): GateOptions =>
  gateFor(clientId, { claim: theme.label, requireRelevance: true, kind: theme.kind })

/** The lenient gate (research C's replay): the same gate with the label as the
 *  claim, which ranks but is not required, and no kind. What counts. */
export const lenientGateFor = (clientId: string, label: string): GateOptions => gateFor(clientId, { claim: label })

/**
 * The distinct videos (`videos.id`, sorted) with a citation of these insights
 * that counts for the period (`countsForTheWeek`: category, read lane, no
 * maker's video) and passes the gate (no brand insider). The one count a
 * candidate's week and its month are both made of. Pure.
 */
export function passingVideoIds(evidence: readonly DatedEvidence[], members: ReadonlySet<string>, gate: GateOptions): string[] {
  const out = new Set<string>()
  for (const e of evidence) if (members.has(e.insightId) && countsForTheWeek(e) && passes(e, gate)) out.add(e.video.uuid)
  return [...out].sort()
}

/** What a quote says on its own (lib/written/substance.ts): its form, read
 *  from its readable English, and its score under the gate it passed. Read
 *  here, where the words are, and kept beside the ref without them. Pure. */
export function substanceOf(e: DatedEvidence, gate: GateOptions): QuoteSubstance {
  const input = gateInputOf(e)
  const verdict = quoteGate(input, gate)
  return { form: quoteForm(readableEnglish(input) ?? ''), gate: verdict.ok ? verdict.score : 0 }
}

/**
 * The first comment date among the same citations `passingVideoIds` counts:
 * when the theme was first heard in the period, on the lenient gate. Null
 * where none passes. Pure.
 */
export function firstPassingDate(evidence: readonly DatedEvidence[], members: ReadonlySet<string>, gate: GateOptions): string | null {
  let first: string | null = null
  let firstMs = Number.POSITIVE_INFINITY
  for (const e of evidence) {
    if (!members.has(e.insightId) || !countsForTheWeek(e) || !passes(e, gate)) continue
    const ms = Date.parse(e.commentDate)
    if (Number.isFinite(ms) && ms < firstMs) { firstMs = ms; first = e.commentDate }
  }
  return first
}

/** A citation as a quote a finding may print, with its insight's embedding
 *  text (the product's formula) and, given the gate it passed, what it says
 *  on its own (`substanceOf`). */
export const optionOf = (e: DatedEvidence, gate?: GateOptions): QuoteOption => ({
  quote: refOf(e),
  insightId: e.insightId,
  insightText: embedInput({ theme: e.theme ?? '', description: e.description }),
  ...(gate ? { substance: substanceOf(e, gate) } : {}),
})

/**
 * One theme's week: how many videos carry a citation the lenient gate passes
 * and a quote the strict gate passes, the quotes it may offer, and the kinds
 * and descriptions of the insights behind the lenient-gated material.
 * `evidence` may hold other themes' rows: only this theme's member insights
 * are read. Pure.
 *
 * THE QUOTES (best first, one per thread, never the video's own account, never
 * a brand insider) are strict-gated and kind-matched: those whose insight is
 * of the theme's dominant kind first, then any other kind that does not
 * contradict it, never one that does (praise against objection or pain point).
 * Each passes the strict gate the theme was judged under AND, where the
 * dominant kind is another, the gate under that kind too, so a problem-led
 * theme never quotes pure praise. `quoteRefs` is the first `POOL_QUOTES` of
 * `quoteOptions`. Each option carries what it says on its own (its form and
 * its score under the strict gate, `substanceOf`), which compose weighs with
 * its fit to the finding (v3).
 */
export function judgeTheme(clientId: string, theme: PoolTheme, evidence: readonly DatedEvidence[]): ThemeJudgement {
  const gate = strictGateFor(clientId, theme)
  const lenient = lenientGateFor(clientId, theme.label)
  const members = new Set(theme.memberIds)
  // The evidence's own order: relevance rank, then id (the theme voices' order),
  // so the choice does not depend on how the rows came back.
  const onLane = evidence
    .filter((e) => members.has(e.insightId) && e.video.audience === INDUSTRY_AUDIENCE && e.video.lane === COMMENTS_READ_LANE)
    .sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))
  const mine = onLane.filter(countsForTheWeek)
  const makerVideos = new Set(onLane.filter((e) => e.context?.segment === 'maker').map((e) => e.video.uuid)).size
  const gatedVideoIds = passingVideoIds(mine, members, gate)
  const counted: { e: DatedEvidence; score: number }[] = []
  for (const e of mine) {
    const verdict = judge(e, lenient)
    if (verdict.ok) counted.push({ e, score: verdict.score })
  }
  const lenientVideoIds = [...new Set(counted.map((p) => p.e.video.uuid))].sort()

  const dominantKind = dominantKindOf(mine, theme.kind)
  const dominantGate = dominantKind && dominantKind !== theme.kind ? { ...gate, kind: dominantKind } : null
  const quotable = mine.filter((e) =>
    !e.insider &&
    !isOwnAccount(e) &&
    !contradictsDominant(e.kind, dominantKind) &&
    (!dominantGate || passes(e, dominantGate)))
  const used = new Set<string>()
  const first = pickEligible(quotable.filter((e) => e.kind === dominantKind), gateInputOf, POOL_QUOTE_OPTIONS, { ...gate, used })
  const threads = new Set(first.map((e) => threadOf(e.context) ?? e.video.uuid))
  const rest = first.length < POOL_QUOTE_OPTIONS
    ? pickEligible(quotable.filter((e) => e.kind !== dominantKind && !threads.has(threadOf(e.context) ?? e.video.uuid)), gateInputOf, POOL_QUOTE_OPTIONS - first.length, { ...gate, used })
    : []
  const quoteOptions = [...first, ...rest].map((e) => optionOf(e, gate))
  const quoteRefs = quoteOptions.slice(0, POOL_QUOTES).map((o) => o.quote)

  // The kinds seen in the counted material, by the videos each is seen on.
  const videosByKind = new Map<string, Set<string>>()
  for (const { e } of counted) {
    if (!e.kind) continue
    const set = videosByKind.get(e.kind) ?? new Set<string>()
    set.add(e.video.uuid)
    videosByKind.set(e.kind, set)
  }
  const kinds = [...videosByKind.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([kind]) => kind)

  // The insights behind the counted material, best-fitting first: the gate's
  // score, then the evidence's rank, then the id. One per wording.
  const notes = notesOf(counted)
  return {
    theme, lenientVideos: lenientVideoIds.length, lenientVideoIds, gatedVideos: gatedVideoIds.length, gatedVideoIds,
    quoteRefs, quoteOptions, kinds, dominantKind, notes,
    seenVideos: new Set(onLane.map((e) => e.video.uuid)).size, makerVideos,
  }
}

/** Insight descriptions from gated citations, best-fitting first (the gate's
 *  score, then the evidence's rank, then the insight id), one per wording, at
 *  most `POOL_NOTES`. Pure. */
export function notesOf(passed: readonly { e: Pick<DatedEvidence, 'insightId' | 'rank' | 'description'>; score: number }[]): string[] {
  const best = new Map<string, { score: number; rank: number; description: string }>()
  for (const { e, score } of passed) {
    const held = best.get(e.insightId)
    if (!held || score > held.score || (score === held.score && e.rank < held.rank)) {
      best.set(e.insightId, { score, rank: e.rank, description: e.description })
    }
  }
  const seen = new Set<string>()
  const notes: string[] = []
  for (const [, b] of [...best.entries()].sort((x, y) => y[1].score - x[1].score || x[1].rank - y[1].rank || x[0].localeCompare(y[0]))) {
    const key = b.description.toLowerCase()
    if (!b.description || seen.has(key)) continue
    seen.add(key)
    notes.push(b.description)
    if (notes.length >= POOL_NOTES) break
  }
  return notes
}

/** Is the theme eligible? Three lenient-gated videos, one strict-gated one,
 *  and not maker-led. */
export const isEligible = (j: Pick<ThemeJudgement, 'lenientVideos' | 'gatedVideos' | 'seenVideos' | 'makerVideos'>): boolean =>
  j.lenientVideos >= POOL_MIN_VIDEOS && j.gatedVideos >= POOL_MIN_STRICT && !isMakerLed(j)

/** The eligible themes, ranked: lenient-gated videos, then strict-gated ones,
 *  then the week's videos, then the registry id so the order never depends
 *  on how the rows came back. Uncapped (the cap is `buildWeekPool`'s): a thin
 *  week is judged on this whole list. Pure. */
export function rankEligible(judged: readonly ThemeJudgement[]): ThemeJudgement[] {
  return judged
    .filter(isEligible)
    .sort((a, b) =>
      b.lenientVideos - a.lenientVideos ||
      b.gatedVideos - a.gatedVideos ||
      b.theme.weekVideos - a.theme.weekVideos ||
      a.theme.themeId.localeCompare(b.theme.themeId))
}

// ---- Theme → subject -------------------------------------------------------------

/**
 * The subject a theme is part of: the one holding the most of the theme's
 * member insights (`subject_memberships.member`), where it holds at least
 * `SUBJECT_MIN_MEMBERS` of them and at least `SUBJECT_SHARE_FLOOR` of the
 * theme's member ids as the run stored them; else null. A tie goes to the
 * subject earlier in `order` (the subjects' own order), then by id. Pure.
 */
export function subjectForTheme(
  memberIds: readonly string[],
  subjectsOf: ReadonlyMap<string, readonly string[]>,
  order: readonly string[] = [],
): string | null {
  const members = [...new Set(memberIds)]
  if (members.length === 0) return null
  const counts = new Map<string, number>()
  for (const id of members) for (const s of new Set(subjectsOf.get(id) ?? [])) counts.set(s, (counts.get(s) ?? 0) + 1)
  const at = (s: string) => {
    const i = order.indexOf(s)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  let best: string | null = null
  let bestN = 0
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && best != null && (at(s) - at(best) || s.localeCompare(best)) < 0)) {
      best = s
      bestN = n
    }
  }
  return best != null && bestN >= SUBJECT_MIN_MEMBERS && bestN / members.length >= SUBJECT_SHARE_FLOOR ? best : null
}

/** Insight id → the subjects it is a member of, from subject → members. */
export function invertMembers(bySubject: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [subject, ids] of bySubject) for (const id of ids) out.set(id, [...(out.get(id) ?? []), subject])
  return out
}

// ---- The pool ----------------------------------------------------------------------

/** What the pool says about the week and its month, before the candidates. */
export interface PoolHead {
  clientId: string
  runId: string
  window: { from: string; to: string }
  month: string
  weekVideos: number
  weekComments: number
  monthVideos: number
  /** The market's week and month to date (v3); absent where not read. */
  market?: WeekMarketFigures | null
  /** The month is stated in full (a week that carried past its end, M2). */
  monthComplete?: boolean
}

/** The per-theme facts read after eligibility, for the candidates kept. */
export interface PoolFacts {
  /** Category videos citing the theme in the month to date. Absent is 0. */
  monthK: ReadonlyMap<string, number>
  /** The lenient-gated videos citing the theme in the month to date
   *  (`passingVideoIds` over `[month start, window end)`). Absent is none. */
  monthVideoIds?: ReadonlyMap<string, readonly string[]>
  /** The first comment date among those citations (`firstPassingDate`).
   *  Absent is null. */
  firstHeard?: ReadonlyMap<string, string | null>
  /** `themeFlags`' other inputs (lib/pages/overview-market/board.ts): last
   *  month's category k (null where last month has no category row), whether
   *  any earlier month in any audience held the theme, and whether a run that
   *  opened a new clustering regime minted it. */
  flags: ReadonlyMap<string, { prevK: number | null; heardBefore: boolean; regrouped: boolean }>
  subjectOf: ReadonlyMap<string, string | null>
}

/** The pool from the ranked eligible themes: the first `POOL_CAP`, numbered
 *  in rank order. Thin is judged on every eligible theme, not on the cap. Pure. */
export function buildWeekPool(head: PoolHead, ranked: readonly ThemeJudgement[], facts: PoolFacts): WeekPool {
  const candidates: PoolCandidate[] = ranked.slice(0, POOL_CAP).map((j, i) => {
    const id = j.theme.themeId
    const monthK = facts.monthK.get(id) ?? 0
    const f = facts.flags.get(id)
    return {
      id: `C${i + 1}`,
      themeId: id,
      label: j.theme.label,
      description: j.theme.description,
      kinds: j.kinds,
      dominantKind: j.dominantKind,
      lenses: lensesOf(j.kinds),
      weekVideos: j.theme.weekVideos,
      lenientVideos: j.lenientVideos,
      lenientVideoIds: j.lenientVideoIds,
      gatedVideos: j.gatedVideos,
      gatedVideoIds: j.gatedVideoIds,
      monthVideoIds: [...(facts.monthVideoIds?.get(id) ?? [])],
      monthK,
      monthN: head.monthVideos,
      subjectId: facts.subjectOf.get(id) ?? null,
      isNew: f ? themeFlags({ k: monthK, prevK: f.prevK, heardBefore: f.heardBefore, regrouped: f.regrouped }).includes('new') : false,
      firstHeard: facts.firstHeard?.get(id) ?? null,
      quoteRefs: j.quoteRefs,
      quoteOptions: j.quoteOptions,
      notes: j.notes,
    }
  })
  return { ...head, candidates, thin: ranked.length < POOL_THIN_BELOW }
}

// ---- The reads ---------------------------------------------------------------------

/**
 * The week pool for one run. READ-ONLY. Every read is the product's own reader
 * where one exists; a read that fails throws, and the caller (the pipeline
 * step, the script) decides what a failure costs.
 */
export async function loadWeekPool(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; brands?: readonly string[] },
): Promise<WeekPool> {
  const { clientId, runId } = opts

  // The run and its frozen window. `select('*')`, as every window reader does:
  // an absent column arrives as an absent key rather than a 42703.
  const runRes = await admin.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (runRes.error) throw new Error(`written pool run: ${runRes.error.message}`)
  if (!runRes.data) throw new Error(`written pool: no run ${runId} for this client`)
  const stored = rowWindow(runRes.data as WindowColumns)
  if (!stored?.start || !stored.end) throw new Error(`written pool: run ${runId} carries no window`)
  const window = { from: stored.start, to: stored.end }
  // The month the week is restated against (lib/written/month.ts): the one it
  // ended in, so far; or, for a week that started in the month before, that
  // month IN FULL, its figures read to its end rather than to the window's.
  const reading = readingMonthOf(window)
  const month = reading.month

  // The week under this run's clustering, on the market's audiences: the
  // candidates are the category's (themes are grouped within it); the
  // market's size is the category and the tracked brands pooled (v3).
  const rivals = (await loadMarketRivalAudiences(admin, clientId)) ?? []
  const week = await loadWindowReading(admin, clientId, { from: window.from, to: window.to, runId, audiences: marketAudiences(rivals) })
  if (!week.denominators || !week.themes) throw new Error('written pool: the window reads are not applied here')
  const weekDen = week.denominators.find((d) => d.audience === INDUSTRY_AUDIENCE)
  // Only a theme on three category videos can reach three gated ones.
  const raw = week.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS)

  const brands = opts.brands ?? (await loadTrackedBrands(admin, clientId))
  const themes = await loadPoolThemes(admin, clientId, runId, raw)
  const evidence = await loadDatedEvidence(admin, clientId, themes.flatMap((t) => t.memberIds), window, { brands })
  const ranked = rankEligible(themes.map((t) => judgeTheme(clientId, t, evidence)))
  const kept = ranked.slice(0, POOL_CAP).map((j) => j.theme)

  const [monthRead, subjectOf, monthHeard] = await Promise.all([
    loadMonthFacts(admin, { clientId, runId, window, month, monthTo: reading.to, themes: kept, rivals }),
    loadThemeSubjects(admin, clientId, kept),
    loadMonthVideoIds(admin, { clientId, window, month, monthTo: reading.to, themes: kept, brands }),
  ])
  return buildWeekPool(
    {
      clientId,
      runId,
      window,
      month,
      weekVideos: weekDen?.videos ?? 0,
      weekComments: weekDen?.comments ?? 0,
      monthVideos: monthRead.monthN,
      market: marketFiguresOf({ week: week.denominators, month: monthRead.marketRows, rivals }),
      monthComplete: reading.complete,
    },
    ranked,
    { monthK: monthRead.monthK, flags: monthRead.flags, subjectOf, monthVideoIds: monthHeard.ids, firstHeard: monthHeard.first },
  )
}

/**
 * The market's week and month to date (the Dashboard's figures, v3) from
 * per-audience denominator rows of ONE period each: pooled over the category
 * and the tracked brands' audiences by the product's own rule
 * (`pooledDenominators`: disjoint audiences add, the client's own posts and
 * any untracked audience are left out). Null where a period was not read or
 * holds no market row: never zero for "not measured". Pure.
 */
export function marketFiguresOf(input: {
  week: readonly { audience: string; videos: number; comments: number }[] | null
  month: readonly { audience: string; videos: number; comments: number }[] | null
  rivals: readonly string[]
}): WeekMarketFigures {
  const pooled = (rows: typeof input.week): WeekMarketFigures['week'] => {
    if (!rows) return { videos: null, comments: null }
    // One period: every row under one key, so the pooling is across audiences only.
    const key = '2000-01-01'
    const c = pooledDenominators(rows.map((r) => ({ month: key, audience: r.audience, videos: r.videos, comments: r.comments })), input.rivals).get(key)
    return { videos: c?.videos ?? null, comments: c?.comments ?? null }
  }
  return { week: pooled(input.week), month: pooled(input.month) }
}

/**
 * Each kept theme's lenient-gated videos over the month to date,
 * `[month start, monthTo)` (the window's end, or the month's own end for a
 * week that carried past it), counted exactly as its week is
 * (`passingVideoIds`): the ids a finding's month figure is the union of; and
 * the first comment date among them (`firstPassingDate`), which says whether
 * a theme new this month was first heard this week. One evidence read for the
 * kept themes only.
 */
async function loadMonthVideoIds(
  admin: SupabaseClient,
  a: { clientId: string; window: { from: string; to: string }; month: string; monthTo: string; themes: readonly PoolTheme[]; brands: readonly string[] },
): Promise<{ ids: Map<string, string[]>; first: Map<string, string | null> }> {
  const ids = new Map<string, string[]>()
  const first = new Map<string, string | null>()
  if (a.themes.length === 0) return { ids, first }
  const period = { from: `${a.month}T00:00:00.000Z`, to: a.monthTo }
  const evidence = await loadDatedEvidence(admin, a.clientId, a.themes.flatMap((t) => t.memberIds), period, { brands: a.brands })
  for (const t of a.themes) {
    const members = new Set(t.memberIds)
    const gate = lenientGateFor(a.clientId, t.label)
    ids.set(t.themeId, passingVideoIds(evidence, members, gate))
    first.set(t.themeId, firstPassingDate(evidence, members, gate))
  }
  return { ids, first }
}

/** The run's observation of each theme and its Pass B description. Exported
 *  for the long-run pool (lib/written/longrun.ts), which reads the same. */
export async function loadPoolThemes(
  admin: SupabaseClient,
  clientId: string,
  runId: string,
  raw: readonly { theme_id: string; videos: number }[],
): Promise<PoolTheme[]> {
  const ids = [...new Set(raw.map((t) => String(t.theme_id)))]
  if (ids.length === 0) return []
  type Obs = { theme_id: string; label: string | null; category: string | null; match_kind: string | null; member_insight_ids: string[] | null }
  type Desc = { registry_id: string | null; description: string | null }
  const obs: Obs[] = []
  const desc = new Map<string, string>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const [o, d] = await Promise.all([
      admin.from('theme_observations').select('theme_id, label, category, match_kind, member_insight_ids')
        .eq('client_id', clientId).eq('run_id', runId).in('theme_id', part),
      admin.from('themes').select('registry_id, description')
        .eq('client_id', clientId).eq('run_id', runId).in('registry_id', part),
    ])
    if (o.error) throw new Error(`written pool observations: ${o.error.message}`)
    if (d.error) throw new Error(`written pool descriptions: ${d.error.message}`)
    obs.push(...((o.data ?? []) as Obs[]))
    for (const r of (d.data ?? []) as Desc[]) if (r.registry_id && r.description?.trim()) desc.set(String(r.registry_id), r.description.trim())
  }
  const videosOf = new Map(raw.map((t) => [String(t.theme_id), t.videos]))
  return obs.flatMap((o) => {
    const id = String(o.theme_id)
    const label = o.label?.trim()
    if (!label) return []
    return [{
      themeId: id,
      label,
      description: desc.get(id) ?? null,
      kind: o.category ?? null,
      matchKind: o.match_kind ?? null,
      memberIds: (o.member_insight_ids ?? []).map(String),
      weekVideos: videosOf.get(id) ?? 0,
    }]
  })
}

/**
 * The month the candidates are stated against, and `themeFlags`' inputs.
 *
 * The stored rows (`loadMonthSeries`) where this run wrote the month (its
 * category denominator carries this run's id): the figure the pages print.
 * Otherwise the window read `[month start, window end)` under this run, which
 * is the month as this run left it; that keeps a candidate's month count on
 * the clustering that counted its week. Last month and "heard before" are the
 * stored rows either way, as Conversation reads them.
 */
async function loadMonthFacts(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; window: { from: string; to: string }; month: string; monthTo: string; themes: readonly PoolTheme[]; rivals: readonly string[] },
): Promise<{ monthN: number; monthK: Map<string, number>; flags: PoolFacts['flags']; marketRows: { audience: string; videos: number; comments: number }[] | null }> {
  const ids = a.themes.map((t) => t.themeId)
  const set = await loadMonthSeries(admin, a.clientId, {
    objectKind: 'theme',
    objectIds: ids,
    from: FIRST_MONTH,
    to: a.month,
    updatesByMonth: {},
    firstRunMonth: null,
  })
  if (set.substrate !== 'seeded' || (ids.length > 0 && set.numeratorSubstrate !== 'seeded')) {
    throw new Error(`written pool: the month rows are ${set.substrate === 'seeded' ? set.numeratorSubstrate : set.substrate}`)
  }
  const denOf = (m: string) => set.denominators.find((d) => monthStartOf(d.month) === m && d.audience === INDUSTRY_AUDIENCE) ?? null
  const categoryPoint = (id: string, m: string) =>
    set.series.find((s) => s.objectId === id && s.audience === INDUSTRY_AUDIENCE)?.points.find((p) => monthStartOf(p.month) === m) ?? null

  const monthK = new Map<string, number>()
  let monthN: number
  // The market's month to date, per audience (pooled by the caller): the
  // same rows, on the same rule, as the category's.
  let marketRows: { audience: string; videos: number; comments: number }[] | null
  const den = denOf(a.month)
  if (den && den.run_id === a.runId) {
    monthN = den.videos
    for (const id of ids) monthK.set(id, categoryPoint(id, a.month)?.k ?? 0)
    marketRows = set.denominators.filter((d) => monthStartOf(d.month) === a.month)
  } else {
    const read = await loadWindowReading(admin, a.clientId, { from: `${a.month}T00:00:00.000Z`, to: a.monthTo, runId: a.runId, audiences: marketAudiences(a.rivals) })
    if (!read.denominators || !read.themes) throw new Error('written pool: the window reads are not applied here')
    monthN = read.denominators.find((d) => d.audience === INDUSTRY_AUDIENCE)?.videos ?? 0
    for (const id of ids) monthK.set(id, read.themes.find((t) => t.audience === INDUSTRY_AUDIENCE && String(t.theme_id) === id)?.videos ?? 0)
    marketRows = read.denominators
  }

  // themeFlags' inputs, read as Conversation reads them (lib/pages/voice-surface.ts):
  // last month's category k is 0 where last month has a category row and the
  // theme is not in it, null where it has none; "heard before" is any earlier
  // month in any audience with videos.
  const prevKey = prevMonth(a.month)
  const prevRow = denOf(prevKey)
  const base = new Map<string, { prevK: number | null; heardBefore: boolean }>()
  for (const id of ids) {
    const prevK = prevRow ? categoryPoint(id, prevKey)?.k ?? 0 : null
    const heardBefore = (prevK ?? 0) > 0 || set.series.some((s) => s.objectId === id && s.points.some((p) => monthStartOf(p.month) < a.month && (p.k ?? 0) > 0))
    base.set(id, { prevK, heardBefore })
  }
  // The regime rule (WP1.9), read only where it can decide the flag: a theme
  // at the floor this month that no earlier month holds.
  const unheard = ids.filter((id) => (monthK.get(id) ?? 0) >= THEME_FLOOR && base.get(id)?.prevK != null && !base.get(id)?.heardBefore)
  let opened: Promise<boolean> | null = null
  const regrouped = unheard.length > 0
    ? await loadRegrouped(admin, a.clientId, unheard, {
        runId: a.runId,
        minted: new Set(a.themes.filter((t) => t.matchKind === 'new').map((t) => t.themeId)),
        opened: () => (opened ??= loadRegimeOpened(admin, a.clientId, a.runId)),
      })
    : new Set<string>()
  const flags = new Map<string, { prevK: number | null; heardBefore: boolean; regrouped: boolean }>()
  for (const id of ids) {
    const b = base.get(id) ?? { prevK: null, heardBefore: false }
    flags.set(id, { ...b, regrouped: regrouped.has(id) })
  }
  return { monthN, monthK, flags, marketRows }
}

/** Each kept theme's subject, among the tenant's confirmed subjects. Null for
 *  every theme where the subjects are not recorded here. */
async function loadThemeSubjects(admin: SupabaseClient, clientId: string, themes: readonly PoolTheme[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>(themes.map((t) => [t.themeId, null]))
  if (themes.length === 0) return out
  let subjects: Awaited<ReturnType<typeof loadActiveSubjects>>
  try {
    subjects = await loadActiveSubjects(admin, clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return out
    throw error
  }
  if (subjects.length === 0) return out
  const bySubject = await loadMemberInsightIdsBySubject(admin, clientId, subjects.map((s) => s.id))
  if (!bySubject) return out
  const subjectsOf = invertMembers(bySubject)
  const order = subjects.map((s) => s.id)
  for (const t of themes) out.set(t.themeId, subjectForTheme(t.memberIds, subjectsOf, order))
  return out
}
