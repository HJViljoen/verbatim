import type { SupabaseClient } from '@supabase/supabase-js'

import { longMonth } from '../format'
import { COMMENTS_READ_LANE } from '../pipeline/pass-a'
import { rowWindow, type WindowColumns } from '../pipeline/run-bookkeeping'
import { pickThemedRunId, type ThemedRunRow } from '../pages/themed-run'
import { sinceStart } from '../reading/horizon'
import { marketAudiences } from '../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../reading/month-key'
import { loadMonthSeries, loadWindowReading } from '../reading/read'
import { loadMarketRivalAudiences } from '../reading/reading-view'
import { CLIENT_AUDIENCE } from '../rivals'
import { checkWeekRead, type WeekCheck } from './check'
import { loadCompanyContext, type CompanyContext } from './company'
import { callBudget, WEEK_READ_STEP_BUDGET_MS, type CallBudget } from './deadline'
import { judge, loadDatedEvidence, loadTrackedBrands, type DatedEvidence } from './evidence'
import { generateLongRun, LONGRUN_MAX, LONGRUN_MODEL, LONGRUN_PROMPT_VERSION, type LongRunOutput } from './longrun-write'
import { readingMonthOf } from './month'
import { dominantKindOf, isMakerLed, lenientGateFor, loadPoolThemes, notesOf, POOL_MIN_VIDEOS, type PoolTheme } from './pool'
import { ADVICE, scrubWeekText, toldWhatToDo, type WeekScrubCounts } from './scrub'
import { WEEK_READS_TABLE, longRunWritten, saveWeekRead, type WeekReadRow } from './store'
import { sureOf } from './sure'
import type { LongRunIdea, LongRunReadData, WeekReadHeld, WhoPart } from './types'
import { loadBrandNames, loadCommentBrands, whoSplit, type WhoVideo } from './who'
import type { ParseClient } from './write-model'

// The long-run read (pages build, 1 Oct): "What holds across {months}", the
// lead of Your market as the bigger picture. The week read's machinery
// (lib/written/pool.ts, evidence.ts, scrub.ts, check.ts) over a long window.
//
// THE WINDOW. Whole calendar months, ending with the read's month: back to the
// first month the market cleared the floor (decision M's `sinceStart`, the
// month the product could first read anything), and at most three months (the
// last ninety days, in months, so every month it names was read whole). One
// month is not a long run: a window of one month is thin, and nothing is
// written.
//
// THE POOL. Themes of the themed run's clustering (`theme_observations`),
// sized over the window by `window_theme_readings` (the window read that
// spans months, never a sum of month rows), on the market's audiences (the
// category and the tracked rivals) AND the client's own posts, because what
// people say under the client's own posts is talk about the client (the
// design's "Sealand's community work is remembered…"). Each theme is judged
// on its comment evidence dated in the window, exactly as the week pool judges
// a week: the read lane only, a maker's video never counts, a maker-led theme
// is not a candidate (`isMakerLed`), a brand insider passes no gate, and what
// counts is a citation the LENIENT gate passes (`lenientGateFor`). No quote is
// picked: the section prints none.
//
// WHO IT IS ABOUT, per video (lib/written/who.ts): the brand a counted comment
// names, else the video's audience. Frozen with the read.
//
// COMPOSE (code owns every fact): an idea rests on the candidates it cites
// that exist, each candidate on one idea only; on at least the evidence the
// week calls reasonable (`sureOf`, five distinct videos); and on talk heard in
// at least two of the window's months, the read's month among them, so
// "Heard in August and September" is true of every idea that prints. The
// self-check holds a headline the conversation contradicts. Ordered by
// evidence, at most five.

/** At most this many months: the last ninety days, in whole months. */
export const LONGRUN_MAX_MONTHS = 3
/** At least this many: one month is not a long run. */
export const LONGRUN_MIN_MONTHS = 2
/** A theme is judged only with this many videos over the window (makers in). */
export const LONGRUN_JUDGE_MIN_VIDEOS = 5
/** The most themes judged, largest first: bounds the evidence read. */
export const LONGRUN_JUDGE_CAP = 60
/** The most candidates the writer sees. */
export const LONGRUN_CAP = 20
/** Of those, kept for themes led by the client's talk, and as many for the
 *  rivals', whatever their size (`selectLongRun`). */
export const LONGRUN_BRAND_SLOTS = 3
/** The least of the step's budget left for the hook to start: its reads
 *  (about half a minute), the writer's floor and the self-check's cap. Less
 *  than this, it is not started (`maybeWriteLongRun`). */
