import { toFile } from 'openai'
import { openai } from '../openai'
import {
  TRANSCRIBE_MODEL,
  MIN_TRANSCRIPT_CHARS,
  TRANSCRIBE_MAX_BYTES,
  CONTENT_GATE_MODEL,
} from '../config'
import type { MediaRef, Platform, SubtitleTrack, TranscriptResult } from './types'

// Transcript resolution (Step 1 — capture only). One transcript per video,
// however sourced: a platform caption track when the actor returns one (free),
// else Whisper on the downloaded media. The analysis passes DO NOT read this yet.
//
// Every media/caption URL is a signed, expiring CDN link, so this runs during
// gather (right after the item is fetched) — never lazily later.

/**
 * Parse a WebVTT caption file to plain, de-duplicated text. Auto-captions roll
 * the same line forward across overlapping cues, so consecutive repeats are
 * collapsed. Timestamp lines, cue numbers, inline timing tags, and leading
 * bracketed sound cues ([Music]) are stripped.
 */
export function parseWebVtt(vtt: string): string {
  const out: string[] = []
  for (let line of vtt.split(/\r?\n/)) {
    line = line.trim()
    if (!line || line === 'WEBVTT' || line.includes('-->') || /^\d+$/.test(line)) continue
    line = line.replace(/<[^>]+>/g, '') // inline timing tags <00:00:01.000>
    line = line.replace(/^\[[^\]]+\]\s*/, '') // leading [Music] / [Applause]
    if (!line) continue
    if (out.length && out[out.length - 1] === line) continue // rolling repeat
    out.push(line)
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** Pick the best caption track: prefer an English track, else the first. */
export function pickTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  if (!tracks.length) return null
  return tracks.find((t) => (t.lang ?? '').toLowerCase().startsWith('en')) ?? tracks[0]
}

// Whisper's verbose_json reports a language NAME ('english'), while a platform
// caption track reports an ISO code ('en') — same column, two vocabularies, so
// anything keyed on language would silently miss half the rows. Normalise to
// ISO-639-1. Unknown languages fall through as-is rather than being dropped.
const LANG_CODES: Record<string, string> = {
  english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de',
  italian: 'it', dutch: 'nl', afrikaans: 'af', arabic: 'ar', hindi: 'hi',
  telugu: 'te', tamil: 'ta', urdu: 'ur', indonesian: 'id', malay: 'ms',
  chinese: 'zh', japanese: 'ja', korean: 'ko', russian: 'ru', turkish: 'tr',
  thai: 'th', vietnamese: 'vi', polish: 'pl', swedish: 'sv', danish: 'da',
  norwegian: 'no', filipino: 'tl', tagalog: 'tl',
  // Seen as YouTube caption language names on the first Össur backfill (2026-08-16).
  bengali: 'bn', hungarian: 'hu', nepali: 'ne', ukrainian: 'uk', greek: 'el', czech: 'cs', romanian: 'ro', hebrew: 'he', persian: 'fa', finnish: 'fi',
}

export function normaliseLang(lang: string | null | undefined): string | null {
  if (!lang) return null
  const l = lang.trim().toLowerCase()
  if (!l) return null
  return LANG_CODES[l] ?? l
}

/** Count LETTERS only — the speech-gate measure. Whisper renders a music-only
 *  clip as "♪♪ ♪♪" and captions can be "[Music]"; those have real length but no
 *  words, so gating on raw length lets them through. Letters don't lie. */
export function speechLen(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length
}

/**
 * Truncate by CODE POINT, not UTF-16 unit. A plain `.slice()` can cut an emoji
 * in half and leave a lone surrogate, which is unencodable — the OpenAI request
 * body then 400s with "failed to parse JSON value". Social text is full of
 * emoji, so this is the common case, not an edge one.
 */
export function clipText(s: string, max: number): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  const points = [...collapsed]
  return points.length <= max ? collapsed : points.slice(0, max).join('')
}

