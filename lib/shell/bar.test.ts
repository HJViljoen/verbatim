import { describe, expect, it } from 'vitest'
import { contextLine, horizonHref, horizonOptions, updateLine } from './bar'
import { directionHits } from '../calibration'

describe('contextLine', () => {
  it('names the brand, the month, that it is still filling, and when it was read', () => {
    expect(contextLine({ brand: 'Össur', month: '2026-09-01', status: 'filling', readingAt: '2026-09-15T18:00:00Z' }))
      .toBe('Össur · Sep 2026 · still filling · reading as at 15 Sep 2026')
  })

  it('says nothing about filling once the month is frozen', () => {
    expect(contextLine({ brand: 'Sealand', month: '2026-08-01', status: 'frozen', readingAt: '2026-10-02T06:00:00Z' }))
      .toBe('Sealand · Aug 2026 · reading as at 2 Oct 2026')
  })

  it('separates the month read from the moment read', () => {
    // The two dates are the point: a month that is still filling reads
    // differently on Monday and on Friday.
    const line = contextLine({ brand: 'Össur', month: '2026-09-01', status: 'filling', readingAt: '2026-09-01T00:00:00Z' })
    expect(line).toContain('Sep 2026')
    expect(line).toContain('1 Sep 2026')
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
