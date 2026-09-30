import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import { COMMENTS_READ_LANE } from '../pipeline/pass-a'
import { rowWindow, type WindowColumns } from '../pipeline/run-bookkeeping'
import { loadRegimeOpened } from '../pages/overview'
import { THEME_FLOOR, themeFlags } from '../pages/overview-market/board'
import { accountKey } from '../pages/overview-market/voices'
import { loadMemberInsightIdsBySubject } from '../pages/subjects'
import { loadRegrouped } from '../pages/voice-surface'
import { gateFor } from '../quote-context'
import { pickEligible, quoteGate } from '../quote-gate'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { loadMonthSeries, loadWindowReading } from '../reading/read'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { loadActiveSubjects } from '../subjects/membership'
import { isMissingSubjects } from '../subjects/types'
import { gateInputOf, loadDatedEvidence, refOf, type DatedEvidence } from './evidence'
import type { Lens, PoolCandidate, QuoteRef, WeekPool } from './types'

// The week pool (plan T1): the themes a week's written findings may be built
// from, each with the evidence code stands behind.
//
// WHAT A CANDIDATE IS. A theme of the run's own clustering
// (`theme_observations`, keyed by `theme_registry.id`) that at least three
// distinct CATEGORY videos on the READ LANE cite in the run's window, each
// with at least one quote the product's STRICT theme gate passes: `quoteGate`
// with `gateFor(clientId)` and the theme block's options (`claim` the label,
// `requireRelevance`, `kind` the theme's kind), exactly as research C replayed
// it. A video a maker posted (`segments_for_videos` says 'maker') never
// counts: it is set aside before the gate, which refuses it anyway.
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
//    run left it;
//  · dated by the comment, audience by the videos' CASE (client, then a
//    tracked rival, else the category), lane `analyzed_lane = 'full'` (M13).
//
// NOTHING HERE IS A COMMENT'S WORDS. Quotes leave as refs with `text: ''`, and
// `notes` are Pass A's insight descriptions. The texts are read so the gate
// can judge them and go no further (lib/written/evidence.ts).

/** A candidate needs this many distinct videos with a quote the gate passes. */
export const POOL_MIN_VIDEOS = 3
/** The most candidates a pool carries. */
export const POOL_CAP = 12
/** Fewer eligible candidates than this is a thin week. */
export const POOL_THIN_BELOW = 3
/** Quotes kept per candidate, one per thread. */
export const POOL_QUOTES = 3
/** Insight descriptions kept per candidate. */
export const POOL_NOTES = 8
/** A theme is part of a subject when that subject holds at least this share of
 *  the theme's member insights. */
export const SUBJECT_SHARE_FLOOR = 0.3
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
  gatedVideos: number
  quoteRefs: QuoteRef[]
  kinds: string[]
  notes: string[]
}

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

/**
 * One theme's week: how many videos carry a quote the strict gate passes, the
 * quotes it may offer (best first, one per thread, never the video's own
 * account), and the kinds and descriptions of the insights behind those
 * quotes. `evidence` may hold other themes' rows: only this theme's member
 * insights are read. Pure.
 */
export function judgeTheme(clientId: string, theme: PoolTheme, evidence: readonly DatedEvidence[]): ThemeJudgement {
  const gate = gateFor(clientId, { claim: theme.label, requireRelevance: true, kind: theme.kind })
  const members = new Set(theme.memberIds)
  // The evidence's own order: relevance rank, then id (the theme voices' order),
  // so the choice does not depend on how the rows came back.
  const mine = evidence
    .filter((e) => members.has(e.insightId) && countsForTheWeek(e))
    .sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))
  const passed: { e: DatedEvidence; score: number }[] = []
  for (const e of mine) {
    const verdict = quoteGate(gateInputOf(e), gate)
    if (verdict.ok) passed.push({ e, score: verdict.score })
  }
  const gatedVideos = new Set(passed.map((p) => p.e.video.uuid)).size
  const quoteRefs = pickEligible(mine.filter((e) => !isOwnAccount(e)), gateInputOf, POOL_QUOTES, gate).map(refOf)

  // The kinds seen in the gated material, by the videos each is seen on.
  const videosByKind = new Map<string, Set<string>>()
  for (const { e } of passed) {
    if (!e.kind) continue
    const set = videosByKind.get(e.kind) ?? new Set<string>()
    set.add(e.video.uuid)
    videosByKind.set(e.kind, set)
  }
  const kinds = [...videosByKind.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([kind]) => kind)

  // The insights behind the gated quotes, best-fitting first: the gate's score,
  // then the evidence's rank, then the id. One per wording.
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
  return { theme, gatedVideos, quoteRefs, kinds, notes }
}

/** The eligible themes, ranked: gated videos, then the week's videos, then
 *  the registry id so the order never depends on how the rows came back.
 *  Uncapped (the cap is `buildWeekPool`'s): a thin week is judged on this
 *  whole list. Pure. */
