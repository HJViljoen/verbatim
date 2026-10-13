import { zodResponseFormat } from 'openai/helpers/zod'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { createAdminClient, selectAll, isMissingColumnError } from '../supabase-admin'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { logAiCall } from './ai-log'
import { usableOcr, usableTranscript, usableTranslation } from './transcript-input'
import { hookSource } from './hook-source'
import { isOwnedPost, OWNED_SOURCE } from '../reading/owned'
import {
  CLASSIFIED_TYPES,
  CLASSIFIED_TYPE_DEFS,
  enumDefLines,
  ClassifyMetaSchema,
  HOOK_STYLES,
  HOOK_STYLE_DEFS,
  VIDEO_SENTIMENTS,
  type ClassifyMetaItem,
  type ClassifyMetaOutput,
} from './schemas'

// Metadata-classification batch ("the later step" promised at pass-a.ts:42,
// built 2026-08-10). Pass A only classifies videos with ≥5 kept comments —
// ~25% of a run's corpus — so per-entity format/hook stats were fiction
// (n=4 for Ottobock on run ef1e28a3). This pass classifies the REMAINDER from
// caption + hashtags + transcript alone, in batches of many videos per
// gpt-4.1-mini call (~$0.20/run). It writes ONLY rows Pass A left null and
// never touches comment-derived fields (comment_quality_score, insights,
// claims — claims coverage is Wave 3 scope).
//
// THE CLIENT'S OWN POSTS TOO (depth v2, T14). Until then the plan took
// `source = 'discovered'` only, so an own post Pass A skips (under five
// comments and no transcript: typically an Instagram photo or carousel) never
// got a format or an opening, and "your posts by format" could not be read
// (13 Oct: 11 of Össur's 25 September posts and 15 of Sealand's 27 had none).
// Own posts take the format, the opening, the hook and the topics; never the
// framing sentiment, which stays a property of the market's videos
// (`classifyMetaLabels`). A rival's own posts stay out, as before.
//
// COST. A weekly run re-stamps the census window's own posts with its run id
// (lib/gather/owned.ts), so the plan sees them every run they are in the
// window, and only while unclassified: 13 Oct's runs carried 4 (Össur, 1
// unclassified) and 9 (Sealand, 6). They join the discovered rows' batches of
// 25, so that is at most one more call a run, about $0.006 at the runs'
// measured $0.0055–0.0059 a call, and often none. `CLASSIFY_META_OWNED_CAP`
// bounds the worst case (a census at its 200-post ceiling on three platforms)
// at four calls; `RUN_MODEL_BUDGET_USD` still governs the run.
//
// Pure planning/prompt/validation logic up top (tested in
// classify-meta.test.ts); the I/O runner for the Inngest step below.

/** Bumped to v2 on 2026-09-11 with the label DEFINITIONS (bfe485f): the enum
 *  values mean something different now than when the model was handed bare
 *  names. Bumping is free here, unlike Pass A's — classify-meta selects on
 *  `classified_type IS NULL` and nothing else, so no already-classified row is
 *  re-read. The version rides onto each row it writes
 *  (videos.classified_prompt_version) so the two regimes stop being
 *  indistinguishable; rows written before today stay null. */
export const CLASSIFY_META_PROMPT_VERSION = 'classify_meta_v2'
export const CLASSIFY_META_BATCH = 25

/** The `videos.source` values the plan takes: the gathered corpus and the
 *  client's own posts. Never 'competitor_owned'. */
export const CLASSIFY_META_SOURCES = ['discovered', OWNED_SOURCE] as const

/** At most this many own posts a run (four calls). A runaway guard, not a
 *  sample: runs carry under ten, and a post left over is still unclassified
 *  next run, which re-stamps it while it is in the census window. */
export const CLASSIFY_META_OWNED_CAP = 100

export interface ClassifyInput {
  id: string
  platform: string
  account_name: string
  caption: string | null
  hashtags: string[] | null
  transcript: string | null
  transcript_status: string | null
  transcript_en: string | null
  ocr_text: string | null
  ocr_status: string | null
}

// The "deploy landed before its migration" guard now has two callers (this one
// and Pass D-b's lineage_id), so it lives in lib/supabase-admin.ts. Re-exported
// here for the test and the readers who found it at this address first.
export { isMissingColumnError }

