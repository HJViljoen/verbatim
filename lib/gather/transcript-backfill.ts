import { createAdminClient } from '../supabase-admin'
import { chunk } from '../chunk'
import {
  BACKFILL_BATCH,
  BACKFILL_BATCH_YOUTUBE,
  BACKFILL_CAP,
  CONTENT_GATE_MODEL,
  TRANSCRIPT_MAX_ATTEMPTS,
  estimateCost,
} from '../config'
import { gateTranscript, normaliseLang, transcriptColumn } from './transcript'
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
  /** `attempts`: the video's transcript attempts when the plan was made (9
   *  Nov), so a batch run again knows which of its videos this run already
   *  attempted (`backfillStillDue`). A plan memoised before then has none. */
  videos: { id: string; video_id: string; video_url: string; attempts?: number }[]
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
  opts: { batchSize?: number; youtubeBatchSize?: number; maxAttempts?: number; cap?: number } = {},
): BackfillBatch[] {
  const batchSize = opts.batchSize ?? BACKFILL_BATCH
  const ytBatchSize = opts.youtubeBatchSize ?? BACKFILL_BATCH_YOUTUBE
  const wanted = candidates
    .filter((c) => needsTranscriptAttempt(c, opts.maxAttempts ?? TRANSCRIPT_MAX_ATTEMPTS))
    // Richest-first ACROSS platforms, then capped: the cap is a runaway
    // backstop, so what it cuts must be the least-signal videos, and they come
    // back next run.
    .sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0) || a.video_id.localeCompare(b.video_id))
    .slice(0, opts.cap ?? BACKFILL_CAP)
  const byPlatform = new Map<string, BackfillCandidate[]>()
  for (const c of wanted) {
    const list = byPlatform.get(c.platform) ?? []
    list.push(c)
    byPlatform.set(c.platform, list)
  }
  const batches: BackfillBatch[] = []
  for (const [platform, list] of [...byPlatform.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const size = platform === 'youtube' ? ytBatchSize : batchSize
    for (const part of chunk(list, size)) {
      batches.push({
        platform: platform as Platform,
        videos: part.map((v) => ({ id: v.id, video_id: v.video_id, video_url: v.video_url!, attempts: v.transcript_attempts ?? 0 })),
      })
    }
  }
  return batches
}

