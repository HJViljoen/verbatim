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
 * ESTIMATED Apify spend for one platform-URL batch. Both actors bill per run
 * plus per video plus per (started) audio minute; `minutes` is what the items
 * reported. Labelled an estimate everywhere it is stored — Phase 3 replaces it
 * with the run's actual `usageTotalUsd`.
 */
export function estimateSpeechUsd(kind: 'media' | 'youtube', videos: number, minutes: number): number {
  if (!videos) return 0
  const usd =
    kind === 'youtube'
      ? YT_SPEECH_START_USD + videos * YT_SPEECH_PER_CAPTION_USD + Math.ceil(minutes) * YT_SPEECH_PER_AI_MINUTE_USD
      : SPEECH_ACTOR_START_USD + videos * SPEECH_ACTOR_PER_VIDEO_USD + Math.ceil(minutes) * SPEECH_ACTOR_PER_MINUTE_USD
  return Math.round(usd * 1e4) / 1e4
}

/**
 * Transcribe a batch of videos by PLATFORM URL. One actor run for the whole
 * batch (both actors take a url list), which pays the per-run start fee once.
 * Throws only when the actor call itself fails — a per-video failure comes back
 * as an `ok:false` outcome, and an id the actor dropped entirely is simply
 * absent from the map (the caller decides what that means).
 */
export async function transcribeUrls(
  platform: Platform,
  videos: { video_id: string; video_url: string }[],
  opts: { timeoutSecs?: number } = {},
): Promise<{ results: Map<string, UrlTranscriptOutcome>; estUsd: number }> {
  const route = speechActorFor(platform)
  if (!route || !videos.length) return { results: new Map(), estUsd: 0 }
  const items = await runActor(route.actor, speechActorInput(route.kind, videos), { timeoutSecs: opts.timeoutSecs ?? 280 })
  const byKey = parseSpeechItems(route.kind, items)
  const results = new Map<string, UrlTranscriptOutcome>()
  let minutes = 0
  let billed = 0
  for (const v of videos) {
    const r = byKey.get(speechCandidateKey(route.kind, v))
    if (!r) continue
    results.set(v.video_id, r)
    if (r.ok) {
      minutes += r.minutes
      billed++
    }
  }
  return { results, estUsd: estimateSpeechUsd(route.kind, billed, minutes) }
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
