import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { chunk } from '../chunk'
import { openai } from '../openai'
import { normaliseLang } from '../gather/transcript'
import { normaliseQuoteText, quoteTextHash } from '../quote-text'
import { isEnglishLang } from './translate'
import { dbSafeText } from '../db-text'
import { logAiCall } from './ai-log'
import {
  ANALYSIS_TEMPERATURE,
  TRANSLATE_QUOTES_BATCH,
  TRANSLATE_QUOTES_CALLS_PER_STEP,
  TRANSLATE_QUOTES_CAP,
  TRANSLATE_QUOTES_MODEL,
  estimateCost,
} from '../config'

// Quote translation — the comment_translations cache (Phase 1 WP6, design item
// 8, decision A, 2026-09-18).
//
// WHAT THIS REVERSES. 2026-08-09 decided "a hero quote never translates", and
// until now the product honoured it by FILTERING non-English quotes out:
// quoteScore rejects anything with fewer than two English function words, and
// the same rule gates the reply inbox. Measured on production 2026-09-15 that
// filter is load-bearing, not cosmetic — 13.7–19.5% of cited comments are
// confidently not English and 40–41% fail the gate the product actually
// applies. In a category whose buyers are in Germany, Brazil and Indonesia,
// "we only show you the English ones" is a weaker product than "here is what
// they said, and here is what it means". So: the original still leads, an
// English rendering sits underneath it stamped as a machine translation, and
// every quote carries the language it was written in.
//
// The original remains the evidence. insight_evidence.quote is untouched, the
// verbatim validator is untouched, and no English rendering is ever frozen into
// a snapshot — it resolves at render from this cache exactly as the original
// resolves from insight_evidence.
//
// WHAT IT COSTS. gpt-4.1-mini at $0.40/$1.60 per 1M, 25 texts a call. Measured
// read-only against production 2026-09-15, over every comment the CURRENT
// analysis cites and every distinct displayable text of it:
//
//   | tenant  | cited comments | distinct texts | texts/comment | avg chars | calls |
//   |---------|----------------|----------------|---------------|-----------|-------|
//   | Össur   |          7,019 |          8,574 |          1.22 |        93 |   343 |
//   | Sealand |          7,543 |          9,342 |          1.24 |       103 |   374 |
//
// The 1.22–1.24 is the excerpt-versus-whole-comment split measured, not
// assumed: about a quarter of cited comments are quoted in part, so they carry
// two texts and two rows.
//
//   | population                          | cost (Latin bound – CJK bound) |
//   |-------------------------------------|--------------------------------|
//   | Össur,   first run over the backlog  |               $0.68 – $1.50    |
//   | Sealand, first run over the backlog  |               $0.80 – $1.75    |
//   | Össur,   steady state (~172 texts)   |               $0.014 – $0.030  |
//   | Sealand, steady state (~276 texts)   |               $0.024 – $0.052  |
//   | backfill script, both tenants        |               $1.48 – $3.25    |
//
// A RANGE, not a number, and for the reason scripts/translate-transcripts.ts
// gives: the tokenizer costs Latin text about 4 characters a token and CJK,
// Indic and Arabic closer to 1.5, and the non-English half of this population
// is disproportionately the second kind. Billing is the truth; these are
// bounds. At TRANSLATE_QUOTES_CAP the first tenant's backlog clears over three
// runs, or in one invocation of the backfill script.
//
// The first-run figures are the honest worst case and the reason
// TRANSLATE_QUOTES_CAP exists: everything cited and not in the cache goes to
// the model, because there is NO stored per-comment language signal to
// pre-filter on. The only language columns in the schema are on `videos` and
// describe the creator's speech; used as a per-comment decider that signal is
// 58.4% precise on Össur and 34.1% on Sealand and misses 14.5%/31.7% of the
// non-English comments outright. Detection and translation therefore happen in
// one pass — the design's own "fourth cut" — and an English comment comes back
// `english: null`, which is a RESULT that gets cached like any other, so it is
// paid for exactly once.
//
// The steady-state rows are lower bounds: they count the comments a run's own
// gather first inserted (141 Össur / 223 Sealand on the last run), scaled by
// the measured texts-per-comment. The true figure sits between those and the
// 627/684 confidently-non-English comments the run cites, and the cache makes
// it fall towards the lower bound over the first few weeks. Nothing here is
// material against a $5–17 run and a $60 budget.
//
// THE CACHE HAS NO PERMANENT FLOOR, and that took a deliberate decision. The
// prompt asks for language 'und' where a text "carries no language at all —
// pure emoji, a bare handle, digits", and an earlier version of
// quoteTranslationRows refused to write a row for any answer that was neither
// English nor a translation. Those texts were therefore never cached: the same
// bytes went to the model on every run for ever and `needing` never drained to
// zero. A determination that a text carries no language IS a determination, so
// it is cached like any other.
//
// The class is SMALL and its size is not ours to measure. Over every currently
// displayable cited text (2026-09-15, both tenants, excerpts and comments as
// posted): 18,521 distinct texts, of which 7 carry no letter in any script, 13
// carry two letters or fewer, and 1 is a bare handle. So the floor this
// removes is a few tens of texts a run, not a few hundred — cents, not
// dollars. What makes it worth the change is that the size is the MODEL's
// judgement and not a SQL predicate: 'und' is whatever it declines to place,
// and a class that can grow with a prompt revision should not be a class that
// can never be cached. (A related figure is easy to misread: 922 of the 18,521
// contain no ASCII alphanumeric, but those are Thai, Arabic, CJK and Devanagari
// comments — they have a language, they get a rendering, and they were always
// cached.)