export interface BackfillPlan {
  batches: BackfillBatch[]
  /** Videos Pass A selected (the set the precondition is asked about). */
  selected: number
  /** Of those, videos that still need an attempt. */
  needing: number
  /** Of those, videos this run will actually attempt (needing, minus whatever
   *  BACKFILL_CAP defers to the next run). */
  planned: number
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
  for (const part of chunk(videoIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('id, platform, video_id, video_url, comments_count, transcript_status, transcript_attempts')
      .eq('client_id', clientId)
      .in('id', part)
    if (error) throw new Error(`plan transcript backfill: ${error.message}`)
    rows.push(...((data ?? []) as BackfillCandidate[]))
  }
  const batches = planBackfillBatches(rows)
  const needing = rows.filter((r) => needsTranscriptAttempt(r)).length
  const exhausted = rows.filter((r) => r.transcript_status !== 'ok' && !needsTranscriptAttempt(r)).length
  const planned = batches.reduce((n, b) => n + b.videos.length, 0)
  return { batches, selected: rows.length, needing, planned, exhausted }
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

/** A video's transcript columns as a batch reads them when it starts. */
export interface BackfillRowNow {
  status: string | null
  attempts: number
}

/**
 * Pure: which of a batch's videos still need their attempt THIS run (9 Nov, the
 * fresh review). A batch runs again when its step is retried, or when it ran
 * late in its wave and runs as a step of its own; before this it paid the
 * actor again for every video, bumped every video's attempts again, and could
 * write `failed` over the `ok` the first pass had stored. A video is DONE when
 * its status is settled (`ok`, `no_speech`, `lyrics`, `garbled`: a verdict
 * this run reached, since the plan took none of them) or its attempts are past
 * the plan's (this run attempted it and it failed again); `done` carries its
 * stored status, so the batch's tally reads as the first pass's did. A video
 * the plan gave no attempts for (a plan memoised before 9 Nov) is judged by its
 * status alone, and one with no row is due.
 */
export function backfillStillDue<V extends { id: string; attempts?: number }>(
  videos: readonly V[],
  now: ReadonlyMap<string, BackfillRowNow>,
): { due: V[]; done: { video: V; status: string }[] } {
  const due: V[] = []
  const done: { video: V; status: string }[] = []
  for (const v of videos) {
    const row = now.get(v.id)
    const settled = row?.status != null && SETTLED_STATUSES.has(row.status)
    const attempted = row != null && v.attempts != null && row.attempts > v.attempts
    if (row && (settled || attempted)) done.push({ video: v, status: row.status ?? 'failed' })
    else due.push(v)
  }
  return { due, done }
}

/** The statuses a backfill write may replace: the ones the plan takes
 *  (`needsTranscriptAttempt`). A write never lands on a settled transcript,
 *  so a late or retried pass can never turn an `ok` into `failed`. */
export const BACKFILL_WRITABLE = 'transcript_status.is.null,transcript_status.in.(failed,no_media)'

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
  videos: { id: string; video_id: string; video_url: string; attempts?: number }[]
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
  const nowById = new Map<string, BackfillRowNow>()
  const { data: rows, error: readErr } = await admin
    .from('videos')
    .select('id, transcript_attempts, transcript_status')
    .in('id', opts.videos.map((v) => v.id))
  if (readErr) throw new Error(`backfill attempt read: ${readErr.message}`)
  for (const r of (rows ?? []) as { id: string; transcript_attempts: number | null; transcript_status: string | null }[]) {
    attemptsById.set(r.id, r.transcript_attempts ?? 0)
    nowById.set(r.id, { status: r.transcript_status, attempts: r.transcript_attempts ?? 0 })
  }

  // What this run already did for this batch is not done again (a retried or
  // late batch): no second actor call for it, no second attempt counted, and
  // its stored outcome tallied as the first pass tallied it.
  const { due, done } = backfillStillDue(opts.videos, nowById)
  let newlyUsable = 0
  for (const { status } of done) {
    tally.attempted++
    tally[status as keyof BackfillTally] = (tally[status as keyof BackfillTally] ?? 0) + 1
    if (status === 'ok') newlyUsable++
  }
  if (!due.length) return { tally, newlyUsable, estUsd: 0, errors }

  const { results, estUsd } = await transcribeUrls(opts.platform, due)
  const gate = { prompt: 0, completion: 0 }

  for (const v of due) {
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
        transcript: transcriptColumn(t.text),
        transcript_lang: t.lang,
        transcript_source: t.source,
        transcript_status: t.status,
        transcript_attempts: (attemptsById.get(v.id) ?? 0) + 1,
        transcript_error: t.error ?? null,
      })
      .eq('id', v.id)
      .or(BACKFILL_WRITABLE)
    if (error) errors.push(`backfill update (${v.video_id}): ${error.message}`)
  }

  // Cost (T2.4): the content gate's tokens, on the 'transcribe' pass so
  // run_costs.transcribe_usd covers both transcript paths. call_index is offset
  // past the fan-out's batch numbers so the two paths' rows never look like the
  // same call.
  //
  // The actor's spend is NOT in cost_usd (Phase 3, 2026-09-09): apify_runs now
  // records what each of these actor calls actually cost, and run_costs reports
  // it on the apify line. Adding the estimate here too would count the same
  // money twice — and it was always an estimate against a real bill. It stays
  // in `response.apify_est_usd` as observability, which is where the media-path
  // transcribe row has always kept its actor estimate.
  if (!opts.dryRun) {
    const costUsd = estimateCost(CONTENT_GATE_MODEL, gate.prompt, gate.completion)
    const { error: logErr } = await admin.from('ai_call_log').insert({
      client_id: opts.clientId,
      run_id: opts.runId,
      pass: 'transcribe',
      call_index: 1000 + (opts.batchNo ?? 1),
      model: 'apify_speech',
      prompt_version: 'transcribe_backfill_v1',
      request: { platform: opts.platform, videos: due.length },
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