export const LONGRUN_STEP_FLOOR_MS = 150_000

// ---- The window ---------------------------------------------------------------------------

/** The months a long-run read for `month` covers, oldest first: up to
 *  `LONGRUN_MAX_MONTHS` ending with it, none before the first month the
 *  market cleared the floor. With no such month, the month alone. Pure. */
export function longRunMonths(month: string, firstFloorMonth: string | null): string[] {
  const end = monthStartOf(month)
  const months = [end]
  if (!firstFloorMonth) return months
  const floor = monthStartOf(firstFloorMonth)
  while (months.length < LONGRUN_MAX_MONTHS) {
    const p = prevMonth(months[0])
    if (p < floor) break
    months.unshift(p)
  }
  return months
}

/** "August and September", "July, August and September". Pure. */
export function monthsPhrase(months: readonly string[]): string {
  const names = months.map((m) => longMonth(m))
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The window of a set of months: `[first month start, the month after the
 *  last)`. Pure. */
export function windowOfMonths(months: readonly string[]): { from: string; to: string } {
  return { from: `${months[0]}T00:00:00.000Z`, to: `${nextMonth(months[months.length - 1])}T00:00:00.000Z` }
}

/** The month the run's week has carried past, which is the month a run
 *  closes: the month before the one its window ends in. Pure. */
export function endedMonthOf(window: { from: string; to: string }): string {
  return prevMonth(readingMonthOf(window).endMonth)
}

// ---- One theme over the window --------------------------------------------------------------

export interface LongRunJudgement {
  theme: PoolTheme
  /** The distinct videos with a counted citation, sorted. */
  videoIds: string[]
  /** The same by the month each counted citation is dated in. */
  monthVideoIds: Record<string, string[]>
  kinds: string[]
  dominantKind: string | null
  notes: string[]
  /** Each counted video, its audience and the comments counted on it (who
   *  the talk is about is read off these). */
  videos: { id: string; audience: string; comments: string[] }[]
  seenVideos: number
  makerVideos: number
}

/** May this citation count toward the long run at all? A video of the
 *  universe (the market and the client's own posts) on the read lane that no
 *  reader has marked a maker's. */
export function countsForTheLongRun(e: DatedEvidence, universe: ReadonlySet<string>): boolean {
  return universe.has(e.video.audience) && e.video.lane === COMMENTS_READ_LANE && e.context?.segment !== 'maker'
}

/** The week pool's lenient gate (`lenientGateFor`, the label as the claim,
 *  nothing required), taking the client's own posts too (`allowOwn`): what
 *  people say under them is talk about the client, which this read counts. */
export const longRunGateFor = (clientId: string, label: string) => ({ ...lenientGateFor(clientId, label), allowOwn: true })

/**
 * One theme over the window: the videos carrying a citation the lenient gate
 * passes (no maker's video, no brand insider), by month, with the kinds and
 * descriptions behind them and the comments counted on each video. `evidence`
 * may hold other themes' rows. Pure.
 */
export function judgeLongRunTheme(clientId: string, theme: PoolTheme, evidence: readonly DatedEvidence[], universe: ReadonlySet<string>): LongRunJudgement {
  const members = new Set(theme.memberIds)
  const lenient = longRunGateFor(clientId, theme.label)
  const onLane = evidence
    .filter((e) => members.has(e.insightId) && universe.has(e.video.audience) && e.video.lane === COMMENTS_READ_LANE)
    .sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))
  const makerVideos = new Set(onLane.filter((e) => e.context?.segment === 'maker').map((e) => e.video.uuid)).size
  const counted: { e: DatedEvidence; score: number }[] = []
  for (const e of onLane) {
    if (!countsForTheLongRun(e, universe)) continue
    const v = judge(e, lenient)
    if (v.ok) counted.push({ e, score: v.score })
  }
  const byMonth = new Map<string, Set<string>>()
  const byVideo = new Map<string, { audience: string; comments: Set<string> }>()
  for (const { e } of counted) {
    const m = monthStartOf(e.commentDate)
    const set = byMonth.get(m) ?? new Set<string>()
    set.add(e.video.uuid)
    byMonth.set(m, set)
    const v = byVideo.get(e.video.uuid) ?? { audience: e.video.audience, comments: new Set<string>() }
    v.comments.add(e.commentId)
    byVideo.set(e.video.uuid, v)
  }
  const videosByKind = new Map<string, Set<string>>()
  for (const { e } of counted) {
    if (!e.kind) continue
    const set = videosByKind.get(e.kind) ?? new Set<string>()
    set.add(e.video.uuid)
    videosByKind.set(e.kind, set)
  }
  return {
    theme,
    videoIds: [...byVideo.keys()].sort(),
    monthVideoIds: Object.fromEntries([...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, s]) => [m, [...s].sort()])),
    kinds: [...videosByKind.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).map(([k]) => k),
    dominantKind: dominantKindOf(counted.map((c) => c.e), theme.kind),
    notes: notesOf(counted),
    videos: [...byVideo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, v]) => ({ id, audience: v.audience, comments: [...v.comments].sort() })),
    seenVideos: new Set(onLane.map((e) => e.video.uuid)).size,
    makerVideos,
  }
}

