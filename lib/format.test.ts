import { describe, it, expect } from 'vitest'
import { fmtInt, fmtCompact, fmtPct, fmtDelta, shortDate, weekdayDate, listNames, platformLabel } from './format'

describe('fmtInt', () => {
  it('adds thousands separators and rounds', () => {
    expect(fmtInt(6163)).toBe('6,163')
    expect(fmtInt(18391.4)).toBe('18,391')
    expect(fmtInt(468)).toBe('468')
    expect(fmtInt(-1234)).toBe('-1,234')
    expect(fmtInt(0)).toBe('0')
  })
})

describe('fmtCompact', () => {
  it('uses one decimal under 100K and none above; millions keep one decimal under 10M', () => {
    expect(fmtCompact(6163)).toBe('6.2K')
    expect(fmtCompact(18391)).toBe('18.4K')
    expect(fmtCompact(1_200_000)).toBe('1.2M')
    expect(fmtCompact(18_200_000)).toBe('18M')
    expect(fmtCompact(468)).toBe('468')
    expect(fmtCompact(61234)).toBe('61.2K')
    expect(fmtCompact(1000)).toBe('1K')
    expect(fmtCompact(-2500)).toBe('-2.5K')
  })
  it('rounds 57,729 followers to 57.7K, not 58K', () => {
    expect(fmtCompact(57_729)).toBe('57.7K')
  })
  it('keeps one decimal for other sub-100K values', () => {
    expect(fmtCompact(3_900)).toBe('3.9K')
    expect(fmtCompact(9_950)).toBe('10K')
  })
  it('drops the decimal at 100K and above', () => {
    expect(fmtCompact(99_950)).toBe('100K')
    expect(fmtCompact(100_000)).toBe('100K')
    expect(fmtCompact(308_000)).toBe('308K')
  })
  it('leaves millions unchanged', () => {
    expect(fmtCompact(3_600_000)).toBe('3.6M')
    expect(fmtCompact(1_234_567)).toBe('1.2M')
  })
})

describe('fmtPct / fmtDelta', () => {
  it('formats percents with at most one decimal', () => {
    expect(fmtPct(85.06)).toBe('85.1%')
    expect(fmtPct(16)).toBe('16%')
    expect(fmtPct(5.84, 0)).toBe('6%')
  })
  it('signs deltas and keeps units', () => {
    expect(fmtDelta(2.3, 'pt', 1)).toBe('+2.3 pt')
    expect(fmtDelta(-53)).toBe('−53')
    expect(fmtDelta(0)).toBe('±0')
    expect(fmtDelta(1240)).toBe('+1,240')
    expect(fmtDelta(22, '%')).toBe('+22%')
  })
})

describe('dates (UTC-anchored)', () => {
  it('shortDate / weekdayDate do not depend on locale or TZ', () => {
    expect(shortDate('2026-08-16T07:07:51.060Z')).toBe('16 Aug')
    expect(weekdayDate('2026-08-16T07:07:51.060Z')).toBe('Sun 16 Aug')
    expect(weekdayDate('2026-08-23T06:00:00Z')).toBe('Sun 23 Aug')
    expect(weekdayDate('2026-12-31T23:59:59Z')).toBe('Thu 31 Dec')
  })
})

describe('platforms', () => {
  it('labels known platforms and capitalises unknown ones', () => {
    expect(platformLabel('tiktok')).toBe('TikTok')
    expect(platformLabel('reddit')).toBe('Reddit')
    expect(platformLabel('threads')).toBe('Threads')
    expect(listNames(['tiktok', 'youtube', 'instagram'])).toBe('TikTok, YouTube & Instagram')
    expect(listNames(['tiktok'])).toBe('TikTok')
    expect(listNames([])).toBe('')
  })
})