// The failure modes below are the ones actually observed on the 2026-08-08
// Sealand backfill, not hypotheticals — a bare three-way definition missed half
// of them, so each junk class carries a real example.
const CONTENT_GATE_PROMPT = [
  'You are auditing an auto-generated transcript of a short social video.',
  'Decide whether it contains SUBSTANTIVE SPOKEN CONTENT about the video subject.',
  'Reply ONLY with JSON: {"verdict":"speech"}',
  '',
  '- speech:  a person genuinely talking — narrating, explaining, reviewing,',
  '           demonstrating, telling a story, or selling something. Any language.',
  '- lyrics:  song lyrics. The audio is music with vocals and nobody is talking.',
  '           e.g. "And I\'m feelin\' good" / "Have a holly jolly Christmas".',
  '- garbled: no usable content. This covers ALL of:',
  '           · transcription noise — "50ression 3t 2.1t 0.9t period 2.6t"',
  '           · watermarks — "Transcribed by https://otter.ai"',
  '           · bare filler with no subject — "Thanks for watching!", "Let\'s go!"',
  '           · one short line repeated over and over (a looping caption artefact)',
  '           · disconnected word salad that never states a subject',
  '',
  'Judge CONTENT, not length: a short line that actually says something about a',
  'product or a subject is speech; a long string of noise or repetition is garbled.',
  'When speech and background music are mixed but a person is genuinely talking,',
  'answer "speech".',
].join('\n')

export type TranscriptContent = 'speech' | 'lyrics' | 'garbled'

/**
 * The content gate. The letter-count gate can only see whether SOMETHING was
 * said; it can't tell a product review from a pop chorus, and Whisper transcribes
 * background music as happily as narration. Measured on the 2026-08-08 backfill:
 * a third of transcripts that passed the letter gate had no usable speech.
 *
 * Fails OPEN (returns 'speech'): a transient classifier error should not throw
 * away a good transcript, and Pass A's own prompt is the second line of defence.
 */
export async function classifyTranscript(text: string): Promise<{ verdict: TranscriptContent; tokens: { prompt: number; completion: number } }> {
  try {
    const completion = await openai.chat.completions.create({
      model: CONTENT_GATE_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: CONTENT_GATE_PROMPT },
        { role: 'user', content: clipText(text, 500) },
      ],
      response_format: { type: 'json_object' },
    })
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { verdict?: string }
    const v = (raw.verdict ?? '').toLowerCase()
    const tokens = { prompt: completion.usage?.prompt_tokens ?? 0, completion: completion.usage?.completion_tokens ?? 0 }
    return { verdict: v === 'lyrics' || v === 'garbled' ? v : 'speech', tokens }
  } catch (e) {
    console.warn(`[transcript] content gate failed, keeping transcript: ${(e as Error).message}`)
    return { verdict: 'speech', tokens: { prompt: 0, completion: 0 } }
  }
}

async function fetchCaption(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`caption fetch ${res.status}`)
  return res.text()
}

async function whisperMedia(url: string): Promise<{ text: string; lang: string | null; minutes: number }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`media fetch ${res.status}`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared && declared > TRANSCRIBE_MAX_BYTES) throw new Error(`media ${Math.round(declared / 1e6)}MB over cap`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > TRANSCRIBE_MAX_BYTES) throw new Error(`media ${Math.round(buf.byteLength / 1e6)}MB over cap`)
  const file = await toFile(buf, 'audio.mp4')
  // verbose_json, not json: it's the only response format that returns the
  // DETECTED language, and whether a transcript needs translating can't be
  // decided without knowing what language it's in.
  const out = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    response_format: 'verbose_json',
  })
  const o = out as { text?: string; language?: string; duration?: number }
  // verbose_json also returns the audio duration — the unit Whisper bills by.
  return { text: (o.text ?? '').trim(), lang: normaliseLang(o.language), minutes: (o.duration ?? 0) / 60 }
}

/** Apply both gates to a resolved text: the cheap letter count first (silent or
 *  music-only never reaches the classifier), then the content gate. Carries the
 *  cost facts (Whisper minutes, gate tokens) so the caller can log spend.
 *  Exported (Wave 4) so a platform whose text arrives already fetched — YouTube
 *  captions via `fetchTranscripts` — is judged by exactly the same gate as a
 *  Whisper result: an auto-caption of a music video is lyrics either way. */