export function rankEligible(judged: readonly ThemeJudgement[]): ThemeJudgement[] {
  return judged
    .filter((j) => j.gatedVideos >= POOL_MIN_VIDEOS)
    .sort((a, b) => b.gatedVideos - a.gatedVideos || b.theme.weekVideos - a.theme.weekVideos || a.theme.themeId.localeCompare(b.theme.themeId))
}

// ---- Theme → subject -------------------------------------------------------------

/**
 * The subject a theme is part of: the one whose members hold the largest share
 * of the theme's member insights (`subject_memberships.member`), or null where
 * that share is under `SUBJECT_SHARE_FLOOR`. The share is of the theme's
 * member ids as the run stored them. A tie goes to the subject earlier in
 * `order` (the subjects' own order), then by id. Pure.
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
  return best != null && bestN / members.length >= SUBJECT_SHARE_FLOOR ? best : null
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
}

/** The per-theme facts read after eligibility, for the candidates kept. */
export interface PoolFacts {
  /** Category videos citing the theme in the month to date. Absent is 0. */
  monthK: ReadonlyMap<string, number>
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
      lenses: lensesOf(j.kinds),
      weekVideos: j.theme.weekVideos,
      gatedVideos: j.gatedVideos,
      monthK,
      monthN: head.monthVideos,
      subjectId: facts.subjectOf.get(id) ?? null,
      isNew: f ? themeFlags({ k: monthK, prevK: f.prevK, heardBefore: f.heardBefore, regrouped: f.regrouped }).includes('new') : false,
      quoteRefs: j.quoteRefs,
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
export async function loadWeekPool(admin: SupabaseClient, opts: { clientId: string; runId: string }): Promise<WeekPool> {
  const { clientId, runId } = opts

  // The run and its frozen window. `select('*')`, as every window reader does:
  // an absent column arrives as an absent key rather than a 42703.
  const runRes = await admin.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (runRes.error) throw new Error(`written pool run: ${runRes.error.message}`)
  if (!runRes.data) throw new Error(`written pool: no run ${runId} for this client`)
  const stored = rowWindow(runRes.data as WindowColumns)
  if (!stored?.start || !stored.end) throw new Error(`written pool: run ${runId} carries no window`)
  const window = { from: stored.start, to: stored.end }
  const month = monthStartOf(window.to)

  // The week on the category, under this run's clustering.
  const week = await loadWindowReading(admin, clientId, { from: window.from, to: window.to, runId, audiences: [INDUSTRY_AUDIENCE] })
  if (!week.denominators || !week.themes) throw new Error('written pool: the window reads are not applied here')
  const weekDen = week.denominators.find((d) => d.audience === INDUSTRY_AUDIENCE)
  // Only a theme on three category videos can reach three gated ones.
  const raw = week.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE && t.videos >= POOL_MIN_VIDEOS)

  const themes = await loadPoolThemes(admin, clientId, runId, raw)
  const evidence = await loadDatedEvidence(admin, clientId, themes.flatMap((t) => t.memberIds), window)
  const ranked = rankEligible(themes.map((t) => judgeTheme(clientId, t, evidence)))
  const kept = ranked.slice(0, POOL_CAP).map((j) => j.theme)

  const [monthRead, subjectOf] = await Promise.all([
    loadMonthFacts(admin, { clientId, runId, window, month, themes: kept }),
    loadThemeSubjects(admin, clientId, kept),
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
    },
    ranked,
    { monthK: monthRead.monthK, flags: monthRead.flags, subjectOf },
  )
}

/** The run's observation of each theme and its Pass B description. */
async function loadPoolThemes(
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
  a: { clientId: string; runId: string; window: { from: string; to: string }; month: string; themes: readonly PoolTheme[] },
): Promise<{ monthN: number; monthK: Map<string, number>; flags: PoolFacts['flags'] }> {
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
  const den = denOf(a.month)
  if (den && den.run_id === a.runId) {
    monthN = den.videos
    for (const id of ids) monthK.set(id, categoryPoint(id, a.month)?.k ?? 0)
  } else {
    const read = await loadWindowReading(admin, a.clientId, { from: `${a.month}T00:00:00.000Z`, to: a.window.to, runId: a.runId, audiences: [INDUSTRY_AUDIENCE] })
    if (!read.denominators || !read.themes) throw new Error('written pool: the window reads are not applied here')
    monthN = read.denominators.find((d) => d.audience === INDUSTRY_AUDIENCE)?.videos ?? 0
    for (const id of ids) monthK.set(id, read.themes.find((t) => t.audience === INDUSTRY_AUDIENCE && String(t.theme_id) === id)?.videos ?? 0)
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
  return { monthN, monthK, flags }
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
