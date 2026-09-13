import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { clipText } from '../gather/transcript'
import {
  ANALYSIS_TEMPERATURE, TRANSCRIPT_PROMPT_CHARS, TRANSLATE_BATCH, TRANSLATE_CAP, TRANSLATE_MODEL, estimateCost,
} from '../config'
import { normaliseLang } from '../gather/transcript'
import { dbSafeText } from '../db-text'
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
 * A video is a candidate when it has content-gated speech (the usableTranscript
 * rule — 'ok' is the only readable status), it is not already KNOWN to be
 * English, and nothing has been written to transcript_en / transcript_en_error
 * yet.
 *
 * Unknown language IS a candidate (2026-09-12). It was excluded for a day on
 * the reasoning that a model asked to translate text of unstated origin has to
 * guess what it is reading. That was wrong twice over: the review found the 317
 * unknown-language rows are not a homogeneous bucket — Sealand's two largest
 * are 38,000-character Chinese transcripts, its single biggest untranslated
 * block — and a live call with no language label translated a Traditional
 * Chinese video faithfully, brand names and place names intact. The model does
 * not need to be told; it needs to be ASKED. So it now returns the language it
 * detected alongside the translation, and says so instead of guessing: an
 * English video comes back `translation: null` and only its language is
 * written.
 *
 * A recorded transcript_en_error is a BOUNDED retry, not a tombstone
 * (2026-09-13). It was a tombstone — one failure and the row was never offered
 * again — which made every transient failure permanent and, worse, made the
 * code's one un-tombstoned failure path (a write that 400s after the call was
 * paid for) indistinguishable from "not attempted yet". A row is now offered
 * again until TRANSLATE_MAX_ATTEMPTS attempts are recorded in the error itself,
 * so a deterministic failure costs three calls across three weeks and then
 * stops. An error string WITHOUT the attempt marker is still permanent: that is
 * how a hand-written tombstone is spelled.
 */
export function needsTranslation(v: TranslatableVideo): boolean {
  if (v.transcript_status !== 'ok') return false
  if (!v.transcript || !v.transcript.trim()) return false
  if (isEnglishLang(v.transcript_lang)) return false
  if (v.transcript_en !== null) return false
  if (translateAttempts(v.transcript_en_error) >= TRANSLATE_MAX_ATTEMPTS) return false
  return true
}

/** Attempts a video gets before its failure is permanent. Three: enough to ride
 *  out a bad afternoon at the provider, small enough that a deterministic
 *  failure across the whole backlog costs one run's worth of calls, not every
 *  run's, forever. */
export const TRANSLATE_MAX_ATTEMPTS = 3

const ATTEMPT_MARKER = /^attempt (\d+)\/\d+: /

/** Attempts already recorded in a transcript_en_error. An error with no marker
 *  reads as exhausted — it is either hand-written (a deliberate "never again")
 *  or predates the counter, and neither wants re-paying for. */
export function translateAttempts(err: string | null): number {
  if (err === null) return 0
  const m = ATTEMPT_MARKER.exec(err)
  return m ? Number(m[1]) : TRANSLATE_MAX_ATTEMPTS
}

/** The transcript_en_error to write for a failure, carrying the attempt count
 *  forward. Sanitised and truncated, and it is ONLY this string — a failure
 *  write must not carry the bytes that may have caused the failure. */
export function translateErrorStamp(prev: string | null, msg: string): string {
  const n = Math.min(translateAttempts(prev) + 1, TRANSLATE_MAX_ATTEMPTS)
  return `attempt ${n}/${TRANSLATE_MAX_ATTEMPTS}: ${dbSafeText(msg)}`.slice(0, 300)
}