/** A text to translate, and the cache row it will become. `commentId` is what
 *  the row cascades from; `hash` is what makes it findable at render. */
export interface TranslationTarget {
  commentId: string
  text: string
  hash: string
}

/** One cached row's identity. */
export const targetKey = (t: { commentId: string; hash: string }): string => `${t.commentId}|${t.hash}`

/**
 * The distinct texts worth translating, given the texts a comment can be SHOWN
 * as.
 *
 * A comment reaches a reader in two shapes and they are not always the same
 * words: the evidence EXCERPT (`e:` and `c:` refs, which is what every page
 * renders) and the comment AS POSTED (`m:` refs, which is what the reply inbox
 * renders). Translating only the comment would put the English of a longer text
 * under a short excerpt; translating only the excerpt would leave the inbox
 * with nothing. So every distinct displayable text is a target, deduped by its
 * hash — which is usually one row per comment, because an excerpt is usually
 * the whole comment.
 *
 * Empty and whitespace-only texts are dropped: demographic_signal evidence
 * cites without quoting (counts-not-quotes, 2026-08-22) and carries `quote`
 * '', and there is nothing there to read.
 */
export function translationTargets(rows: readonly { commentId: string; text: string | null }[]): TranslationTarget[] {
  const seen = new Set<string>()
  const out: TranslationTarget[] = []
  for (const r of rows) {
    if (!r.commentId || !r.text) continue
    const text = normaliseQuoteText(r.text)
    if (!text) continue
    const hash = quoteTextHash(text)
    const key = targetKey({ commentId: r.commentId, hash })
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ commentId: r.commentId, text, hash })
  }
  return out
}

/** The targets no cache row answers. A row for the SAME comment under a
 *  different hash is not an answer — that is the edited-comment case, and the
 *  whole reason the hash is in the key. */
export function uncachedTargets(
  targets: readonly TranslationTarget[],
  cached: ReadonlySet<string>,
): TranslationTarget[] {
  return targets.filter((t) => !cached.has(targetKey(t)))
}

/**
 * The calls one step will make, and what the cap deferred.
 *
 * The cap applies BEFORE batching (planTranslation's shape), so a capped run
 * dispatches whole calls and the remainder simply arrives on the next run.
 * Order is the caller's: the plan step hands them oldest-comment-first so a
 * capped first run works through the backlog in a stable order rather than
 * re-picking a different arbitrary slice every week.
 */
