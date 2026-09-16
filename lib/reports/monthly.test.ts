import { describe, expect, it } from 'vitest'
import type { Verdict } from '../reading/verdicts'
import {
  MONTHLY_BLOCK_KEYS,
  MONTHLY_EMAIL_WIDTH,
  MONTHLY_MOVERS,
  MONTHLY_RULE,
  MONTHLY_RULE_FROZEN,
  MOVED_SINCE_PTS,
  confirmingLine,
  freezesOn,
  leadVerdict,
  monthlyPeriod,
  monthlyRuleFor,
  monthlySubject,
  movedSince,
  sentReadingLine,
  seriesTrail,
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
  it('is eight sections, in the mock’s order', () => {
    expect(MONTHLY_BLOCK_KEYS).toEqual([
      'monthly.month',
      'monthly.subjects',
      'monthly.movers',
      'monthly.rivals',
      'monthly.moves',
      'monthly.voices',
      'monthly.decide',
      'monthly.sound',
    ])
  })

  it('names every key under one page, so a stored arrangement is legible', () => {
    for (const key of MONTHLY_BLOCK_KEYS) expect(key.startsWith('monthly.')).toBe(true)
    expect(new Set(MONTHLY_BLOCK_KEYS).size).toBe(MONTHLY_BLOCK_KEYS.length)
  })

  it('prints ten movers a side, which is what makes it not the weekly report', () => {
    expect(MONTHLY_MOVERS).toBe(10)
  })

  it('is the mock’s width', () => {
    expect(MONTHLY_EMAIL_WIDTH).toBe(640)
  })
})

describe('the rule printed on the artefact', () => {
  it('says the month keeps filling while it is filling', () => {
    expect(monthlyRuleFor('filling')).toBe(MONTHLY_RULE)
    expect(MONTHLY_RULE).toContain('keeps filling for thirty days')
  })

  it('says the opposite once it has closed', () => {
    expect(monthlyRuleFor('frozen')).toBe(MONTHLY_RULE_FROZEN)
    expect(MONTHLY_RULE_FROZEN).toContain('none of it will move again')
  })

  it('says in both arms that a month is dated by the comment', () => {
    for (const rule of [MONTHLY_RULE, MONTHLY_RULE_FROZEN]) {
      expect(rule).toContain('the day each comment was written')
      expect(rule).toContain('not by the day we read it')
    }
  })
})

describe('the masthead', () => {
  it('names the month, the reading date and the day the month closes', () => {
    const line = monthlyPeriod('2026-09', 'filling', '2026-10-01T06:00:00.000Z')
    expect(line).toBe('September · reading as at 1 Oct 2026 · still filling until 31 Oct 2026')
  })

  it('says a closed month is closed rather than naming a date in the past', () => {
    expect(monthlyPeriod('2026-07', 'frozen', '2026-09-16T05:00:00.000Z'))
      .toBe('July · reading as at 16 Sep 2026 · closed')
  })

  it('names the day the month stops moving, the same day OV6 names', () => {
    // September ends 30 Sep; the freeze line is thirty days later. This is
    // read from the reading layer rather than counted here, so it cannot
    // drift from the trigger that enforces it.
    expect(freezesOn('2026-09').slice(0, 10)).toBe('2026-10-31')
    expect(freezesOn('2026-02').slice(0, 10)).toBe('2026-03-31')
  })
})

