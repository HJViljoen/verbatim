import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { clipText } from '../gather/transcript'
import {
  ANALYSIS_TEMPERATURE, TRANSLATE_BATCH, TRANSLATE_CAP, TRANSLATE_MAX_CHARS, TRANSLATE_MODEL, estimateCost,
} from '../config'
import { logAiCall } from './ai-log'

// Transcript translation — the `transcript_en` wave (WP6, 2026-09-11).
//
// Designed 2026-07-23, deliberately not built 2026-08-08 ("non-EN transcripts
// read as-is; build translation only if measurement demands it"), built now
// because the standing instruction is accuracy and quality of output first.
//
// THE INVARIANT this serves: the ORIGINAL transcript stays the evidence. A
// translation is a reading aid for the extraction model and nothing else — it
// is never quoted, never displayed, never frozen into a snapshot. Pass A gets
// both blocks and is told which one it may quote from, so the verbatim-quote
// validator (which matches against the clipped ORIGINAL the model saw) keeps
// working unchanged and the "in their own words" promise (2026-08-09) holds.
//
// Translation is its own pipeline wave rather than part of transcription, so it
// covers the historical corpus and the platform-URL backfill path too — a
// transcript that lands by any route, in any run, gets translated on the next
// one.

/** The columns the selection rule reads. Deliberately not VideoRow: the plan
 *  step must be able to decide without loading transcript text for the corpus. */
export interface TranslatableVideo {
  transcript: string | null
  transcript_lang: string | null
  transcript_status: string | null
  transcript_en: string | null
  transcript_en_error: string | null
}

/** Is this transcript already in English?
 *
 *  Two vocabularies reach transcript_lang (normaliseLang maps Whisper's
 *  'english' to ISO 'en' on write, but rows predate it and providers invent
 *  spellings), and regional tags ('en-US' from a caption track) are English
 *  too. The prefix test is anchored on a separator so 'enm' — Middle English,
 *  which AssemblyAI can return — is not mistaken for it. */
export function isEnglishLang(lang: string | null | undefined): boolean {
  if (!lang) return false
  const l = lang.trim().toLowerCase()
  return l === 'en' || l === 'english' || /^en[-_]/.test(l)
}

/**
 * The selection rule, stated once.
 *
 * A video is translated when it has content-gated speech (the usableTranscript
 * rule — 'ok' is the only readable status), the provider said what language
 * that speech is in, that language is not English, and nothing has been written
 * to transcript_en / transcript_en_error yet.
 *
 * Unknown language is NOT translated. A null lang means the provider declined
 * to say, and asking the model to translate text of unstated origin is the one
 * case where it has to guess what it is reading — the exact failure mode this
 * feature exists to remove. Those rows keep reading as-is, as they do today.
 *
 * A recorded transcript_en_error is a tombstone, not a retry queue: a weekly
 * run must not re-pay for the same failure forever. Clearing the column is the
 * deliberate retry (scripts/translate-transcripts.ts prints the count).
 */
export function needsTranslation(v: TranslatableVideo): boolean {
  if (v.transcript_status !== 'ok') return false
  if (!v.transcript || !v.transcript.trim()) return false
  if (!v.transcript_lang || !v.transcript_lang.trim()) return false
  if (isEnglishLang(v.transcript_lang)) return false
  if (v.transcript_en !== null || v.transcript_en_error !== null) return false
  return true
}

const TRANSLATE_PROMPT_VERSION = 'translate_v1'

const translationSchema = z.object({
  translation: z.string(),
})

/** System + user prompt for one transcript. Pure — the live call and the dry
 *  run assemble the identical strings, so a token estimate is the real one. */
