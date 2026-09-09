import { createAdminClient } from '../supabase-admin'
import {
  BACKFILL_BATCH,
  BACKFILL_BATCH_YOUTUBE,
  CONTENT_GATE_MODEL,
  TRANSCRIPT_MAX_ATTEMPTS,
  estimateCost,
} from '../config'
import { gateTranscript, normaliseLang } from './transcript'
import { speechActorFor, transcribeUrls } from './transcript-url'
import type { Platform, TranscriptResult } from './types'

// The transcript PRECONDITION (Phase 2 T2.3, 2026-09-09).
//
// The rule this file exists to make true: a video enters Pass A's full lane
// only after a transcript attempt was made for it THIS RUN, or it already
// carries a usable transcript. Before this, a transcript was whatever the
// gather happened to capture from a signed media url in the same run — and a
// video whose url had expired, or whose one attempt errored, was analysed
// without its own words forever. 'failed' was permanent.
//
// So: failures are retried (from the platform url, which never expires), every
// attempt is counted on the row, and 'failed' is terminal only once a video has
// used its attempts.

/** Statuses that are a real VERDICT on the video's audio: it was heard, and
 *  there was no usable speech in it. Asking again buys nothing and costs money,
 *  so these are never retried — only errors and absences are. */
const SETTLED_STATUSES = new Set(['ok', 'no_speech', 'lyrics', 'garbled'])

/** What the precondition needs to know about a video. */
export interface TranscriptState {
  platform: string
  video_url: string | null
  transcript_status: string | null
  transcript_attempts: number | null
}

/**
 * Should this video get another transcript attempt?
 *
 *   null      — never attempted (the common case: 468 of Sealand's 574
 *               Instagram videos, whose media urls expired before any run
 *               could read them)
 *   'failed'  — an attempt that errored. NOT a verdict on the video.
 *   'no_media' on YouTube — the caption actor found no captions, which is not
 *               the same as "no audio": the AI-fallback actor can still
 *               transcribe it. On every other platform 'no_media' means the
 *               ITEM had no media (a photo post) — there is nothing to hear.
 *
 * Bounded by TRANSCRIPT_MAX_ATTEMPTS, by having a url to ask about, and by the
 * platform having a url-transcription route at all (Reddit is text).
 */
export function needsTranscriptAttempt(v: TranscriptState, maxAttempts = TRANSCRIPT_MAX_ATTEMPTS): boolean {
  if (!v.video_url) return false
  if (!speechActorFor(v.platform as Platform)) return false
  if (v.transcript_status && SETTLED_STATUSES.has(v.transcript_status)) return false
  if ((v.transcript_attempts ?? 0) >= maxAttempts) return false
  if (v.transcript_status === null) return true
  if (v.transcript_status === 'failed') return true
  if (v.transcript_status === 'no_media') return v.platform === 'youtube'
  return false
}

/**
 * THE PRECONDITION, stated once so it can be tested and pointed at: a video may
 * enter analysis only when it already carries a usable transcript, or a
 * transcript attempt was made for it this run, or no attempt is possible any
 * more (attempts exhausted, no url, a platform with nothing to transcribe, or a
 * settled no-speech verdict). "Attempted and came back empty" satisfies it;
 * "nobody ever asked" does not.
 */
export function transcriptPreconditionMet(v: TranscriptState, attemptedThisRun: boolean): boolean {
  if (v.transcript_status === 'ok') return true
  if (attemptedThisRun) return true
  return !needsTranscriptAttempt(v)
}

/** A video the backfill will attempt, carrying what the write needs. */
export interface BackfillCandidate extends TranscriptState {
  id: string
  video_id: string
  comments_count?: number | null
}

export interface BackfillBatch {
  platform: Platform
  videos: { id: string; video_id: string; video_url: string }[]
}

/**
 * Plan the backfill: keep the videos that still need an attempt, group them by
 * platform (one actor call per platform per batch), order them richest-first
 * (the same signal proxy the transcribe fan-out uses under any cap), and chunk
 * to the platform's step budget — YouTube's actor is ~4x slower per video, so
 * it gets smaller batches. Pure.
 */