export function planQuoteCalls(
  targets: readonly TranslationTarget[],
  opts: { cap?: number; batch?: number } = {},
): { calls: TranslationTarget[][]; deferred: number } {
  const cap = opts.cap ?? TRANSLATE_QUOTES_CAP
  const batch = opts.batch ?? TRANSLATE_QUOTES_BATCH
  const taken = targets.slice(0, Math.max(0, cap))
  return { calls: chunk([...taken], batch), deferred: Math.max(0, targets.length - taken.length) }
}

/** Comment ids grouped into Inngest-step-sized parcels. A step re-reads the
 *  texts for its own ids and re-applies the whole rule, so the plan's output
 *  stays a list of uuids rather than a copy of the corpus travelling through
 *  step state. */
export function planQuoteSteps(
  commentIds: readonly string[],
  opts: { batch?: number; callsPerStep?: number } = {},
): string[][] {
  const perStep = (opts.batch ?? TRANSLATE_QUOTES_BATCH) * (opts.callsPerStep ?? TRANSLATE_QUOTES_CALLS_PER_STEP)
  return chunk([...commentIds], perStep)
}

// ---- The call ----------------------------------------------------------------

/** Diagnostic only (ai_call_log.prompt_version), as the transcript wave's is —
 *  but it is also written onto every cache row, so a future change of prompt
 *  can find and re-do what this one produced. */
export const TRANSLATE_QUOTES_PROMPT_VERSION = 'quote_translate_v1'

/** ISO 639-2's "no linguistic content", the word the prompt asks for where a
 *  text is pure emoji, a bare handle or digits. A row carrying it is a RESULT
 *  and is cached, because a population that cannot be cached is a population
 *  re-billed to the model on every run for ever. */
export const UNDETERMINED_LANG = 'und'

const quoteTranslationSchema = z.object({
  items: z.array(z.object({
    /** The item's position in the input list, 1-based. */
    n: z.number(),
    /** ISO 639-1 of the language detected in THIS text, or 'und'. */
    language: z.string(),
    /** null — and only null — when there is nothing to render: the text is
     *  already English, or it has no language ('und'). */
    english: z.string().nullable(),
  })),
})

/**
 * System + user prompt for one batch. Pure: the live call and the dry run
 * assemble identical strings, so a token estimate is the real one.
 *
 * The rules are the transcript translator's, minus the ones that are about
 * machine-made speech and plus the ones that are about a person typing on a
 * phone. A comment is short, whole and written on purpose — there is no
 * clipping and no ASR garble to refuse to repair — but it is full of slang,
 * deliberate misspelling, emoji and shouting, and every one of those carries
 * the tone the reading is about. "Never repair the source" matters MORE here
 * than it does for a transcript, not less: a tidy English sentence over an
 * angry fragment is a different finding.
 */
export function buildQuoteTranslatePrompt(items: readonly { text: string }[]): { system: string; user: string } {
  const system = [
    'You translate social-media comments into English for an analysis system that shows both the original and your translation to a business reader, side by side.',
    '',
    'For EACH numbered item, report the language you detected and an English rendering.',
    '',
    'Rules:',
    '- Detect the language from the TEXT. Report it as an ISO 639-1 code ("es", "pt", "de", "id", "zh"). Use "und" only when the text carries no language at all — pure emoji, a bare handle, digits.',
    '- If the text is ALREADY ENGLISH, set language to "en" and english to null. Do not echo English back.',
    '- Translate FAITHFULLY and COMPLETELY. Every clause in the source gets a clause in the output. Do not summarise, tidy, soften or complete a sentence the writer left unfinished.',
    '- Keep the REGISTER. Slang stays slang, shouting stays shouting, profanity stays profanity, sarcasm stays sarcastic. This reader is deciding what customers feel, and a polite rendering of a furious comment is a false reading.',
    '- Keep emoji exactly where they are, keep brand names, product names, model numbers, handles and hashtags exactly as written, and keep prices and measurements in their original units.',
    '- NEVER repair the source into something that makes more sense. Translate what is actually there. Where a passage genuinely cannot be read, write [unclear] in its place.',
    '- No commentary, no notes, no quotation marks added around the whole rendering.',
    '',
    'Return one entry per input item, with n matching the item number. Never merge, reorder or drop items.',
  ].join('\n')
  const user = items.map((it, i) => `${i + 1}. ${it.text}`).join('\n')
  return { system, user }
}

