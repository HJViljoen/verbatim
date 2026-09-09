import {
  APIFY_ACTORS,
  SPEECH_ACTOR_START_USD,
  SPEECH_ACTOR_PER_VIDEO_USD,
  SPEECH_ACTOR_PER_MINUTE_USD,
  YT_SPEECH_START_USD,
  YT_SPEECH_PER_CAPTION_USD,
  YT_SPEECH_PER_AI_MINUTE_USD,
  YT_SPEECH_MAX_AI_MINUTES,
  YT_SPEECH_SKIP_LONGER_THAN_MIN,
} from '../config'
import { runActor } from './apify'
import type { Platform, RawItem } from './types'

// The SECOND transcript path (Phase 2, 2026-09-09): transcribe from the PLATFORM
// URL instead of from a media handle.
//
// WHY it exists. The first path reads `video_raw` — the raw item this run's
// gather stored — and every media URL in there is a signed CDN link that expires
// within days. A video gathered three weeks ago therefore has no reachable
// media at all: on Sealand, 468 of 574 Instagram videos had transcript_status
// NULL for exactly that reason. A platform URL never expires, so this path can
// transcribe anything still public, at any time, and is what makes "a transcript
// is a precondition of analysis" a rule instead of an aspiration.
//
// It is the EXPENSIVE path (~$0.05/video vs AssemblyAI's ~$0.001 for a 30s
// reel), because the actor downloads the video itself. So it runs as a backfill
// over what the cheap path missed, never as the first attempt.

/** Pre-gate transcript text from the platform-URL path, or the reason there is
 *  none. `minutes` is the audio the provider billed (the cost unit). */
export type UrlTranscriptOutcome =
  | { ok: true; text: string; lang: string | null; minutes: number }
  | { ok: false; error: string }

/** Which actor transcribes this platform's URLs, and therefore which input
 *  shape and which parser. Live-tested 2026-09-09 (see APIFY_ACTORS.speech):
 *  the media actor handles Instagram and TikTok and FAILS on every YouTube URL,
 *  so YouTube has its own. Reddit has no video to transcribe. */
export function speechActorFor(platform: Platform): { actor: string; kind: 'media' | 'youtube' } | null {
  if (platform === 'youtube') return { actor: APIFY_ACTORS.speech.youtube, kind: 'youtube' }
  if (platform === 'instagram' || platform === 'tiktok') return { actor: APIFY_ACTORS.speech.media, kind: 'media' }
  return null
}

/** The identity an actor echoes back per item — the key both the input and the
 *  parsed output are indexed by. The media actor echoes the exact url it was
 *  given; the YouTube actor returns `metadata.id` (canonical, and its `url` is
 *  normalised, so matching on the url we sent would silently drop items). */
export function speechCandidateKey(kind: 'media' | 'youtube', v: { video_id: string; video_url: string }): string {
  return kind === 'youtube' ? v.video_id : v.video_url
}

