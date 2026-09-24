import { describe, it, expect } from 'vitest'
import {
  needsTranslation, isEnglishLang, buildTranslatePrompt, planTranslation, translateAttempts,
  translateErrorStamp, translationPatch, translateBatch, TRANSLATE_MAX_ATTEMPTS,
  type TranslatableVideo, type TranslateOutcome,
} from './translate'
import { TRANSCRIPT_PROMPT_CHARS } from '../config'

// Translation selection (WP6, 2026-09-11). The rule is stated ONCE, here, and
// the Inngest plan step's SQL is only an index-friendly pre-filter over it —
// so every edge that decides real spend is locked in this file.

/** The character that cannot be written: a U+0000 in model output 400s the
 *  PostgREST write carrying it (22P05) and loses a paid-for translation. */
const NUL = '\u0000'

const video = (over: Partial<TranslatableVideo> = {}): TranslatableVideo => ({
  transcript: 'Hola, esto es una prueba del producto.',
  transcript_lang: 'es',
  transcript_status: 'ok',
  transcript_en: null,
  transcript_en_error: null,
  ...over,
})

describe('isEnglishLang', () => {
  it('treats ISO en and its regional variants as English', () => {
    expect(isEnglishLang('en')).toBe(true)
    expect(isEnglishLang('EN')).toBe(true)
    expect(isEnglishLang('en-US')).toBe(true)
    expect(isEnglishLang('en_GB')).toBe(true)
  })

  it('catches the un-normalised Whisper name too', () => {
    // normaliseLang maps 'english' → 'en' on write, but rows predate it and a
    // provider can always invent a vocabulary. Cheaper to accept both than to
    // pay gpt-4.1 to translate English into English.
    expect(isEnglishLang('english')).toBe(true)
    expect(isEnglishLang('English')).toBe(true)
  })

  it('is not fooled by other languages that start with "en"', () => {
    expect(isEnglishLang('enm')).toBe(false) // Middle English is not English
    expect(isEnglishLang('es')).toBe(false)
    expect(isEnglishLang('zh')).toBe(false)
  })

  it('reads null/blank as not-English (unknown is handled by needsTranslation)', () => {
    expect(isEnglishLang(null)).toBe(false)
    expect(isEnglishLang('  ')).toBe(false)
  })
})

describe('needsTranslation', () => {
  it('selects a usable non-English transcript that has no translation yet', () => {
    expect(needsTranslation(video())).toBe(true)
    expect(needsTranslation(video({ transcript_lang: 'zh' }))).toBe(true)
    expect(needsTranslation(video({ transcript_lang: 'te' }))).toBe(true)
  })

  it('never translates English', () => {
    expect(needsTranslation(video({ transcript_lang: 'en' }))).toBe(false)
    expect(needsTranslation(video({ transcript_lang: 'en-US' }))).toBe(false)
    expect(needsTranslation(video({ transcript_lang: 'english' }))).toBe(false)
  })

  it('INCLUDES an unknown language — the model reports what it detected', () => {
    // Excluded for a day, wrongly: the review found Sealand's two largest
    // unknown-language rows are 38,000-char Chinese transcripts, its single
    // biggest untranslated block, and a live call with no language label
    // translated Traditional Chinese faithfully. The model is asked, not told.
    expect(needsTranslation(video({ transcript_lang: null }))).toBe(true)
    expect(needsTranslation(video({ transcript_lang: '' }))).toBe(true)
  })

  it('only reads content-gated speech — the usableTranscript rule', () => {
    for (const status of ['no_speech', 'lyrics', 'garbled', 'no_media', 'failed', null]) {
      expect(needsTranslation(video({ transcript_status: status }))).toBe(false)
    }
  })

  it('needs actual text', () => {
    expect(needsTranslation(video({ transcript: null }))).toBe(false)
    expect(needsTranslation(video({ transcript: '   ' }))).toBe(false)
  })

  it('never re-translates', () => {
    expect(needsTranslation(video({ transcript_en: 'Hello, this is a product test.' }))).toBe(false)
  })

  it('treats an unmarked error as a permanent tombstone', () => {
    // A hand-written error, or one from before attempts were counted, means
    // "never again" — clearing the column is the deliberate retry.
    expect(needsTranslation(video({ transcript_en_error: 'context_length_exceeded' }))).toBe(false)
  })

  it('RE-OFFERS a row whose failure has attempts left (2026-09-13)', () => {
    // The regression this closes: a translation that was paid for and then lost
    // at the write left transcript_en NULL and transcript_en_error NULL, which
    // reads as "never attempted" — true, but only by accident. Now a failure is
    // always recorded, and a recorded failure comes back until it has had three
    // goes.
    expect(needsTranslation(video({ transcript_en_error: 'attempt 1/3: write: unsupported Unicode escape sequence' }))).toBe(true)
    expect(needsTranslation(video({ transcript_en_error: 'attempt 2/3: no parsed translation' }))).toBe(true)
    expect(needsTranslation(video({ transcript_en_error: 'attempt 3/3: no parsed translation' }))).toBe(false)
  })

  it('still never re-translates a row that HAS a translation, error or not', () => {
    expect(needsTranslation(video({ transcript_en: 'Hello.', transcript_en_error: 'attempt 1/3: x' }))).toBe(false)
  })
})