export interface QuoteTranslationOutcome {
  results: { n: number; language: string; english: string | null }[]
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  prompt: { system: string; user: string }
}

/** One batch through the model. Throws only on a failure the caller records for
 *  the whole batch — a per-item problem comes back as a result the reconciler
 *  drops. */
export async function translateQuoteBatchCall(items: readonly { text: string }[]): Promise<QuoteTranslationOutcome> {
  const prompt = buildQuoteTranslatePrompt(items)
  const startedAt = Date.now()
  const completion = await openai.chat.completions.parse({
    model: TRANSLATE_QUOTES_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: zodResponseFormat(quoteTranslationSchema, 'quote_translations'),
  })
  const msg = completion.choices[0]?.message
  const parsed = msg?.parsed
  if (!parsed) throw new Error(msg?.refusal ?? 'no parsed quote translations')
  return {
    results: parsed.items,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
    },
    durationMs: Date.now() - startedAt,
    prompt,
  }
}

export interface TranslationRow {
  client_id: string
  comment_id: string
  text_hash: string
  language: string
  english: string | null
  model: string
  prompt_version: string
}

/**
 * Turn one call's answers into rows, and say what it could not place.
 *
 * The item number is the join, not an id the model was asked to echo: a model
 * that returns 24 of 25 items has told us which 24 unambiguously, where a
 * mangled uuid tells us nothing. Three answers are refused:
 *
 *   * an `n` outside the batch, or a repeat — nothing can be written from it;
 *   * a language that is neither English nor 'und' with a null rendering —
 *     that is a failed reading, not a verdict, and caching it would make the
 *     failure permanent;
 *   * a rendering that is only whitespace, which is the same thing said quietly.
 *
 * `english: null` is a RESULT, not a failure, in TWO cases, and both are cached:
 *
 *   * an ENGLISH text — nothing to render, so an English comment is paid for
 *     once and never again. That is the whole reason every cited comment can be
 *     sent to the model without a language pre-filter.
 *   * a text whose language is 'und' — the prompt asks for exactly that word
 *     where a text "carries no language at all: pure emoji, a bare handle,
 *     digits", so 'und' is the model doing what it was told. Refusing to write
 *     those rows made that population permanently uncacheable: the same bytes
 *     were re-sent on every run for ever and `plan.needing` never drained to
 *     zero. A determination that a text carries no language IS a
 *     determination. The header has the measured size (small) and why it is
 *     worth fixing anyway (the size is the model's call, not a predicate's).
 *
 * What a cached 'und' row means to the read path is unchanged: quoteAvailability
 * reads it as 'untranslated', because a reader has nothing to read either way.
 * It is the BILL that changes, not a single rendered quote.
 */
export function quoteTranslationRows(
  clientId: string,
  items: readonly TranslationTarget[],
  results: readonly { n: number; language: string; english: string | null }[],
): { rows: TranslationRow[]; unplaced: number } {
  const rows: TranslationRow[] = []
  const used = new Set<number>()
  for (const r of results) {
    const i = Math.trunc(r.n) - 1
    if (!Number.isFinite(r.n) || i < 0 || i >= items.length || used.has(i)) continue
    const language = normaliseLang(r.language) ?? UNDETERMINED_LANG
    const english = r.english?.trim() || null
    const nothingToRender = isEnglishLang(language) || language === UNDETERMINED_LANG
    if (!english && !nothingToRender) continue
    used.add(i)
    rows.push({
      client_id: clientId,
      comment_id: items[i].commentId,
      text_hash: items[i].hash,
      language,
      // Stored NULL wherever there is nothing to render, so a row's meaning is
      // the column comment's: an echo of the emoji back at us is not a
      // translation and must not be shown under the original as one.
      english: english === null || nothingToRender ? null : dbSafeText(english),
      model: TRANSLATE_QUOTES_MODEL,
      prompt_version: TRANSLATE_QUOTES_PROMPT_VERSION,
    })
  }
  return { rows, unplaced: items.length - used.size }
}