/**
 * The themes worth judging, from the window read's per-audience rows: those on
 * `LONGRUN_JUDGE_MIN_VIDEOS` videos or more, the largest `LONGRUN_JUDGE_CAP`,
 * plus any on `POOL_MIN_VIDEOS` of the client's own posts (small beside the
 * category's, and the only place the client's own talk is). Pure.
 */
export function themesToJudge(rows: readonly { audience: string; theme_id: string; videos: number }[]): { theme_id: string; videos: number }[] {
  const total = new Map<string, number>()
  const own = new Map<string, number>()
  for (const r of rows) {
    const id = String(r.theme_id)
    total.set(id, (total.get(id) ?? 0) + r.videos)
    if (r.audience === CLIENT_AUDIENCE) own.set(id, (own.get(id) ?? 0) + r.videos)
  }
  const sorted = [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const big = sorted.filter(([, v]) => v >= LONGRUN_JUDGE_MIN_VIDEOS).slice(0, LONGRUN_JUDGE_CAP)
  const kept = new Set(big.map(([id]) => id))
  const ownLed = sorted.filter(([id]) => !kept.has(id) && (own.get(id) ?? 0) >= POOL_MIN_VIDEOS)
  return [...big, ...ownLed].map(([theme_id, videos]) => ({ theme_id, videos }))
}

/** A candidate: lenient-gated on at least `POOL_MIN_VIDEOS` videos over the
 *  window, and not maker-led. */
export const isLongRunEligible = (j: Pick<LongRunJudgement, 'videoIds' | 'seenVideos' | 'makerVideos'>): boolean =>
  j.videoIds.length >= POOL_MIN_VIDEOS && !isMakerLed(j)

/** The months a judgement was heard in. */
const monthsHeard = (j: Pick<LongRunJudgement, 'monthVideoIds'>): number =>
  Object.values(j.monthVideoIds).filter((ids) => ids.length > 0).length

/** The eligible themes, ranked: videos over the window, then the months heard
 *  in, then the registry id. Pure. */
export function rankLongRun(judged: readonly LongRunJudgement[]): LongRunJudgement[] {
  return judged
    .filter(isLongRunEligible)
    .sort((a, b) => b.videoIds.length - a.videoIds.length || monthsHeard(b) - monthsHeard(a) || a.theme.themeId.localeCompare(b.theme.themeId))
}

// ---- The pool -----------------------------------------------------------------------------------

export interface LongRunCandidate {
  id: string                 // 'C1'…, stable within one read
  themeId: string
  label: string
  description: string | null
  kinds: string[]
  dominantKind: string | null
  videoIds: string[]
  monthVideoIds: Record<string, string[]>
  notes: string[]
  /** Each counted video, with the tracked brands its counted comments name. */
  whoVideos: WhoVideo[]
  /** The split of `whoVideos` (the writer reads it in words). */
  who: WhoPart[]
}

export interface LongRunPool {
  clientId: string
  /** The themed run whose clustering the candidates are. */
  runId: string
  /** The read's month and the window's months, oldest first. */
  month: string
  months: string[]
  window: { from: string; to: string }
  candidates: LongRunCandidate[]
  /** One month only, or fewer than three candidates: nothing is written. */
  thin: boolean
}

/** Who each video of a judgement is about, with the brands its counted
 *  comments name. */
function whoVideosOf(j: Pick<LongRunJudgement, 'videos'>, brandsOf: ReadonlyMap<string, readonly string[]>): WhoVideo[] {
  return j.videos.map((v) => ({ id: v.id, audience: v.audience, named: [...new Set(v.comments.flatMap((c) => brandsOf.get(c) ?? []))] }))
}

/** A judgement whose videos are at least half about the client, or at least
 *  half about the tracked rivals. */
const ledBy = (who: readonly WhoPart[], side: 'client' | 'rival'): boolean => {
  const total = who.reduce((n, p) => n + p.videos, 0)
  const mine = who.filter((p) => (side === 'client' ? p.about === 'client' : p.about.startsWith('rival:'))).reduce((n, p) => n + p.videos, 0)
  return total > 0 && mine * 2 >= total
}

/**
 * The candidates, in rank order: the biggest themes, plus up to
 * `LONGRUN_BRAND_SLOTS` of the biggest led by the client's talk and as many
 * led by the rivals', so the writer can say what holds about the brands (the
 * design's "Rivals are known for concrete jobs; Sealand is heard for its
 * values") when the category's themes are far bigger. At most `LONGRUN_CAP`.
 * Pure.
 */
export function selectLongRun<T extends { who: readonly WhoPart[] }>(ranked: readonly T[], cap = LONGRUN_CAP): T[] {
  const client = ranked.filter((j) => ledBy(j.who, 'client')).slice(0, LONGRUN_BRAND_SLOTS)
  const rival = ranked.filter((j) => ledBy(j.who, 'rival') && !client.includes(j)).slice(0, LONGRUN_BRAND_SLOTS)
  const reserved = new Set<T>([...client, ...rival])
  const rest = ranked.filter((j) => !reserved.has(j)).slice(0, Math.max(0, cap - reserved.size))
  const keep = new Set<T>([...reserved, ...rest])
  return ranked.filter((j) => keep.has(j)).slice(0, cap)
}

/** The pool from the ranked judgements and each comment's named brands:
 *  attributed, selected (`selectLongRun`) and numbered in rank order. Pure. */
export function buildLongRunPool(
  head: Omit<LongRunPool, 'candidates' | 'thin'>,
  ranked: readonly LongRunJudgement[],
  brandsOf: ReadonlyMap<string, readonly string[]>,
  company: string,
): LongRunPool {
  const attributed = ranked.map((j) => {
    const whoVideos = whoVideosOf(j, brandsOf)
    return { j, whoVideos, who: whoSplit(whoVideos, company) }
  })
  const candidates = selectLongRun(attributed).map(({ j, whoVideos, who }, i): LongRunCandidate => ({
    id: `C${i + 1}`,
    themeId: j.theme.themeId,
    label: j.theme.label,
    description: j.theme.description,
    kinds: j.kinds,
    dominantKind: j.dominantKind,
    videoIds: j.videoIds,
    monthVideoIds: j.monthVideoIds,
    notes: j.notes,
    whoVideos,
    who,
  }))
  return { ...head, candidates, thin: head.months.length < LONGRUN_MIN_MONTHS || candidates.length < 3 }
}

/** The themed run as of `asOf`: the newest run that produced themes
 *  (`pickThemedRunId`, the standing facts' own read). */
export async function themedRunAsOf(admin: SupabaseClient, clientId: string, asOf: string): Promise<string | null> {
  const res = await admin.from('themes').select('run_id, created_at')
    .eq('client_id', clientId).not('run_id', 'is', null).lte('created_at', asOf)
    .order('created_at', { ascending: false }).limit(1)
  if (res.error) throw new Error(`long run themed run: ${res.error.message}`)
  return pickThemedRunId((res.data ?? []) as ThemedRunRow[])
}

/**
 * The long-run pool for one month. READ-ONLY. The themed run is `runId` where
 * given, else the newest as of `asOf`. A read that fails throws; the caller
 * decides what a failure costs.
 */
export async function loadLongRunPool(
  admin: SupabaseClient,
  opts: { clientId: string; month: string; company: string; runId?: string | null; asOf: Date; brands?: readonly string[] },
): Promise<LongRunPool> {
  const { clientId, company } = opts
  const month = monthStartOf(opts.month)

  // The months: back to the first month any audience cleared the floor.
  const series = await loadMonthSeries(admin, clientId, { from: '2019-01-01', to: month, updatesByMonth: {}, firstRunMonth: null })
  const months = longRunMonths(month, sinceStart(series.denominators.map((d) => ({ month: d.month, videos: d.videos }))).from)
  const window = windowOfMonths(months)
  const runId = opts.runId ?? (await themedRunAsOf(admin, clientId, opts.asOf.toISOString()))
  if (!runId) throw new Error('long run: no run has produced themes')
  const head = { clientId, runId, month, months, window }
  if (months.length < LONGRUN_MIN_MONTHS) return buildLongRunPool(head, [], new Map(), company)

  // The themes over the window, on the market and the client's own posts.
  const rivals = (await loadMarketRivalAudiences(admin, clientId)) ?? []
  const universe = new Set([...marketAudiences(rivals), CLIENT_AUDIENCE])
  const read = await loadWindowReading(admin, clientId, { from: window.from, to: window.to, runId, audiences: [...universe] })
  if (!read.themes) throw new Error('long run: the window reads are not applied here')
  const raw = themesToJudge(read.themes)

  const brands = opts.brands ?? (await loadTrackedBrands(admin, clientId))
  const themes = await loadPoolThemes(admin, clientId, runId, raw)
  const evidence = await loadDatedEvidence(admin, clientId, themes.flatMap((t) => t.memberIds), window, { brands })
  const ranked = rankLongRun(themes.map((t) => judgeLongRunTheme(clientId, t, evidence, universe)))

  // Who each eligible theme's talk is about: the brands its counted comments
  // name (one read), else each video's audience. Read before the selection,
  // which keeps room for the brands' own themes.
  const names = await loadBrandNames(admin, clientId, company)
  const brandsOf = await loadCommentBrands(admin, clientId, ranked.flatMap((j) => j.videos.flatMap((v) => v.comments)), names)
  return buildLongRunPool(head, ranked, brandsOf, company)
}

// ---- Scrub ---------------------------------------------------------------------------------------

/**
 * A comparison in time, which the long run never makes ("what holds, never
 * what changed"): applied to every field beside the week read's rules (its
 * direction word list drops "growing", "rising" and the like already). Each
 * entry is a phrase that claims a change on any reading; "a bag that turns
 * heads" is not one, so "turn(s) into" alone is.
 */
export const CHANGE: readonly { name: string; re: RegExp }[] = [
  { name: 'change over time', re: /\b(?:increasingly|more\s+and\s+more|less\s+and\s+less|no\s+longer|any\s*more|used\s+to|these\s+days|lately|recently|over\s+time|over\s+the\s+months|month\s+(?:after|on|by)\s+month|compared\s+(?:with|to)\s+(?:earlier|before|last|the\s+previous)|than\s+(?:before|earlier|last\s+month))\b/i },
  { name: 'since a month', re: /\bsince\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|last\s+month|the\s+start)\b/i },
  { name: 'became', re: /\b(?:shift(?:s|ed|ing)?\s+(?:to|toward|towards|from|away)|settl(?:es|ed|ing)\s+(?:on|into|around)|turn(?:s|ed)?\s+into|is\s+becoming|are\s+becoming|became|has\s+become|have\s+become|emerg(?:es|ed|ing)|start(?:s|ed)?\s+to|beg(?:an|ins)\s+to|starting\s+to|beginning\s+to)\b/i },
]

