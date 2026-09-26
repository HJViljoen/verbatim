import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { pipelineActor } from '../config-log'
import { segmentJudgeEnabled } from '../config'
import { heuristicVerdict } from '../gather/relevance'
import { isMissingObject, type StoredProvenance } from '../provenance/load'
import { SEGMENT_RULE_VERSION, segmentOfReason, segmentReason, segmentRulesEnabled, type Segment } from '../segments/rules'
import { selectAll } from '../supabase-admin'

// The `segment-videos` step (market-first decision F; plan WP3.2, deploy 4),
// the first of the four ids before `freeze-months`: `plan-segment-videos` +
// `segment-videos:${i}-of-${n}`, a batch of videos a step.
//
// At $0 until Heinrich says yes to the judge's spend. Every video a segments_v1
// label is missing for (after label-segments' one pass over every stored
// video on 30 Sep, those are the videos first stored since, the run's new
// ones) gets its segments_v1 RULE row, exactly as scripts/label-segments.ts
// writes it: the maker words and the bare names (lib/segments/rules.ts), and
// for a video a gate verdict admitted unjudged (source 'default') the free
// heuristic gate, which marks it noise or adds ';unjudged_admission' to its
// reason. No model call on that path.
//
// THE JUDGE (segments_v2, mf/s3-segments' lib/segments/judge.ts) runs only
// where SEGMENT_JUDGE_ENABLED is on for the tenant (off for every tenant,
// pinned by lib/config.test.ts) AND a judge is handed in. Its rows are
// additional (method 'judge', rule_version 'segments_v2'); the v1 rule rows are
// written either way, so the $0 reading never waits on a spend.
//
// A LABEL, NEVER A DELETION: rows are inserted, never updated, and no count
// loses a video. Non-fatal and a no-op until MF1's video_segments exists, and
// for a tenant with no segment rule (Össur, whose non-buyer content is lived
// experience, not making: CQ F43).

export const SEGMENT_BATCH = 500
/** The judge's rule version (plan §4.1: 'segments_v2' = judge). */
export const JUDGE_RULE_VERSION = 'segments_v2'

export interface SegmentVideo {
  id: string
  platform: string
  video_id: string
  caption: string | null
  hashtags: string[] | null
  topics: string[] | null
  source_keywords: string[] | null
  account_name: string | null
}

export interface SegmentLabel { segment: Segment; reason: string | null }

/**
 * One video's segments_v1 label: label-segments' own rule, line for line
 * (the rule, then the unjudged-admission heuristic). PURE.
 */
export function v1Label(v: SegmentVideo, p: Pick<StoredProvenance, 'first_terms' | 'first_subreddits' | 'evidence'> | undefined, unjudged: boolean): SegmentLabel {
  let reason = segmentReason({
    caption: v.caption, hashtags: v.hashtags, topics: v.topics,
    firstTerms: p?.first_terms, firstSubreddits: p?.first_subreddits, firstEvidence: p?.evidence, sourceKeywords: v.source_keywords,
  })
  let segment = segmentOfReason(reason)
  if (unjudged) {
    const h = heuristicVerdict({ video_id: v.video_id, account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] })
    if (h && !h.relevant) {
      segment = 'noise'
      reason = 'unjudged_admission'
    } else {
      reason = reason ? `${reason};unjudged_admission` : 'unjudged_admission'
    }
  }
  return { segment, reason }
}

/** A judge batch as the step hands it on: the pinned per-batch function of
 *  lib/segments/judge.ts (mf/s3-segments), wrapped by the pipeline. It returns
 *  the rows to write (method 'judge', rule_version 'segments_v2') and what it
 *  spent. Never called while SEGMENT_JUDGE_ENABLED is off. */
export type SegmentJudgeBatch = (videos: readonly SegmentVideo[]) => Promise<{
  rows: { video_id: string; segment: Segment; reason: string | null; rule_version: string }[]
  costUsd: number
}>

export interface SegmentPlan {
  batches: string[][]
  note: string
}

/** The videos still missing a segments_v1 label, in batches. */
export async function planSegmentVideos(admin: SupabaseClient, clientId: string): Promise<SegmentPlan> {
  if (!segmentRulesEnabled(clientId)) return { batches: [], note: 'no segment rule is switched on for this tenant' }
  let held: { video_id: string }[]
  try {
    held = await selectAll<{ video_id: string }>(() => admin.from('video_segments').select('video_id')
      .eq('client_id', clientId).eq('rule_version', SEGMENT_RULE_VERSION).neq('method', 'override').order('video_id'))
  } catch (e) {
    if (isMissingObject(e, 'video_segments')) return { batches: [], note: 'video_segments is not there (MF1 not applied)' }
    throw e
  }
  const labelled = new Set(held.map((h) => h.video_id))
  const ids = await selectAll<{ id: string }>(() => admin.from('videos').select('id').eq('client_id', clientId).order('id'))
  const missing = ids.map((r) => r.id).filter((id) => !labelled.has(id))
  return { batches: chunk(missing, SEGMENT_BATCH), note: `${missing.length} videos without a ${SEGMENT_RULE_VERSION} label (${labelled.size} held)` }
}

export interface SegmentBatchResult {
  written: number
  maker: number
  noise: number
  market: number
  unjudged: number
  judged: number
  costUsd: number
  judge: 'off' | 'on' | 'no_judge'
}

