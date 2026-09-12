import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { adapters } from '../gather/platforms'
import type { Platform, PlatformAdapter, RawItem } from '../gather/types'
import {
  ANALYSIS_TEMPERATURE, OCR_BACKFILL_CAP, OCR_BATCH, OCR_CAP, OCR_FETCH_TIMEOUT_MS, OCR_IMAGE_DETAIL, OCR_MAX_ATTEMPTS,
  OCR_MAX_IMAGE_BYTES, OCR_MAX_CHARS, OCR_MODEL, estimateCost,
} from '../config'
import { logAiCall } from './ai-log'
import { isMissingColumnError } from './classify-meta'

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
  /** Reads that have been attempted and did not produce a verdict about the
   *  FRAME ('failed' / 'no_image'). Null on rows written before the column. */
  ocr_attempts?: number | null
}

/** A row of the selection query. */
export interface OcrSelectionRow extends OcrableVideo {
  video_id: string
}

/**
 * The selection rule, stated once.
 *
 * Never read → candidate. `ok` and `none` are FINAL: both are verdicts the
 * frame itself gave, and a weekly run must not re-pay to be told the same thing
 * ("none" — the model looked and there was no legible text — is an answer, not
 * a miss).
 *
 * `failed` and `no_image` are different: neither says anything about the frame.
 * A fetch timeout, a CDN 5xx, an OpenAI 5xx or a format we cannot decode is a
 * fact about the attempt. Whether retrying is worth anything depends entirely on
 * whether the image is still THERE:
 *
 *  - **Durable cover (YouTube)** — `https://i.ytimg.com/vi/<id>/hqdefault.jpg`
 *    never expires, so one bad eight-second fetch must not remove a video from
 *    the backfill for good. Retry until OCR_MAX_ATTEMPTS.
 *  - **Signed cover (TikTok/Instagram) that still answers** — same argument
 *    while it lasts: the caller checked, the image is reachable, retry.
 *  - **Signed cover that is gone** — retrying buys nothing, so it is terminal.
 *    This is the common case within days.
 *
 * That budget is what stops ~9% of TikTok (the HEIC covers) and any transient
 * blip being tombstoned permanently by the first run that touches them. Above
 * the budget it IS terminal — a weekly run cannot chase the same failure
 * forever. Clearing ocr_status is still the deliberate manual retry.
 */
export function needsOcr(
  v: OcrableVideo,
  opts: { durableCover?: boolean; coverStillAnswers?: boolean } = {},
): boolean {
  if (v.ocr_status == null) return true
  if (v.ocr_status === 'ok' || v.ocr_status === 'none') return false
  const retryable = opts.durableCover === true || opts.coverStillAnswers === true
  if (!retryable) return false
  return (v.ocr_attempts ?? 0) < OCR_MAX_ATTEMPTS
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

/** A cover we cannot use, as opposed to a read that went wrong. Unsupported
 *  format, disallowed host, empty or oversized body: all facts about OUR
 *  fetcher, not about the frame, so they must never be recorded as 'failed'
 *  (see ocrOne). */
export class UnusableCoverError extends Error {}

/** The image formats OpenAI's vision input accepts: PNG, JPEG, WEBP and
 *  non-animated GIF. Anything else — HEIC above all — is rejected by the API. */
export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * The real format, from the MAGIC BYTES rather than the Content-Type header.
 *
 * The header is third-party data and is only as good as the CDN feels like
 * being; the first bytes of the body are the file. Returns null for anything
 * OpenAI will not accept — most importantly HEIC/HEIF, which TikTok serves for
 * a real share of its covers (measured 2026-09-12: 125 of 1,422 stored TikTok
 * cover urls end `.heic`, and the ones that are still live really do return
 * `image/heic` bytes).
 *
 * Pure; exported for tests.
 */
export function sniffImageType(bytes: Buffer): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  return null
}

