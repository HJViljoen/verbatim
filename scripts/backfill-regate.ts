// The regate step of scripts/backfill-platform.ts (`--regate`; the lead's
// ruling, 1 Oct evening). Helpers only: the backfill script runs them.
//
// THE 66. Before the 24 Sep fix a relevance batch that OpenAI refused kept its
// videos unjudged (`gate_verdicts.source = 'default'`); a resurfaced video is
// never judged again, so they stayed in the market's counts and kept every
// week they drew a comment in off the Dashboard's chart. This judges the ones
// still in the market lane with today's check, appends today's verdict for
// each (append-only), removes the ones today's check drops with a backup
// (`regate_videos`, migration 20261106092000; undo `regate_restore`), keeps
// any whose insights something stored cites (named, for a person), and then
// refreshes the reading month's stored rows (`freezeMonths`, exactly the
// pipeline's freeze-months visit, for that month only) so every reader counts
// without them at once, not from Sunday.
//
// DRY by default: the judging costs a fraction of a cent, nothing is stored,
// and the effect is SIMULATED on the reads (`simulateWeekRead`,
// `simulateLongRun`): the dropped videos come out of the figures the reads
// print, and the reads are composed again from the same writer output.

import type { SupabaseClient } from '@supabase/supabase-js'

import { whoSplit } from '../lib/brands/attribution'
import { chunk } from '../lib/chunk'
import { selectAll } from '../lib/supabase-admin'
import { scriptActor } from '../lib/config-log'
import {
  citedAmong, judgeToday, loadUnjudgedMarketVideos, planRegate, rejudgeRows,
  type RegatePlan, type UnjudgedVideo,
} from '../lib/gather/rejudge'
import type { RelevanceVerdict } from '../lib/gather/relevance'
import { citedEvidenceIds } from '../lib/pipeline/stale-analysis'
import { freezeMonths } from '../lib/reading/monthly'
import { subjectMonthSide } from '../lib/subjects/read'
import { finishLongRun, type BuiltLongRun } from '../lib/written/longrun'
import { readingMonthOf } from '../lib/written/month'
import { finishWeekRead, type BuiltWeekRead } from '../lib/written/step'
import type { PoolCandidate, StandingFact } from '../lib/written/types'

export interface RegateRead {
  plan: RegatePlan
  /** Every unjudged market-lane video (the plan's input). */
  videos: UnjudgedVideo[]
  unjudgedAll: number
  costUsd: number
  failedBatches: number
  verdictOf: (v: UnjudgedVideo) => RelevanceVerdict | undefined
  /** Where the verdicts came from: judged now, or a dry run's saved plan. */
  judgedAt: string
}

/** The plan a dry run saves and `--regate --yes` applies, so what is written
 *  is exactly what Heinrich read (today's check is a model: a fresh call can
 *  differ on a borderline video or two). */
export interface SavedRegatePlan {
  clientId: string
  judgedAt: string
  verdicts: { platform: string; video_id: string; verdict: RelevanceVerdict | null }[]
}

/** A saved plan this long old is not applied: judge again. */
export const SAVED_PLAN_MAX_AGE_MS = 48 * 60 * 60 * 1000

export function savedPlanOf(clientId: string, read: RegateRead): SavedRegatePlan {
  return { clientId, judgedAt: read.judgedAt, verdicts: read.videos.map((v) => ({ platform: v.platform, video_id: v.video_id, verdict: read.verdictOf(v) ?? null })) }
}

/** Load, judge with today's check (or take a dry run's saved verdicts),
 *  check citations, plan. Writes nothing. A video unjudged now that the saved
 *  plan does not name has no verdict: it is left as it is (undecided). */