export interface ScrubbedLongRun {
  output: LongRunOutput
  counts: WeekScrubCounts
}

/** Every field through the week read's scrub (the `week_read` policy, the
 *  §0a backstop, no figures), with `CHANGE` and the advice rules as extra
 *  sentence rules, and its cap. Ids pass through for compose. Pure. */
export function scrubLongRun(w: LongRunOutput, opts: { company?: string } = {}): ScrubbedLongRun {
  const told = opts.company ? toldWhatToDo(opts.company) : null
  const extra = [...CHANGE, ...ADVICE, ...(told ? [told] : [])]
  let counts: WeekScrubCounts = { dropped: 0, droppedDigits: 0, droppedDirection: 0, droppedBanned: 0, droppedAdvice: 0, droppedLong: 0, leaked: false }
  const run = (raw: string, max: number, o: Parameters<typeof scrubWeekText>[2] = {}) => {
    const r = scrubWeekText(raw ?? '', max, { extra, ...o })
    counts = {
      dropped: counts.dropped + r.counts.dropped,
      droppedDigits: counts.droppedDigits + r.counts.droppedDigits,
      droppedDirection: counts.droppedDirection + r.counts.droppedDirection,
      droppedBanned: counts.droppedBanned + r.counts.droppedBanned,
      droppedAdvice: counts.droppedAdvice + r.counts.droppedAdvice,
      droppedLong: counts.droppedLong + r.counts.droppedLong,
      leaked: counts.leaked || r.counts.leaked,
    }
    return r.text
  }
  const ideas = (w.ideas ?? []).map((i) => ({
    headline: run(i.headline, LONGRUN_MAX.headline, { headline: true }),
    body: run(i.body, LONGRUN_MAX.body, { maxSentences: LONGRUN_MAX.bodySentences }),
    based_on: [...(i.based_on ?? [])],
  }))
  const in_short = run(w.in_short ?? '', LONGRUN_MAX.inShort, { maxSentences: LONGRUN_MAX.inShortSentences })
  return { output: { ideas, in_short }, counts }
}

