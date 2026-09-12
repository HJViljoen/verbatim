import { describe, it, expect } from 'vitest'
import { needsOcr, canOcr, canBackfillOcr, buildOcrPrompt, normaliseOcrLines, orderAndChunkOcrPending } from './ocr'
import { tiktok } from '../gather/platforms/tiktok'
import { instagram } from '../gather/platforms/instagram'
import { youtube } from '../gather/platforms/youtube'
import { reddit } from '../gather/platforms/reddit'
import { OCR_MAX_CHARS } from '../config'

describe('needsOcr — every answer is terminal', () => {
  it('selects a video that has never been read', () => {
    expect(needsOcr({ ocr_status: null })).toBe(true)
  })

  it('does not re-read a frame that already answered, "none" included', () => {
    for (const s of ['ok', 'none', 'no_image', 'failed']) {
      expect(needsOcr({ ocr_status: s })).toBe(false)
    }
  })
})

describe('which platforms can be read', () => {
  it('gather-time OCR needs a cover in the raw item', () => {
    expect(canOcr(tiktok)).toBe(true)
    expect(canOcr(instagram)).toBe(true)
    expect(canOcr(youtube)).toBe(true)
    expect(canOcr(reddit)).toBe(false)
    expect(canOcr(undefined)).toBe(false)
  })

  it('backfill needs a cover that survives the raw item — YouTube alone', () => {
    expect(canBackfillOcr(youtube)).toBe(true)
    expect(canBackfillOcr(tiktok)).toBe(false)
    expect(canBackfillOcr(instagram)).toBe(false)
    expect(canBackfillOcr(reddit)).toBe(false)
  })
})

describe('buildOcrPrompt', () => {
  const { system, user } = buildOcrPrompt()

  it('asks for transcription and forbids description — the failure mode', () => {
    expect(system).toContain('Do NOT describe the image')
    expect(system).toContain('Transcribe every piece of legible on-screen text')
    expect(system).toContain('one entry per text block')
  })

  it('makes "no text" a correct answer, so an empty frame is not a failure', () => {
    expect(system).toContain('return an empty list')
    expect(system).toContain('not a failure')
  })

  it('forbids translating, correcting or guessing at unreadable text', () => {
    expect(system).toContain('Do not translate, correct, summarise, or complete it')
    expect(system).toContain('rather than inventing a plausible word')
  })

  it('is pure — the dry run and the live call assemble the same strings', () => {
    expect(buildOcrPrompt()).toEqual({ system, user })
  })
})

describe('normaliseOcrLines', () => {
  it('keeps one block per line, in reading order', () => {
    expect(normaliseOcrLines(['I TRIED 6 LEGS', 'this one won'])).toBe('I TRIED 6 LEGS\nthis one won')
  })

  it('drops blanks and collapses whitespace inside a block', () => {
    expect(normaliseOcrLines(['  ', '\n', 'DAY   3\tof 30'])).toBe('DAY 3 of 30')
  })

  it('drops case-insensitive repeats — a cover often shows its text twice', () => {
    expect(normaliseOcrLines(['SALE ENDS TODAY', 'sale ends today', 'link in bio'])).toBe('SALE ENDS TODAY\nlink in bio')
  })

  it('returns "" for no text at all, which the caller stores as status none', () => {
    expect(normaliseOcrLines([])).toBe('')
    expect(normaliseOcrLines(['', '   '])).toBe('')
  })

  it('clips a runaway output at OCR_MAX_CHARS', () => {
    const out = normaliseOcrLines([('x'.repeat(50) + ' ').repeat(40)])
    expect([...out].length).toBeLessThanOrEqual(OCR_MAX_CHARS)
  })

  it('clips by code point, so an emoji is never split in half', () => {
    const out = normaliseOcrLines(['🔥'.repeat(500)], 4)
    expect(out).toBe('🔥🔥🔥🔥')
  })

  it('preserves the line breaks — they are the reading order, not whitespace', () => {
    // Collapsing them would merge two unrelated text blocks into one sentence
    // the frame never showed, and that sentence would then be quotable.
    expect(normaliseOcrLines(['before', 'after'])).toContain('\n')
  })
})

describe('orderAndChunkOcrPending', () => {
  const row = (video_id: string, comments_count: number | null, ocr_status: string | null = null) =>
    ({ video_id, comments_count, ocr_status })

  it('takes only the videos with no answer yet', () => {
    expect(orderAndChunkOcrPending([row('a', 5), row('b', 9, 'none'), row('c', 1, 'failed')], 8, 100))
      .toEqual([['a']])
  })

  it('orders richest-first so a capped run takes the highest-signal videos', () => {
    expect(orderAndChunkOcrPending([row('a', 2), row('b', 40), row('c', 11)], 8, 100))
      .toEqual([['b', 'c', 'a']])
  })

  it('breaks ties on video_id, so a replanned step chunks identically', () => {
    expect(orderAndChunkOcrPending([row('z', 3), row('a', 3)], 8, 100)).toEqual([['a', 'z']])
  })

  it('treats a null comment count as zero rather than dropping the video', () => {
    expect(orderAndChunkOcrPending([row('a', null), row('b', 1)], 8, 100)).toEqual([['b', 'a']])
  })

  it('applies the cap BEFORE batching, so a capped run dispatches whole batches', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`v${String(i).padStart(2, '0')}`, 100 - i))
    const batches = orderAndChunkOcrPending(rows, 4, 10)
    expect(batches).toHaveLength(3)
    expect(batches.flat()).toHaveLength(10)
    expect(batches[0]).toEqual(['v00', 'v01', 'v02', 'v03'])
  })

  it('is empty when nothing is pending', () => {
    expect(orderAndChunkOcrPending([row('a', 5, 'ok')], 8, 100)).toEqual([])
    expect(orderAndChunkOcrPending([], 8, 100)).toEqual([])
  })
})