describe('translateAttempts / translateErrorStamp', () => {
  it('counts from zero and carries the count forward', () => {
    expect(translateAttempts(null)).toBe(0)
    const first = translateErrorStamp(null, 'no parsed translation')
    expect(first).toBe('attempt 1/3: no parsed translation')
    expect(translateAttempts(first)).toBe(1)
    expect(translateErrorStamp(first, 'again')).toBe('attempt 2/3: again')
    expect(translateAttempts(translateErrorStamp(translateErrorStamp(first, 'x'), 'y'))).toBe(TRANSLATE_MAX_ATTEMPTS)
  })

  it('never counts past the cap, so a stamped row stays stamped', () => {
    const last = translateErrorStamp('attempt 3/3: boom', 'boom again')
    expect(last).toBe('attempt 3/3: boom again')
    expect(needsTranslation(video({ transcript_en_error: last }))).toBe(false)
  })

  it('records a failure the error write itself can survive', () => {
    // The failure path must not carry the bytes that caused the failure: a
    // U+0000 in the message would 400 the write that records it (22P05).
    const stamp = translateErrorStamp(null, `write: bad byte ${NUL} here`)
    expect(stamp).not.toContain('\u0000')
    expect(translateErrorStamp(null, 'x'.repeat(500)).length).toBe(300)
  })
})

describe('translationPatch', () => {
  const outcome = (over: Partial<TranslateOutcome> = {}): TranslateOutcome => ({
    language: 'es',
    translation: 'Hello, this is a product test.',
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    durationMs: 1200,
    prompt: { system: 's', user: 'u' },
    ...over,
  })

  it('strips the character that cannot be written, at the write boundary', () => {
    const p = translationPatch({ transcript_lang: 'ar' }, outcome({ language: 'ar', translation: `He said${NUL} hello` }))
    expect(p.transcript_en).toBe('He said hello')
    expect(p.transcript_en).not.toContain('\u0000')
  })

  it('clears any previous error and writes nothing else when the label is right', () => {
    const p = translationPatch({ transcript_lang: 'es' }, outcome())
    expect(p).toEqual({ transcript_en: 'Hello, this is a product test.', transcript_en_error: null })
  })

  it('labels an unlabelled row with the language the model read', () => {
    expect(translationPatch({ transcript_lang: null }, outcome({ language: 'zh' })).transcript_lang).toBe('zh')
    expect(translationPatch({ transcript_lang: '  ' }, outcome({ language: 'zh' })).transcript_lang).toBe('zh')
  })

  it('stores no translation for an English video, only its corrected label', () => {
    const p = translationPatch({ transcript_lang: 'es' }, outcome({ language: 'en', translation: null }))
    expect(p).toEqual({ transcript_en_error: null, transcript_lang: 'en' })
  })
})

describe('buildTranslatePrompt', () => {
  const p = buildTranslatePrompt('Hola, esto es una prueba.', 'es')

  it('names the source language so the model does not have to guess it', () => {
    expect(p.user).toContain('es')
    expect(p.user).toContain('Hola, esto es una prueba.')
  })

  it('asks for a faithful, complete, commentary-free rendering', () => {
    expect(p.system).toMatch(/faithful/i)
    expect(p.system).toMatch(/complete/i)
    expect(p.system).toMatch(/do not summarise|never summarise/i)
    expect(p.system).toMatch(/no commentary|never comment/i)
  })

  it('forbids repairing a garbled passage into something that makes sense', () => {
    // The live check (2026-09-11) caught v1 returning a fluent, confident
    // English sentence for a 102-char transcript ASR had reduced to non-words.
    // A plausible sentence over a garbled source is a fabrication that nothing
    // downstream can catch — the quote validator checks the ORIGINAL.
    expect(p.system).toMatch(/NEVER repair/)
    expect(p.system).toContain('[unintelligible]')
    expect(p.system).toMatch(/fabrication/i)
  })

  it('protects brand and product names from being translated', () => {
    expect(p.system).toMatch(/brand|product name/i)
  })

  it('clips the input to the span Pass A can quote from, code-point-safe', () => {
    const long = 'ñ'.repeat(TRANSCRIPT_PROMPT_CHARS + 500)
    const clipped = buildTranslatePrompt(long, 'es')
    expect([...clipped.user].length).toBeLessThan(TRANSCRIPT_PROMPT_CHARS + 500)
    expect(clipped.user).toContain('ñ')
  })

  it('asks for the detected language and for null on English', () => {
    expect(p.system).toMatch(/ISO 639-1/)
    expect(p.system).toMatch(/trust the text/i)
    expect(p.system).toMatch(/set language to "en" and translation to null/)
  })

  it('presents the provider label as a guess, not a fact', () => {
    expect(buildTranslatePrompt('x', null).user).toContain('not stated')
    expect(p.user).toContain('language as the provider labelled it: es')
  })
})