// ---- Surviving a deploy that lands before its migration ----------------------

const QUOTE_TRANSLATION_OBJECTS = ['comment_translations'] as const

/** Is this the error the cache gets before 20260918095000 is applied? Narrow
 *  and named, the isMissingMonthlyReading shape — never a blanket swallow. */
export function isMissingQuoteTranslations(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!QUOTE_TRANSLATION_OBJECTS.some((name) => text.includes(name))) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

// ---- I/O ---------------------------------------------------------------------

type Admin = ReturnType<typeof createAdminClient>

/** Every displayable text of every comment this tenant's CURRENT analysis
 *  cites, with the comment it belongs to.
 *
 *  Through `audience_insights_current`, never `audience_insights … eq(run_id)`:
 *  insights belong to videos, not runs (2026-08-17), so "the comments we are
 *  citing" is the whole current corpus and not just what this run re-read. The
 *  cache is what stops that being expensive — the second run pays for the
 *  difference and nothing else. */
async function citedTexts(admin: Admin, clientId: string): Promise<{ commentId: string; text: string | null }[]> {
  const insights = await selectAll<{ id: string }>(() =>
    admin.from('audience_insights_current').select('id').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const out: { commentId: string; text: string | null }[] = []
  const commentIds = new Set<string>()
  for (const part of chunk(insights.map((i) => i.id), 120)) {
    const rows = await selectAll<{ comment_id: string | null; quote: string | null }>(() =>
      admin.from('insight_evidence')
        .select('comment_id, quote')
        .in('audience_insight_id', part)
        .eq('redacted', false)
        .eq('source', 'comment')
        .order('id', { ascending: true }),
    )
    for (const r of rows) {
      if (!r.comment_id) continue
      commentIds.add(r.comment_id)
      out.push({ commentId: r.comment_id, text: r.quote })
    }
  }
  // The comment AS POSTED, for the refs that render it whole. Usually the same
  // words as the excerpt above, in which case the hash dedups it away.
  for (const part of chunk([...commentIds], 120)) {
    const rows = await selectAll<{ id: string; text: string | null }>(() =>
      admin.from('comments').select('id, text').in('id', part).order('id', { ascending: true }),
    )
    for (const r of rows) out.push({ commentId: r.id, text: r.text })
  }
  return out
}

/** The cache keys already held for a set of comments. */
async function cachedKeys(admin: Admin, commentIds: readonly string[]): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const part of chunk([...commentIds], 120)) {
    const rows = await selectAll<{ comment_id: string; text_hash: string }>(() =>
      admin.from('comment_translations')
        .select('comment_id, text_hash')
        .in('comment_id', part)
        .order('comment_id', { ascending: true }),
    )
    for (const r of rows) keys.add(targetKey({ commentId: r.comment_id, hash: r.text_hash }))
  }
  return keys
}

export interface QuoteTranslationPlan {
  /** Comment ids, parcelled one parcel per Inngest step. */
  batches: string[][]
  /** Distinct (comment, text) pairs with no cache row. */
  needing: number
  /** Of those, how many the cap left for the next run. */
  deferred: number
  /** Comments carrying at least one uncached text — what `batches` counts. */
  comments: number
}

/**
 * Plan step: which comments have a displayable text nothing has translated yet.
 *
 * Returns COMMENT IDS, not texts. The batch step re-reads the texts for its own
 * ids and re-applies the whole rule, which makes an Inngest retry idempotent
 * (whatever the first attempt cached is simply found in the cache) and keeps
 * the plan's output a few kilobytes of uuids instead of a copy of the corpus.
 *
 * Non-fatal by construction: a missing migration comes back as an empty plan
 * with a logged line, and the step above it spends nothing.
 */