export function buildTranslatePrompt(text: string, lang: string | null): { system: string; user: string } {
  const system = [
    'You translate social-video transcripts into English for an analysis system.',
    '',
    'Rules:',
    '- Translate FAITHFULLY and COMPLETELY. Every sentence in the source gets a sentence in the output, in the same order. Do not summarise, condense, or drop filler, repetition, hesitation or profanity — the analysis reads tone and emphasis, not just content.',
    '- Plain, natural English. Render idiom as the nearest English idiom rather than word-for-word, but never embellish: if the speaker is vague, the translation is vague.',
    '- Keep brand names, product names, model numbers, handles and hashtags exactly as written in the source. Do not translate or localise them.',
    '- Transcripts are machine-made and often messy: no punctuation, run-on speech, mis-heard words. Translate what is there. Where a passage is genuinely unintelligible, render it as [unintelligible] rather than inventing a plausible line.',
    '- No commentary, no notes, no preamble, no labels. Return only the translation.',
    '- If the text is already English, return it unchanged.',
  ].join('\n')
  const user = [
    `TRANSCRIPT (language: ${lang ?? 'unknown'})`,
    clipText(text, TRANSLATE_MAX_CHARS),
  ].join('\n')
  return { system, user }
}

/**
 * Ids of videos to translate this run, chunked into step-sized batches.
 *
 * The cap applies BEFORE batching, so a capped run dispatches whole batches and
 * the remainder simply comes on the next run (BACKFILL_CAP's shape). Order is
 * the caller's — the plan step hands them richest-first so a capped first run
 * takes the highest-signal videos.
 */
export function planTranslation(
  videos: { id: string }[],
  opts: { cap?: number; batch?: number } = {},
): string[][] {
  const cap = opts.cap ?? TRANSLATE_CAP
  const batch = opts.batch ?? TRANSLATE_BATCH
  return chunk(videos.slice(0, cap).map((v) => v.id), batch)
}

export interface TranslateResult {
  translated: number
  skipped: number
  failed: number
  costUsd: number
  errors: string[]
}

/** One transcript through the model. Returns the translation and what it cost;
 *  throws only on a transport failure the caller should record per video. */
export async function translateTranscript(
  text: string,
  lang: string | null,
): Promise<{ translation: string; usage: { prompt_tokens: number; completion_tokens: number }; durationMs: number; prompt: { system: string; user: string } }> {
  const prompt = buildTranslatePrompt(text, lang)
  const startedAt = Date.now()
  const completion = await openai.chat.completions.parse({
    model: TRANSLATE_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: zodResponseFormat(translationSchema, 'translation'),
  })
  const msg = completion.choices[0]?.message
  const parsed = msg?.parsed
  if (!parsed) throw new Error(msg?.refusal ?? 'no parsed translation')
  const translation = parsed.translation.trim()
  if (!translation) throw new Error('empty translation')
  return {
    translation,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
    },
    durationMs: Date.now() - startedAt,
    prompt,
  }
}

/**
 * Plan step: the videos that need a translation now, richest-first, chunked.
 *
 * The DB filter is only an index-friendly pre-filter over needsTranslation —
 * the rule itself is re-applied in code on the rows that come back, and again
 * at write distance inside the batch. `transcript` is NOT selected here: a
 * corpus-wide read of that column hung Postgres for eight hours once
 * (lib/pipeline/types.ts SYNTHESIS_VIDEO_COLUMNS), and its presence is already
 * implied by transcript_status 'ok' plus the batch's own re-check.
 */
export async function planTranslateBatches(clientId: string, cap = TRANSLATE_CAP): Promise<{
  batches: string[][]
  needing: number
  deferred: number
  byLang: Record<string, number>
}> {
  const admin = createAdminClient()
  const rows = await selectAll<{ id: string; transcript_lang: string | null; comments_count: number | null }>(() =>
    admin.from('videos')
      .select('id, transcript_lang, comments_count')
      .eq('client_id', clientId)
      .eq('transcript_status', 'ok')
      .not('transcript_lang', 'is', null)
      .is('transcript_en', null)
      .is('transcript_en_error', null)
      .order('id', { ascending: true }),
  )
  const pending = rows.filter((r) => !isEnglishLang(r.transcript_lang) && (r.transcript_lang ?? '').trim() !== '')
  const byLang: Record<string, number> = {}
  for (const r of pending) {
    const k = (r.transcript_lang ?? 'unknown').toLowerCase()
    byLang[k] = (byLang[k] ?? 0) + 1
  }
  // Richest-first, so a capped first run takes the videos whose analysis
  // carries the most weight and the tail comes next run.
  pending.sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0))
  const batches = planTranslation(pending, { cap })
  return { batches, needing: pending.length, deferred: Math.max(0, pending.length - cap), byLang }
}

