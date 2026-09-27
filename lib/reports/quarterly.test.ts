import { describe, expect, it } from 'vitest'

import { DIRECTION_WORDS } from '../test/copy-contract'
import { quarterKey } from '../schedules/due'
import {
  REVIEW_TZ,
  QUARTERLY_BLOCK_KEYS,
  QUARTERLY_RULE,
  QUARTER_PAGE_KINDS,
  QUARTER_PAGE_QUESTION,
  QUARTER_PAGE_TITLE,
  QUARTER_READINGS_NEEDED,
  firstQuarterVerdictMonth,
  isQuarterlyBlockKey,
  monthsSoFar,
  previousQuarter,
  quarterAgainst,
  quarterFilling,
  quarterFor,
  quarterGateSentence,
  quarterLabel,
  quarterOfIn,
  quarterToReview,
  quarterUnlocked,
  quarterlyPeriod,
  quarterlySubject,
  quarterlyTitle,
} from './quarterly'

describe('the eight pages', () => {
  it('names eight, in the design order', () => {
    expect(QUARTER_PAGE_KINDS).toEqual(['cover', 'read', 'subjects', 'category', 'rivals', 'moves', 'method', 'unsettled'])
    expect(QUARTERLY_BLOCK_KEYS).toHaveLength(8)
    expect(QUARTERLY_BLOCK_KEYS[0]).toBe('quarterly.cover')
    expect(QUARTERLY_BLOCK_KEYS[7]).toBe('quarterly.unsettled')
  })

  it('gives every page a title and a question', () => {
    for (const kind of QUARTER_PAGE_KINDS) {
      expect(QUARTER_PAGE_TITLE[kind].length).toBeGreaterThan(0)
      expect(QUARTER_PAGE_QUESTION[kind].endsWith('?')).toBe(true)
    }
  })

  it('recognises its own keys and nothing else', () => {
    expect(isQuarterlyBlockKey('quarterly.method')).toBe(true)
    expect(isQuarterlyBlockKey('weekly.coverage')).toBe(false)
    expect(isQuarterlyBlockKey('quarterly.nonesuch')).toBe(false)
  })

  it('puts no direction word in a heading or a question', () => {
    // Copy contract rule (c): a claim made before any row has earned one.
    const words = new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i')
    for (const kind of QUARTER_PAGE_KINDS) {
      expect(QUARTER_PAGE_TITLE[kind]).not.toMatch(words)
      expect(QUARTER_PAGE_QUESTION[kind]).not.toMatch(words)
    }
  })
})

