import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { adapters } from '../gather/platforms'
import type { Platform, PlatformAdapter, RawItem } from '../gather/types'
import {
  ANALYSIS_TEMPERATURE, OCR_BACKFILL_CAP, OCR_BATCH, OCR_CAP, OCR_IMAGE_DETAIL, OCR_MAX_CHARS, OCR_MODEL, estimateCost,
} from '../config'
import { logAiCall } from './ai-log'

// On-screen text from the COVER FRAME (WP7b, 2026-09-12).
//
// The hole this fills: the 2026-09-02 blind benchmark found — independently,
// from two agents — that every incumbent listening tool misses on-screen text
// on TikTok/YouTube, and that hooks and claims there are very often TYPED and
// never spoken. We transcribe speech; a video whose entire argument is a title
// card reaches Pass A as silence.
//
// WHAT THIS IS, exactly, and the only thing it may ever be called: on-screen
// text from the cover frame. NOT scene understanding, NOT thumbnail analysis,
// NOT "we analyse the visuals" (standing rule, v5-Ideas.md). Reading every
// frame would need a video download plus ffmpeg, which Vercel serverless does
// not have; the cover is the one frame we can reach, and on TikTok it is very
// often the hook card itself.
//
// WHEN: at gather time, in a wave right after transcribe, for the same reason
// transcription runs there — the cover URL in a raw item is a signed CDN link
// that expires within days (verified 2026-09-12: TikTok `video.cover` on
// p16-common-sign.tiktokcdn.com, Instagram `displayUrl` on *.fbcdn.net). A
// video gathered three weeks ago has no reachable cover at all. YouTube is the
// exception — its cover is derived from the video id and never expires — which
// is why it, and only it, also gets a backfill wave over historical rows.
//
// THE INVARIANT this serves: extracted text is the creator's own words, so it is
// quotable evidence under exactly the transcript's rules — cited with the label
// [o], validated verbatim against the same clipped text the model saw, and only
// on industry/other videos (a brand's own typed hook is brand messaging, not
// audience insight). Nothing here invents: the prompt's whole job is to make the
// model transcribe rather than describe.

/** Verdicts a cover-frame read can reach.
 *   ok       — legible text found and stored
 *   none     — the model saw the frame and there was no legible text. A REAL
 *              answer, not a failure: plenty of covers are a face and nothing
 *              else, and re-reading them every week would pay forever for the
 *              same "no".
 *   no_image — the item carried no cover handle at all
 *   failed   — the fetch or the model call errored (a tombstone; see needsOcr) */
export type OcrStatus = 'ok' | 'none' | 'no_image' | 'failed'

/** The columns the selection rule reads. */
export interface OcrableVideo {
  ocr_status: string | null
}

/**
 * The selection rule, stated once: a video is a candidate until it has an
 * answer of any kind.
 *
 * Every terminal status stays terminal, 'failed' included — a weekly run must
 * not re-pay for the same failure forever, and 'none' is a verdict the frame
 * already gave. Clearing the column is the deliberate retry
 * (scripts/ocr-videos.ts prints the counts).
 */
export function needsOcr(v: OcrableVideo): boolean {
  return v.ocr_status == null
}

/** A platform can be OCR'd at gather time when its adapter can pull a cover out
 *  of a raw item. Reddit is text-native and implements neither hook. */
export function canOcr(a: PlatformAdapter | undefined): boolean {
  return typeof a?.coverUrl === 'function'
}

/** A platform can be BACKFILLED when its cover survives the raw item — i.e. it
 *  is derived from the video id and carries no signature. YouTube only. */
export function canBackfillOcr(a: PlatformAdapter | undefined): boolean {
  return typeof a?.coverUrlById === 'function'
}

// v1 (2026-09-12). The failure this prompt exists to prevent is the model
// DESCRIBING the picture — "a woman holding a prosthetic leg" is not on-screen
// text, and downstream it would become a quoted "finding" the video never
// showed. Hence: transcribe, one line per text block, and an EMPTY list is the
// correct answer for a frame with no type on it.
//
// The version string is diagnostic only (ai_call_log.prompt_version); nothing
// re-reads on it.
const OCR_PROMPT_VERSION = 'ocr_v1'

const ocrSchema = z.object({
  /** One entry per distinct block of text, in reading order. Empty = no legible
   *  text on the frame. */
  lines: z.array(z.string()),
})

/** System + user prompt for one cover frame. Pure — the live call and the dry
 *  run assemble the identical strings, so a token estimate is the real one. */