export function planBackfillBatches(
  candidates: BackfillCandidate[],
  opts: { batchSize?: number; youtubeBatchSize?: number; maxAttempts?: number } = {},
): BackfillBatch[] {
  const batchSize = opts.batchSize ?? BACKFILL_BATCH
  const ytBatchSize = opts.youtubeBatchSize ?? BACKFILL_BATCH_YOUTUBE
  const byPlatform = new Map<string, BackfillCandidate[]>()
  for (const c of candidates) {
    if (!needsTranscriptAttempt(c, opts.maxAttempts ?? TRANSCRIPT_MAX_ATTEMPTS)) continue
    const list = byPlatform.get(c.platform) ?? []
    list.push(c)
    byPlatform.set(c.platform, list)
  }
  const batches: BackfillBatch[] = []
  for (const [platform, list] of [...byPlatform.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0) || a.video_id.localeCompare(b.video_id))
    const size = platform === 'youtube' ? ytBatchSize : batchSize
    for (let i = 0; i < list.length; i += size) {
      batches.push({
        platform: platform as Platform,
        videos: list.slice(i, i + size).map((v) => ({ id: v.id, video_id: v.video_id, video_url: v.video_url! })),
      })
    }
  }
  return batches
}

export interface BackfillPlan {
  batches: BackfillBatch[]
  /** Videos Pass A selected (the set the precondition is asked about). */
  selected: number
  /** Of those, videos that still need an attempt — the backfill's work. */
  needing: number
  /** Of those, videos that can never carry a transcript now: attempts spent, no
   *  url, or a platform with nothing to transcribe. They satisfy the
   *  precondition by exhaustion, and the run should say how many there were. */
  exhausted: number
}

/**
 * Read the videos Pass A selected and plan the backfill over them. The
 * candidate set is deliberately the SELECTED set: these are the videos about to
 * be analysed, and the precondition is about what analysis reads.
 */
export async function planTranscriptBackfill(clientId: string, videoIds: string[]): Promise<BackfillPlan> {
  const admin = createAdminClient()
  const rows: BackfillCandidate[] = []
  for (let i = 0; i < videoIds.length; i += 100) {
    const { data, error } = await admin
      .from('videos')
      .select('id, platform, video_id, video_url, comments_count, transcript_status, transcript_attempts')
      .eq('client_id', clientId)
      .in('id', videoIds.slice(i, i + 100))
    if (error) throw new Error(`plan transcript backfill: ${error.message}`)
    rows.push(...((data ?? []) as BackfillCandidate[]))
  }
  const batches = planBackfillBatches(rows)
  const needing = rows.filter((r) => needsTranscriptAttempt(r)).length
  const exhausted = rows.filter((r) => r.transcript_status !== 'ok' && !needsTranscriptAttempt(r)).length
  return { batches, selected: rows.length, needing, exhausted }
}

/** Per-run transcript bookkeeping, logged so a run says plainly how many videos
 *  were asked and what came back. */
export type BackfillTally = Record<'attempted' | 'ok' | 'no_speech' | 'lyrics' | 'garbled' | 'failed' | 'no_media', number>

export function emptyBackfillTally(): BackfillTally {
  return { attempted: 0, ok: 0, no_speech: 0, lyrics: 0, garbled: 0, failed: 0, no_media: 0 }
}

export function mergeTallies(a: BackfillTally, b: BackfillTally): BackfillTally {
  const out = emptyBackfillTally()
  for (const k of Object.keys(out) as (keyof BackfillTally)[]) out[k] = a[k] + b[k]
  return out
}

export function formatTally(t: BackfillTally): string {
  return `attempted ${t.attempted} · ok ${t.ok} · no_speech ${t.no_speech} · lyrics ${t.lyrics} · garbled ${t.garbled} · failed ${t.failed} · no_media ${t.no_media}`
}

export interface BackfillBatchResult {
  tally: BackfillTally
  /** Videos that gained a usable transcript — the reason to re-plan Pass A. */
  newlyUsable: number
  estUsd: number
  errors: string[]
}

/**
 * Run one backfill batch: transcribe the videos from their platform urls, judge
 * the text with the SAME content gate every other path uses, and write the
 * result with the same status bookkeeping — plus the attempt count and the last
 * error, which is what makes a failure retryable instead of permanent.
 *
 * Never throws for a per-video reason; an actor-level failure propagates so the
 * Inngest step retries (the videos keep their old status and re-plan).
 */
