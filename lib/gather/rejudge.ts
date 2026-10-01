import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { loadGatherConfig } from './gather'
import { buildGateVerdictRows, type GateVerdictRow } from './gate-verdicts'
import { classifyRelevance, type RelevanceVerdict } from './relevance'
import { selectAll } from '../supabase-admin'

/**
 * THE VIDEOS THE GATE LET IN UNJUDGED, JUDGED AFTER ALL (the backfill's
 * regate, 1 Oct evening; the lead's ruling).
 *
 * Before the 24 Sep fix (commit 6efc8588) a relevance batch that OpenAI
 * refused kept all sixty of its videos unjudged (`gate_verdicts.source =
 * 'default'`). A resurfaced video is never judged again, so those videos stay
 * in the market's counts and mark every week they draw a comment in as
 * `unchecked`. This judges the ones still in the market lane with today's
 * check (`classifyRelevance`, the gather's own call), appends today's verdict
 * for each (the default rows stay: the log is append-only), and hands back
 * the ones today's check drops, for `regate_videos` (migration
 * 20261106092000) to remove with a backup.
 *
 * It finishes the 24 Sep fix rather than changing how we judge: the same
 * prompt and model as every gather since, on the videos that fix could not
 * reach. So its record is that fix's shape (`gate_rule` / `relevance_gate`).
 */

/** One video the gate let in unjudged, as today's check reads it. */
export interface UnjudgedVideo {
  id: string
  platform: string
  video_id: string
  account_name: string | null
  caption: string | null
  hashtags: string[] | null
}

/** The videos of the market lane (comments read in full, not the client's
 *  own posts) whose NEWEST relevance verdict is the fail-open default. A
 *  video judged since (by a later gather or by this) is not one. Bounded at
 *  `cap`. */
export async function loadUnjudgedMarketVideos(db: SupabaseClient, clientId: string, cap = 1000): Promise<{ videos: UnjudgedVideo[]; unjudgedAll: number }> {
  type Gv = { platform: string; video_id: string; source: string; kept: boolean; created_at: string }
  const gv = await selectAll<Gv>(() => db.from('gate_verdicts').select('platform, video_id, source, kept, created_at')
    .eq('client_id', clientId).order('created_at').order('id') as unknown as { range: (a: number, b: number) => PromiseLike<{ data: Gv[] | null; error: unknown }> })
  const keys = newestDefaultKept(gv)
  const byPlatform = new Map<string, string[]>()
  for (const k of keys) {
    const [p, ...id] = k.split('\u0000')
    byPlatform.set(p, [...(byPlatform.get(p) ?? []), id.join('\u0000')])
  }
  type V = UnjudgedVideo & { analyzed_lane: string | null; is_client: boolean | null }
  const videos: V[] = []
  for (const [platform, ids] of byPlatform) {
    for (const part of chunk(ids, 100)) {
      const r = await db.from('videos').select('id, platform, video_id, account_name, caption, hashtags, analyzed_lane, is_client')
        .eq('client_id', clientId).eq('platform', platform).in('video_id', part)
      if (r.error) throw new Error(`videos: ${r.error.message}`)
      videos.push(...((r.data ?? []) as V[]))
    }
  }
  const market = videos.filter((v) => v.analyzed_lane === 'full' && v.is_client !== true)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, cap)
  return { videos: market.map(({ analyzed_lane: _l, is_client: _c, ...v }) => v), unjudgedAll: keys.length }
}

/** `platform\0video_id` of every video whose newest verdict is a kept
 *  `default` (ties on the clock: the later row in the given order). Pure. */
export function newestDefaultKept(rows: readonly { platform: string; video_id: string; source: string; kept: boolean; created_at: string }[]): string[] {
  const newest = new Map<string, { source: string; kept: boolean; at: string }>()
  for (const r of rows) {
    const k = `${r.platform}\u0000${r.video_id}`
    const h = newest.get(k)
    if (!h || r.created_at >= h.at) newest.set(k, { source: r.source, kept: r.kept, at: r.created_at })
  }
  return [...newest.entries()].filter(([, v]) => v.kept && v.source === 'default').map(([k]) => k).sort()
}

