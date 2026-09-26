import { describe, expect, it } from 'vitest'
import type { Verdict } from '../reading/verdicts'
import { scheduledUpdateAfter } from '../reading/reading-month'
import {
  MONTHLY_BLOCK_KEYS,
  MONTHLY_EMAIL_WIDTH,
  MONTHLY_RETIRED_KEYS,
  MONTHLY_SEND_DAYS_AFTER,
  MONTHLY_UPDATES_PAST_END,
  MOVED_SINCE_PTS,
  freezesOn,
  leadVerdict,
  monthlyStamp,
  monthlySubject,
  monthlyTitle,
  movedSince,
  nextMonthlyOf,
  nextMonthlyParts,
  readToWords,
  sentReadingLine,
  shortMonth,
  type SentReading,
} from './monthly'

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Durability',
  audience: 'industry',
  window: { from: '2026-09-01', to: '2026-10-01', kind: 'month' },
  value: { k: 305, n: 1388 },
  changePts: 3,
  bandPts: 1.8,
  state: 'moved',
  flags: [],
  ...over,
})

const sent = (over: Partial<SentReading> = {}): SentReading => ({
  readingAt: '2026-10-01T06:00:00.000Z',
  value: 19,
  unit: 'pct',
  k: 264,
  n: 1388,
  monthStatus: 'filling',
  ...over,
})

describe('the arrangement', () => {
  it('is ten sections, in the front page’s order (plan §2.9)', () => {
    expect(MONTHLY_BLOCK_KEYS).toEqual([
      'monthly.month',
      'monthly.themes',
      'monthly.arrivals',
      'monthly.kinds',
      'monthly.asks',
      'monthly.subjects',
      'monthly.you',
      'monthly.brands',
      'monthly.change',
      'monthly.decide',
    ])
  })

  it('puts what it means for you before the brands, as the front page does', () => {
    expect(MONTHLY_BLOCK_KEYS.indexOf('monthly.you')).toBeLessThan(MONTHLY_BLOCK_KEYS.indexOf('monthly.brands'))
  })

  it('names every key under one page, so a stored arrangement is legible', () => {
    for (const key of MONTHLY_BLOCK_KEYS) expect(key.startsWith('monthly.')).toBe(true)
    expect(new Set(MONTHLY_BLOCK_KEYS).size).toBe(MONTHLY_BLOCK_KEYS.length)
  })

  it('never reuses a retired key for a new section', () => {
    for (const key of MONTHLY_RETIRED_KEYS) expect((MONTHLY_BLOCK_KEYS as readonly string[]).includes(key)).toBe(false)
    expect(MONTHLY_RETIRED_KEYS).toContain('monthly.sound')
  })

  it('is the artboard’s width', () => {
    expect(MONTHLY_EMAIL_WIDTH).toBe(640)
  })
})

describe('the masthead', () => {
  it('heads the artefact "September in your market"', () => {
    expect(monthlyTitle('2026-09-01')).toBe('September in your market')
    expect(monthlyTitle('2026-10')).toBe('October in your market')
  })

  it('stamps the month and the update it was read to, with no "still filling"', () => {
    expect(monthlyStamp('2026-09-01', '2026-10-04T08:30:00.000Z')).toBe('September 2026 · read to the 4 Oct update')
    expect(monthlyStamp('2026-09-01', null)).toBe('September 2026')
    expect(readToWords(null)).toBeNull()
  })

  it('names the day the month stops moving, the same day the reading layer names', () => {
    expect(freezesOn('2026-09').slice(0, 10)).toBe('2026-10-31')
    expect(freezesOn('2026-02').slice(0, 10)).toBe('2026-03-31')
  })
})

describe('the subject line', () => {
  it('leads with the market, as the plan words it', () => {
    expect(monthlySubject('Sealand', '2026-09-01', 655)).toBe('Sealand · September in your market: 655 videos')
    expect(monthlySubject('Össur', '2026-09-01', 362)).toBe('Össur · September in your market: 362 videos')
  })

  it('names the month alone where the market was not counted, never a zero', () => {
    expect(monthlySubject('Sealand', '2026-09-01', null)).toBe('Sealand · September in your market')
    expect(monthlySubject('Sealand', '2026-09-01', Number.NaN)).toBe('Sealand · September in your market')
  })

  it('carries no share and no change', () => {
    const line = monthlySubject('Sealand', '2026-09-01', 655)
    expect(line).not.toContain('%')
    expect(line).not.toMatch(/\b(up|down|points?)\b/)
  })
})