/** Label one batch: the v1 rule rows, and the judge's rows where it is on. */
export async function runSegmentBatch(admin: SupabaseClient, args: {
  clientId: string
  runId: string
  ids: readonly string[]
  judge?: SegmentJudgeBatch | null
}): Promise<SegmentBatchResult> {
  const { clientId, runId } = args
  const videos: SegmentVideo[] = []
  for (const part of chunk([...args.ids], 100)) {
    videos.push(...await selectAll<SegmentVideo>(() => admin.from('videos')
      .select('id, platform, video_id, caption, hashtags, topics, source_keywords, account_name')
      .eq('client_id', clientId).in('id', part).order('id')))
  }
  const provenance = new Map<string, StoredProvenance>()
  for (const part of chunk([...args.ids], 100)) {
    try {
      const rows = await selectAll<StoredProvenance>(() => admin.from('video_provenance')
        .select('video_id, first_terms, first_subreddits, method, evidence').eq('client_id', clientId).in('video_id', part).order('video_id'))
      for (const r of rows) provenance.set(r.video_id, r)
    } catch (e) {
      if (!isMissingObject(e, 'video_provenance')) throw e
    }
  }
  const unjudged = new Set<string>()
  const byPlatform = new Map<string, string[]>()
  for (const v of videos) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
  for (const [platform, platformIds] of byPlatform) {
    for (const part of chunk(platformIds, 100)) {
      const rows = await selectAll<{ platform: string; video_id: string }>(() => admin.from('gate_verdicts')
        .select('platform, video_id').eq('client_id', clientId).eq('platform', platform).eq('kept', true).eq('source', 'default')
        .in('video_id', part).order('video_id'))
      for (const r of rows) unjudged.add(`${r.platform}\u0000${r.video_id}`)
    }
  }

  const labels = videos.map((v) => ({ v, ...v1Label(v, provenance.get(v.id), unjudged.has(`${v.platform}\u0000${v.video_id}`)) }))
  const actorLabel = pipelineActor(runId, 'segment-videos').label
  // Replay-safe: what another attempt of this step already wrote is read back
  // just before the insert and left alone (one rule row per video and version).
  const heldNow = new Set<string>()
  for (const part of chunk(labels.map((l) => l.v.id), 100)) {
    const rows = await selectAll<{ video_id: string }>(() => admin.from('video_segments').select('video_id')
      .eq('client_id', clientId).eq('rule_version', SEGMENT_RULE_VERSION).neq('method', 'override').in('video_id', part).order('video_id'))
    for (const r of rows) heldNow.add(r.video_id)
  }
  const fresh = labels.filter((l) => !heldNow.has(l.v.id))
  for (const part of chunk(fresh, SEGMENT_BATCH)) {
    const { error } = await admin.from('video_segments').insert(part.map((l) => ({
      client_id: clientId, video_id: l.v.id, rule_version: SEGMENT_RULE_VERSION, segment: l.segment, method: 'rule',
      reason: l.reason, actor_label: actorLabel,
    })))
    if (error) throw new Error(`video_segments insert: ${error.message}`)
  }

  const result: SegmentBatchResult = {
    written: fresh.length,
    maker: fresh.filter((l) => l.segment === 'maker').length,
    noise: fresh.filter((l) => l.segment === 'noise').length,
    market: fresh.filter((l) => l.segment === 'market').length,
    unjudged: fresh.filter((l) => l.reason?.includes('unjudged_admission')).length,
    judged: 0,
    costUsd: 0,
    judge: segmentJudgeEnabled(clientId) ? (args.judge ? 'on' : 'no_judge') : 'off',
  }
  // The spend: only with the tenant's switch on AND a judge handed in.
  if (result.judge === 'on' && args.judge && videos.length > 0) {
    // Replay-safe and spend-safe: a video that already holds a judge row is
    // never judged again.
    const judgedNow = new Set<string>()
    for (const part of chunk(videos.map((v) => v.id), 100)) {
      const rows = await selectAll<{ video_id: string }>(() => admin.from('video_segments').select('video_id')
        .eq('client_id', clientId).eq('rule_version', JUDGE_RULE_VERSION).eq('method', 'judge').in('video_id', part).order('video_id'))
      for (const r of rows) judgedNow.add(r.video_id)
    }
    const toJudge = videos.filter((v) => !judgedNow.has(v.id))
    const judged = toJudge.length > 0 ? await args.judge(toJudge) : { rows: [], costUsd: 0 }
    if (judged.rows.length > 0) {
      const { error } = await admin.from('video_segments').insert(judged.rows.map((r) => ({
        client_id: clientId, video_id: r.video_id, rule_version: r.rule_version, segment: r.segment, method: 'judge',
        reason: r.reason, actor_label: actorLabel,
      })))
      if (error) throw new Error(`video_segments judge insert: ${error.message}`)
    }
    result.judged = judged.rows.length
    result.costUsd = judged.costUsd
  }
  return result
}

export const segmentSummary = (r: SegmentBatchResult): string =>
  `${r.written} ${SEGMENT_RULE_VERSION} rule rows (maker ${r.maker}, noise ${r.noise}, market ${r.market}; ${r.unjudged} admitted unjudged) · judge ${r.judge}${r.judge === 'on' ? `: ${r.judged} judged, $${r.costUsd.toFixed(4)}` : ''}`