/** `platform\0video_id` of every video whose NEWEST verdict is not a clean
 *  keep: the fail-open default, or a drop (the regate's cited videos, which
 *  today's check dropped and stored work keeps). Exactly `market_week_volumes`'
 *  `unchecked` rule (migration 20261106091000, newest by `created_at` then
 *  `id`; the rows come in that order). These, and only these, are the videos
 *  the operator may keep (`--keep`). Pure. */
export function newestUnchecked(rows: readonly { platform: string; video_id: string; source: string; kept: boolean; created_at: string }[]): string[] {
  const newest = new Map<string, { source: string; kept: boolean; at: string }>()
  for (const r of rows) {
    const k = `${r.platform}\u0000${r.video_id}`
    const h = newest.get(k)
    if (!h || r.created_at >= h.at) newest.set(k, { source: r.source, kept: r.kept, at: r.created_at })
  }
  return [...newest.entries()].filter(([, v]) => !v.kept || v.source === 'default').map(([k]) => k).sort()
}

/** The requested keeps that are NOT flagged unchecked (`newestUnchecked`),
 *  each named: a keep is the operator's verdict on a video the check could
 *  not stand behind, never a way to put back any video at all. Pure. */
export function keepRefusals(videos: readonly Pick<UnjudgedVideo, 'platform' | 'video_id'>[], unchecked: ReadonlySet<string>): string[] {
  return videos
    .filter((v) => !unchecked.has(`${v.platform}\u0000${v.video_id}`))
    .map((v) => `${v.platform}:${v.video_id}: not flagged unchecked (its newest verdict is a clean keep, or it has none); only the flagged videos can be kept`)
}

/** The `config_changes` row the operator's keeps log: ONE change, the 24 Sep
 *  fix's own shape (`gate_rule` / `relevance_gate`, as `regate_videos` logs),
 *  because a keep judges videos the fail-open gate let in or the regate named,
 *  and changes no rule: the comparison judge measures it as the fix, and
 *  neither the week chart nor the same-age line cuts at it (`isFailOpenFix`).
 *  No note (Heinrich, 27 Sep: these rows carry no sentence); the reason rides
 *  on each verdict. Pure. */
export function operatorKeepChange(clientId: string, videos: readonly Pick<UnjudgedVideo, 'platform' | 'video_id'>[], actorLabel: string, at: string): Record<string, unknown> {
  const ids = videos.map((v) => `${v.platform}:${v.video_id}`)
  // Field for field what `regate_videos` inserts (the SQL writes `gate_rule`,
  // which `ConfigSurface` does not list, so `changeRow` cannot build it).
  return {
    client_id: clientId,
    changed_at: at,
    surface: 'gate_rule',
    field: 'relevance_gate',
    before: { unchecked: ids },
    after: { kept_by_operator: ids },
    actor_kind: 'script',
    actor_user_id: null,
    actor_label: actorLabel,
    run_id: null,
    source: 'logged',
    rows_affected: videos.length,
    note: null,
  }
}

/** What today's check says of each, and what follows. Pure. */
export interface RegatePlan {
  /** Kept by today's check: they stay, now checked. */
  kept: UnjudgedVideo[]
  /** Dropped by today's check, and nothing stored cites them: removed. */
  drop: UnjudgedVideo[]
  /** Dropped, but a recommendation, plan check, Ask answer or export cites
   *  one of their insights: kept, and named, for a person to decide. */
  cited: UnjudgedVideo[]
  /** Still not judged (today's batch failed too): left as they are. */
  undecided: UnjudgedVideo[]
}

