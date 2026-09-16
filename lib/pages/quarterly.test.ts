import { describe, expect, it } from 'vitest'

import type { Verdict } from '../reading/verdicts'
import { quarterFor } from '../reports/quarterly'
import { confidenceOf, countedLines, coverBody, flagOutcome, methodNumbers, ordinal, readingCounter, unsettledItems } from './quarterly'

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Durability',
  audience: 'category',
  window: { kind: 'quarter', from: '2026-07-01', to: '2026-09-30' },
  value: { k: 30, n: 100 },
  changePts: 5,
  bandPts: 3,
  state: 'moved',
  flags: [],
  ...over,
})

describe('readingCounter', () => {
  it('counts the reading and attaches the gate below six', () => {
    expect(readingCounter(3)).toBe('your 3rd monthly reading, the quarter view needs 6')
    expect(readingCounter(1)).toBe('your 1st monthly reading, the quarter view needs 6')
    expect(readingCounter(2)).toContain('your 2nd')
    expect(readingCounter(0)).toBe('no monthly reading yet, the quarter view needs 6')
  })

  it('drops the gate once six stand behind it', () => {
    expect(readingCounter(6)).toBe('your 6th monthly reading')
    expect(readingCounter(11)).toBe('your 11th monthly reading')
  })

  it('ordinals the teens correctly', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(4)).toBe('4th')
  })
})

describe('confidenceOf', () => {
  it('is never better than "partly" while the tenant’s own side is locked', () => {
    const all = [verdict(), verdict({ objectId: 't2' }), verdict({ objectId: 't3' })]
    expect(confidenceOf(all, false).word).toBe('partly')
    expect(confidenceOf(all, false).why).toContain('six monthly readings')
  })

  it('reads "reasonable" once two thirds of the comparisons were answered', () => {
    const answered = [verdict(), verdict({ objectId: 't2' }), verdict({ objectId: 't3', state: 'too_little_data' })]
    expect(confidenceOf(answered, true).word).toBe('reasonable')
  })

  it('reads "partly" when most comparisons went undrawn', () => {
    const thin = [verdict({ state: 'too_little_data' }), verdict({ objectId: 't2', state: 'refused' }), verdict({ objectId: 't3' })]
    expect(confidenceOf(thin, true).word).toBe('partly')
  })

  it('says so rather than guessing when nothing was compared', () => {
    expect(confidenceOf([], true).word).toBe('not yet')
  })

  it('prints every count with what it is out of', () => {
    const { why } = confidenceOf([verdict(), verdict({ objectId: 't2', state: 'refused' })], true)
    expect(why).toMatch(/1 of 2/)
  })
})

describe('coverBody', () => {
  it('names the lead and its denominator as tokens, never as digits', () => {
    const body = coverBody({ lead: verdict(), monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: true, readings: 8 })
    expect(body).toContain('[[lead_share]]')
    expect(body).toContain('[[lead_of]]')
    expect(body).toContain('[[quarter_videos]]')
    // The cover is code's prose and may carry a figure, but only as a token:
    // a bare digit here is a number nobody can re-substitute at render. The
    // quarter's own NAME is not a figure — "Q3 2026" is a period, the same
    // call WP17 made about a date on the weekly report's first screen.
    expect(body.replace(/\[\[[a-z_]+\]\]/g, '').replace(/Q3 2026/g, '')).not.toMatch(/\d/)
  })

  it('says the gate in its own words when the quarter is locked', () => {
    const body = coverBody({ lead: verdict(), monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: false, readings: 3 })
    // Lower-cased mid-sentence: the gate is a clause here, not a heading.
    expect(body).toContain('quarter against quarter needs six months')
    expect(body).toContain('you have 3')
  })

  it('says nothing cleared rather than inventing a lead', () => {
    const body = coverBody({ lead: null, monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: true, readings: 8 })
    expect(body).toContain('Nothing on either side cleared its band')
    expect(body).not.toContain('[[lead_share]]')
  })
})

describe('countedLines', () => {
  it('prints only what cleared a band, biggest first, with both sides', () => {
    const lines = countedLines([
      verdict({ objectLabel: 'Small', changePts: 1 }),
      verdict({ objectId: 't2', objectLabel: 'Big', changePts: 9, baseline: { k: 10, n: 100 } }),
      verdict({ objectId: 't3', objectLabel: 'Unsettled', state: 'too_little_data', changePts: 20 }),
    ])
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Big')
    expect(lines[0]).toContain('against 10 of 100 before it')
    expect(lines[1]).toContain('Small')
  })

  it('answers nothing when nothing moved', () => {
    expect(countedLines([verdict({ state: 'no_clear_change' })])).toEqual([])
  })
})