export async function gateTranscript(
  text: string,
  lang: string | null,
  source: TranscriptResult['source'],
  whisperMinutes?: number,
): Promise<TranscriptResult> {
  if (speechLen(text) < MIN_TRANSCRIPT_CHARS) return { text, lang, source, status: 'no_speech', whisperMinutes }
  const { verdict, tokens } = await classifyTranscript(text)
  return { text, lang, source, status: verdict === 'speech' ? 'ok' : verdict, whisperMinutes, gateTokens: tokens }
}

// ---- AssemblyAI --------------------------------------------------------------
// The primary media path when ASSEMBLYAI_API_KEY is set (2026-09-09). Whisper
// stays as the fallback — no key, or AssemblyAI erred on this video — so the
// provider swap can be undone by unsetting one env var.

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2'

/** Poll interval while a transcript job runs. AssemblyAI turns a 30s reel
 *  around in ~10-20s, so this is a handful of polls, not a spin. */
const ASSEMBLYAI_POLL_MS = 3_000

/** Wall-clock ONE video's AssemblyAI job may take before we give up on it —
 *  the ISOLATION_DEADLINE_MS pattern (lib/gather/gather.ts), for the same
 *  reason: a slow provider must not walk an Inngest step past the 300s
 *  function cap. The batch passes its own remaining budget as `deadline`;
 *  this bounds a single job when nobody does. */
export const ASSEMBLYAI_DEADLINE_MS = 120_000

export function assemblyAiKey(): string | null {
  return process.env.ASSEMBLYAI_API_KEY?.trim() || null
}

/**
 * How this platform's media has to reach AssemblyAI.
 *   'url'    — the CDN answers an anonymous third-party GET, so AssemblyAI
 *              fetches the bytes itself: no download here, no upload, no size
 *              limit at all. Instagram (verified 2026-09-09: 200 + accept-ranges
 *              on a signed CDN url from a datacenter IP).
 *   'upload' — the CDN serves only the client that was handed the link (TikTok
 *              answers a third-party GET with 503), so the in-function download
 *              — which does work — feeds POST /v2/upload.
 * Unknown platforms take the safe route: upload.
 */
export function assemblySubmission(platform: Platform | undefined | null): 'url' | 'upload' {
  return platform === 'instagram' ? 'url' : 'upload'
}

async function assemblyUpload(mediaUrl: string, key: string): Promise<string> {
  // The one path that downloads. Deliberately NO TRANSCRIBE_MAX_BYTES check:
  // that cap exists because OpenAI's transcription endpoints are upload-only
  // with a 25MB limit, and it silently dropped the longest (often richest)
  // videos. AssemblyAI's upload endpoint has no practical cap.
  const res = await fetch(mediaUrl)
  if (!res.ok) throw new Error(`media fetch ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.byteLength) throw new Error('media empty')
  const up = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/octet-stream' },
    body: new Uint8Array(buf),
  })
  if (!up.ok) throw new Error(`assemblyai upload ${up.status}: ${(await up.text().catch(() => '')).slice(0, 200)}`)
  const j = (await up.json()) as { upload_url?: string }
  if (!j.upload_url) throw new Error('assemblyai upload returned no url')
  return j.upload_url
}

/**
 * Transcribe one media reference with AssemblyAI. Throws on any failure so the
 * caller can fall back to Whisper — this is a provider, not a verdict.
 * `language_detection` is on: the corpus is South African and multilingual, and
 * a wrong language hint is worse than none.
 */
export async function assemblyTranscribe(
  mediaUrl: string,
  opts: { platform?: Platform; key: string; deadline?: number; now?: () => number; sleep?: (ms: number) => Promise<void> },
): Promise<{ text: string; lang: string | null; minutes: number }> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const deadline = opts.deadline ?? now() + ASSEMBLYAI_DEADLINE_MS
  const audioUrl =
    assemblySubmission(opts.platform) === 'url' ? mediaUrl : await assemblyUpload(mediaUrl, opts.key)

  const sub = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: 'POST',
    headers: { authorization: opts.key, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl, language_detection: true }),
  })
  if (!sub.ok) throw new Error(`assemblyai submit ${sub.status}: ${(await sub.text().catch(() => '')).slice(0, 200)}`)
  const job = (await sub.json()) as { id?: string }
  if (!job.id) throw new Error('assemblyai submit returned no id')

  for (;;) {
    const r = await fetch(`${ASSEMBLYAI_BASE}/transcript/${job.id}`, { headers: { authorization: opts.key } })
    if (!r.ok) throw new Error(`assemblyai poll ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
    const j = (await r.json()) as {
      status?: string; text?: string | null; language_code?: string | null; audio_duration?: number | null; error?: string | null
    }
    if (j.status === 'completed') {
      return {
        text: (j.text ?? '').trim(),
        lang: normaliseLang(j.language_code),
        minutes: (j.audio_duration ?? 0) / 60,
      }
    }
    if (j.status === 'error') throw new Error(`assemblyai: ${(j.error ?? 'unknown error').slice(0, 200)}`)
    // Out of budget. The job keeps running on their side (and is billed), so
    // this is a real attempt — it just doesn't get a verdict here. The video
    // stays a backfill candidate this run and re-plans next run.
    if (now() + ASSEMBLYAI_POLL_MS >= deadline) throw new Error(`assemblyai still ${j.status ?? 'pending'} at the step deadline`)
    await sleep(ASSEMBLYAI_POLL_MS)
  }
}