// ---- Compose -------------------------------------------------------------------------------------

/**
 * From the scrubbed output to the stored read. Pure.
 *  · each idea's candidates are those it cites that exist and no earlier idea
 *    took (the writer's order; an invented id is dropped, never thrown);
 *  · held: no candidate left, a headline or body the scrub emptied, a
 *    headline the self-check contradicts, evidence under reasonable
 *    (`sureOf`), or talk heard in fewer than `LONGRUN_MIN_MONTHS` of the
 *    window's months or not in the read's month;
 *  · ordered by evidence, at most `LONGRUN_MAX.ideas`;
 *  · the lead prints only beside an idea, and not where it is contradicted.
 */
export function composeLongRun(input: {
  pool: LongRunPool
  written: LongRunOutput | null
  contradicted?: ReadonlyMap<string, string | null>
  company: string
  model: string
  costUsd: number
}): LongRunReadData {
  const { pool } = input
  const byId = new Map(pool.candidates.map((c) => [c.id.toUpperCase(), c]))
  const used = new Set<string>()
  const held: WeekReadHeld[] = []
  const kept: LongRunIdea[] = []
  for (const idea of input.written?.ideas ?? []) {
    const headline = idea.headline.trim()
    const body = idea.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    const cited = [...new Set(idea.based_on.map((id) => String(id).trim().toUpperCase()))]
      .map((id) => byId.get(id))
      .filter((c): c is LongRunCandidate => c != null && !used.has(c.id))
    const hold = (reason: string) => held.push({ reason, headline: headline || '(no headline)', section: 'finding' })
    if (!headline || body.length === 0) { hold('the scrub left no headline or body'); continue }
    if (cited.length === 0) { hold('it cites no candidate that is left'); continue }
    if (input.contradicted?.has(headline)) {
      const says = input.contradicted.get(headline)
      hold(`the conversation contradicts it${says ? `: ${says}` : ''}`)
      continue
    }
    const videos = new Set(cited.flatMap((c) => c.videoIds))
    const months = pool.months.map((m) => ({ month: m, videos: new Set(cited.flatMap((c) => c.monthVideoIds[m] ?? [])).size }))
    const heard = months.filter((m) => m.videos > 0)
    const sure = sureOf(cited.length, videos.size, videos.size)
    if (!sure) { hold(`too little evidence (${videos.size} videos)`); continue }
    if (heard.length < LONGRUN_MIN_MONTHS || !heard.some((m) => m.month === pool.month)) {
      hold(`not heard across the months (${heard.map((m) => longMonth(m.month)).join(', ') || 'none'})`)
      continue
    }
    for (const c of cited) used.add(c.id)
    kept.push({
      headline,
      body,
      basedOn: cited.map((c) => c.themeId),
      videos: videos.size,
      months,
      who: whoSplit(cited.flatMap((c) => c.whoVideos), input.company),
      sure,
    })
  }
  const ideas = kept.sort((a, b) => b.videos - a.videos).slice(0, LONGRUN_MAX.ideas)
  for (const dropped of kept.slice(LONGRUN_MAX.ideas)) held.push({ reason: 'over the cap', headline: dropped.headline, section: 'finding' })
  const lead = (input.written?.in_short ?? '').trim()
  const inShort = ideas.length > 0 && lead && !input.contradicted?.has(lead) ? lead : ''
  if (lead && !inShort && ideas.length > 0) held.push({ reason: 'the conversation contradicts it', headline: lead, section: 'week_line' })
  return {
    version: 1,
    kind: 'longrun',
    promptVersion: LONGRUN_PROMPT_VERSION,
    month: pool.month,
    months: pool.months,
    window: pool.window,
    inShort,
    ideas,
    held,
    model: input.model,
    costUsd: Math.round(input.costUsd * 10_000) / 10_000,
  }
}