describe('the next monthly (decision J, moved one update earlier by plan §3.7)', () => {
  const sundays = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })
  const line = (n: NonNullable<ReturnType<typeof nextMonthlyOf>>) => {
    const p = nextMonthlyParts(n)
    return `${p.lead}${p.title}${p.tail}`
  }

  it('reproduces September’s own dates: read to the 4 Oct update, sent Tue 6 Oct (option (b), decided 26 Sep)', () => {
    const sep = nextMonthlyOf('2026-08-01', sundays)!
    expect(sep.month).toBe('2026-09-01')
    expect(sep.readTo).toBe('2026-10-04T04:00:00.000Z')
    expect(sep.sendOn.slice(0, 10)).toBe('2026-10-06')
    expect(line(sep)).toBe('Next: “September in your market”, read to the 4 Oct update, on Tue 6 Oct.')
    expect(MONTHLY_UPDATES_PAST_END).toBe(1)
    expect(MONTHLY_SEND_DAYS_AFTER).toBe(2)
  })

  it('is October’s, read to the 1 Nov update and sent Tue 3 Nov, after September’s', () => {
    const next = nextMonthlyOf('2026-09-01', sundays)!
    expect(next.month).toBe('2026-10-01')
    expect(next.readTo.slice(0, 10)).toBe('2026-11-01')
    expect(next.sendOn.slice(0, 10)).toBe('2026-11-03')
    expect(line(next)).toBe('Next: “October in your market”, read to the 1 Nov update, on Tue 3 Nov.')
  })

  it('keeps the rule after the trial: November read to the 6 Dec update, sent Tue 8 Dec', () => {
    const nov = nextMonthlyOf('2026-10-01', sundays)!
    expect(nov.month).toBe('2026-11-01')
    expect(line(nov)).toBe('Next: “November in your market”, read to the 6 Dec update, on Tue 8 Dec.')
  })

  it('never names a date on the old calendar (11 Oct, Mon 12 Oct, 8 Nov, Mon 9 Nov)', () => {
    const lines = ['2026-08-01', '2026-09-01'].map((m) => line(nextMonthlyOf(m, sundays)!)).join(' ')
    expect(lines).not.toMatch(/11 Oct|12 Oct|8 Nov|9 Nov/)
  })

  it('promises nothing where no update is scheduled', () => {
    expect(nextMonthlyOf('2026-09-01', null)).toBeNull()
    expect(nextMonthlyOf('2026-09-01', () => null)).toBeNull()
  })
})

describe('leadVerdict', () => {
  it('takes the largest movement that actually cleared its band', () => {
    const lead = leadVerdict([
      verdict({ objectId: 'a', objectLabel: 'A', changePts: 2 }),
      verdict({ objectId: 'b', objectLabel: 'B', changePts: -6 }),
      verdict({ objectId: 'c', objectLabel: 'C', changePts: 9, state: 'no_clear_change' }),
    ])
    expect(lead?.objectLabel).toBe('B')
  })

  it('is null where nothing moved — not the biggest refusal', () => {
    expect(leadVerdict([
      verdict({ state: 'refused', changePts: null, refusedReason: 'clustering_changed' }),
      verdict({ state: 'too_little_data', changePts: null }),
    ])).toBeNull()
    expect(leadVerdict([])).toBeNull()
  })

  it('breaks a tie on the narrower band', () => {
    const lead = leadVerdict([
      verdict({ objectId: 'a', objectLabel: 'Wide', changePts: 4, bandPts: 3.9 }),
      verdict({ objectId: 'b', objectLabel: 'Narrow', changePts: -4, bandPts: 1.1 }),
    ])
    expect(lead?.objectLabel).toBe('Narrow')
  })
})

describe('shortMonth', () => {
  it('abbreviates the month without repeating the year', () => {
    expect(shortMonth('2026-09')).toBe('Sep')
  })
})

describe('the report of {date} read X', () => {
  it('prints the sent reading with its own denominator where the month has moved', () => {
    expect(sentReadingLine(sent(), 22)).toBe('the report of 1 Oct read 19.0% · 264 of 1,388')
  })

  it('says nothing where the figure has not moved', () => {
    expect(sentReadingLine(sent({ value: 22 }), 22)).toBeNull()
    expect(movedSince(sent({ value: 22 }), 22.04)).toBe(false)
    expect(movedSince(sent({ value: 22 }), 22 + MOVED_SINCE_PTS)).toBe(true)
  })

  // 0.3 − 0.2 is 0.09999999999999998, and so is 1.3 − 1.2: comparing the
  // difference of two floats against 0.1 missed 158 of the first 300
  // adjacent-tenth pairs, which is half the smallest moves a reader can see.
  it('sees every move of one printed tenth, floats notwithstanding', () => {
    for (let i = 0; i < 300; i += 1) {
      const from = i / 10
      expect(movedSince(sent({ value: from }), from + 0.1)).toBe(true)
    }
  })

  it('says nothing about a month that was already closed when it went out', () => {
    // A frozen month cannot have moved; a difference here is a bug somewhere
    // else, and not something to tell a client in a masthead.
    expect(sentReadingLine(sent({ monthStatus: 'frozen', value: 19 }), 22)).toBeNull()
  })

  it('prints a share without a denominator rather than inventing one', () => {
    expect(sentReadingLine(sent({ k: null, n: null }), 22)).toBe('the report of 1 Oct read 19.0%')
  })

  it('prints a count in its own unit', () => {
    expect(sentReadingLine(sent({ unit: 'videos', value: 1200, k: null, n: null }), 1388))
      .toBe('the report of 1 Oct read 1,200 videos')
  })
})