/**
 * Hosts a cover may be fetched from.
 *
 * The URL comes out of an Apify actor's output — third-party data — and is then
 * fetched server-side, so it is worth naming the four CDNs that actually serve
 * covers rather than letting an actor point the fetcher anywhere. Low
 * exploitability (the response must sniff as an image and nothing is echoed
 * back), and it costs nothing. A rejection is an UnusableCoverError, not a
 * failure, so a new CDN hostname degrades to "no image" and shows up in the
 * counts instead of tombstoning a platform.
 *
 * Pure; exported for tests.
 */
const COVER_HOST_SUFFIXES = [
  '.ytimg.com',          // youtube (i.ytimg.com)
  '.tiktokcdn.com',      // tiktok, and its regional siblings below
  '.tiktokcdn-us.com',
  '.tiktokcdn-eu.com',
  '.tiktokcdn-va.com',
  '.cdninstagram.com',   // instagram
  '.fbcdn.net',
]
export function isAllowedCoverHost(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return COVER_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}

/**
 * Fetch a cover and return it as a data URI.
 *
 * WE fetch it, rather than handing OpenAI the URL — measured 2026-09-12, and
 * this is load-bearing. An Instagram `displayUrl` that answers 200 to our own
 * GET comes back to OpenAI's image fetcher as `400 Error while downloading
 * file. Upstream status code: 403`: the CDN serves us and blocks them. Passing
 * the url straight through would have made the Instagram half of the wave fail
 * on every single video.
 *
 * One path for all three platforms rather than a URL shortcut for YouTube: a
 * cover is tens of kilobytes, and a second code path exists only to break.
 *
 * ON HEIC, and why there is no format rewrite here. TikTok serves a real share
 * of its covers as HEIC, which the vision API rejects outright. The obvious fix
 * — rewrite the `~tplv-…:q70.heic` transform suffix to `.jpeg`, since the tplv
 * path encodes the output format — DOES NOT WORK, verified read-only on two
 * live HEIC covers on 2026-09-12: the transform is inside the SIGNED path, so
 * changing a character of it returns 403, and `&format=jpeg` / `&x-format=jpeg`
 * are ignored (still `image/heic`, byte-identical). Dropping the transform
 * entirely is 403 too. Converting would mean decoding HEIC ourselves, which
 * needs an image library this repo does not declare. So a HEIC cover is
 * honestly unusable, and says so: UnusableCoverError → 'no_image', which is
 * retryable while the url still answers (see needsOcr) rather than a permanent
 * tombstone on ~9% of TikTok.
 */
async function fetchCoverAsDataUri(imageUrl: string): Promise<string> {
  if (!isAllowedCoverHost(imageUrl)) throw new UnusableCoverError('cover host not allowed')
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(OCR_FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`cover fetch ${res.status}`)
  // Check the declared length BEFORE reading the body: eight 10MB images in one
  // batch step is 80MB of transient heap in a serverless function, spent only to
  // reject them. The post-read check stays for chunked responses that declare
  // nothing.
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > OCR_MAX_IMAGE_BYTES) {
    throw new UnusableCoverError(`cover too large (${declared} bytes declared)`)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (!bytes.length) throw new UnusableCoverError('cover fetch returned no bytes')
  if (bytes.length > OCR_MAX_IMAGE_BYTES) throw new UnusableCoverError(`cover too large (${bytes.length} bytes)`)
  // The FILE, not the header: a CDN that mislabels its own bytes would otherwise
  // send the model something it cannot decode and we would book that as a
  // failure of the frame.
  const type = sniffImageType(bytes)
  if (!type) {
    const declaredType = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    throw new UnusableCoverError(`cover format not supported by the vision api (${declaredType || 'unknown'})`)
  }
  return `data:${type};base64,${bytes.toString('base64')}`
}

/** One cover frame through the model. Returns the text blocks it read and what
 *  the call cost; throws only on a failure the caller should record per video. */