/** Ids of videos still unclassified, chunked into call-sized batches. Own
 *  posts beyond `ownedCap` wait for a later run; the rest are never capped. */
export function planClassifyBatches(
  videos: { id: string; classified_type: string | null; source?: string | null }[],
  batchSize = CLASSIFY_META_BATCH,
  ownedCap = CLASSIFY_META_OWNED_CAP,
): string[][] {
  let owned = 0
  const pending = videos
    .filter((v) => v.classified_type == null)
    .filter((v) => !isOwnedPost(v) || owned++ < ownedCap)
    .map((v) => v.id)
  return chunk(pending, batchSize)
}

/**
 * What one classified video's row is patched with.
 *
 * AN OWN POST TAKES NO SENTIMENT. This pass's sentiment is the video's own
 * FRAMING (caption and transcript, no comments), stamped `framing` so
 * run_summary never blends it with Pass A's audience read; the client's own
 * posts have been outside this pass and every framing consumer since it moved
 * before Pass A (2026-08-16), and taking their format and opening must not put
 * them into run_summary's framing family. A row of unknown source keeps the
 * discovered behaviour.
 */
export function classifyMetaLabels(
  item: ClassifyMetaItem,
  src: (ClassifyInput & { source?: string | null }) | undefined,
): Record<string, unknown> & { hook_source: string | null } {
  const labels = {
    classified_type: item.classified_type,
    hook_style: item.hook_style,
    hook_text: item.hook_text,
    // Derived, not asked for — see lib/pipeline/hook-source.ts.
    hook_source: src
      ? hookSource(item.hook_text, {
          transcript: usableTranscript(src),
          ocr: usableOcr(src),
          caption: src.caption,
        })
      : null,
    topics: item.topics.length ? item.topics : null,
  }
  if (src && isOwnedPost(src)) return labels
  return {
    ...labels,
    // Framing sentiment (caption + transcript, no comments). Provenance is
    // stamped so run_summary never blends it with Pass A's audience read
    // (T0-8): the two families are different measurements.
    sentiment: item.sentiment,
    sentiment_source: item.sentiment == null ? null : 'framing',
  }
}

export function buildClassifySystemPrompt(): string {
  return [
    'You classify social videos for a consumer-intelligence platform, from METADATA ONLY (caption, hashtags, a speech transcript when one exists, and the text printed on the cover frame when it carries any). You never see the footage.',
    '',
    'For each numbered video block, return one entry with its "ref" (e.g. "v1") and:',
    '- classified_type: one of the types defined below — or null if the metadata is too thin to tell.',
    '- hook_style: one of the hook styles defined below — how the video OPENS. Null if you cannot tell.',
    '- hook_text: the verbatim opening hook, copied from the start of the transcript, the "on-screen text" line, or the caption. Never invent or paraphrase; null if none shows a real hook. On short-form video the hook is very often TYPED on the cover rather than spoken — when the on-screen text carries the opening claim, that IS the hook. But a watermark, a platform name, a channel name or an @handle is NEVER the hook, however prominent: skip those and take the next line, or return null if nothing else is there. When a block shows both a "transcript" and a "transcript (English)", copy the hook from the "transcript" line — the original words, in their own language. The English is there to help you understand, and is never the hook.',
    '- topics: 1-4 short lowercase topics the video is about. Empty array if unknowable.',
    `- sentiment: one of ${VIDEO_SENTIMENTS.join(', ')} for the video's own framing — or null.`,
    '',
    'Video types (apply these definitions strictly):',
    ...enumDefLines(CLASSIFIED_TYPES, CLASSIFIED_TYPE_DEFS),
    '',
    'Hook styles — the OPENING SECONDS only, not the video\'s overall shape:',
    ...enumDefLines(HOOK_STYLES, HOOK_STYLE_DEFS),
    '',
    'Honesty over coverage: a null is correct whenever the metadata does not support a judgment. Return one entry per block, no extras.',
  ].join('\n')
}