export async function readRegate(db: SupabaseClient, clientId: string, saved?: SavedRegatePlan | null, now = Date.now()): Promise<RegateRead> {
  const { videos, unjudgedAll } = await loadUnjudgedMarketVideos(db, clientId)
  let verdictOf: RegateRead['verdictOf']
  let costUsd = 0
  let failedBatches = 0
  let judgedAt = new Date(now).toISOString()
  if (saved) {
    if (saved.clientId !== clientId) throw new Error('the saved regate plan is another client\'s')
    if (now - Date.parse(saved.judgedAt) > SAVED_PLAN_MAX_AGE_MS) throw new Error(`the saved regate plan was judged ${saved.judgedAt}, over 48 hours ago: run the dry run again`)
    const byKey = new Map(saved.verdicts.map((x) => [`${x.platform}\u0000${x.video_id}`, x.verdict ?? undefined]))
    verdictOf = (v) => byKey.get(`${v.platform}\u0000${v.video_id}`)
    judgedAt = saved.judgedAt
  } else {
    const judged = await judgeToday(clientId, videos)
    verdictOf = judged.verdictOf
    costUsd = judged.costUsd
    failedBatches = judged.failedBatches
  }
  const dropped = videos.filter((v) => verdictOf(v)?.relevant === false && verdictOf(v)?.source !== 'default')
  const cited = dropped.length > 0
    ? await citedAmong(db, clientId, dropped.map((v) => v.id), (await citedEvidenceIds(db as never, clientId)).insights)
    : new Set<string>()
  return { plan: planRegate(videos, verdictOf, cited), videos, unjudgedAll, costUsd, failedBatches, verdictOf, judgedAt }
}

/** Today's verdicts appended, the dropped removed with a backup, the month
 *  refreshed. The verdict rows go first: a removal that fails leaves them,
 *  and a second run then finds nothing unjudged and removes nothing, so the
 *  removal is re-run by hand (`regate_videos` with the listed ids). */
export async function applyRegate(
  db: SupabaseClient,
  a: { clientId: string; runId: string; month: string; read: RegateRead; actorLabel: string },
): Promise<{ verdicts: number; removal: Record<string, unknown> | null; refreshed: string }> {
  const rows = rejudgeRows(a.clientId, a.read.videos, a.read.verdictOf)
  for (const part of chunk(rows, 200)) {
    const { error } = await db.from('gate_verdicts').insert(part)
    if (error) throw new Error(`gate_verdicts: ${error.message}`)
  }
  let removal: Record<string, unknown> | null = null
  if (a.read.plan.drop.length > 0) {
    const { data, error } = await db.rpc('regate_videos', {
      p_client: a.clientId, p_video_ids: a.read.plan.drop.map((v) => v.id), p_actor_label: a.actorLabel, p_run_id: a.runId,
    })
    if (error) throw new Error(`regate_videos: ${error.message}`)
    removal = data as Record<string, unknown>
  }
  // The reading month's stored rows, without the removed videos: the
  // pipeline's own freeze-months visit, for this month only (a month past its
  // line is left for the run to freeze, as it would be).
  const r = await freezeMonths(db, {
    clientId: a.clientId, runId: a.runId, months: [a.month],
    sides: [subjectMonthSide(db, a.clientId)],
    actor: scriptActor(`${a.actorLabel} (the month refresh)`),
  })
  const refreshed = `${r.months.join(', ')}: denominators ${r.denominators.written} written (${r.denominators.frozen} frozen) · ${Object.entries(r.sides).map(([t, s]) => `${t} ${s.written}`).join(' · ')}`
  return { verdicts: rows.length, removal, refreshed }
}

// ---- What the removal takes out of the reads (the dry run's simulation) --------------------

/** The dropped videos' share of a period: videos with a comment dated in it,
 *  and those comments. */
interface Contribution { videos: number; comments: number }

/** The dropped videos' comments in the week's window and in the month to
 *  the window's end, and per subject the dropped videos a member insight of
 *  it was read on that month (what `month_subject_readings` counts). */