describe('the quarter', () => {
  it('names the quarter an instant falls in, on the artefact’s own clock', () => {
    expect(quarterOfIn('2026-09-16T05:00:00Z')).toMatchObject({ year: 2026, q: 3, from: '2026-07-01', to: '2026-09-30' })
    expect(quarterOfIn('2026-01-01T12:00:00Z').q).toBe(1)
    expect(quarterOfIn('2026-03-31T12:00:00Z').q).toBe(1)
    expect(quarterOfIn('2026-04-01T12:00:00Z').q).toBe(2)
    expect(quarterOfIn('2026-12-31T12:00:00Z')).toMatchObject({ q: 4, from: '2026-10-01', to: '2026-12-31' })
  })

  it('ends each quarter on its own last day, February included', () => {
    expect(quarterFor(2026, 1).to).toBe('2026-03-31')
    expect(quarterFor(2026, 2).to).toBe('2026-06-30')
    expect(quarterFor(2028, 1).months[1]).toBe('2028-02-01')
    // A leap February is inside Q1, so the quarter's end never touches it —
    // but the arithmetic that finds 31 March must not be calendar-naive.
    expect(quarterFor(2028, 1).to).toBe('2028-03-31')
  })

  it('steps back across the year boundary', () => {
    expect(previousQuarter(quarterFor(2026, 3))).toMatchObject({ year: 2026, q: 2 })
    expect(previousQuarter(quarterFor(2026, 1))).toMatchObject({ year: 2025, q: 4, from: '2025-10-01', to: '2025-12-31' })
  })

  it('labels a quarter the way the masthead does', () => {
    expect(quarterLabel(quarterFor(2026, 3))).toBe('Q3 2026 (Jul–Sep)')
    expect(quarterLabel(quarterFor(2026, 3), false)).toBe('Q3 2026')
    expect(quarterAgainst(quarterFor(2026, 1), quarterFor(2025, 4))).toBe('Q1 2026 (Jan–Mar) against Q4 2025 (Oct–Dec)')
  })

  it('counts only the months the reading date has reached', () => {
    const q = quarterFor(2026, 3)
    expect(monthsSoFar(q, '2026-09-16T00:00:00Z')).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(monthsSoFar(q, '2026-08-02T00:00:00Z')).toEqual(['2026-07-01', '2026-08-01'])
    expect(monthsSoFar(q, '2026-06-30T00:00:00Z')).toEqual([])
  })

  it('knows when the quarter it is reading is still running', () => {
    const q = quarterFor(2026, 3)
    expect(quarterFilling(q, '2026-09-16T05:00:00Z')).toBe(true)
    // 23:00 UTC on 30 September is ALREADY 1 October in SAST, which is the
    // clock `quarterOfIn` and `scheduleDue` keep — so the quarter is over.
    // Sliced off the UTC day this answered `true` while `quarterToReview` had
    // already moved on, and the masthead said "Q3 still filling" on a review
    // of Q3 that the schedule had fired as a new quarter's send.
    expect(quarterFilling(q, '2026-09-30T23:00:00Z')).toBe(false)
    expect(quarterFilling(q, '2026-09-30T20:00:00Z')).toBe(true)
    expect(quarterFilling(q, '2026-10-01T00:00:00Z')).toBe(false)
  })

  it('reviews the quarter that CLOSED, never the one that has just begun', () => {
    // The defect this replaces: a first quarterly send on 5 October built
    // "Q4 2026 (Oct–Dec) against Q3 2026 · October still filling" over four
    // days of comment.
    expect(quarterToReview('2026-10-05T09:00:00Z')).toMatchObject({ year: 2026, q: 3, from: '2026-07-01', to: '2026-09-30' })
    expect(quarterToReview('2026-09-16T09:00:00Z')).toMatchObject({ year: 2026, q: 2 })
    expect(quarterToReview('2027-01-04T09:00:00Z')).toMatchObject({ year: 2026, q: 4 })
    // A reviewed quarter is never still filling, whatever the reading date.
    for (const day of ['2026-10-01T00:30:00Z', '2026-11-20T09:00:00Z', '2026-12-31T21:00:00Z']) {
      expect(quarterFilling(quarterToReview(day), day)).toBe(false)
    }
  })

  // ONE CLOCK, AND ALL OF IT. `quarterOfIn` / `quarterToReview` / `quarterKey`
  // read SAST; `quarterFilling` and `monthsSoFar` sliced the UTC day, so in the
  // two hours after 22:00 UTC on a quarter's last day the send reviewed the new
  // quarter's predecessor while the masthead called the OLD quarter "still
  // filling" and counted its last month as the one in progress.
  it('fills and counts months on the same clock it names quarters on', () => {
    const q3 = quarterFor(2026, 3)
    const boundary = '2026-09-30T22:30:00Z' // 1 October in SAST
    expect(quarterOfIn(boundary)).toMatchObject({ year: 2026, q: 4 })
    expect(quarterFilling(q3, boundary)).toBe(false)
    expect(monthsSoFar(q3, boundary)).toEqual(q3.months)
    // Read in UTC it is still September, and every one of the three agrees.
    expect(quarterOfIn(boundary, 'UTC')).toMatchObject({ year: 2026, q: 3 })
    expect(quarterFilling(q3, boundary, 'UTC')).toBe(true)
    // Well inside the quarter nothing changed.
    expect(quarterFilling(q3, '2026-09-16T05:00:00Z')).toBe(true)
    expect(monthsSoFar(q3, '2026-08-16T05:00:00Z')).toEqual(['2026-07-01', '2026-08-01'])
  })

  it('keeps one clock with the schedule that fires it', () => {
    // 2026-09-30T22:30Z is 1 October in SAST: the schedule calls it Q4 and
    // fires, so the artefact must call it Q4 too and review Q3. Read in UTC
    // it is still September, and the review would have been of Q2.
    expect(quarterOfIn('2026-09-30T22:30:00Z')).toMatchObject({ year: 2026, q: 4 })
    expect(quarterToReview('2026-09-30T22:30:00Z')).toMatchObject({ year: 2026, q: 3 })
    expect(quarterKey('2026-09-30T22:30:00Z', REVIEW_TZ)).toBe('2026-Q4')
    // A timezone the caller names is honoured, so the pair cannot drift.
    expect(quarterOfIn('2026-09-30T22:30:00Z', 'UTC')).toMatchObject({ year: 2026, q: 3 })
  })
})

