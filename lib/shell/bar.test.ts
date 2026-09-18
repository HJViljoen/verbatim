import { describe, expect, it } from 'vitest'
import { contextLine, detailHref, horizonHref, horizonOptions, updateLine } from './bar'
import { directionHits } from '../calibration'

describe('contextLine', () => {
  it('names the brand, the month, that it is still filling, and when it was read', () => {
    expect(contextLine({ brand: 'Össur', month: '2026-09-01', status: 'filling', readingAt: '2026-09-15T18:00:00Z' }))
      .toBe('Össur · September 2026 · still filling · as at 15 Sep')
  })

  it('says nothing about filling once the month is frozen', () => {
    expect(contextLine({ brand: 'Sealand', month: '2026-08-01', status: 'frozen', readingAt: '2026-10-02T06:00:00Z' }))
      // BLOCK D WAVE 2, `main.bar.context`: the artboard writes the month LONG
      // and the stamp SHORT, and drops "reading" (the question above the bar
      // and the band below it both already say it).
      .toBe('Sealand · August 2026 · as at 2 Oct')
  })

  it('separates the month read from the moment read', () => {
    // The two dates are the point: a month that is still filling reads
    // differently on Monday and on Friday.
    const line = contextLine({ brand: 'Össur', month: '2026-09-01', status: 'filling', readingAt: '2026-09-01T00:00:00Z' })
    expect(line).toContain('September 2026')
    // The stamp keeps the DAY, which is the half that separates the two dates;
    // it loses the year, which the month beside it has already settled.
    expect(line).toContain('as at 1 Sep')
  })

  it('prints no direction word', () => {
    expect(directionHits(contextLine({ brand: 'Össur', month: '2026-09-01', status: 'filling', readingAt: '2026-09-15T18:00:00Z' }))).toEqual([])
  })
})

describe('updateLine', () => {
  it('dates This week by the two updates it compares', () => {
    expect(updateLine({ update: '2026-09-14T04:00:00Z', previous: '2026-09-07T04:00:00Z' }))
      .toBe('update of 14 Sep · previous 7 Sep')
  })

  it('says there is no previous update rather than printing a blank', () => {
    expect(updateLine({ update: '2026-06-28T04:00:00Z', previous: null })).toBe('update of 28 Jun · no previous update')
    expect(updateLine({ update: '2026-06-28T04:00:00Z' })).toBe('update of 28 Jun · no previous update')
  })
})

describe('horizonHref', () => {
  it('writes no parameter for the default, so a page’s plain address is its default reading', () => {
    expect(horizonHref('/dashboard', {}, 'this_month')).toBe('/dashboard')
  })

  it('carries the page’s own selection through', () => {
    expect(horizonHref('/dashboard/market', { item: 'mi-1', group: 'recs' }, 'last_3'))
      .toBe('/dashboard/market?item=mi-1&group=recs&horizon=last_3')
  })

  it('replaces a horizon already in the params rather than doubling it', () => {
    expect(horizonHref('/dashboard/voice', { horizon: 'last_12', theme: 't' }, 'since_start'))
      .toBe('/dashboard/voice?theme=t&horizon=since_start')
    expect(horizonHref('/dashboard/voice', { horizon: 'last_12' }, 'this_month')).toBe('/dashboard/voice')
  })

  it('drops empty params instead of writing bare keys', () => {
    expect(horizonHref('/dashboard/subjects', { item: '', vs: undefined }, 'last_12'))
      .toBe('/dashboard/subjects?horizon=last_12')
  })
})

describe('horizonOptions', () => {
  it('is the four, in order, with exactly one active', () => {
    const o = horizonOptions('/dashboard', {}, 'last_3')
    expect(o.map((x) => x.label)).toEqual(['This month', 'Last 3 months', 'Last 12 months', 'Since we started'])
    expect(o.filter((x) => x.active).map((x) => x.horizon)).toEqual(['last_3'])
    expect(o[0].href).toBe('/dashboard')
    expect(o[3].href).toBe('/dashboard?horizon=since_start')
  })
})

describe('detailHref', () => {
  it('opens the record at the reading the reader is looking at', () => {
    expect(detailHref('/dashboard/voice', { themes: 'product_usefulness', horizon: 'last_3' }, 'record'))
      .toBe('/dashboard/voice?themes=product_usefulness&horizon=last_3&detail=record')
  })

  it('closes back to the same reading, not to the page’s default', () => {
    expect(detailHref('/dashboard/voice', { themes: 'product_usefulness', horizon: 'last_3', detail: 'record' }, null))
      .toBe('/dashboard/voice?themes=product_usefulness&horizon=last_3')
  })

  it('leaves a plain page plain', () => {
    expect(detailHref('/dashboard', {}, null)).toBe('/dashboard')
    expect(detailHref('/dashboard', { item: '' }, 'record')).toBe('/dashboard?detail=record')
  })
})