export async function dropContributions(
  db: SupabaseClient,
  clientId: string,
  drop: readonly UnjudgedVideo[],
  window: { from: string; to: string },
): Promise<{ week: Contribution; month: Contribution; weekVideoIds: Set<string>; monthVideoIds: Set<string>; bySubject: Map<string, Set<string>> }> {
  const out = { week: { videos: 0, comments: 0 }, month: { videos: 0, comments: 0 }, weekVideoIds: new Set<string>(), monthVideoIds: new Set<string>(), bySubject: new Map<string, Set<string>>() }
  if (drop.length === 0) return out
  const reading = readingMonthOf(window)
  const monthFrom = `${reading.month}T00:00:00.000Z`
  const monthTo = reading.to
  const weekVideos = out.weekVideoIds
  const byKey = new Map(drop.map((v) => [`${v.platform}\u0000${v.video_id}`, v.id]))
  const byPlatform = new Map<string, string[]>()
  for (const v of drop) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
  for (const [platform, ids] of byPlatform) {
    for (const part of chunk(ids, 100)) {
      // Paged: PostgREST caps a select at 1000 rows (AGENTS.md, selectAll).
      type C = { video_id: string; comment_date: string }
      const rows = await selectAll<C>(() => db.from('comments').select('video_id, comment_date').eq('client_id', clientId).eq('platform', platform).in('video_id', part)
        .gte('comment_date', monthFrom < window.from ? monthFrom : window.from).lt('comment_date', monthTo > window.to ? monthTo : window.to)
        .order('id') as unknown as { range: (a: number, b: number) => PromiseLike<{ data: C[] | null; error: unknown }> })
      for (const c of rows) {
        const id = byKey.get(`${platform}\u0000${c.video_id}`)
        if (!id) continue
        const t = Date.parse(c.comment_date)
        if (t >= Date.parse(window.from) && t < Date.parse(window.to)) { out.week.comments++; weekVideos.add(id) }
        if (t >= Date.parse(monthFrom) && t < Date.parse(monthTo)) { out.month.comments++; out.monthVideoIds.add(id) }
      }
    }
  }
  out.week.videos = weekVideos.size
  out.month.videos = out.monthVideoIds.size
  // The subjects: member insights of the dropped videos whose evidence cites a
  // comment dated in the month.
  const ids = drop.map((v) => v.id)
  const insights: { id: string; source_video_id: string }[] = []
  for (const part of chunk(ids, 100)) {
    const r = await db.from('audience_insights_current').select('id, source_video_id').eq('client_id', clientId).in('source_video_id', part)
    if (r.error) throw new Error(`insights: ${r.error.message}`)
    insights.push(...((r.data ?? []) as { id: string; source_video_id: string }[]))
  }
  if (insights.length === 0) return out
  const videoOf = new Map(insights.map((i) => [i.id, i.source_video_id]))
  const subjectsOf = new Map<string, string[]>()
  const datedIn = new Set<string>()
  for (const part of chunk(insights.map((i) => i.id), 100)) {
    type M = { audience_insight_id: string; subject_id: string }
    type E = { audience_insight_id: string }
    type Page<T> = { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
    const m = await selectAll<M>(() => db.from('subject_memberships').select('audience_insight_id, subject_id')
      .eq('client_id', clientId).eq('member', true).in('audience_insight_id', part).order('audience_insight_id').order('subject_id') as unknown as Page<M>)
    const e = await selectAll<E>(() => db.from('insight_evidence').select('id, audience_insight_id, comments!inner(comment_date)').eq('source', 'comment').in('audience_insight_id', part)
      .gte('comments.comment_date', monthFrom).lt('comments.comment_date', monthTo).order('id') as unknown as Page<E>)
    for (const r of m) subjectsOf.set(r.audience_insight_id, [...(subjectsOf.get(r.audience_insight_id) ?? []), r.subject_id])
    for (const r of e) datedIn.add(r.audience_insight_id)
  }
  for (const [insight, subjects] of subjectsOf) {
    if (!datedIn.has(insight)) continue
    for (const s of subjects) {
      const set = out.bySubject.get(s) ?? new Set<string>()
      set.add(videoOf.get(insight)!)
      out.bySubject.set(s, set)
    }
  }
  return out
}

const less = (n: number | null | undefined, by: number): number | null => (n == null ? null : Math.max(0, n - by))
const without = (ids: readonly string[], gone: ReadonlySet<string>) => ids.filter((id) => !gone.has(id))

/** The week read as it reads once the dropped videos are gone: the market's
 *  figures less their share, each subject's level less its dropped members
 *  (ranks again), each candidate's videos less the dropped ones, composed
 *  again from the same writer output (no model call). Pure. */
export function simulateWeekRead(built: BuiltWeekRead, company: string, gone: ReadonlySet<string>, c: Awaited<ReturnType<typeof dropContributions>>): BuiltWeekRead {
  if (!built.raw || !built.check) return built
  const pool = {
    ...built.pool,
    market: built.pool.market
      ? {
          week: { videos: less(built.pool.market.week.videos, c.week.videos), comments: less(built.pool.market.week.comments, c.week.comments) },
          month: { videos: less(built.pool.market.month.videos, c.month.videos), comments: less(built.pool.market.month.comments, c.month.comments) },
        }
      : built.pool.market,
    candidates: built.pool.candidates.map((cand): PoolCandidate => {
      const lenientVideoIds = without(cand.lenientVideoIds, gone)
      const gatedVideoIds = without(cand.gatedVideoIds, gone)
      const lost = cand.lenientVideoIds.length - lenientVideoIds.length
      return { ...cand, lenientVideoIds, lenientVideos: lenientVideoIds.length, gatedVideoIds, gatedVideos: gatedVideoIds.length, monthVideoIds: without(cand.monthVideoIds, gone), weekVideos: Math.max(0, cand.weekVideos - lost) }
    }),
  }
  const standing: StandingFact[] = built.standing.map((f) => (f.level
    ? { ...f, level: { k: Math.max(0, f.level.k - (c.bySubject.get(f.subjectId)?.size ?? 0)), n: Math.max(0, f.level.n - c.month.videos) } }
    : { ...f }))
  standing.sort((a, b) => (a.level ? 0 : 1) - (b.level ? 0 : 1) || (b.level?.k ?? 0) - (a.level?.k ?? 0) || a.name.localeCompare(b.name))
  let rank = 0
  for (const f of standing) f.rank = f.level ? ++rank : 0
  return finishWeekRead({ company, pool, standing, raw: built.raw, check: built.check, fit: built.fit, costUsd: built.data.costUsd - built.check.costUsd })
}

/** The long-run read once the dropped videos are gone: each candidate's
 *  videos, months and who less the dropped ones, composed again from the
 *  same writer output and self-check (no model call). */
export async function simulateLongRun(db: SupabaseClient, built: BuiltLongRun, a: { clientId: string; company: string; gone: ReadonlySet<string> }): Promise<BuiltLongRun> {
  if (!built.raw || !built.check) return built
  const pool = {
    ...built.pool,
    candidates: built.pool.candidates.map((c) => {
      const whoVideos = c.whoVideos.filter((v) => !a.gone.has(v.id))
      return {
        ...c,
        videoIds: without(c.videoIds, a.gone),
        monthVideoIds: Object.fromEntries(Object.entries(c.monthVideoIds).map(([m, ids]) => [m, without(ids, a.gone)])),
        whoVideos,
        who: whoSplit(whoVideos, a.company),
      }
    }),
  }
  return finishLongRun(db, { clientId: a.clientId, runId: built.pool.runId, pool, company: a.company, raw: built.raw, costUsd: built.data.costUsd - built.check.costUsd, log: false, check: built.check })
}