export function buildOcrPrompt(): { system: string; user: string } {
  const system = [
    'You read the text printed on a single still frame from a social video (its cover frame) for an analysis system.',
    '',
    'Rules:',
    '- Transcribe every piece of legible on-screen text, in reading order, one entry per text block. Include title cards, caption burn-ins, stickers, labels, price tags, and text in the platform UI overlay if it is part of the image.',
    '- Copy the text EXACTLY as it appears — same words, same language, same spelling, including emoji and ALL-CAPS. Do not translate, correct, summarise, or complete it.',
    '- Do NOT describe the image. No people, objects, colours, setting, mood or composition. If you find yourself writing a sentence about what is happening, you have the wrong task: only text that is literally printed on the frame belongs in the output.',
    '- Do not guess at text that is blurred, cropped off, or too small to read. Leave it out rather than inventing a plausible word.',
    '- If there is no legible text on the frame at all, return an empty list. That is a correct and common answer, not a failure.',
  ].join('\n')
  const user = 'Read the on-screen text in this cover frame.'
  return { system, user }
}

/** Model output → the stored string. Trims, drops blanks and exact repeats
 *  (a frame's text often appears twice — burnt in and in the platform overlay),
 *  joins one block per line and clips to OCR_MAX_CHARS. '' means "no text",
 *  which the caller stores as status 'none'. Pure; exported for tests. */
export function normaliseOcrLines(lines: string[], max = OCR_MAX_CHARS): string {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(line)
  }
  const text = kept.join('\n')
  // Code-point-safe clip (clipText's rule), but newline-preserving: the line
  // structure IS the reading order, and collapsing it would merge two unrelated
  // text blocks into one sentence the frame never showed.
  const points = [...text]
  return points.length <= max ? text : points.slice(0, max).join('').trimEnd()
}

export interface OcrOutcome {
  lines: string[]
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  prompt: { system: string; user: string }
}

/** One cover frame through the model. Returns the text blocks it read and what
 *  the call cost; throws only on a failure the caller should record per video. */
export async function ocrCoverFrame(imageUrl: string): Promise<OcrOutcome> {
  const prompt = buildOcrPrompt()
  const startedAt = Date.now()
  const completion = await openai.chat.completions.parse({
    model: OCR_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt.user },
          { type: 'image_url', image_url: { url: imageUrl, detail: OCR_IMAGE_DETAIL } },
        ],
      },
    ],
    response_format: zodResponseFormat(ocrSchema, 'on_screen_text'),
  })
  const msg = completion.choices[0]?.message
  const parsed = msg?.parsed
  if (!parsed) throw new Error(msg?.refusal ?? 'no parsed on-screen text')
  return {
    lines: parsed.lines,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
    },
    durationMs: Date.now() - startedAt,
    prompt,
  }
}

/** Pure: order pending candidates highest-comment-first (the best signal proxy
 *  under any cap), drop videos that already have an answer, cap, and chunk into
 *  Inngest-step-sized batches. orderAndChunkPending's shape, on ocr_status.
 *  Exported for tests. */
export function orderAndChunkOcrPending(
  rows: { video_id: string; comments_count: number | null; ocr_status: string | null }[],
  batchSize = OCR_BATCH,
  cap = OCR_CAP,
): string[][] {
  const ids = rows
    .filter(needsOcr)
    .sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0) || a.video_id.localeCompare(b.video_id))
    .slice(0, cap)
    .map((r) => r.video_id)
  return chunk(ids, batchSize)
}

/** Batch plan for the gather-time OCR fan-out: this run's video_raw candidates
 *  for one platform, minus videos that already have an answer, signal-first,
 *  chunked. planTranscribeBatches' shape — the status check is scoped to
 *  exactly these candidates (chunked .in), never a platform-wide unbounded
 *  read. */