// ---- Build, store, and the step's hook ------------------------------------------------------------

export interface BuiltLongRun {
  status: 'ready' | 'thin'
  data: LongRunReadData
  pool: LongRunPool
  called: boolean
  raw: LongRunOutput | null
  scrub: WeekScrubCounts | null
  check: WeekCheck | null
}

/** What the writer is handed, read from the database (a dry run may save it
 *  and build again without reading production twice). */
export interface LongRunInputs {
  company: string
  pool: LongRunPool
  context: CompanyContext | null
}

export async function loadLongRunInputs(
  admin: SupabaseClient,
  opts: { clientId: string; month: string; company: string; runId?: string | null; asOf?: Date },
): Promise<LongRunInputs> {
  const pool = await loadLongRunPool(admin, { clientId: opts.clientId, month: opts.month, company: opts.company, runId: opts.runId, asOf: opts.asOf ?? new Date() })
  const context = pool.thin ? null : await loadCompanyContext(admin, { clientId: opts.clientId, window: pool.window })
  return { company: opts.company, pool, context }
}

/**
 * The long-run read for one month: pool, writer, scrub, self-check, compose.
 * Writes nothing but the `ai_call_log` rows of its two calls, and not those
 * where `log` is false. A thin pool makes no call. `logRunId` is the run the
 * calls are logged against (the step's run; the themed run otherwise).
 */