export async function planQuoteTranslations(
  clientId: string,
  opts: { cap?: number; admin?: Admin } = {},
): Promise<QuoteTranslationPlan> {
  const admin = opts.admin ?? createAdminClient()
  const empty: QuoteTranslationPlan = { batches: [], needing: 0, deferred: 0, comments: 0 }
  const rows = await citedTexts(admin, clientId)
  const targets = translationTargets(rows)
  if (!targets.length) return empty
  let cached: Set<string>
  try {
    cached = await cachedKeys(admin, [...new Set(targets.map((t) => t.commentId))])
  } catch (e) {
    if (isMissingQuoteTranslations(e)) {
      console.log('[translate-quotes] comment_translations does not exist yet — apply supabase/migrations/20260918095000_quote_translations.sql. Nothing planned, nothing spent.')
      return empty
    }
    throw e
  }
  const missing = uncachedTargets(targets, cached)
  const { calls, deferred } = planQuoteCalls(missing, { cap: opts.cap })
  const taken = calls.flat()
  const comments = [...new Set(taken.map((t) => t.commentId))]
  return {
    batches: planQuoteSteps(comments),
    needing: missing.length,
    deferred,
    comments: comments.length,
  }
}

export interface QuoteTranslationResult {
  /** Rows written carrying an English rendering. */
  translated: number
  /** Rows written saying "already English" — cached, so paid for once. */
  english: number
  /** Targets the step found already cached (a retry, or a sibling step). */
  cached: number
  /** Texts a call could not place, plus every text of a failed call. */
  failed: number
  costUsd: number
  rateLimited: boolean
  errors: string[]
}

const emptyResult = (): QuoteTranslationResult => ({
  translated: 0, english: 0, cached: 0, failed: 0, costUsd: 0, rateLimited: false, errors: [],
})

/**
 * One step: translate every uncached displayable text of these comments.
 *
 * The two rules the transcript wave learned the hard way hold here too.
 *
 *   1. NOTHING IN HERE MAY THROW. A thrown Inngest step is retried, and a retry
 *      re-CALLS the model for every batch whose rows did not land — so one
 *      deterministic write failure would bill the same translations four times.
 *      A failure ends the call, not the step.
 *   2. Spend is accounted the moment the call RETURNS, before the write can
 *      fail. A ledger that only counts successful writes under-counts what was
 *      actually paid for.
 *
 * There is no third rule about tombstoning a failed row, and that is a real
 * difference from the transcript wave. A transcript lives on a `videos` row
 * that can carry its own error column; a translation target is a (comment,
 * text) pair with no row of its own until it succeeds. A failure therefore
 * simply leaves the pair uncached and it is offered again next run. That is
 * affordable at $0.0004 a comment and it is the honest behaviour: there is
 * nowhere to write "we tried" that would not also be a row claiming the text
 * had been read.
 */