describe('the subject line', () => {
  it('leads with the largest banded change, its size and its direction', () => {
    expect(monthlySubject('Sealand', '2026-09', verdict({ changePts: 3 })))
      .toBe('Sealand: September — Durability up 3 points')
  })

  it('says down for a fall, and prints one point in the singular', () => {
    expect(monthlySubject('Sealand', '2026-09', verdict({ objectLabel: 'Price', changePts: -1 })))
      .toBe('Sealand: September — Price down 1 point')
  })

  it('does not manufacture a movement when nothing cleared a band', () => {
    expect(monthlySubject('Sealand', '2026-09', null)).toBe('Sealand: September — where you stand')
    expect(monthlySubject('Sealand', '2026-09', verdict({ state: 'no_clear_change' })))
      .toBe('Sealand: September — where you stand')
    expect(monthlySubject('Sealand', '2026-09', verdict({ state: 'too_little_data', changePts: null })))
      .toBe('Sealand: September — where you stand')
  })

  it('never prints a bare share', () => {
    const line = monthlySubject('Össur', '2026-09', verdict())
    expect(line).not.toContain('%')
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

describe('the series trail under a mover row', () => {
  const p = (pct: number, n: number) => ({ pct, n })

  // RULE (b) OVER SIX LEVELS. The trail used to read "Jul 5.1% → Aug 6.8% →
  // Sep 9.4%" — up to six levels with no "of N" anywhere, ten rows a side, on
  // the one artefact a client reads unaccompanied.
  it('reads as the mock prints it, with every point’s denominator', () => {
    expect(seriesTrail(['2026-07', '2026-08', '2026-09'], [p(5.1, 1349), p(6.8, 1388), p(9.4, 1388)]))
      .toBe('Jul 5.1% of 1,349 → Aug 6.8% of 1,388 → Sep 9.4% of 1,388')
  })

  it('names a month with no reading and leaves it blank — never closes the gap', () => {
    expect(seriesTrail(['2026-07', '2026-08', '2026-09'], [null, p(6.8, 1388), p(9.4, 1388)]))
      .toBe('Jul — → Aug 6.8% of 1,388 → Sep 9.4% of 1,388')
  })

  it('is empty rather than misleading when it has no months', () => {
    expect(seriesTrail([], [])).toBe('')
  })

  // A ROW OF DASHES IS NOT A READING. Every month under the floor comes back
  // null, so a mover nobody could read anywhere in the span prints no line
  // rather than "Apr — → May — → Jun —".
  it('is empty where no month in the span could be read', () => {
    expect(seriesTrail(['2026-07', '2026-08'], [null, null])).toBe('')
  })

  it('reads only as far as the shorter of the two lists', () => {
    expect(seriesTrail(['2026-08', '2026-09'], [p(6.8, 1388)])).toBe('Aug 6.8% of 1,388')
  })

  it('abbreviates the month without repeating the year', () => {
    expect(shortMonth('2026-09')).toBe('Sep')
  })
})

describe('the report of {date} read X', () => {
  it('prints the sent reading with its own denominator where the month has moved', () => {
    expect(sentReadingLine(sent(), 22)).toBe('the report of 1 Oct read 19% · 264 of 1,388')
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
    expect(sentReadingLine(sent({ k: null, n: null }), 22)).toBe('the report of 1 Oct read 19%')
  })

  it('prints a count in its own unit', () => {
    expect(sentReadingLine(sent({ unit: 'videos', value: 1200, k: null, n: null }), 1388))
      .toBe('the report of 1 Oct read 1,200 videos')
  })
})

describe('next month’s confirming line', () => {
  const closed = (value: number, frozen = true) => ({ value, frozen })

  it('says what the month closed at, and what we had said', () => {
    expect(confirmingLine('2026-09', sent(), closed(22))).toBe(
      'September has closed at 22%. The report of 1 Oct read 19%; the rest of the month has since been counted.',
    )
  })

  it('confirms rather than corrects where the number held', () => {
    expect(confirmingLine('2026-09', sent({ value: 22 }), closed(22))).toBe(
      'September has closed at 22%, which is what the report of 1 Oct read.',
    )
  })

  it('has nothing to confirm where nothing was sent, or nothing has closed', () => {
    expect(confirmingLine('2026-09', null, closed(22))).toBeNull()
    expect(confirmingLine('2026-09', sent(), null)).toBeNull()
  })

  it('adds nothing where the artefact already printed the final figure', () => {
    expect(confirmingLine('2026-09', sent({ monthStatus: 'frozen' }), closed(22))).toBeNull()
  })

  // A month keeps filling for thirty days after it ends, and nothing ties this
  // artefact to the 1st: an every_update schedule pointed at the monthly
  // report sends it on a Sunday, and a preview can be built any day. Saying
  // "August has closed at 7.1%" on 10 September is the claim the frozen-month
  // rules exist to make impossible.
  it('will not say a month has closed while it is still filling', () => {
    expect(confirmingLine('2026-09', sent(), closed(22, false))).toBeNull()
  })
})