export function buildClassifyUserPrompt(videos: ClassifyInput[]): string {
  return videos
    .map((v, i) => {
      const lines = [
        `[v${i + 1}] platform: ${v.platform} · account: @${v.account_name}`,
        `caption: ${v.caption?.trim() || '(none)'}`,
      ]
      if (v.hashtags?.length) lines.push(`hashtags: ${v.hashtags.join(' ')}`)
      // Both lines when there is a translation, never one instead of the other
      // (2026-09-12). This step's judgments — type, hook style, framing
      // sentiment — read better in English, but hook_text is a VERBATIM column,
      // and feeding only the English made every translated video's hook an
      // English rendering stored as the video's own words. The original stays
      // first and stays labelled `transcript:`, which is what the prompt tells
      // the model to copy the hook from.
      const transcript = usableTranscript(v)
      if (transcript) lines.push(`transcript: ${transcript}`)
      const translation = transcript ? usableTranslation(v) : null
      if (translation) lines.push(`transcript (English, for understanding only — never copy the hook from this line): ${translation}`)
      // The cover frame's text (WP7b, 2026-09-12), AFTER the transcript — the
      // order the hook_text rule lists them in. It led the block for a day, and
      // that quietly biased the model toward the first thing on the frame, which
      // on TikTok is as often the platform watermark as the hook. Newlines
      // flattened to " / " so one video stays one prompt block, with a separator
      // that stops two cards reading as one sentence.
      const ocr = usableOcr(v)
      if (ocr) lines.push(`on-screen text (cover frame): ${ocr.split('\n').join(' / ')}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * Map validated model output back onto video ids by block ref. Bad refs
 * (unknown, out of range, duplicate) are dropped, never guessed — the
 * T#/S# ref-validation invariant.
 */
export function validateClassifyResponse(
  parsed: ClassifyMetaOutput,
  batchIds: string[],
): Map<string, ClassifyMetaItem> {
  const out = new Map<string, ClassifyMetaItem>()
  for (const item of parsed.videos) {
    const m = /^v(\d+)$/.exec(item.ref.trim())
    if (!m) continue
    const idx = Number(m[1]) - 1
    if (idx < 0 || idx >= batchIds.length) continue
    const id = batchIds[idx]
    if (out.has(id)) continue
    out.set(id, {
      ...item,
      hook_text: item.hook_text?.trim() || null,
      topics: item.topics.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4),
    })
  }
  return out
}

// ---- I/O runner (one Inngest step = one batch) ------------------------------

/** Plan step: this run's discovered corpus and the client's own posts it
 *  re-read, still-unclassified only. Run-scoped (unlike Pass A's whole-client
 *  plan) — the batch exists for the Content page's per-entity stats, which
 *  read the current gather. */
export async function planClassifyMetaBatches(clientId: string, runId: string): Promise<string[][]> {
  const admin = createAdminClient()
  const videos = await selectAll<{ id: string; classified_type: string | null; source: string | null }>(() =>
    admin
      .from('videos')
      .select('id, classified_type, source')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .in('source', [...CLASSIFY_META_SOURCES])
      .order('id'),
  )
  return planClassifyBatches(videos)
}

export interface ClassifyMetaResult {
  requested: number
  classified: number
  nulls: number
  costUsd: number
  error?: string
}

/** Classify one batch of videos and persist. Only rows still unclassified are
 *  written (Pass A's comment-informed output always wins). */
export async function runClassifyMetaBatch(
  clientId: string,
  runId: string,
  videoIds: string[],
  callIndex: number,
): Promise<ClassifyMetaResult> {
  const admin = createAdminClient()
  type Row = ClassifyInput & { classified_type: string | null; source: string | null }
  // The OCR columns are asked for separately so a deploy that lands before its
  // migration degrades to "classify without on-screen text" instead of failing
  // the batch — the same tolerance isMissingColumnError already gives
  // classified_prompt_version below.
  let videos: Row[]
  try {
    videos = await selectAll<Row>(() =>
      admin
        .from('videos')
        .select('id, platform, account_name, caption, hashtags, transcript, transcript_en, transcript_status, ocr_text, ocr_status, classified_type, source')
        .eq('client_id', clientId)
        .in('id', videoIds)
        .order('id'),
    )
  } catch (e) {
    if (!(e instanceof Error) || !/ocr_(text|status)/.test(e.message) || !/does not exist|schema cache/i.test(e.message)) throw e
    console.warn('[classify-meta] videos.ocr_text/ocr_status do not exist — apply supabase/migrations/20260912100000_ocr_text.sql. Classifying without on-screen text.')
    videos = (await selectAll<Omit<Row, 'ocr_text' | 'ocr_status'>>(() =>
      admin
        .from('videos')
        .select('id, platform, account_name, caption, hashtags, transcript, transcript_en, transcript_status, classified_type, source')
        .eq('client_id', clientId)
        .in('id', videoIds)
        .order('id'),
    )).map((v) => ({ ...v, ocr_text: null, ocr_status: null }))
  }
  // Re-check the null guard at write-distance: a resumed run may have
  // classified some of these since the plan step.
  const pending = videos.filter((v) => v.classified_type == null)
  if (pending.length === 0) return { requested: videoIds.length, classified: 0, nulls: 0, costUsd: 0 }

  const batchIds = pending.map((v) => v.id)
  const systemPrompt = buildClassifySystemPrompt()
  const userPrompt = buildClassifyUserPrompt(pending)
  const startedAt = Date.now()

  const completion = await openai.chat.completions.parse({
    model: ANALYSIS_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(ClassifyMetaSchema, 'classify_meta'),
  })
  const msg = completion.choices[0]?.message
  const parsed = (msg?.parsed ?? null) as ClassifyMetaOutput | null
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 }
  const costUsd = estimateCost(ANALYSIS_MODEL, usage.prompt_tokens, usage.completion_tokens)

  await logAiCall(admin, {
    clientId,
    runId,
    pass: 'classify_meta',
    callIndex,
    model: ANALYSIS_MODEL,
    promptVersion: CLASSIFY_META_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    response: parsed,
    error: msg?.refusal ?? (parsed ? null : 'no parsed output'),
    usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens },
    durationMs: Date.now() - startedAt,
    validationStatus: parsed ? 'valid' : 'parse_error',
  })
  if (!parsed) return { requested: videoIds.length, classified: 0, nulls: 0, costUsd, error: msg?.refusal ?? 'no parsed output' }

  const byId = validateClassifyResponse(parsed, batchIds)
  const byVideoId = new Map(videos.map((v) => [v.id, v]))
  let classified = 0
  let nulls = 0
  let versionColumnMissing = false
  let hookSourceColumnMissing = false
  for (const [id, item] of byId) {
    if (item.classified_type == null && item.hook_style == null && item.topics.length === 0) {
      nulls++
      continue
    }
    const labels = classifyMetaLabels(item, byVideoId.get(id))
    // Which regime chose these labels (null on every row written before
    // 2026-09-11 — see the column's comment).
    const write = (withVersion: boolean, withHookSource: boolean) => {
      const { hook_source: derivedHookSource, ...rest } = labels
      const patch: Record<string, unknown> = withHookSource ? { ...rest, hook_source: derivedHookSource } : { ...rest }
      if (withVersion) patch.classified_prompt_version = CLASSIFY_META_PROMPT_VERSION
      return admin.from('videos').update(patch).eq('id', id).is('classified_type', null)
    }

    let { error } = await write(!versionColumnMissing, !hookSourceColumnMissing)
    // The model call is already billed by the time we get here. If this deploy
    // landed ahead of its migration, the bookkeeping column is the only thing
    // missing — write the labels without it rather than throw the batch away,
    // re-bill it on every Inngest retry and close the run `partial`. Once one
    // row says the column is absent, the rest of the batch skips the attempt.
    if (error && isMissingColumnError(error, 'classified_prompt_version')) {
      versionColumnMissing = true
      console.warn(`[classify-meta] videos.classified_prompt_version does not exist — apply supabase/migrations/20260911120000_classified_prompt_version.sql. Writing labels without it; those rows will read as the pre-2026-09-11 regime.`)
      ;({ error } = await write(false, !hookSourceColumnMissing))
    }
    if (error && isMissingColumnError(error, 'hook_source')) {
      hookSourceColumnMissing = true
      console.warn(`[classify-meta] videos.hook_source does not exist — apply supabase/migrations/20260912100000_ocr_text.sql. Writing labels without it; those rows will not say where their hook came from.`)
      ;({ error } = await write(!versionColumnMissing, false))
    }
    if (error) throw new Error(`classify-meta persist: ${error.message}`)
    classified++
  }
  return { requested: videoIds.length, classified, nulls, costUsd }
}