/**
 * Resolve one transcript from a platform's media reference. Never throws — a
 * failure returns a status so one bad video can't sink the batch. Order: free
 * caption track first (TikTok when present), then the media — AssemblyAI when
 * ASSEMBLYAI_API_KEY is set, Whisper when it isn't or when AssemblyAI erred.
 * Applies the speech-gate: a near-empty result is `no_speech`, not `ok`.
 *
 * `deadline` is an absolute epoch-ms the whole resolution must finish inside
 * (the batch's remaining wall-clock); without one each provider bounds itself.
 */
export async function resolveTranscript(
  media: MediaRef,
  opts: { platform?: Platform; deadline?: number } = {},
): Promise<TranscriptResult> {
  try {
    const track = media.subtitleTracks ? pickTrack(media.subtitleTracks) : null
    if (track?.url) {
      // The caption URL is signed and can 403 on its own. That must not sink the
      // video — the express lane failing just means we take the slow one, so this
      // attempt gets its own catch rather than falling into the outer one.
      // (Backfill 2026-08-08: one TikTok died this way with a live mp4 in hand.)
      try {
        const text = parseWebVtt(await fetchCaption(track.url))
        if (speechLen(text) >= MIN_TRANSCRIPT_CHARS) {
          // A caption track transcribes the SAME audio Whisper would, so a
          // lyrics/garbled verdict here wouldn't change on a second pass — settle it.
          return await gateTranscript(text, normaliseLang(track.lang), 'tiktok_caption')
        }
        // caption present but empty/music-only → fall through to Whisper if we have media
      } catch (e) {
        console.warn(`[transcript] caption failed, falling back to whisper: ${(e as Error).message}`)
      }
    }
    if (media.mediaUrl) {
      const key = assemblyAiKey()
      if (key) {
        try {
          const { text, lang, minutes } = await assemblyTranscribe(media.mediaUrl, {
            platform: opts.platform, key, deadline: opts.deadline,
          })
          const gated = await gateTranscript(text, lang, 'assemblyai')
          return { ...gated, assemblyMinutes: minutes }
        } catch (e) {
          // Provider failure, not a verdict on the video: fall through to
          // Whisper, which reads the same bytes (under its 25MB cap).
          console.warn(`[transcript] assemblyai failed, falling back to whisper: ${(e as Error).message}`)
        }
      }
      const { text, lang, minutes } = await whisperMedia(media.mediaUrl)
      return await gateTranscript(text, lang, 'whisper', minutes)
    }
    return { text: '', lang: null, source: null, status: 'no_media' }
  } catch (e) {
    const message = (e as Error).message
    console.warn(`[transcript] ${message}`)
    return { text: '', lang: null, source: null, status: 'failed', error: message.slice(0, 300) }
  }
}