export async function backfillTranscriptsBatch(opts: {
  clientId: string
  runId: string
  platform: Platform
  videos: { id: string; video_id: string; video_url: string }[]
  batchNo?: number
  dryRun?: boolean
}): Promise<BackfillBatchResult> {
  const admin = createAdminClient()
  const tally = emptyBackfillTally()
  const errors: string[] = []
  if (!opts.videos.length) return { tally, newlyUsable: 0, estUsd: 0, errors }
  const startedAt = Date.now()

  // Attempt counts as they stand now. Read (not incremented in place) because
  // the untyped client has no atomic increment; one run is the only writer of a
  // video's transcript columns, so read-then-write is safe here.
  const attemptsById = new Map<string, number>()
  const { data: rows, error: readErr } = await admin
    .from('videos')
    .select('id, transcript_attempts')
    .in('id', opts.videos.map((v) => v.id))
  if (readErr) throw new Error(`backfill attempt read: ${readErr.message}`)
  for (const r of (rows ?? []) as { id: string; transcript_attempts: number | null }[]) {
    attemptsById.set(r.id, r.transcript_attempts ?? 0)
  }

  const { results, estUsd } = await transcribeUrls(opts.platform, opts.videos)
  const gate = { prompt: 0, completion: 0 }
  let newlyUsable = 0

  for (const v of opts.videos) {
    const outcome = results.get(v.video_id)
    let t: TranscriptResult
    if (!outcome) {
      // The actor returned no item for this video at all. We paid for the run,
      // so it counts as an attempt — and it is an error, not a verdict.
      t = { text: '', lang: null, source: null, status: 'failed', error: 'actor returned no item for this url' }
    } else if (!outcome.ok) {
      t = { text: '', lang: null, source: null, status: 'failed', error: outcome.error }
    } else {
      t = await gateTranscript(outcome.text, normaliseLang(outcome.lang), 'apify_speech')
      gate.prompt += t.gateTokens?.prompt ?? 0
      gate.completion += t.gateTokens?.completion ?? 0
    }
    tally.attempted++
    tally[t.status as keyof BackfillTally] = (tally[t.status as keyof BackfillTally] ?? 0) + 1
    if (t.status === 'ok') newlyUsable++
    if (opts.dryRun) continue
    const { error } = await admin
      .from('videos')
      .update({
        transcript: t.text || null,
        transcript_lang: t.lang,
        transcript_source: t.source,
        transcript_status: t.status,
        transcript_attempts: (attemptsById.get(v.id) ?? 0) + 1,
        transcript_error: t.error ?? null,
      })
      .eq('id', v.id)
    if (error) errors.push(`backfill update (${v.video_id}): ${error.message}`)
  }

  // Cost (T2.4): the actor's ESTIMATED spend plus the content gate's tokens,
  // on the 'transcribe' pass so run_costs.transcribe_usd covers both transcript
  // paths. call_index is offset past the fan-out's batch numbers so the two
  // paths' rows never look like the same call.
  if (!opts.dryRun) {
    const costUsd = estUsd + estimateCost(CONTENT_GATE_MODEL, gate.prompt, gate.completion)
    const { error: logErr } = await admin.from('ai_call_log').insert({
      client_id: opts.clientId,
      run_id: opts.runId,
      pass: 'transcribe',
      call_index: 1000 + (opts.batchNo ?? 1),
      model: 'apify_speech',
      prompt_version: 'transcribe_backfill_v1',
      request: { platform: opts.platform, videos: opts.videos.length },
      response: {
        statuses: tally,
        apify_est_usd: estUsd,
        gate_prompt_tokens: gate.prompt,
        gate_completion_tokens: gate.completion,
      },
      error_message: null,
      prompt_tokens: gate.prompt,
      completion_tokens: gate.completion,
      cost_usd: costUsd,
      duration_ms: Date.now() - startedAt,
      validation_status: 'ok',
    })
    if (logErr) console.warn(`[backfill] cost log failed: ${logErr.message}`)
  }

  console.log(`[backfill:${opts.platform}${opts.batchNo ? `:${opts.batchNo}` : ''}] ${formatTally(tally)} · ~$${estUsd.toFixed(4)} apify (est)`)
  return { tally, newlyUsable, estUsd, errors }
}