export async function ocrCoverFrame(imageUrl: string): Promise<OcrOutcome> {
  const prompt = buildOcrPrompt()
  const startedAt = Date.now()
  const dataUri = await fetchCoverAsDataUri(imageUrl)
  const completion = await openai.chat.completions.parse({
    model: OCR_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt.user },
          { type: 'image_url', image_url: { url: dataUri, detail: OCR_IMAGE_DETAIL } },
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
  rows: (OcrSelectionRow & { comments_count: number | null })[],
  batchSize = OCR_BATCH,
  cap = OCR_CAP,
  opts: { durableCover?: boolean; coverStillAnswers?: boolean } = {},
): string[][] {
  const ids = rows
    .filter((r) => needsOcr(r, opts))
    .sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0) || a.video_id.localeCompare(b.video_id))
    .slice(0, cap)
    .map((r) => r.video_id)
  return chunk(ids, batchSize)
}

/** Batch plan for the gather-time OCR fan-out: this run's video_raw candidates
 *  for one platform, minus videos that already have an answer, signal-first,
 *  chunked. planTranscribeBatches' shape — the status check is scoped to
 *  exactly these candidates (chunked .in), never a platform-wide unbounded
 *  read.
 *
 *  `cap` is the run's REMAINING budget, not a per-platform one: the caller
 *  subtracts what each platform planned so the three share OCR_CAP between them
 *  (H2). Pass 0 and nothing is planned. */
