import { describe, expect, it } from 'vitest'
import { contextLine, detailHref, horizonHref, horizonOptions, monthHref, monthLabel, monthOptions, monthTitle, updateLabel, updateLine } from './bar'
import { readingMonthFor } from '../reading/reading-month'
import { sealandReading } from '../test/reading-fixture'
import { directionHits } from '../calibration'

// ---- The 25 Sep rulings' bar (market-first WP1.2) --------------------------------
//
// Sealand's real calendar (lib/test/reading-fixture.ts: DR F21's updates, the
// schedule's Sunday updates from 27 Sep, production's pooled market) and
// Össur's, paused since 13 Sep.
const OSSUR = readingMonthFor({
  now: '2026-10-02T06:00:00.000Z',
  updates: ['2026-04-06T12:00:00.000Z', '2026-09-13T12:00:00.000Z'],
  videosByMonth: new Map([['2026-08-01', 585], ['2026-09-01', 362]]),
  firstRunMonth: '2026-04-01',
})

describe('contextLine: the bar\'s one line', () => {
  it('is "as at the {update} update · next update {date}", dated by the update and never the clock', () => {
    expect(contextLine({ brand: 'Sealand', reading: sealandReading('2026-09-24T18:00:00.000Z') }))
      .toBe('as at the 24 Sep update · next update Sun 27 Sep')
    expect(contextLine({ brand: 'Sealand', reading: sealandReading('2026-10-01T00:00:00.000Z') }))
      .toBe('as at the 27 Sep update · next update Sun 4 Oct')
    expect(contextLine({ brand: 'Össur', reading: OSSUR })).toBe('as at the 13 Sep update · updates paused')
  })

  it('never says "so far, ", "still filling", "complete" or "how sound", and no direction word or em dash', () => {
    const lines = [
      '2026-09-24T18:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-11T12:00:00.000Z', '2026-10-16T12:00:00.000Z',
    ].map((now) => contextLine({ brand: 'Sealand', reading: sealandReading(now) }))
    lines.push(contextLine({ brand: 'Össur', reading: OSSUR }))
    for (const line of lines) {
      expect(line).not.toContain('so far, ')
      expect(line).not.toContain('still filling')
      expect(line.toLowerCase()).not.toContain('complete')
      expect(line.toLowerCase()).not.toContain('how sound')
      expect(line).not.toContain('\u2014')
      expect(directionHits(line)).toEqual([])
    }
  })
})

describe('the month selector', () => {
  it('names the month with its year', () => {
    expect(monthLabel('2026-09-01')).toBe('September 2026')
  })

  it('carries the month\'s state in its tooltip, never in the line', () => {
    expect(monthTitle(sealandReading('2026-10-11T12:00:00.000Z')))
      .toBe('September · ended · read to the 11 Oct update · still filling until the 1 Nov update')
    expect(monthTitle(OSSUR)).toBe('September · read to the 13 Sep update · updates paused')
  })

  it('points at the other month, carrying the page\'s own selection', () => {
    expect(monthHref('/dashboard', {}, { month: '2026-08-01', isDefault: false })).toBe('/dashboard?month=2026-08')
    expect(monthHref('/dashboard/voice', { horizon: 'last_3', theme: 't1' }, { month: '2026-10-01', isDefault: false }))
      .toBe('/dashboard/voice?horizon=last_3&theme=t1&month=2026-10')
  })

  it('back to the default month writes no parameter, and never doubles one', () => {
    expect(monthHref('/dashboard', { month: '2026-10' }, { month: '2026-09-01', isDefault: true })).toBe('/dashboard')
    expect(monthHref('/dashboard/subjects', { month: '2026-10', item: 's1' }, { month: '2026-09-01', isDefault: false }))
      .toBe('/dashboard/subjects?item=s1&month=2026-09')
  })
})