export async function buildLongRunRead(
  admin: SupabaseClient,
  opts: {
    clientId: string; month: string; company: string; runId?: string | null; logRunId?: string; asOf?: Date
    log: boolean; client?: ParseClient; budget?: CallBudget; inputs?: LongRunInputs
  },
): Promise<BuiltLongRun> {
  const inputs = opts.inputs ?? (await loadLongRunInputs(admin, opts))
  const { pool, company, context } = inputs
  if (pool.thin) {
    const data = composeLongRun({ pool, written: null, company, model: '', costUsd: 0 })
    return { status: 'thin', data, pool, called: false, raw: null, scrub: null, check: null }
  }
  const runId = opts.logRunId ?? pool.runId
  const call = await generateLongRun(admin, { company, pool, context, clientId: opts.clientId, runId, log: opts.log, client: opts.client, budget: opts.budget })
  return finishLongRun(admin, { ...opts, runId, pool, company, raw: call.written, costUsd: call.costUsd })
}

/** After the writer: scrub, self-check (the headlines and the lead), compose. */
export async function finishLongRun(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; pool: LongRunPool; company: string; raw: LongRunOutput; costUsd: number; log: boolean; budget?: CallBudget; check?: WeekCheck },
): Promise<BuiltLongRun> {
  const scrubbed = scrubLongRun(a.raw, { company: a.company })
  const known = new Set(a.pool.candidates.map((c) => c.id.toUpperCase()))
  const claims = [
    ...scrubbed.output.ideas.filter((i) => i.headline && i.based_on.some((id) => known.has(String(id).trim().toUpperCase()))).map((i) => i.headline),
    ...(scrubbed.output.in_short ? [scrubbed.output.in_short] : []),
  ]
  const check = a.check ?? (await checkWeekRead(admin, { clientId: a.clientId, runId: a.runId, companyName: a.company, headlines: claims, persist: a.log, budget: a.budget }))
  const data = composeLongRun({ pool: a.pool, written: scrubbed.output, contradicted: check.contradicted, company: a.company, model: LONGRUN_MODEL, costUsd: a.costUsd + check.costUsd })
  return { status: data.ideas.length > 0 ? 'ready' : 'thin', data, pool: a.pool, called: true, raw: a.raw, scrub: scrubbed.counts, check }
}

/** The row a built long-run read is stored as, under the run that wrote it. */
export function longRunRowOf(clientId: string, runId: string, built: Pick<BuiltLongRun, 'status' | 'data'>): WeekReadRow {
  return {
    client_id: clientId,
    run_id: runId,
    kind: 'month',
    month: built.data.month,
    window_start: built.data.window.from,
    window_end: built.data.window.to,
    data: built.data,
    status: built.status,
    cost_usd: built.data.costUsd,
  }
}

export interface LongRunStepResult {
  status: 'ready' | 'thin' | 'failed' | 'not_due' | 'skipped'
  month: string | null
  ideas: number
  costUsd: number
  error?: string
}

export interface LongRunStepDeps {
  /** Is the month's read written already (ready or thin)? */
  written: (admin: SupabaseClient, clientId: string, month: string) => Promise<boolean>
  /** The run's frozen window. */
  window: (admin: SupabaseClient, clientId: string, runId: string) => Promise<{ from: string; to: string } | null>
  build: typeof buildLongRunRead
  save: (admin: SupabaseClient, row: WeekReadRow) => Promise<void>
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
  /** The clock (a test's stand-in). */
  now?: () => number
}

async function runWindow(admin: SupabaseClient, clientId: string, runId: string): Promise<{ from: string; to: string } | null> {
  const res = await admin.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (res.error) throw new Error(`long run window: ${res.error.message}`)
  const w = res.data ? rowWindow(res.data as WindowColumns) : null
  return w?.start && w.end ? { from: w.start, to: w.end } : null
}