/**
 * The videos patch for a successful call.
 *
 * The translation is sanitised here, at the write boundary: model output that
 * contains U+0000 cannot be written to Postgres at all, and a 400 on this PATCH
 * is how a paid-for translation gets lost (lib/db-text.ts).
 *
 * The language the model actually read is written when the provider gave none,
 * and when the model says English — that second case is what closes the loop on
 * a mislabelled row: without it a video the provider called 'es' and the model
 * reads as English would carry no translation, no error and no English label,
 * and be re-selected every run until its attempts ran out.
 */
export function translationPatch(
  v: Pick<TranslatableVideo, 'transcript_lang'>,
  r: Pick<TranslateOutcome, 'language' | 'translation'>,
): Record<string, string | null> {
  const relabel = !v.transcript_lang?.trim() || (isEnglishLang(r.language) && !isEnglishLang(v.transcript_lang))
  return {
    ...(r.translation === null ? {} : { transcript_en: dbSafeText(r.translation) }),
    transcript_en_error: null,
    ...(relabel ? { transcript_lang: r.language } : {}),
  }
}

// v1.1 (2026-09-11): the unintelligibility rule was rewritten after the live
// check. On a 102-character Telugu-adjacent Hindi transcript that ASR had
// reduced to non-words, v1 returned a fluent, confident English sentence that
// the source does not say — the exact failure mode this feature exists to
// remove, arriving by a different door. The sharper rule returns the same
// passage marked [unintelligible], and re-running two clean samples (pt, de)
// under it produced translations indistinguishable in quality from v1's.
//
// v2 (2026-09-12): the model reports the language it detected, and returns
// `translation: null` when the text is already English. That is what lets the
// 317 unknown-language transcripts in (see needsTranslation) without ever
// paying to translate English into English or storing a redundant block.
//
// The version string is diagnostic only (ai_call_log.prompt_version); nothing
// re-reads on it.
const TRANSLATE_PROMPT_VERSION = 'translate_v2'

