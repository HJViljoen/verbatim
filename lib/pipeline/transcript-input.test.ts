import { describe, it, expect } from 'vitest'
import { usableTranscript, usableTranslation } from './transcript-input'
import { buildTranslatePrompt } from './translate'
import { TRANSCRIPT_PROMPT_CHARS } from '../config'

// The single door transcript text enters analysis through, and — since WP6 —
// the second door beside it. Both gate on the SAME content-gate verdict.
//
// THE INVARIANT: the English block covers the same SPEECH as the original
// block. It is bought on the INPUT side — buildTranslatePrompt translates
// exactly the TRANSCRIPT_PROMPT_CHARS span usableTranscript shows Pass A — and
// usableTranslation then returns what came back whole. Equal character budgets
// on the two sides would NOT buy it: 2,051 chars of Traditional Chinese became
// 6,508 of English, so re-clipping the English at 2,400 covered ~37% of the
// speech the original block shows.

describe('usableTranscript — unchanged by translation (it is still the ORIGINAL)', () => {
  it('reads only content-gated speech', () => {
    expect(usableTranscript({ transcript: 'hola qué tal', transcript_status: 'ok' })).toBe('hola qué tal')
    for (const status of ['no_speech', 'lyrics', 'garbled', 'no_media', 'failed', null]) {
      expect(usableTranscript({ transcript: 'hola qué tal', transcript_status: status })).toBeNull()
    }
  })

  it('is null without text', () => {
    expect(usableTranscript({ transcript: null, transcript_status: 'ok' })).toBeNull()
    expect(usableTranscript({ transcript: '   ', transcript_status: 'ok' })).toBeNull()
  })

  it('clips to the prompt budget', () => {
    const long = 'a'.repeat(TRANSCRIPT_PROMPT_CHARS + 500)
    expect(usableTranscript({ transcript: long, transcript_status: 'ok' })!.length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CHARS)
  })
})

describe('usableTranslation', () => {
  it('reads the English rendering when one exists', () => {
    expect(usableTranslation({ transcript_en: 'Hi, how are you', transcript_status: 'ok' })).toBe('Hi, how are you')
  })

  it('is null when nothing has been translated', () => {
    expect(usableTranslation({ transcript_en: null, transcript_status: 'ok' })).toBeNull()
    expect(usableTranslation({ transcript_en: '  ', transcript_status: 'ok' })).toBeNull()
  })

  it('respects the content gate — a rejected transcript stays rejected', () => {
    // Otherwise a translation would be a second way in for exactly the lyrics
    // and noise the gate exists to keep out.
    for (const status of ['no_speech', 'lyrics', 'garbled', 'no_media', 'failed', null]) {
      expect(usableTranslation({ transcript_en: 'Hi, how are you', transcript_status: status })).toBeNull()
    }
  })

  it('does NOT clip — a longer English rendering is passed through whole', () => {
    // Clipping here is what broke the coverage invariant: English runs ~3x the
    // characters of Chinese for the same speech, so a 2,400-char cut on the
    // output threw away two thirds of the translation of a transcript the
    // ORIGINAL block shows in full.
    const long = 'b'.repeat(TRANSCRIPT_PROMPT_CHARS * 3)
    expect(usableTranslation({ transcript_en: long, transcript_status: 'ok' })).toHaveLength(TRANSCRIPT_PROMPT_CHARS * 3)
  })
})

describe('the English covers the same speech as the original block', () => {
  // Not a length claim — a coverage one. Whatever span usableTranscript shows
  // Pass A as the ORIGINAL is exactly the span that was sent for translation,
  // so the ENGLISH TRANSLATION block beside it is that same speech in English,
  // however many characters that turns out to be in either script.
  const CJK = '這是一個測試句子。'.repeat(600) // ~5,400 chars, well past the budget

  it('what is translated is exactly what the ORIGINAL block shows', () => {
    const original = usableTranscript({ transcript: CJK, transcript_status: 'ok' })!
    const sent = buildTranslatePrompt(CJK, 'zh').user
    expect(original.length).toBe(TRANSCRIPT_PROMPT_CHARS)
    expect(sent).toContain(original)
    // and nothing beyond it: the character after the cut is not in the prompt.
    expect(sent).not.toContain(CJK.slice(0, TRANSCRIPT_PROMPT_CHARS + 1))
  })

  it('a 3x expansion into English survives intact rather than being re-cut', () => {
    // The Chinese case, to scale: the original block is 2,400 chars of Chinese
    // and the English for that same speech is ~7,200. All of it reaches Pass A.
    const english = 'This is a test sentence. '.repeat(288) // ~7,200 chars
    const shown = usableTranslation({ transcript_en: english, transcript_status: 'ok' })!
    expect(shown.length).toBeGreaterThan(TRANSCRIPT_PROMPT_CHARS * 2)
    expect(shown.endsWith('This is a test sentence.')).toBe(true)
  })
})
