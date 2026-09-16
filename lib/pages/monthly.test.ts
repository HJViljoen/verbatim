import { describe, expect, it } from 'vitest'
import {
  MONTHLY_SPARK_MONTHS,
  briefStaleLine,
  monthlyStatusOf,
  nextReadingOf,
  pickLed,
  spanOf,
  sparkMonths,
  voiceNote,
  type BriefLink,
  type ReadableSent,
} from './monthly'

const sent = (over: Partial<ReadableSent> = {}): ReadableSent => ({
  snapshotId: 's1',
  month: '2026-08',
  audience: 'industry',
  objectKind: 'theme',
  objectId: 't1',
  label: 'Durability',
  value: 7.1,
  unit: 'pct',
  measure: 'videos',
  k: 99,
  n: 1388,
  denominator: 'the category’s videos this month',
  changePts: null,
  bandPts: 2,
  verdict: 'no_clear_change',
  direction: null,
  monthStatus: 'filling',
  artefact: 'monthly',
  readingAt: '2026-10-01T06:00:00.000Z',
  sentAt: '2026-10-01T06:02:00.000Z',
  ...over,
})

describe('the months a mover’s line is drawn on', () => {
  it('is this month and the five before it, oldest first', () => {
    // A month is its first day, which is how the reading layer keys one and
    // what `pointsByMonth` is indexed by.
    expect(sparkMonths('2026-09-01')).toEqual([
      '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01',
    ])
    expect(sparkMonths('2026-09-01')).toHaveLength(MONTHLY_SPARK_MONTHS)
  })

  it('crosses a year without losing a month', () => {
    expect(sparkMonths('2026-02-01', 4)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'])
  })

  it('names the span for the block’s meta line', () => {
    expect(spanOf(sparkMonths('2026-09-01'))).toBe('Apr – Sep')
    expect(spanOf(['2026-09-01'])).toBe('Sep')
    expect(spanOf([])).toBe('')
  })
})

describe('why a subject shows no voice', () => {
  // Four, and the loader can reach all four: nothing said at all, nothing
  // quotable in the corpus, nothing quotable IN THIS MONTH (the pool is dated
  // by the comment), and a voice this artefact has already printed under
  // another subject. A workspace with no confirmed subject is answered one
  // level up, by the section's own note.
  it('tells the silences apart', () => {
    expect(voiceNote({ citations: 0, readable: 0, inMonth: 0 }))
      .toBe('nothing has been said about this one yet')
    expect(voiceNote({ citations: 12, readable: 0, inMonth: 0 }))
      .toBe('what was said about this one could not be quoted — too short, or nothing but a handle')
    expect(voiceNote({ citations: 12, readable: 4, inMonth: 0 }))
      .toBe('nothing quotable was said about this one this month')
  })

  // Only the arm that IS about the month may name one: the other two are
  // readings of the whole corpus, and the citations behind them carry comment
  // dates from any month.
  it('names the month in the one arm the month is about', () => {
    expect(voiceNote({ citations: 0, readable: 0, inMonth: 0 })).not.toContain('this month')
    expect(voiceNote({ citations: 12, readable: 0, inMonth: 0 })).not.toContain('this month')
    expect(voiceNote({ citations: 12, readable: 4, inMonth: 0 })).toContain('this month')
  })

  // A row with no voice and no note renders an empty paragraph under a
  // subject's name, which reads as a bug rather than as a silence.
  it('always says something, including when the voice went to another subject', () => {
    expect(voiceNote({ citations: 12, readable: 4, inMonth: 2 }))
      .toBe('the voices from this month are already quoted above')
  })
})

describe('the next reading', () => {
  it('is the first of the month after this one, so a decision has a deadline', () => {
    expect(nextReadingOf('2026-09-01').slice(0, 10)).toBe('2026-10-01')
    expect(nextReadingOf('2026-12-01').slice(0, 10)).toBe('2027-01-01')
  })
})

describe('the brief attached by link', () => {
  const brief = (over: Partial<BriefLink> = {}): BriefLink => ({
    title: 'Marketing brief',
    href: '/r/abc',
    public: true,
    locked: false,
    builtAt: '2026-09-12T08:25:00.000Z',
    stale: true,
    ...over,
  })

  it('says when the attached brief is not this reading’s', () => {
    expect(briefStaleLine(brief())).toBe('Built 12 Sep, before this reading — the numbers in it are that day’s.')
  })
})

describe('a month’s status is one vocabulary', () => {
  it('passes straight through, because the two types are the same two strings', () => {
    expect(monthlyStatusOf('filling')).toBe('filling')
    expect(monthlyStatusOf('frozen')).toBe('frozen')
  })
})

describe("the object last month's report led with", () => {
  it('is the largest movement that cleared its band', () => {
    const led = pickLed([
      sent({ objectId: 't1', verdict: 'moved', changePts: 2.2 }),
      sent({ objectId: 't2', verdict: 'moved', changePts: -5.1 }),
    ])
    expect(led?.objectId).toBe('t2')
  })

  // The confirming line says "<label> — September has closed at X, which is
  // what the report of 1 Oct read." A month in which nothing cleared its band
  // has no lead, and the fallback named whichever row came back first — a
  // sentence about an object the artefact never led with.
  it('is nothing where nothing moved', () => {
    expect(pickLed([sent({ objectId: 't1' }), sent({ objectId: 't2' })])).toBeNull()
    expect(pickLed([])).toBeNull()
  })

  it('does not count a refusal as a movement', () => {
    expect(pickLed([sent({ verdict: 'refused', changePts: 9 })])).toBeNull()
  })
})
