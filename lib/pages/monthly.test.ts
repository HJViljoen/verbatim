import { describe, expect, it } from 'vitest'
import {
  MONTHLY_SPARK_MONTHS,
  briefStaleLine,
  monthlyStatusOf,
  nextReadingOf,
  spanOf,
  sparkMonths,
  voiceNote,
  type BriefLink,
} from './monthly'

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
  // Two, not three: the loader filters to active subjects, so the arm that
  // said "not counted yet" could only ever be reached by a test calling it
  // directly. A workspace with no confirmed subject is answered by the
  // section's own note.
  it('tells the two silences apart', () => {
    expect(voiceNote({ citations: 0, readable: 0 }))
      .toBe('nothing was said about this one this month')
    expect(voiceNote({ citations: 12, readable: 0 }))
      .toBe('what was said this month could not be quoted — too short, or nothing but a handle')
  })

  it('says nothing where there is a voice to print', () => {
    expect(voiceNote({ citations: 12, readable: 4 })).toBeNull()
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
