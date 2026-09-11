import { describe, it, expect } from 'vitest'
import { usableTranscript, usableTranslation } from './transcript-input'
import { TRANSCRIPT_PROMPT_CHARS } from '../config'

// The single door transcript text enters analysis through, and — since WP6 —
// the second door beside it. Both gate on the SAME content-gate verdict, and
// both clip to the same prompt budget: the quote validator matches against the
// clipped original, so a translation clipped differently would let the model
// read a sentence it cannot quote.

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

  it('clips to the same budget as the original', () => {
    const long = 'b'.repeat(TRANSCRIPT_PROMPT_CHARS + 500)
    expect(usableTranslation({ transcript_en: long, transcript_status: 'ok' })!.length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CHARS)
  })

  it('is code-point-safe (emoji survive the clip, no lone surrogate)', () => {
    const long = '😀'.repeat(TRANSCRIPT_PROMPT_CHARS)
    const clipped = usableTranslation({ transcript_en: long, transcript_status: 'ok' })!
    expect([...clipped].every((c) => c === '😀')).toBe(true)
  })
})