// THE MENU (default M-d, 26 Sep): every month the reading view offers, the one
// read marked, newest first, each carrying the page's own selection. On 1 to 3
// Oct it steps back to August and July, where WP1.2's selector offered nothing.
describe('monthOptions: the selector\'s menu', () => {
  const EARLIER = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01'].map((month) => ({ month, isDefault: false }))

  it('2 Oct: September read and marked, then August, July and the months before, each one click back', () => {
    const options = monthOptions('/dashboard', { horizon: 'last_3' }, sealandReading('2026-10-02T06:00:00.000Z'), EARLIER)
    expect(options.map((o) => o.label)).toEqual(['September 2026', 'August 2026', 'July 2026', 'June 2026', 'May 2026', 'April 2026'])
    expect(options.filter((o) => o.current).map((o) => o.month)).toEqual(['2026-09-01'])
    // The month read by default links with no `?month=`; the others carry it,
    // with the page's own params.
    expect(options[0].href).toBe('/dashboard?horizon=last_3')
    expect(options[1].href).toBe('/dashboard?horizon=last_3&month=2026-08')
    expect(options[2].href).toBe('/dashboard?horizon=last_3&month=2026-07')
  })

  it('under a ?month=, the month read keeps its parameter and the default drops it', () => {
    const options = monthOptions('/dashboard/subjects', { month: '2026-07', item: 's1' }, sealandReading('2026-10-02T06:00:00.000Z', '2026-07'), [
      { month: '2026-09-01', isDefault: true }, ...EARLIER.filter((o) => o.month !== '2026-07-01'),
    ])
    expect(options.map((o) => o.month)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01'])
    expect(options.find((o) => o.current)?.href).toBe('/dashboard/subjects?item=s1&month=2026-07')
    expect(options[0].href).toBe('/dashboard/subjects?item=s1')
  })

  it('labels months by name only: no "so far" and no "still filling", so none reaches the bar', () => {
    const options = monthOptions('/dashboard', {}, sealandReading('2026-10-11T12:00:00.000Z'), [{ month: '2026-10-01', isDefault: false }, ...EARLIER])
    for (const o of options) {
      expect(o.label).toMatch(/^[A-Z][a-z]+ \d{4}$/)
      expect(o.label).not.toContain('so far')
      expect(o.label).not.toContain('still filling')
    }
  })

  it('says under a month too few to read that it is, with its count, and nothing under a month that reads', () => {
    const others = [
      { month: '2026-08-01', isDefault: false, tooFew: false, videos: 377 },
      { month: '2026-07-01', isDefault: false, tooFew: true, videos: 36 },
      { month: '2026-06-01', isDefault: false, tooFew: true, videos: 50 },
    ]
    const options = monthOptions('/dashboard', {}, sealandReading('2026-10-02T06:00:00.000Z'), others)
    expect(options.map((o) => [o.label, o.note])).toEqual([
      ['September 2026', null],
      ['August 2026', null],
      ['July 2026', '36 videos · too few to read'],
      ['June 2026', '50 videos · too few to read'],
    ])
    // The label stays the month's name alone.
    for (const o of options) expect(o.label).toMatch(/^[A-Z][a-z]+ \d{4}$/)
  })

  it('is empty where there is no other month, so the chip is not a control', () => {
    expect(monthOptions('/dashboard', {}, sealandReading('2026-10-02T06:00:00.000Z'), [])).toEqual([])
  })
})

describe('This week\'s line (25 Sep rulings, item 2)', () => {
  // Staging's 20 Sep update, `b67b56de`: a 9.9-day window, 10 Sep to 20 Sep
  // (GR F58). The instants are stamped within those days; only the days print.
  const window = { from: '2026-09-10T08:00:00.000Z', to: '2026-09-20T06:00:00.000Z' }

  it('names the update in the slot and the comment window in place of "as at"', () => {
    expect(updateLabel('2026-09-20T12:00:00.000Z')).toBe('The 20 Sep update')
    expect(updateLine({ update: '2026-09-20T12:00:00.000Z', window, nextUpdate: '2026-09-27T04:00:00.000Z' }))
      .toBe('comments written 10 to 20 Sep · next update Sun 27 Sep')
  })

  it('names both months when the window crosses one, and takes the day before a midnight end', () => {
    expect(updateLine({ update: '2026-09-10T12:00:00.000Z', window: { from: '2026-08-11T00:00:00.000Z', to: '2026-09-10T00:00:00.000Z' } }))
      .toBe('comments written 11 Aug to 9 Sep')
  })

  it('says "as at" where the run carries no window, and "updates paused" for a paused tenant', () => {
    expect(updateLine({ update: '2026-09-20T12:00:00.000Z', window: null, nextUpdate: '2026-09-27T04:00:00.000Z' }))
      .toBe('as at the 20 Sep update · next update Sun 27 Sep')
    expect(updateLine({ update: '2026-09-13T12:00:00.000Z', window: null, paused: true }))
      .toBe('as at the 13 Sep update · updates paused')
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
    expect(o.map((x) => x.label)).toEqual(['The month', 'Last 3 months', 'Last 12 months', 'Since we started'])
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