export function planRegate(
  videos: readonly UnjudgedVideo[],
  verdictOf: (v: UnjudgedVideo) => RelevanceVerdict | undefined,
  citedVideoIds: ReadonlySet<string>,
): RegatePlan {
  const plan: RegatePlan = { kept: [], drop: [], cited: [], undecided: [] }
  for (const v of videos) {
    const verdict = verdictOf(v)
    if (!verdict || verdict.source === 'default') plan.undecided.push(v)
    else if (verdict.relevant) plan.kept.push(v)
    else if (citedVideoIds.has(v.id)) plan.cited.push(v)
    else plan.drop.push(v)
  }
  return plan
}

/** The verdict rows today's check appends: one per judged video, `run_id`
 *  null (no gather made them), the reason saying it was judged again. A
 *  video still undecided gets no row (another default would say nothing).
 *  Pure. */
export function rejudgeRows(clientId: string, videos: readonly UnjudgedVideo[], verdictOf: (v: UnjudgedVideo) => RelevanceVerdict | undefined): GateVerdictRow[] {
  const out: GateVerdictRow[] = []
  for (const v of videos) {
    const verdict = verdictOf(v)
    if (!verdict || verdict.source === 'default') continue
    const [row] = buildGateVerdictRows(clientId, null, v.platform, [{ video_id: v.video_id, account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] }],
      new Map([[v.video_id, { ...verdict, reason: `judged again after the 24 Sep fix: ${verdict.reason}` }]]))
    out.push(row)
  }
  return out
}

/** Today's check over the videos, keyed `platform\0video_id` (two platforms
 *  can share a video id). One call per sixty, gpt-4.1-mini. */
export async function judgeToday(clientId: string, videos: readonly UnjudgedVideo[]): Promise<{ verdictOf: (v: UnjudgedVideo) => RelevanceVerdict | undefined; costUsd: number; failedBatches: number }> {
  const key = (v: Pick<UnjudgedVideo, 'platform' | 'video_id'>) => `${v.platform}\u0000${v.video_id}`
  if (videos.length === 0) return { verdictOf: () => undefined, costUsd: 0, failedBatches: 0 }
  const config = await loadGatherConfig(clientId)
  const result = await classifyRelevance(videos.map((v) => ({ video_id: key(v), account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] })), { method: 'gpt', config })
  return { verdictOf: (v) => result.verdicts.get(key(v)), costUsd: result.costUsd, failedBatches: result.failedBatches }
}

/** The videos whose insights something stored cites (recommendations, plan
 *  checks, saved Ask answers, frozen exports: `citedEvidenceIds`), among
 *  these. Read before anything is removed; a read that fails throws. */
export async function citedAmong(db: SupabaseClient, clientId: string, videoIds: readonly string[], citedInsightIds: ReadonlySet<string>): Promise<Set<string>> {
  const out = new Set<string>()
  for (const part of chunk([...videoIds], 100)) {
    const r = await db.from('audience_insights').select('id, source_video_id').eq('client_id', clientId).in('source_video_id', part)
    if (r.error) throw new Error(`insights: ${r.error.message}`)
    for (const row of (r.data ?? []) as { id: string; source_video_id: string }[]) if (citedInsightIds.has(row.id)) out.add(row.source_video_id)
  }
  return out
}

/** The operator's keeps (`--keep <ids> --yes`): one appended verdict per
 *  video, kept, source `operator`, the reason saying who and why. The newest
 *  verdict then is a clean keep, so the video is checked (migration
 *  20261106093000). Pure. */
export function operatorKeepRows(clientId: string, videos: readonly UnjudgedVideo[], reason: string): GateVerdictRow[] {
  return videos.map((v) => {
    const [row] = buildGateVerdictRows(clientId, null, v.platform, [{ video_id: v.video_id, account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] }],
      new Map([[v.video_id, { relevant: true, reason: `kept by the operator: ${reason}`, source: 'gpt' as const }]]))
    return { ...row, kept: true, source: 'operator' as const }
  })
}