describe('planTranslation', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}` }))

  it('chunks into batch-sized steps, order preserved', () => {
    expect(planTranslation(ids(5), { cap: 400, batch: 2 })).toEqual([['v1', 'v2'], ['v3', 'v4'], ['v5']])
  })

  it('applies the runaway cap BEFORE batching, so a capped run is whole batches', () => {
    const plan = planTranslation(ids(50), { cap: 12, batch: 8 })
    expect(plan.flat()).toHaveLength(12)
    expect(plan).toHaveLength(2)
    expect(plan.flat()[0]).toBe('v1')
    expect(plan.flat()[11]).toBe('v12')
  })

  it('is empty when nothing needs translating', () => {
    expect(planTranslation([], { cap: 400, batch: 8 })).toEqual([])
  })

  it('defaults to the configured cap and batch size', () => {
    expect(planTranslation(ids(3))).toEqual([['v1', 'v2', 'v3']])
  })
})

// The write paths of translateBatch, through its two seams (a fake client and a
// fake model call). No network, no DB, no GPT — the point is the decisions the
// 2026-09-13 run got wrong: a failed write must leave a recorded failure, must
// not re-call the model, and must not throw (a thrown step is retried by
// Inngest, which re-bills every call in the batch that had not landed).
describe('translateBatch write paths', () => {
  type Row = TranslatableVideo & { id: string }
  const row = (over: Partial<Row> = {}): Row => ({
    id: 'v1',
    transcript: 'Hola, esto es una prueba del producto.',
    transcript_lang: 'es',
    transcript_status: 'ok',
    transcript_en: null,
    transcript_en_error: null,
    ...over,
  })

  interface Write { table: string; op: 'update' | 'insert'; patch: Record<string, unknown>; id?: string }

  /** Just the three chains translateBatch uses. `failUpdate` fails any update
   *  that carries a transcript_en, the way a 22P05 does. */
  const fakeAdmin = (rows: Row[], o: { failUpdate?: boolean; failInsert?: boolean } = {}) => {
    const writes: Write[] = []
    const admin = {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              in: (_c: string, ids: string[]) =>
                Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => {
              writes.push({ table, op: 'update', patch, id })
              const fails = o.failUpdate && 'transcript_en' in patch
              return Promise.resolve({ error: fails ? { message: 'unsupported Unicode escape sequence' } : null })
            },
          }),
          insert: (patch: Record<string, unknown>) => {
            writes.push({ table, op: 'insert', patch })
            return Promise.resolve({ error: o.failInsert ? { message: 'unsupported Unicode escape sequence' } : null })
          },
        }
      },
    }
    return { admin: admin as never, writes }
  }

  const outcome = (translation: string | null, language = 'es'): TranslateOutcome => ({
    language,
    translation,
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    durationMs: 1000,
    prompt: { system: 's', user: 'u' },
  })

  it('stores model output containing U+0000 cleanly', async () => {
    const { admin, writes } = fakeAdmin([row()])
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1'], admin,
      translate: async () => outcome(`Hello,${NUL} this is a product test.`),
    })
    expect(r.translated).toBe(1)
    expect(r.failed).toBe(0)
    const patch = writes.find((w) => w.table === 'videos')!.patch
    expect(patch.transcript_en).toBe('Hello, this is a product test.')
    expect(JSON.stringify(writes)).not.toContain(NUL)
  })

  it('records transcript_en_error when the write fails, and does not re-call the model', async () => {
    const { admin, writes } = fakeAdmin([row()], { failUpdate: true })
    let calls = 0
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1'], admin,
      translate: async () => { calls++; return outcome('Hello, this is a product test.') },
    })
    expect(calls).toBe(1)                  // paid for once, never twice
    expect(r.failed).toBe(1)
    expect(r.translated).toBe(0)           // not counted as stored
    expect(r.costUsd).toBeGreaterThan(0)   // but the spend is still booked
    const stamps = writes.filter((w) => w.table === 'videos' && 'transcript_en_error' in w.patch && w.patch.transcript_en_error !== null)
    expect(stamps).toHaveLength(1)
    expect(stamps[0].patch).toEqual({ transcript_en_error: 'attempt 1/3: write: unsupported Unicode escape sequence' })
    expect(stamps[0].id).toBe('v1')
    const log = writes.find((w) => w.table === 'ai_call_log')!
    expect(log.patch.validation_status).toBe('write_failed')
  })

  it('stamps every failing row individually — one bad row cannot blank a batch', async () => {
    const rows = [row({ id: 'v1' }), row({ id: 'v2' }), row({ id: 'v3' })]
    const { admin, writes } = fakeAdmin(rows, { failUpdate: true })
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1', 'v2', 'v3'], admin,
      translate: async () => outcome('Hello.'),
    })
    expect(r.failed).toBe(3)
    const stamped = writes.filter((w) => w.patch.transcript_en_error && w.patch.transcript_en_error !== null).map((w) => w.id)
    expect(stamped).toEqual(['v1', 'v2', 'v3'])
  })

  it('counts a failed call as an attempt, and a rate limit as nothing', async () => {
    const { admin, writes } = fakeAdmin([row()])
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1'], admin,
      translate: async () => { throw new Error('no parsed translation') },
    })
    expect(r.failed).toBe(1)
    expect(writes[0].patch).toEqual({ transcript_en_error: 'attempt 1/3: no parsed translation' })

    const limited = fakeAdmin([row()])
    const r2 = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1'], admin: limited.admin,
      translate: async () => { throw new Error('429 rate limit exceeded') },
    })
    expect(r2.rateLimited).toBe(true)
    expect(limited.writes).toHaveLength(0) // says nothing about this video
  })

  it('survives a ledger insert failure without failing the row or the step', async () => {
    const { admin, writes } = fakeAdmin([row()], { failInsert: true })
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1'], admin,
      translate: async () => outcome('Hello, this is a product test.'),
    })
    expect(r.translated).toBe(1)
    expect(r.failed).toBe(0)
    expect(writes.some((w) => w.table === 'ai_call_log')).toBe(true)
  })

  it('re-reads the rule at write distance: an already-translated row is skipped, a failed one is not', async () => {
    const { admin } = fakeAdmin([
      row({ id: 'v1', transcript_en: 'Hello.' }),
      row({ id: 'v2', transcript_en_error: 'attempt 1/3: write: boom' }),
      row({ id: 'v3', transcript_en_error: 'attempt 3/3: write: boom' }),
    ])
    let calls = 0
    const r = await translateBatch({
      clientId: 'c', runId: null, videoIds: ['v1', 'v2', 'v3'], admin,
      translate: async () => { calls++; return outcome('Hello.') },
    })
    expect(calls).toBe(1)       // only v2
    expect(r.skipped).toBe(2)
    expect(r.translated).toBe(1)
  })
})

// ---- The 2026-09-20 false alarm (run b67b56de) ------------------------------
//
// Sealand was read as having "1,564 videos pending translation" and the run as
// having attempted 178 of a 400 cap. Both halves came from measuring the
// backlog with the DB PRE-FILTER — `transcript_status = 'ok' and transcript_en
// is null`, which is also the predicate `videos_translate_pending_v2_idx` is
// defined on — instead of with the selection rule. All 1,564 of those rows are
// labelled English; the real candidate set was 178, and the run attempted all
// of it. These pin the gap so the next person measuring it reads the same
// number the step does.
describe('the index predicate is not the selection rule', () => {
  const pending = (over: Partial<TranslatableVideo> = {}): TranslatableVideo =>
    video({ transcript_en: null, transcript_status: 'ok', ...over })

  it('an English transcript matches the index predicate and is NOT a candidate', () => {
    // Every spelling that reaches transcript_lang, all of them still pending by
    // the index's own predicate, none of them anything to translate.
    for (const lang of ['en', 'EN', 'english', 'English', 'en-US', 'en_GB']) {
      expect(needsTranslation(pending({ transcript_lang: lang }))).toBe(false)
    }
  })

  it('an unknown language IS a candidate — the model is asked, not told', () => {
    expect(needsTranslation(pending({ transcript_lang: null }))).toBe(true)
    expect(needsTranslation(pending({ transcript_lang: '   ' }))).toBe(true)
  })

  it('the cap defers CANDIDATES, never pre-filter rows: 178 of a 400 cap defers nothing', () => {
    const candidates = Array.from({ length: 178 }, (_, i) => ({ id: `v${i}` }))
    const batches = planTranslation(candidates, { cap: 400, batch: 4 })
    expect(batches.flat()).toHaveLength(178)
    expect(Math.max(0, candidates.length - 400)).toBe(0)
  })

  it('a real backlog IS worked up to the cap, and the remainder is reported', () => {
    const candidates = Array.from({ length: 1564 }, (_, i) => ({ id: `v${i}` }))
    const batches = planTranslation(candidates, { cap: 400, batch: 4 })
    expect(batches.flat()).toHaveLength(400)
    expect(batches).toHaveLength(100)
    expect(Math.max(0, candidates.length - 400)).toBe(1164)
  })
})