export async function planOcrBatches(
  clientId: string,
  runId: string,
  platform: Platform,
  cap = OCR_CAP,
): Promise<string[][]> {
  const admin = createAdminClient()
  if (!canOcr(adapters[platform])) return []
  if (!(await hasOcrColumns(admin))) return []
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

  const rows: (OcrSelectionRow & { comments_count: number | null })[] = []
  for (const part of chunk(rawIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, comments_count, ocr_status, ocr_attempts')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .in('video_id', part)
    if (error) throw new Error(`plan ocr: ${error.message}`)
    rows.push(...((data ?? []) as typeof rows))
  }
  // Gather time: this run just fetched these items, so a signed cover is live by
  // definition. A previous run's 'failed' or 'no_image' therefore gets another
  // attempt here — which is the only chance it will ever get on TikTok/Instagram.
  return orderAndChunkOcrPending(rows, OCR_BATCH, cap, { coverStillAnswers: true })
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
  /** Per-video detail lines, populated ONLY on a dry run. The pipeline's step
   *  results stay small; scripts/ocr-videos.ts --probe needs to show what each
   *  cover actually read so it can be compared against the image. */
  samples: string[]
}

export function emptyOcrResult(): OcrResult {
  return { ok: 0, none: 0, noImage: 0, skipped: 0, failed: 0, costUsd: 0, rateLimited: false, errors: [], samples: [] }
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
    /** Attempts recorded on the row before this one. */
    attempts: number
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
    if (opts.dryRun) out.samples.push(`- ${opts.platform} ${opts.videoId}\n  no_image (no cover url on the stored item)`)
    const err = await write({ ocr_text: null, ocr_status: 'no_image', ocr_error: null, ocr_attempts: opts.attempts + 1 })
    if (err) { out.errors.push(`ocr write (${opts.videoId}): ${err}`); out.noImage--; out.failed++ }
    return
  }

  let r: OcrOutcome
  try {
    r = await ocrCoverFrame(opts.imageUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A cover WE cannot use — HEIC, a host off the allowlist, an empty or
    // oversized body — is not a failed read. It is a fact about our fetcher, and
    // calling it 'failed' would blame the frame and (before H1's attempt budget)
    // permanently tombstone ~9% of TikTok for a format we chose not to decode.
    // 'no_image' is the honest verdict: there was no image we could show a model.
    if (e instanceof UnusableCoverError) {
      out.noImage++
      if (opts.dryRun) out.samples.push(`- ${opts.platform} ${opts.videoId}\n  cover: ${opts.imageUrl}\n  no_image — ${msg}`)
      const err = await write({ ocr_text: null, ocr_status: 'no_image', ocr_error: msg.slice(0, 300), ocr_attempts: opts.attempts + 1 })
      if (err) { out.errors.push(`ocr write (${opts.videoId}): ${err}`); out.noImage--; out.failed++ }
      return
    }
    out.failed++
    if (isRateLimited(msg)) out.rateLimited = true
    if (opts.dryRun) out.samples.push(`- ${opts.platform} ${opts.videoId}\n  cover: ${opts.imageUrl}\n  failed — ${msg.slice(0, 200)}`)
    out.errors.push(`ocr (${opts.videoId}): ${msg.slice(0, 200)}`)
    // A rate limit is never recorded (translateBatch's rule): it says nothing
    // about this video, and stamping it would exclude a whole batch a retry
    // would have read fine.
    if (!isRateLimited(msg)) await write({ ocr_status: 'failed', ocr_error: msg.slice(0, 300), ocr_attempts: opts.attempts + 1 })
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
  if (opts.dryRun) {
    out.samples.push(
      [
        `- ${opts.platform} ${opts.videoId}`,
        `  cover: ${opts.imageUrl}`,
        `  ${status} · ${r.usage.prompt_tokens}+${r.usage.completion_tokens} tok · $${cost.toFixed(5)} · ${r.durationMs}ms`,
        text ? text.split('\n').map((l) => `    | ${l}`).join('\n') : '    (no legible text)',
      ].join('\n'),
    )
  }
  const writeErr = await write({ ocr_text: text || null, ocr_status: status, ocr_error: null, ocr_attempts: opts.attempts + 1 })
  if (writeErr) {
    out.errors.push(`ocr write (${opts.videoId}): ${writeErr}`)
    out.failed++
    if (status === 'ok') out.ok--; else out.none--
  }
  // Logged either way, write error included: ai_call_log is the ledger of record
  // for what was SPENT, and the call was spent. Not on a dry run, though —
  // translateBatch's rule: a dry run must leave the tenant's tables exactly as
  // it found them, ai_call_log included, so the read-only check in
  // scripts/ocr-videos.ts really does write nothing.
  if (opts.dryRun) return
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
  // The guard protects WRITES (and paying for reads with nowhere to store them).
  // A dry run stores nothing by design, so it is free to exercise the real fetch
  // and model path before the migration lands — which is exactly what the
  // bounded live check needs.
  if (!opts.dryRun && !(await hasOcrColumns(admin))) return out

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
  const attempts = new Map<string, number>()
  for (const part of chunk(rawRows.map((r) => r.video_id), 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, ocr_status, ocr_attempts')
      .eq('client_id', opts.clientId)
      .eq('platform', opts.platform)
      .in('video_id', part)
    if (error) {
      // No column yet: on a dry run every video simply reads as unread, which
      // is true. On a real run hasOcrColumns already returned above.
      if (isMissingColumnError(error, 'ocr_status') && opts.dryRun) continue
      out.errors.push(`ocr done-check: ${error.message}`)
      return out
    }
    for (const r of (data ?? []) as OcrSelectionRow[]) {
      attempts.set(r.video_id, r.ocr_attempts ?? 0)
      // At gather time the signed cover is live by definition (this run fetched
      // the item), so a previous non-verdict is retried here while its budget
      // lasts — the only chance TikTok/Instagram will ever get.
      if (!needsOcr(r, { coverStillAnswers: true })) done.add(r.video_id)
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
      attempts: attempts.get(row.video_id) ?? 0,
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
  if (!(await hasOcrColumns(admin))) return { batches: [], needing: 0, deferred: 0 }
  // Unread rows PLUS rows whose only answer was a non-verdict ('failed' /
  // 'no_image') and that still have attempts left. YouTube's cover is durable,
  // so a transient blip must not remove a video from the backfill forever
  // (H1) — the attempt budget is what keeps that from becoming an endless retry.
  const rows = await selectAll<OcrSelectionRow & { comments_count: number | null }>(() =>
    admin
      .from('videos')
      .select('video_id, comments_count, ocr_status, ocr_attempts')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .or('ocr_status.is.null,ocr_status.in.(failed,no_image)')
      .order('video_id', { ascending: true }),
  )
  const pending = rows.filter((r) => needsOcr(r, { durableCover: true }))
  const batches = orderAndChunkOcrPending(pending, OCR_BATCH, cap, { durableCover: true })
  return { batches, needing: pending.length, deferred: Math.max(0, pending.length - cap) }
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
  if (!opts.dryRun && !(await hasOcrColumns(admin))) return out

  const rows: OcrSelectionRow[] = []
  for (const part of chunk(opts.videoIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('video_id, ocr_status, ocr_attempts')
      .eq('client_id', opts.clientId)
      .eq('platform', platform)
      .in('video_id', part)
    if (error) {
      if (isMissingColumnError(error, 'ocr_status') && opts.dryRun) {
        rows.push(...part.map((video_id) => ({ video_id, ocr_status: null, ocr_attempts: 0 })))
        continue
      }
      out.errors.push(`ocr backfill read: ${error.message}`)
      return out
    }
    rows.push(...((data ?? []) as typeof rows))
  }

  let callIndex = (opts.batchNo ?? 1) * 1000
  for (const row of rows) {
    if (!needsOcr(row, { durableCover: true })) { out.skipped++; continue }
    callIndex++
    await ocrOne(admin, {
      clientId: opts.clientId,
      runId: opts.runId,
      platform,
      videoId: row.video_id,
      imageUrl: adapter.coverUrlById!(row.video_id),
      attempts: row.ocr_attempts ?? 0,
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

/**
 * "That column does not exist", by MESSAGE.
 *
 * classify-meta's isMissingColumnError reads the PostgrestError's `code`, which
 * is the right check where the raw error is in hand. selectAll rewraps errors as
 * plain Errors and drops the code, so the surviving signal is the text — and
 * Postgres names the column in it ("column videos.ocr_status does not exist").
 */
export function mentionsMissingColumn(e: unknown, column: string): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: string })?.message ?? ''
  return msg.includes(column) && /does not exist|schema cache/i.test(msg)
}

/**
 * Are the WP7b columns actually on `videos` yet?
 *
 * A deploy can land before its migration, and when it does every OCR read and
 * write raises 42703. Without this the plan step throws, the wave's catch turns
 * it into a run error, and — worse for the two paths that are not isolated —
 * plan-pass-a takes the whole run down for every tenant. classify-meta already
 * carries this exact pattern for `classified_prompt_version`; WP7b carried none
 * of it, and the T6 probe hit it live.
 *
 * Checked once per plan step (one row, one column, index-free but trivial) and
 * cached for the life of the process, so the fan-out does not re-ask.
 */
let ocrColumnsReady: boolean | null = null
export async function hasOcrColumns(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  if (ocrColumnsReady !== null) return ocrColumnsReady
  const { error } = await admin.from('videos').select('ocr_status').limit(1)
  ocrColumnsReady = !(error && isMissingColumnError(error, 'ocr_status'))
  if (!ocrColumnsReady) {
    console.warn('[ocr] videos.ocr_status does not exist — apply supabase/migrations/20260912100000_ocr_text.sql. The OCR waves are skipped until it lands; nothing is spent and nothing is lost (every video simply stays unread).')
  }
  return ocrColumnsReady
}

/** Test seam: the cache is process-lifetime, which a test must be able to clear. */
export function resetOcrColumnCache(): void {
  ocrColumnsReady = null
}
