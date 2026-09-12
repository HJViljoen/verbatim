import { describe, it, expect } from 'vitest'
import { needsTranslation, isEnglishLang, buildTranslatePrompt, planTranslation, type TranslatableVideo } from './translate'
import { TRANSCRIPT_PROMPT_CHARS } from '../config'

// Translation selection (WP6, 2026-09-11). The rule is stated ONCE, here, and
// the Inngest plan step's SQL is only an index-friendly pre-filter over it —
// so every edge that decides real spend is locked in this file.

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

  it('never retries a recorded failure (the error is the tombstone)', () => {
    // Same posture as transcript_error: a stored failure means "attempted and
    // it did not work", so a weekly run does not pay for it again and again.
    // Clearing the column is the deliberate retry.
    expect(needsTranslation(video({ transcript_en_error: 'context_length_exceeded' }))).toBe(false)
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