export async function translateQuotesBatch(opts: {
  clientId: string
  runId: string | null
  commentIds: string[]
  batchNo?: number
  dryRun?: boolean
  /** Seams for the pure-logic test. Production passes neither. */
  admin?: Admin
  translate?: (items: readonly { text: string }[]) => Promise<QuoteTranslationOutcome>
}): Promise<QuoteTranslationResult> {
  const admin = opts.admin ?? createAdminClient()
  const call = opts.translate ?? translateQuoteBatchCall
  const out = emptyResult()
  if (!opts.commentIds.length) return out

  let targets: TranslationTarget[]
  try {
    const rows: { commentId: string; text: string | null }[] = []
    for (const part of chunk(opts.commentIds, 120)) {
      const evidence = await selectAll<{ comment_id: string | null; quote: string | null }>(() =>
        admin.from('insight_evidence')
          .select('comment_id, quote')
          .in('comment_id', part)
          .eq('redacted', false)
          .eq('source', 'comment')
          .order('id', { ascending: true }),
      )
      for (const r of evidence) if (r.comment_id) rows.push({ commentId: r.comment_id, text: r.quote })
      const comments = await selectAll<{ id: string; text: string | null; client_id: string }>(() =>
        admin.from('comments')
          .select('id, text, client_id')
          .in('id', part)
          .eq('client_id', opts.clientId)
          .order('id', { ascending: true }),
      )
      for (const r of comments) rows.push({ commentId: r.id, text: r.text })
    }
    const all = translationTargets(rows)
    // Re-check the cache on freshly-read rows: this is what makes a step retry
    // free rather than a second bill.
    const cached = await cachedKeys(admin, opts.commentIds)
    out.cached = all.length - uncachedTargets(all, cached).length
    targets = uncachedTargets(all, cached)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    if (isMissingQuoteTranslations(e)) {
      console.log('[translate-quotes] comment_translations does not exist yet — nothing translated, nothing spent.')
      return out
    }
    out.errors.push(`translate-quotes read: ${why.slice(0, 200)}`)
    return out
  }
  if (!targets.length) return out

  let callIndex = (opts.batchNo ?? 1) * 1000
  for (const items of chunk(targets, TRANSLATE_QUOTES_BATCH)) {
    callIndex++
    let r: QuoteTranslationOutcome
    try {
      r = await call(items)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.failed += items.length
      if (isRateLimited(msg)) out.rateLimited = true
      out.errors.push(`translate-quotes call: ${msg.slice(0, 200)}`)
      continue
    }
    out.costUsd += estimateCost(TRANSLATE_QUOTES_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens)
    const { rows, unplaced } = quoteTranslationRows(opts.clientId, items, r.results)
    out.failed += unplaced
    if (opts.dryRun) {
      for (const row of rows) { if (row.english === null) out.english++; else out.translated++ }
      continue
    }
    let writeError: string | null = null
    try {
      // Upsert, not insert: two steps of the same wave can reach the same
      // comment through two different insights, and a retry re-reads rows the
      // first attempt may already have written.
      const { error } = await admin.from('comment_translations').upsert(rows, { onConflict: 'comment_id,text_hash' })
      writeError = error?.message ?? null
    } catch (e) {
      writeError = e instanceof Error ? e.message : String(e)
    }
    if (writeError) {
      out.errors.push(`translate-quotes write: ${writeError.slice(0, 200)}`)
      out.failed += rows.length
    } else {
      for (const row of rows) { if (row.english === null) out.english++; else out.translated++ }
    }
    // Logged either way: ai_call_log is the ledger of what was SPENT, and the
    // call was spent. The response snapshot carries counts and languages, never
    // the renderings — those are a stranger's words and they belong in the
    // cache the retention sweep can reach, not in a log body.
    try {
      await logAiCall(admin, {
        clientId: opts.clientId,
        runId: opts.runId,
        pass: 'translate-quotes',
        callIndex,
        model: TRANSLATE_QUOTES_MODEL,
        promptVersion: TRANSLATE_QUOTES_PROMPT_VERSION,
        systemPrompt: r.prompt.system,
        userPrompt: r.prompt.user,
        response: {
          items: items.length,
          placed: rows.length,
          english: rows.filter((x) => x.english === null).length,
          languages: countBy(rows.map((x) => x.language)),
        },
        error: writeError,
        usage: r.usage,
        durationMs: r.durationMs,
        validationStatus: writeError ? 'write_failed' : unplaced ? 'partial' : 'ok',
      })
    } catch (e) {
      console.warn(`[translate-quotes] ai_call_log insert threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

const countBy = (xs: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

/** A 429 after the SDK's own backoff — a fact about the account, not about the
 *  comment (the transcript wave's isRateLimited, same rule). */
function isRateLimited(msg: string): boolean {
  return /\b429\b|rate limit|insufficient_quota|no credits/i.test(msg)
}