describe('the six-month gate', () => {
  it('is six', () => {
    expect(QUARTER_READINGS_NEEDED).toBe(6)
  })

  it('says the sentence the plan asks for, with the count', () => {
    expect(quarterGateSentence(3)).toBe('Quarter against quarter needs six months: you have 3.')
    expect(quarterGateSentence(0)).toContain('you have 0.')
  })

  it('unlocks at six and not before', () => {
    expect(quarterUnlocked(5)).toBe(false)
    expect(quarterUnlocked(6)).toBe(true)
    expect(quarterUnlocked(12)).toBe(true)
  })

  it('names the month the first quarter verdict lands in', () => {
    // Three readings, the latest September: October, November, December make six.
    expect(firstQuarterVerdictMonth(3, '2026-09-01')).toBe('2026-12-01')
    expect(firstQuarterVerdictMonth(5, '2026-09-01')).toBe('2026-10-01')
    expect(firstQuarterVerdictMonth(6, '2026-09-01')).toBeNull()
    expect(firstQuarterVerdictMonth(0, '2026-09-01')).toBeNull()
    expect(firstQuarterVerdictMonth(3, null)).toBeNull()
  })
})

describe('what the artefact says about itself', () => {
  it('prints its rule with no direction word and no bare figure', () => {
    expect(QUARTERLY_RULE).toContain('what it is out of')
    expect(QUARTERLY_RULE).not.toMatch(/\d/)
  })

  it('titles and periods a quarter under way', () => {
    const q = quarterFor(2026, 3)
    expect(quarterlyTitle('Sealand', q)).toBe('Sealand · quarterly review · Q3 2026')
    expect(quarterlyPeriod(q, previousQuarter(q), '2026-09-16T00:00:00Z')).toBe(
      'Q3 2026 (Jul–Sep) against Q2 2026 (Apr–Jun) · September still filling',
    )
    expect(quarterlyPeriod(q, previousQuarter(q), '2026-10-05T00:00:00Z')).toBe(
      'Q3 2026 (Jul–Sep) against Q2 2026 (Apr–Jun)',
    )
  })

  it('says in the subject line when the tenant’s own side is not readable yet', () => {
    const q = quarterFor(2026, 3)
    expect(quarterlySubject('Sealand', q, 3)).toBe('Sealand: your quarterly review · Q3 2026 (your own side is still forming)')
    expect(quarterlySubject('Össur', q, 8)).toBe('Össur: your quarterly review · Q3 2026')
  })

  it('puts no direction word and no digit-bearing claim in the subject line', () => {
    const words = new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'i')
    expect(quarterlySubject('Sealand', quarterFor(2026, 3), 3)).not.toMatch(words)
  })
})

// ── WP3.11: the gate, the quarter pair, the quarter's own month ─────────────

import { floorClearingMonths, nextQuarter, quarterPageMonth, quarterPairOf, quarterPairSentence, quarterVerdict } from './quarterly'
import { pairOn } from '../reading/pairs'
import { sealandJudge } from '../test/sealand-pairs'
import type { PairComparability } from '../reading/comparability'

describe('a quarterly built at a 2026-10-02 clock (WP3.11)', () => {
  const ON = '2026-10-02T06:00:00.000Z'
  it('reviews Q3 and reads its pages on September, never October', () => {
    const q = quarterToReview(ON)
    expect(quarterLabel(q)).toBe('Q3 2026 (Jul–Sep)')
    expect(quarterPageMonth(q, ON)).toBe('2026-09')
    // An operator's preview of the quarter in progress reads the month in hand.
    expect(quarterPageMonth(quarterFor(2026, 4), '2026-11-18T09:00:00.000Z')).toBe('2026-11')
  })
})