const translationSchema = z.object({
  /** ISO 639-1 of the language actually detected in the text, or 'und' when it
   *  genuinely cannot be told (a transcript of pure non-words). */
  language: z.string(),
  /** null — and ONLY null — when the detected language is English. */
  translation: z.string().nullable(),
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
    '- These transcripts are MACHINE-MADE and often wrong: mis-heard words, non-words, missing punctuation, sentences that cut off mid-word. Translate what is actually there. NEVER repair a passage into something that makes sense — a plausible English sentence over a garbled source is a fabrication, and downstream it becomes a false finding. Where a word or passage is not intelligible, write [unintelligible] in its place. A short transcript that is mostly non-words should come back mostly [unintelligible]; that is the correct answer, not a failure.',
    '- No commentary, no notes, no preamble, no labels. Return only the translation.',
    '',
    'Also report the language you actually detected in the text, as an ISO 639-1 code ("es", "zh", "hi"). The label in the input is what a speech-to-text provider guessed and is sometimes missing and sometimes wrong — trust the text. Use "und" only when the text is too garbled for any language to be identified.',
    'If the text is ALREADY ENGLISH, set language to "en" and translation to null. Do not echo English text back as a translation.',
  ].join('\n')
  // The input is clipped to exactly the span Pass A can quote from, so the
  // ORIGINAL and ENGLISH TRANSLATION blocks in that prompt describe the same
  // speech. Anything past this cut is not translated because it is not read.
  const user = [
    `TRANSCRIPT (language as the provider labelled it: ${lang ?? 'not stated'})`,
    clipText(text, TRANSCRIPT_PROMPT_CHARS),
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
  /** Detected as English: language written, no translation stored, no re-read. */
  english: number
  skipped: number
  failed: number
  costUsd: number
  /** True when a 429 was seen — a fact about the account, not the corpus, and
   *  the one condition that degrades a run regardless of the failure ratio. */
  rateLimited: boolean
  errors: string[]
}

export interface TranslateOutcome {
  /** Detected language, ISO 639-1 (or 'und'). Never null. */
  language: string
  /** null when the detected language is English — nothing to store. */
  translation: string | null
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  prompt: { system: string; user: string }
}

/** One transcript through the model. Returns the detected language and the
 *  translation (null when the text was already English) and what it cost;
 *  throws only on a failure the caller should record per video. */
export async function translateTranscript(text: string, lang: string | null): Promise<TranslateOutcome> {
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
  const language = normaliseLang(parsed.language) ?? 'und'
  const translation = parsed.translation?.trim() || null
  // A null translation means one thing only: "this is already English". Any
  // other language with nothing to show is a failed call, not a verdict —
  // treated as an error so the row is tombstoned rather than left in a state
  // that re-selects it every run forever.
  if (!translation && !isEnglishLang(language)) throw new Error(`no translation returned (detected ${language})`)
  return {
    language,
    translation: isEnglishLang(language) ? null : translation,
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
  /** Of `needing`, how many are re-attempts of a recorded failure — the rows
   *  that are costing a second or third call. Visible because they are spend. */
  retrying: number
  byLang: Record<string, number>
}> {
  const admin = createAdminClient()
  // transcript_en_error is read, not filtered on: a failed row is a candidate
  // again until its attempts run out (needsTranslation), which is what makes a
  // lost write recoverable on the next run instead of permanent.
  const rows = await selectAll<{
    id: string; transcript_lang: string | null; comments_count: number | null; transcript_en_error: string | null
  }>(() =>
    admin.from('videos')
      .select('id, transcript_lang, comments_count, transcript_en_error')
      .eq('client_id', clientId)
      .eq('transcript_status', 'ok')
      .is('transcript_en', null)
      .order('id', { ascending: true }),
  )
  // Unknown-language rows are candidates: the model reports what it detected,
  // and an English one costs one call and stores only its language.
  const pending = rows.filter((r) =>
    !isEnglishLang(r.transcript_lang) && translateAttempts(r.transcript_en_error) < TRANSLATE_MAX_ATTEMPTS)
  const byLang: Record<string, number> = {}
  for (const r of pending) {
    const k = (r.transcript_lang ?? '').trim().toLowerCase() || 'unknown'
    byLang[k] = (byLang[k] ?? 0) + 1
  }
  // Richest-first, so a capped first run takes the videos whose analysis
  // carries the most weight and the tail comes next run.
  pending.sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0))
  const batches = planTranslation(pending, { cap })
  const retrying = pending.filter((r) => r.transcript_en_error !== null).length
  return { batches, needing: pending.length, deferred: Math.max(0, pending.length - cap), retrying, byLang }
}

/**
 * Translate one batch of videos and write the results.
 *
 * Sequential within the batch (8 × one gpt-4.1 call ≈ 80s, wide margin under
 * the 300s step cap) and idempotent: the selection rule is re-checked on the
 * freshly-read rows, so an Inngest step retry skips what the first attempt
 * already wrote. A per-video failure is stamped into transcript_en_error and
 * counted — it never sinks the batch, and the video keeps reading as-is.
 *
 * EVERY failure is stamped, including a failed write and including an unexpected
 * throw from the client (2026-09-13). Two rules come out of that run:
 *   1. Nothing in here may throw. A thrown step is retried by Inngest, and a
 *      retry re-CALLS the model for every row whose result did not land — so a
 *      deterministic write failure would bill the same translation four times.
 *      A write that cannot succeed must end the row, not the step.
 *   2. A row never ends with no translation and no error. That pair means "not
 *      attempted yet" to the plan step, and a paid-for call that reads as
 *      never-attempted is a silent loss.
 */