/**
 * Translate one batch of videos and write the results.
 *
 * Sequential within the batch (8 × one gpt-4.1 call ≈ 80s, wide margin under
 * the 300s step cap) and idempotent: the selection rule is re-checked on the
 * freshly-read rows, so an Inngest step retry skips what the first attempt
 * already wrote. A per-video failure is stamped into transcript_en_error and
 * counted — it never sinks the batch, and the video keeps reading as-is.
 */
export async function translateBatch(opts: {
  clientId: string
  runId: string | null
  videoIds: string[]
  batchNo?: number
  dryRun?: boolean
}): Promise<TranslateResult> {
  const admin = createAdminClient()
  const out: TranslateResult = { translated: 0, skipped: 0, failed: 0, costUsd: 0, errors: [] }
  if (!opts.videoIds.length) return out

  const rows: (TranslatableVideo & { id: string })[] = []
  for (const part of chunk(opts.videoIds, 100)) {
    const { data, error } = await admin
      .from('videos')
      .select('id, transcript, transcript_lang, transcript_status, transcript_en, transcript_en_error')
      .eq('client_id', opts.clientId)
      .in('id', part)
    if (error) {
      out.errors.push(`translate read: ${error.message}`)
      return out
    }
    rows.push(...((data ?? []) as typeof rows))
  }

  let callIndex = (opts.batchNo ?? 1) * 1000
  for (const v of rows) {
    if (!needsTranslation(v)) { out.skipped++; continue }
    callIndex++
    try {
      const r = await translateTranscript(v.transcript!, v.transcript_lang)
      const cost = estimateCost(TRANSLATE_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens)
      out.costUsd += cost
      if (opts.dryRun) { out.translated++; continue }
      const { error } = await admin.from('videos')
        .update({ transcript_en: r.translation, transcript_en_error: null })
        .eq('id', v.id)
      if (error) { out.errors.push(`translate write (${v.id}): ${error.message}`); out.failed++; continue }
      out.translated++
      await logAiCall(admin, {
        clientId: opts.clientId,
        runId: opts.runId,
        pass: 'translate',
        callIndex,
        model: TRANSLATE_MODEL,
        promptVersion: TRANSLATE_PROMPT_VERSION,
        systemPrompt: r.prompt.system,
        userPrompt: r.prompt.user,
        response: { lang: v.transcript_lang, chars: r.translation.length },
        error: null,
        usage: r.usage,
        durationMs: r.durationMs,
        validationStatus: 'ok',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.failed++
      out.errors.push(`translate (${v.id}): ${msg.slice(0, 200)}`)
      // Stamp the tombstone so the next run does not re-pay for the same
      // failure. A rate limit is the exception: it says nothing about this
      // video, and stamping it would permanently exclude a whole batch that a
      // retry would have translated fine.
      if (!opts.dryRun && !isRateLimited(msg)) {
        await admin.from('videos').update({ transcript_en_error: msg.slice(0, 300) }).eq('id', v.id)
      }
    }
  }
  return out
}

/** A 429 (rate limit or exhausted credits) after the SDK's own backoff — a
 *  fact about the account, not about the video (pass-a.ts isRateLimitError). */
function isRateLimited(msg: string): boolean {
  return /\b429\b|rate limit|insufficient_quota|no credits/i.test(msg)
}