export function speechActorInput(kind: 'media' | 'youtube', videos: { video_id: string; video_url: string }[]): RawItem {
  if (kind === 'youtube') {
    return {
      startUrls: videos.map((v) => ({ url: v.video_url })),
      outputFormats: ['text'],
      // Captions first, AI only when there are none — which is the whole point
      // here: these videos already came back 'no_media' from the caption actor.
      subType: 'both',
      enableAiFallback: true,
      maxAiMinutes: YT_SPEECH_MAX_AI_MINUTES,
      skipAiFallbackIfLongerThan: YT_SPEECH_SKIP_LONGER_THAN_MIN,
    }
  }
  return {
    urls: videos.map((v) => v.video_url),
    // We store prose, never cues — segments/srt/vtt would just be paid-for bytes
    // to throw away.
    timestamps: 'none',
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Parse one actor's dataset into per-video outcomes, keyed by
 * `speechCandidateKey`. Pure — the live item shapes (recorded
 * scratch/transcripts/actor-live-test*.log, 2026-09-09) are:
 *   media:   { url, text, language, duration_s, engine, usage:{minutes} }
 *            failure → { url, error: 'this URL could not be fetched…' }
 *   youtube: { metadata:{id,url,duration}, transcript_text, language,
 *              ai_duration_charged_min, is_ai_generated }
 *            failure → { metadata:{…}, error, error_code }
 * An item that carries neither text nor error is a failure with a stated
 * reason, never a silent empty transcript.
 */
export function parseSpeechItems(kind: 'media' | 'youtube', items: RawItem[]): Map<string, UrlTranscriptOutcome> {
  const out = new Map<string, UrlTranscriptOutcome>()
  for (const raw of items) {
    const it = raw as Record<string, unknown>
    const meta = (it.metadata ?? {}) as Record<string, unknown>
    const key = kind === 'youtube' ? str(meta.id) : str(it.url)
    if (!key) continue
    const error = str(it.error)
    if (error) {
      out.set(key, { ok: false, error: error.slice(0, 300) })
      continue
    }
    const text = (kind === 'youtube' ? str(it.transcript_text) : str(it.text)).trim()
    if (!text) {
      out.set(key, { ok: false, error: 'actor returned no transcript text' })
      continue
    }
    const minutes =
      kind === 'youtube'
        ? num(it.ai_duration_charged_min) || num(meta.duration) / 60
        : num((it.usage as Record<string, unknown> | undefined)?.minutes) || num(it.duration_s) / 60
    out.set(key, { ok: true, text, lang: str(it.language) || null, minutes })
  }
  return out
}

/**
 * ESTIMATED Apify spend for one platform-URL backfill. Both actors bill per RUN
 * (paid even when every url in it failed — the isolation pass below buys extra
 * runs), plus per transcribed video, plus per started audio minute. Checked
 * against the settled bills of the live runs on 2026-09-09: a 2-video TikTok
 * batch estimated $0.1050 and cost $0.1052.
 *
 * Estimates, not a bill: exact per-run Apify usage lands in Phase 3.
 */
export function estimateSpeechUsd(
  kind: 'media' | 'youtube',
  usage: { runs: number; transcribed: number; minutes: number },
): number {
  if (!usage.runs) return 0
  const usd =
    kind === 'youtube'
      ? usage.runs * YT_SPEECH_START_USD + usage.transcribed * YT_SPEECH_PER_CAPTION_USD + Math.ceil(usage.minutes) * YT_SPEECH_PER_AI_MINUTE_USD
      : usage.runs * SPEECH_ACTOR_START_USD + usage.transcribed * SPEECH_ACTOR_PER_VIDEO_USD + Math.ceil(usage.minutes) * SPEECH_ACTOR_PER_MINUTE_USD
  return Math.round(usd * 1e4) / 1e4
}

/**
 * Should a batch's result be re-tried one url at a time? Only when NOTHING in a
 * multi-url batch resolved.
 *
 * Measured 2026-09-09: a batch of two Instagram urls came back with both items
 * "this URL could not be fetched or transcribed" — and minutes later the same
 * two urls transcribed fine, one of them in a batch of two. So a whole-batch
 * failure is transient far more often than it is a verdict on the videos, and
 * an extra $0.005 run is the cheap way to find out which it was. Same evidence
 * rule as the caption actor's isolation pass (fetchTranscriptsIsolating,
 * lib/gather/gather.ts): one video resolving is proof the actor is healthy, so
 * the rest of that batch's failures are real per-video verdicts.
 */
export function shouldIsolate(results: Map<string, UrlTranscriptOutcome>, batchSize: number): boolean {
  if (batchSize < 2) return false
  for (const r of results.values()) if (r.ok) return false
  return true
}

/** Wall-clock the per-url isolation pass may spend before giving up on the rest
 *  (the ISOLATION_DEADLINE_MS pattern — a step must stay under 300s). */
const URL_ISOLATION_DEADLINE_MS = 150_000

/**
 * Transcribe a batch of videos by PLATFORM URL. One actor run for the whole
 * batch (both actors take a url list), which pays the per-run start fee once —
 * unless nothing in the batch resolved, in which case each url is re-tried
 * alone (see shouldIsolate: one bad url can take its batch-mates down with it).
 *
 * Throws only when the actor call itself fails — a per-video failure comes back
 * as an `ok:false` outcome, and an id the actor dropped entirely is simply
 * absent from the map (the caller decides what that means).
 */
export async function transcribeUrls(
  platform: Platform,
  videos: { video_id: string; video_url: string }[],
  opts: { timeoutSecs?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<{ results: Map<string, UrlTranscriptOutcome>; estUsd: number }> {
  const route = speechActorFor(platform)
  if (!route || !videos.length) return { results: new Map(), estUsd: 0 }
  const now = opts.now ?? Date.now
  const deadline = now() + (opts.deadlineMs ?? URL_ISOLATION_DEADLINE_MS)

  const call = async (batch: { video_id: string; video_url: string }[]) => {
    const items = await runActor(route.actor, speechActorInput(route.kind, batch), { timeoutSecs: opts.timeoutSecs ?? 240 })
    const byKey = parseSpeechItems(route.kind, items)
    const out = new Map<string, UrlTranscriptOutcome>()
    for (const v of batch) {
      const r = byKey.get(speechCandidateKey(route.kind, v))
      if (r) out.set(v.video_id, r)
    }
    return out
  }

  let runs = 1
  const results = await call(videos)
  if (shouldIsolate(results, videos.length)) {
    console.warn(`[transcript-url] ${platform} batch of ${videos.length} resolved nothing — retrying one url at a time`)
    const isolated = new Map<string, UrlTranscriptOutcome>()
    for (const v of videos) {
      // Out of budget: keep the batch's verdict for the rest rather than walking
      // the step past its cap.
      if (now() > deadline) break
      runs++
      for (const [k, r] of await call([v])) isolated.set(k, r)
    }
    for (const [k, r] of isolated) results.set(k, r)
  }

  let minutes = 0
  let transcribed = 0
  for (const r of results.values()) {
    if (!r.ok) continue
    minutes += r.minutes
    transcribed++
  }
  return { results, estUsd: estimateSpeechUsd(route.kind, { runs, transcribed, minutes }) }
}

/** One video by platform URL — the single-video form of `transcribeUrls`, for
 *  scripts and one-off retries. */
export async function transcribeByPlatformUrl(opts: {
  platform: Platform
  videoUrl: string
  videoId?: string
  timeoutSecs?: number
}): Promise<{ outcome: UrlTranscriptOutcome; estUsd: number }> {
  const videoId = opts.videoId ?? opts.videoUrl
  const { results, estUsd } = await transcribeUrls(
    opts.platform,
    [{ video_id: videoId, video_url: opts.videoUrl }],
    { timeoutSecs: opts.timeoutSecs },
  )
  return { outcome: results.get(videoId) ?? { ok: false, error: 'actor returned no item for this url' }, estUsd }
}