export async function translateBatch(opts: {
  clientId: string
  runId: string | null
  videoIds: string[]
  batchNo?: number
  dryRun?: boolean
  /** Seams, for the pure-logic test of the write paths. Production passes
   *  neither — the real client and the real model call are the defaults. */
  admin?: ReturnType<typeof createAdminClient>
  translate?: (text: string, lang: string | null) => Promise<TranslateOutcome>
}): Promise<TranslateResult> {
  const admin = opts.admin ?? createAdminClient()
  const translate = opts.translate ?? translateTranscript
  const out: TranslateResult = { translated: 0, english: 0, skipped: 0, failed: 0, costUsd: 0, rateLimited: false, errors: [] }
  if (!opts.videoIds.length) return out

  /** Record a failure on one row. Writes ONLY the stamped message — never the
   *  model's bytes — so it cannot fail for the reason it is recording. */
  const stampFailure = async (v: TranslatableVideo & { id: string }, msg: string): Promise<void> => {
    if (opts.dryRun) return
    try {
      const { error } = await admin.from('videos')
        .update({ transcript_en_error: translateErrorStamp(v.transcript_en_error, msg) })
        .eq('id', v.id)
      if (error) throw new Error(error.message)
    } catch (e) {
      // Last line: the row stays NULL/NULL and will be re-offered next run.
      const why = e instanceof Error ? e.message : String(e)
      out.errors.push(`translate error-write (${v.id}): ${why.slice(0, 200)}`)
      console.warn(`[translate] could not record failure for ${v.id}: ${why}`)
    }
  }

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
    let r: TranslateOutcome
    try {
      r = await translate(v.transcript!, v.transcript_lang)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.failed++
      if (isRateLimited(msg)) out.rateLimited = true
      out.errors.push(`translate (${v.id}): ${msg.slice(0, 200)}`)
      // Count the attempt so the next run does not re-pay forever. A rate limit
      // is the exception: it says nothing about this video, and counting it
      // would spend a whole batch's attempts on a fact about the account.
      if (!isRateLimited(msg)) await stampFailure(v, msg)
      continue
    }
    // Spend happened the moment the call returned (transcribeBatch's rule):
    // account for it before the write can fail, or the ledger under-counts.
    const cost = estimateCost(TRANSLATE_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens)
    out.costUsd += cost
    const detected = r.language
    if (r.translation === null) out.english++
    else out.translated++
    if (opts.dryRun) continue
    // The write can fail on bytes (22P05) or on anything else a client throws;
    // either way the row gets its attempt stamped rather than being left
    // looking un-attempted, and the step does NOT throw (see rule 1 above).
    let writeError: string | null = null
    try {
      const { error } = await admin.from('videos').update(translationPatch(v, r)).eq('id', v.id)
      writeError = error?.message ?? null
    } catch (e) {
      writeError = e instanceof Error ? e.message : String(e)
    }
    if (writeError) {
      out.errors.push(`translate write (${v.id}): ${writeError.slice(0, 200)}`)
      out.failed++
      if (r.translation === null) out.english--; else out.translated--
      await stampFailure(v, `write: ${writeError}`)
    }
    // Logged either way, write error included: ai_call_log is the ledger of
    // record for what was SPENT, and the call was spent. A ledger failure is
    // never allowed to throw out of here — that would retry the step and re-bill
    // every call in the batch that had not landed.
    try {
      await logAiCall(admin, {
        clientId: opts.clientId,
        runId: opts.runId,
        pass: 'translate',
        callIndex,
        model: TRANSLATE_MODEL,
        promptVersion: TRANSLATE_PROMPT_VERSION,
        systemPrompt: r.prompt.system,
        userPrompt: r.prompt.user,
        response: { labelled: v.transcript_lang, detected, chars: r.translation?.length ?? 0, english: r.translation === null },
        error: writeError,
        usage: r.usage,
        durationMs: r.durationMs,
        validationStatus: writeError ? 'write_failed' : 'ok',
      })
    } catch (e) {
      console.warn(`[translate] ai_call_log insert threw for ${v.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

/** A 429 (rate limit or exhausted credits) after the SDK's own backoff — a
 *  fact about the account, not about the video (pass-a.ts isRateLimitError). */
function isRateLimited(msg: string): boolean {
  return /\b429\b|rate limit|insufficient_quota|no credits/i.test(msg)
}
