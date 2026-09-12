import { describe, it, expect } from 'vitest'
import {
  needsOcr, canOcr, canBackfillOcr, buildOcrPrompt, normaliseOcrLines, orderAndChunkOcrPending,
  sniffImageType, isAllowedCoverHost, mentionsMissingColumn,
} from './ocr'
import { tiktok } from '../gather/platforms/tiktok'
import { instagram } from '../gather/platforms/instagram'
import { youtube } from '../gather/platforms/youtube'
import { reddit } from '../gather/platforms/reddit'
import { OCR_MAX_ATTEMPTS, OCR_MAX_CHARS } from '../config'

describe('needsOcr — the frame\'s answers are final, ours are not', () => {
  it('selects a video that has never been read', () => {
    expect(needsOcr({ ocr_status: null })).toBe(true)
    expect(needsOcr({ ocr_status: null }, { durableCover: true })).toBe(true)
  })

  it('never re-reads a frame that answered — "none" is an answer, not a miss', () => {
    for (const opts of [{}, { durableCover: true }, { coverStillAnswers: true }]) {
      expect(needsOcr({ ocr_status: 'ok', ocr_attempts: 1 }, opts)).toBe(false)
      expect(needsOcr({ ocr_status: 'none', ocr_attempts: 1 }, opts)).toBe(false)
    }
  })

  it('retries failed/no_image on a DURABLE cover — one timeout must not lose a video forever', () => {
    // https://i.ytimg.com/vi/<id>/hqdefault.jpg is there next week too, so an
    // eight-second fetch timeout is a fact about the attempt, not the frame.
    for (const status of ['failed', 'no_image']) {
      expect(needsOcr({ ocr_status: status, ocr_attempts: 0 }, { durableCover: true })).toBe(true)
      expect(needsOcr({ ocr_status: status, ocr_attempts: OCR_MAX_ATTEMPTS - 1 }, { durableCover: true })).toBe(true)
    }
  })

  it('stops at OCR_MAX_ATTEMPTS — a weekly run cannot chase a dead end forever', () => {
    expect(needsOcr({ ocr_status: 'failed', ocr_attempts: OCR_MAX_ATTEMPTS }, { durableCover: true })).toBe(false)
    expect(needsOcr({ ocr_status: 'no_image', ocr_attempts: OCR_MAX_ATTEMPTS + 5 }, { durableCover: true })).toBe(false)
  })

  it('retries a SIGNED cover only while it still answers', () => {
    // At gather time the run just fetched the item, so the url is live and a
    // previous HEIC/timeout gets its one real chance.
    expect(needsOcr({ ocr_status: 'no_image', ocr_attempts: 0 }, { coverStillAnswers: true })).toBe(true)
    // Days later it is 403 and retrying buys nothing.
    expect(needsOcr({ ocr_status: 'no_image', ocr_attempts: 0 })).toBe(false)
    expect(needsOcr({ ocr_status: 'failed', ocr_attempts: 0 })).toBe(false)
  })

  it('reads a null attempt count as zero, so pre-column rows get their retries', () => {
    expect(needsOcr({ ocr_status: 'failed', ocr_attempts: null }, { durableCover: true })).toBe(true)
    expect(needsOcr({ ocr_status: 'failed' }, { durableCover: true })).toBe(true)
  })
})

describe('sniffImageType — the file, not the header', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
  const gif = Buffer.from('GIF89a....')
  // The real first bytes of a TikTok cover served as image/heic (2026-09-12).
  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(8)])

  it('recognises exactly what the vision api accepts', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg')
    expect(sniffImageType(png)).toBe('image/png')
    expect(sniffImageType(webp)).toBe('image/webp')
    expect(sniffImageType(gif)).toBe('image/gif')
  })

  it('rejects HEIC — the format ~9% of TikTok covers are served in', () => {
    // The API cannot decode it, and no url rewrite gets a jpeg instead (the
    // tplv transform is inside the signed path — verified live 2026-09-12), so
    // this has to be an honest "we cannot use this image".
    expect(sniffImageType(heic)).toBeNull()
  })

  it('rejects html, empty and truncated bodies rather than guessing', () => {
    expect(sniffImageType(Buffer.from('<!DOCTYPE html>'))).toBeNull()
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull()
  })
})

describe('isAllowedCoverHost', () => {
  it('allows the CDNs that actually serve covers', () => {
    for (const u of [
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      'https://p16-common-sign.tiktokcdn.com/x~tplv-a.jpeg?a=1',
      'https://p16-common-sign.tiktokcdn-eu.com/x.heic',
      'https://p16-common-sign.tiktokcdn-us.com/x.jpeg',
      'https://scontent-cph2-1.cdninstagram.com/v/x.jpg',
      'https://instagram.frkh1-1.fna.fbcdn.net/v/x.jpg',
    ]) expect(isAllowedCoverHost(u)).toBe(true)
  })

  it('refuses anything else, http, and unparseable input', () => {
    // The url is third-party actor output fetched server-side; naming the four
    // real CDNs costs nothing.
    for (const u of [
      'https://evil.example.com/x.jpg',
      'http://i.ytimg.com/vi/abc/hqdefault.jpg',
      'https://notytimg.com/x.jpg',
      'https://i.ytimg.com.evil.example/x.jpg',
      'file:///etc/passwd',
      'not a url',
      '',
    ]) expect(isAllowedCoverHost(u)).toBe(false)
  })
})

describe('mentionsMissingColumn', () => {
  it('recognises the message selectAll leaves behind when the code is gone', () => {
    expect(mentionsMissingColumn(new Error('selectAll: column videos.ocr_status does not exist'), 'ocr_status')).toBe(true)
    expect(mentionsMissingColumn({ message: 'Could not find the \'ocr_text\' column in the schema cache' }, 'ocr_text')).toBe(true)
  })

  it('does not swallow an unrelated failure', () => {
    expect(mentionsMissingColumn(new Error('selectAll: fetch failed'), 'ocr_status')).toBe(false)
    expect(mentionsMissingColumn(new Error('ocr_status is null'), 'ocr_status')).toBe(false)
    expect(mentionsMissingColumn(null, 'ocr_status')).toBe(false)
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
    ({ video_id, comments_count, ocr_status, ocr_attempts: 0 })

  it('takes the unread, and skips a frame that already answered', () => {
    expect(orderAndChunkOcrPending([row('a', 5), row('b', 9, 'none'), row('c', 1, 'ok')], 8, 100))
      .toEqual([['a']])
  })

  it('takes a retryable non-verdict back when the cover is durable', () => {
    const rows = [row('a', 5), row('b', 9, 'failed'), row('c', 1, 'no_image')]
    expect(orderAndChunkOcrPending(rows, 8, 100)).toEqual([['a']])
    expect(orderAndChunkOcrPending(rows, 8, 100, { durableCover: true })).toEqual([['b', 'a', 'c']])
  })

  it('the cap is the run REMAINDER, so 0 plans nothing', () => {
    expect(orderAndChunkOcrPending([row('a', 5), row('b', 9)], 8, 0)).toEqual([])
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