describe('the gate counts floor-clearing months (H19)', () => {
  // Sealand's market (decision E): July 36 (category and Cotopaxi, frozen),
  // August 377 (351 in the category, 22 Cotopaxi, 4 Freitag; DR F11),
  // September 655 (626 and 29; prod), the client's own 9 left out.
  const rows = [
    { month: '2026-07-01', audience: 'industry-other', videos: 35 }, { month: '2026-07-01', audience: 'competitor:Cotopaxi', videos: 1 },
    { month: '2026-08-01', audience: 'industry-other', videos: 351 }, { month: '2026-08-01', audience: 'competitor:Cotopaxi', videos: 22 }, { month: '2026-08-01', audience: 'competitor:Freitag', videos: 4 },
    { month: '2026-09-01', audience: 'industry-other', videos: 626 }, { month: '2026-09-01', audience: 'competitor:Cotopaxi', videos: 29 },
    { month: '2026-09-01', audience: 'client', videos: 9 },
  ]
  const rivals = ['competitor:Cotopaxi', 'competitor:Freitag']

  it('counts August and September, not July’s 36, whatever rows exist', () => {
    expect(floorClearingMonths(rows, rivals)).toEqual(['2026-08-01', '2026-09-01'])
    expect(floorClearingMonths(rows, rivals, '2026-08-31')).toEqual(['2026-08-01'])
  })

  it('never counts the client’s own posts toward the market', () => {
    expect(floorClearingMonths([{ month: '2026-09-01', audience: 'client', videos: 120 }], rivals)).toEqual([])
  })
})

describe('Q4 against Q3 is refused by comparability (WP3.11)', () => {
  // Read in January 2027, when Q4 has closed: every step from July to
  // December goes through Sealand's real change log.
  const judge = pairOn(sealandJudge('2027-01-04T06:00:00.000Z'))
  const Q3 = quarterFor(2026, 3)
  const Q4 = nextQuarter(Q3)
  const pair = quarterPairOf(Q3, Q4, (a, b) => judge(a, b, 'market'))

  it('refuses the pair, naming our September search change', () => {
    expect(pair.mode).toBe('refuse')
    expect(quarterPairSentence(pair)).toBe('Q4 2026 against Q3 2026 is not read as a change: we changed our searches in September.')
  })

  it('refuses a verdict across it even with the gate open, and never says "moved"', () => {
    // Looks & style's real counts (38 of 351, 104 of 626) standing in for a
    // quarter's window; readings 6 opens the gate.
    const v = quarterVerdict({
      object: { kind: 'subject', id: 's1', label: 'Looks & style' },
      audience: 'industry-other',
      window: { kind: 'quarter', from: Q4.from, to: Q4.to },
      basis: { from: Q3.from, to: Q3.to },
      value: { k: 104, n: 626 },
      baseline: { k: 38, n: 351 },
      readings: 6,
    }, pair)
    expect(v.state).toBe('refused')
    expect(v.changePts).toBeNull()
    expect(v.value).toEqual({ k: 104, n: 626 })
    expect(v.baseline).toEqual({ k: 38, n: 351 })
    expect(v.pair?.cause).toBe('searches')
  })

  it('lets the gate decide a pair read the same way (HYPOTHETICAL: every step comparable)', () => {
    const same = (prevMonth: string, month: string): PairComparability => ({ prevMonth, month, mode: 'comparable', reasons: [], row: null })
    const Q1 = nextQuarter(Q4)
    const p = quarterPairOf(Q4, Q1, same)
    expect(p.mode).toBe('comparable')
    expect(quarterPairSentence(p)).toBeNull()
    const v = quarterVerdict({
      object: { kind: 'subject', id: 's1', label: 'Looks & style' }, audience: 'industry-other',
      window: { kind: 'quarter', from: Q1.from, to: Q1.to }, basis: { from: Q4.from, to: Q4.to },
      value: { k: 104, n: 626 }, baseline: { k: 38, n: 351 }, readings: 5,
    }, p)
    expect(v.state).toBe('baseline_forming')
  })
})