const LONGRUN_FALLBACK = (clientId: string, month: string) =>
  `Fallback: node --env-file=.env.local --import tsx scripts/longrun-read.ts --client ${clientId} --month ${month.slice(0, 7)} (dry), then again with --write.`

/**
 * THE PIPELINE HOOK, inside the existing `write-week-read` step (no new step
 * id). At the first run after a month ends, write that month's long-run read:
 * the month the run's window has carried past (`endedMonthOf`), unless a
 * ready or thin read of it is stored already. NEVER THROWS, and never touches
 * the week's read:
 *  · the due check cannot be read: nothing is written and nobody is alerted
 *    (the next run asks again);
 *  · the build fails or runs out of the step's time (its calls share the
 *    step's budget, counted from `startedAt`, so the week's save is never put
 *    at risk): a failed row is stored, the operator is alerted once with the
 *    script to run, and the next run tries again.
 */
export async function maybeWriteLongRun(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; company: string; startedAt?: number },
  deps: Partial<LongRunStepDeps> & Pick<LongRunStepDeps, 'save' | 'alert'>,
): Promise<LongRunStepResult> {
  const d: LongRunStepDeps = { written: longRunWritten, window: runWindow, build: buildLongRunRead, ...deps }
  let month: string
  try {
    const window = await d.window(admin, opts.clientId, opts.runId)
    if (!window) return { status: 'not_due', month: null, ideas: 0, costUsd: 0 }
    month = endedMonthOf(window)
    if (await d.written(admin, opts.clientId, month)) return { status: 'not_due', month, ideas: 0, costUsd: 0 }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.warn(`[longrun-read] not checked: ${error}; the next run asks again`)
    return { status: 'skipped', month: null, ideas: 0, costUsd: 0, error }
  }
  // NOT STARTED WITHOUT TIME FOR IT: the week's read went first and its
  // calls share the step's budget. Said to the operator, with the script, and
  // asked again next run.
  const startedAt = opts.startedAt ?? Date.now()
  const left = startedAt + WEEK_READ_STEP_BUDGET_MS - (d.now ?? Date.now)()
  if (left < LONGRUN_STEP_FLOOR_MS) {
    const error = `only ${Math.max(0, Math.round(left / 1000))} s of the step's time left after the week's read`
    console.warn(`[longrun-read] not started: ${error}`)
    await d.alert(
      `Verbatim long-run read deferred: ${opts.company}`,
      `The long-run read for ${longMonth(month)} (the top of Your market) was not started on run ${opts.runId}: ${error}. The week's read is unaffected, and the next run tries again.\n\n${LONGRUN_FALLBACK(opts.clientId, month)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'skipped', month, ideas: 0, costUsd: 0, error }
  }
  try {
    const built = await d.build(admin, {
      clientId: opts.clientId, month, company: opts.company, logRunId: opts.runId, log: true,
      budget: callBudget({ startedAt, now: d.now }),
    })
    await d.save(admin, longRunRowOf(opts.clientId, opts.runId, built))
    console.log(`[longrun-read] ${built.status}: ${built.data.ideas.length} idea(s) for ${month}, $${built.data.costUsd}`)
    return { status: built.status, month, ideas: built.data.ideas.length, costUsd: built.data.costUsd }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`[longrun-read] failed: ${error}`)
    let stored = true
    try {
      await d.save(admin, { client_id: opts.clientId, run_id: opts.runId, kind: 'month', month: null, window_start: null, window_end: null, data: null, status: 'failed', cost_usd: 0 })
    } catch {
      stored = false
    }
    await d.alert(
      `Verbatim long-run read not written: ${opts.company}`,
      `The long-run read for ${longMonth(month)} ("What holds across ...", the top of Your market) could not be written on run ${opts.runId}. The week's read and the run are unaffected, and the next run tries again.\n\nError: ${error}\n${stored ? 'A failed row is stored in week_reads.' : 'No row could be stored.'}\n\n${LONGRUN_FALLBACK(opts.clientId, month)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'failed', month, ideas: 0, costUsd: 0, error }
  }
}

/** The table, for the script's guard. */
export const LONGRUN_TABLE = WEEK_READS_TABLE

/** Persist a built read (the script's --write). */
export async function saveLongRun(admin: SupabaseClient, clientId: string, runId: string, built: Pick<BuiltLongRun, 'status' | 'data'>): Promise<void> {
  await saveWeekRead(admin, longRunRowOf(clientId, runId, built))
}