export async function planOcrBatches(clientId: string, runId: string, platform: Platform): Promise<string[][]> {
  const admin = createAdminClient()
  if (!canOcr(adapters[platform])) return []
  const rawIds = (
    await selectAll<{ video_id: string }>(() =>
      admin
        .from('video_raw')
        .select('video_id')
        .eq('client_id', clientId)
        .eq('run_id', runId)
        .eq('platform', platform)
        .order('id', { ascending: true }),
    )
  ).map((r) => r.video_id)
  if (!rawIds.length) return []

  const rows: { video_id: string; comments_count: number | null; ocr_status: string | null }[] = []
  for (const part of chunk(rawIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, comments_count, ocr_status')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .in('video_id', part)
    if (error) throw new Error(`plan ocr: ${error.message}`)
    rows.push(...((data ?? []) as typeof rows))
  }
  return orderAndChunkOcrPending(rows)
}

export interface OcrResult {
  /** Text found and stored. */
  ok: number
  /** The frame was read and carried no legible text — a verdict, not a miss. */
  none: number
  /** No cover handle on the item. */
  noImage: number
  skipped: number
  failed: number
  costUsd: number
  /** True when a 429 was seen — a fact about the account, not the corpus. */
  rateLimited: boolean
  errors: string[]
}

export function emptyOcrResult(): OcrResult {
  return { ok: 0, none: 0, noImage: 0, skipped: 0, failed: 0, costUsd: 0, rateLimited: false, errors: [] }
}

/** One video's cover through the model and into the row. Shared by the
 *  gather-time wave and the YouTube backfill — the only thing that differs
 *  between them is where the image URL came from. */
async function ocrOne(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    clientId: string
    runId: string | null
    platform: Platform
    videoId: string
    imageUrl: string | null
    callIndex: number
    dryRun?: boolean
  },
  out: OcrResult,
): Promise<void> {
  const write = async (patch: Record<string, unknown>) => {
    if (opts.dryRun) return null
    const { error } = await admin
      .from('videos')
      .update(patch)
      .eq('client_id', opts.clientId)
      .eq('platform', opts.platform)
      .eq('video_id', opts.videoId)
    return error?.message ?? null
  }

  // No cover handle: a verdict about the item, and a cheap one — recorded so
  // the video is not re-planned every run for a frame that was never there.
  if (!opts.imageUrl) {
    out.noImage++
    const err = await write({ ocr_text: null, ocr_status: 'no_image', ocr_error: null })
    if (err) { out.errors.push(`ocr write (${opts.videoId}): ${err}`); out.noImage--; out.failed++ }
    return
  }

  let r: OcrOutcome
  try {
    r = await ocrCoverFrame(opts.imageUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    out.failed++
    if (isRateLimited(msg)) out.rateLimited = true
    out.errors.push(`ocr (${opts.videoId}): ${msg.slice(0, 200)}`)
    // Tombstone, so the next run does not re-pay for the same failure. A rate
    // limit is the exception (translateBatch's rule): it says nothing about this
    // video, and stamping it would permanently exclude a whole batch a retry
    // would have read fine.
    if (!isRateLimited(msg)) await write({ ocr_status: 'failed', ocr_error: msg.slice(0, 300) })
    return
  }

  // Spend happened the moment the call returned (transcribeBatch's rule):
  // account for it before the write can fail, or the ledger under-counts.
  const cost = estimateCost(OCR_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens)
  out.costUsd += cost
  const text = normaliseOcrLines(r.lines)
  const status: OcrStatus = text ? 'ok' : 'none'
  if (status === 'ok') out.ok++
  else out.none++
  const writeErr = await write({ ocr_text: text || null, ocr_status: status, ocr_error: null })
  if (writeErr) {
    out.errors.push(`ocr write (${opts.videoId}): ${writeErr}`)
    out.failed++
    if (status === 'ok') out.ok--; else out.none--
  }
  // Logged either way, write error included: ai_call_log is the ledger of record
  // for what was SPENT, and the call was spent.
  await logAiCall(admin, {
    clientId: opts.clientId,
    runId: opts.runId,
    pass: 'ocr',
    callIndex: opts.callIndex,
    model: OCR_MODEL,
    promptVersion: OCR_PROMPT_VERSION,
    systemPrompt: r.prompt.system,
    userPrompt: `${r.prompt.user}\nIMAGE: ${opts.imageUrl}`,
    response: { status, blocks: r.lines.length, chars: text.length },
    error: writeErr,
    usage: r.usage,
    durationMs: r.durationMs,
    validationStatus: writeErr ? 'write_failed' : 'ok',
  })
}

/**
 * Read the cover frames of one batch of this run's videos and write the results.
 *
 * Sequential within the batch (8 × one small image call ≈ 16s, wide margin under
 * the 300s step cap) and idempotent: the selection rule is re-checked on the
 * freshly-read rows, so an Inngest step retry skips what the first attempt
 * already wrote. A per-video failure is stamped onto its own row and counted —
 * it never sinks the batch, and the video is simply analysed without on-screen
 * text, exactly as before this existed.
 */
export async function ocrBatch(opts: {
  clientId: string
  runId: string
  platform: Platform
  videoIds: string[]
  batchNo?: number
  dryRun?: boolean
}): Promise<OcrResult> {
  const admin = createAdminClient()
  const out = emptyOcrResult()
  const adapter = adapters[opts.platform]
  if (!canOcr(adapter) || !opts.videoIds.length) return out

  // The raw items this run stored — the only place a live cover URL exists.
  const rawRows = await selectAll<{ video_id: string; raw: RawItem }>(() =>
    admin
      .from('video_raw')
      .select('video_id, raw')
      .eq('client_id', opts.clientId)
      .eq('run_id', opts.runId)
      .eq('platform', opts.platform)
      .in('video_id', opts.videoIds)
      .order('id', { ascending: true }),
  )
  if (!rawRows.length) return out

  const done = new Set<string>()
  for (const part of chunk(rawRows.map((r) => r.video_id), 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, ocr_status')
      .eq('client_id', opts.clientId)
      .eq('platform', opts.platform)
      .in('video_id', part)
    if (error) {
      out.errors.push(`ocr done-check: ${error.message}`)
      return out
    }
    for (const r of (data ?? []) as { video_id: string; ocr_status: string | null }[]) {
      if (!needsOcr(r)) done.add(r.video_id)
    }
  }

  let callIndex = (opts.batchNo ?? 1) * 1000
  for (const row of rawRows) {
    if (done.has(row.video_id)) { out.skipped++; continue }
    callIndex++
    await ocrOne(admin, {
      clientId: opts.clientId,
      runId: opts.runId,
      platform: opts.platform,
      videoId: row.video_id,
      imageUrl: adapter.coverUrl!(row.raw),
      callIndex,
      dryRun: opts.dryRun,
    }, out)
  }
  return out
}

/**
 * Plan the YouTube OCR backfill: historical videos with no answer yet, whose
 * cover is still reachable because it is derived from the video id.
 *
 * TikTok and Instagram cannot be here. Their covers are signed links inside a
 * raw item that expired days after the run that fetched it — the same wall
 * transcription hit in production (468 of 574 Sealand Instagram videos with a
 * NULL transcript, for exactly this reason). Reaching their historical covers
 * would mean re-fetching each video through Apify at ~$0.05 a head; that is a
 * separate, costed decision, not something a weekly run should start doing.
 */
export async function planOcrBackfill(clientId: string, cap = OCR_BACKFILL_CAP): Promise<{
  batches: string[][]
  needing: number
  deferred: number
}> {
  const admin = createAdminClient()
  const platform: Platform = 'youtube'
  if (!canBackfillOcr(adapters[platform])) return { batches: [], needing: 0, deferred: 0 }
  const rows = await selectAll<{ video_id: string; comments_count: number | null; ocr_status: string | null }>(() =>
    admin
      .from('videos')
      .select('video_id, comments_count, ocr_status')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .is('ocr_status', null)
      .order('video_id', { ascending: true }),
  )
  const batches = orderAndChunkOcrPending(rows, OCR_BATCH, cap)
  return { batches, needing: rows.length, deferred: Math.max(0, rows.length - cap) }
}

/** One backfill batch: the same read and the same writes as ocrBatch, with the
 *  cover derived from the video id instead of read out of a raw item. */
export async function ocrBackfillBatch(opts: {
  clientId: string
  runId: string | null
  videoIds: string[]
  batchNo?: number
  dryRun?: boolean
}): Promise<OcrResult> {
  const admin = createAdminClient()
  const out = emptyOcrResult()
  const platform: Platform = 'youtube'
  const adapter = adapters[platform]
  if (!canBackfillOcr(adapter) || !opts.videoIds.length) return out

  const rows: { video_id: string; ocr_status: string | null }[] = []
  for (const part of chunk(opts.videoIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, ocr_status')
      .eq('client_id', opts.clientId)
      .eq('platform', platform)
      .in('video_id', part)
    if (error) {
      out.errors.push(`ocr backfill read: ${error.message}`)
      return out
    }
    rows.push(...((data ?? []) as typeof rows))
  }

  let callIndex = (opts.batchNo ?? 1) * 1000
  for (const row of rows) {
    if (!needsOcr(row)) { out.skipped++; continue }
    callIndex++
    await ocrOne(admin, {
      clientId: opts.clientId,
      runId: opts.runId,
      platform,
      videoId: row.video_id,
      imageUrl: adapter.coverUrlById!(row.video_id),
      callIndex,
      dryRun: opts.dryRun,
    }, out)
  }
  return out
}

/** A 429 (rate limit or exhausted credits) after the SDK's own backoff — a fact
 *  about the account, not about the video (pass-a.ts isRateLimitError). */
function isRateLimited(msg: string): boolean {
  return /\b429\b|rate limit|insufficient_quota|no credits/i.test(msg)
}