describe('flagOutcome', () => {
  it('says what the later reading of the same object turned out to be', () => {
    expect(flagOutcome({ label: 'Durability' }, [verdict()])).toContain('cleared its band')
    expect(flagOutcome({ label: 'durability' }, [verdict({ state: 'no_clear_change' })])).toContain('inside the band')
    expect(flagOutcome({ label: 'Durability' }, [verdict({ state: 'too_little_data' })])).toContain('too little')
    expect(flagOutcome({ label: 'Durability' }, [verdict({ state: 'refused' })])).toContain('could not be compared')
    expect(flagOutcome({ label: 'Durability' }, [verdict({ state: 'baseline_forming' })])).toContain('no baseline')
  })

  it('never claims an outcome nobody read', () => {
    expect(flagOutcome({ label: 'Something else' }, [verdict()])).toBe('no later reading of the same object has been taken')
  })
})

describe('unsettledItems', () => {
  it('lists refusals before thin readings before forming baselines', () => {
    const items = unsettledItems([
      verdict({ objectId: 'a', objectLabel: 'Forming', state: 'baseline_forming' }),
      verdict({ objectId: 'b', objectLabel: 'Thin', state: 'too_little_data' }),
      verdict({ objectId: 'c', objectLabel: 'Refused', state: 'refused' }),
      verdict({ objectId: 'd', objectLabel: 'Answered' }),
    ])
    expect(items.map((i) => i.title)).toEqual(['Whether Refused moved', 'Whether Thin moved', 'Whether Forming moved'])
  })

  it('says each one once, however many verdicts name it', () => {
    const items = unsettledItems([
      verdict({ objectId: 'a', objectLabel: 'Thin', state: 'too_little_data' }),
      verdict({ objectId: 'a', objectLabel: 'Thin', state: 'too_little_data' }),
    ])
    expect(items).toHaveLength(1)
  })

  it('carries a band where there is one and the honest phrase where there is not', () => {
    const [banded] = unsettledItems([verdict({ state: 'too_little_data', bandPts: 6.75 })])
    expect(banded.why).toBe('band ±6.8')
    const [unbanded] = unsettledItems([verdict({ state: 'too_little_data', bandPts: null })])
    expect(unbanded.why).toBe('too few to compare')
  })

  it('prints both sides of the comparison with their denominators', () => {
    const [item] = unsettledItems([verdict({ state: 'too_little_data', value: { k: 26, n: 84 }, baseline: { k: 20, n: 90 } })])
    expect(item.body).toContain('26 of 84 videos')
    expect(item.body).toContain('20 of 90')
  })
})

describe('methodNumbers', () => {
  const overview = { monthStatus: 'filling', month: '2026-09-01', bar: { videos: 449 } } as never

  it('tells a record that could not be read apart from a window that is not counted', () => {
    const q = quarterFor(2026, 3)
    // No record at all: nothing to say, and it says that.
    const none = methodNumbers(null, q, overview)
    expect(none.at(-1)?.value).toBe('not recorded')

    // The record read, but the WINDOWED count (M3) is unapplied. The month
    // tables ARE applied and seeded on both tenants, so "the month tables are
    // not applied" would have been a false sentence on the artefact; what is
    // missing is the one-window read, and the month in hand is stated instead.
    const unwindowed = methodNumbers(
      { coverage: null, delivery: { delivered: 10, dates: [], longestGapDays: 37, failed: 0, basis: 'run_clock' } } as never,
      q,
      overview,
    )
    expect(unwindowed.find((r) => r.label === 'Videos in September')?.value).toBe('449')
    expect(unwindowed.find((r) => r.label === 'Videos in September')?.note).toContain('not counted as one window')
    expect(unwindowed.find((r) => r.label === 'Updates')?.value).toBe('10 this quarter')
  })

  it('counts videos and comments over the quarter and names the gap', () => {
    const q = quarterFor(2026, 3)
    const rows = methodNumbers(
      {
        coverage: [
          { audience: 'category', videos: 1000, comments: 8000, platformMix: {}, dualMention: 0, excludedUndated: 0 },
          { audience: 'client', videos: 84, comments: 900, platformMix: {}, dualMention: 0, excludedUndated: 0 },
        ],
        delivery: { delivered: 13, dates: [], longestGapDays: 35, failed: 0, basis: 'run_clock' },
      } as never,
      q,
      overview,
    )
    expect(rows.find((r) => r.label === 'Videos')?.value).toBe('1,084')
    expect(rows.find((r) => r.label === 'Conversations')?.value).toBe('8,900')
    expect(rows.find((r) => r.label === 'Updates')?.note).toBe('longest gap 35 days')
    expect(rows[0]).toMatchObject({ label: 'Period', value: '2026-07-01 – 2026-09-30', note: 'still filling' })
  })
})
