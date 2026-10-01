import { describe, expect, it } from 'vitest'

import { substituteFigures } from '../reports/cover'
import { weekReadDates } from '../reports/weekly-read'
import { postPeriods, companyLines, type CompanyContext } from './company'
import { composeWeekRead, evidenceLine, marketFigureTable } from './compose'
import { coveredDays, inMonth, monthHeading, readingMonthOf } from './month'
import { candidate, pool, written } from './test-fixtures'
import { weekPromptLine, writerFigures, writerSubjects } from './write'

// The week and the month it is restated against (the lead's rulings on review
// M1 and M2, 1 Oct). The Sunday windows below are Sealand's real cadence: the
// run opens at about 04:03 UTC, and its window is the seven days before.

const SEP_27 = { from: '2026-09-20T04:02:57.874Z', to: '2026-09-27T04:03:42.768Z' }   // inside September
const OCT_04 = { from: '2026-09-27T04:03:42.768Z', to: '2026-10-04T04:02:10.000Z' }   // crosses into October
const OCT_11 = { from: '2026-10-04T04:02:10.000Z', to: '2026-10-11T04:03:00.000Z' }   // wholly in October
const NOV_01 = { from: '2026-10-25T04:03:00.000Z', to: '2026-11-01T04:02:00.000Z' }   // crosses into November

const plain = (s: { body: string; figures: Parameters<typeof substituteFigures>[1] }) =>
  substituteFigures(s.body, s.figures).map((p) => ('text' in p ? p.text : p.figure)).join('')

describe('M1: the days a window holds are comment DATES', () => {
  it('[Sun 27 Sep 04:03, Sun 4 Oct 04:02) holds 28 September to 4 October: a comment dated 27 September sits at 00:00, before the window opens', () => {
    expect(coveredDays(OCT_04)).toEqual({ first: '2026-09-28', last: '2026-10-04', days: 7 })
    expect(weekReadDates(OCT_04)).toBe('28 September to 4 October')
  })
  it('and the 27 Sep run held 21 to 27 September', () => {
    expect(coveredDays(SEP_27)).toEqual({ first: '2026-09-21', last: '2026-09-27', days: 7 })
    expect(weekReadDates(SEP_27)).toBe('21 to 27 September')
  })
})

describe('M2: the month a week is restated against', () => {
  it('a week that started in September and ended in October is restated against September, IN FULL', () => {
    expect(readingMonthOf(OCT_04)).toEqual({ month: '2026-09-01', complete: true, to: '2026-10-01T00:00:00.000Z', endMonth: '2026-10-01' })
    expect(readingMonthOf(NOV_01)).toEqual({ month: '2026-10-01', complete: true, to: '2026-11-01T00:00:00.000Z', endMonth: '2026-11-01' })
  })
  it('a week wholly inside one month is restated against that month so far, to the window\'s end', () => {
    expect(readingMonthOf(SEP_27)).toEqual({ month: '2026-09-01', complete: false, to: SEP_27.to, endMonth: '2026-09-01' })
    expect(readingMonthOf(OCT_11)).toEqual({ month: '2026-10-01', complete: false, to: OCT_11.to, endMonth: '2026-10-01' })
  })
  it('the words: "in September" and "September in total" for the crossing week, "so far" for the contained one', () => {
    expect(inMonth('2026-09-01', true)).toBe('in September')
    expect(inMonth('2026-10-01', false)).toBe('in October so far')
    expect(monthHeading('2026-09-01', true)).toBe('September in total')
    expect(monthHeading('2026-10-01', false)).toBe('October so far')
  })
})

describe('M2 everywhere: the evidence lines, the Dashboard figures, the writer, the census', () => {
  const crossing = pool([candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })], { window: OCT_04, month: '2026-09-01', monthComplete: true, market: { week: { videos: 274, comments: 4777 }, month: { videos: 852, comments: 21468 } } })
  const contained = pool([candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })], { window: OCT_11, month: '2026-10-01', market: { week: { videos: 120, comments: 2000 }, month: { videos: 180, comments: 3100 } } })
  const read = (p: typeof crossing) => composeWeekRead({
    pool: p,
    standing: [],
    written: written({
      findings: [{ headline: 'Buyers weigh the price', saw: 'They say so.', means: 'It decides the sale.', based_on: ['C1'], quote_from: null }],
      week_in_one_line: 'The week turns on price.',
    }),
    subjects: writerSubjects([]),
    writerFigures: writerFigures(p),
    model: 'gpt-5.4',
    costUsd: 0.2,
  })

  it('the crossing week: "7 videos this week · 16 in September", and the stored read says the month is whole', () => {
    const r = read(crossing)
    expect(r.findings[0].evidence).toBe('[[f1_week]] videos this week · [[f1_month]] in September')
    expect(r.figures.f1_month.label).toMatch(/^videos in September behind /)
    expect(r.figures.market_month_videos.label).toBe('videos in your market in September')
    expect(r.monthComplete).toBe(true)
    expect(plain(evidenceLine('f1', { week: 7, month: 16 }, 'x', '2026-09-01', true))).toBe('7 videos this week · 16 in September')
  })
  it('the contained week: "in October so far", and nothing extra stored', () => {
    const r = read(contained)
    expect(r.findings[0].evidence).toBe('[[f1_week]] videos this week · [[f1_month]] in October so far')
    expect(r.figures.market_month_comments.label).toBe('comments in your market in October so far')
    expect(r.monthComplete).toBeUndefined()
    expect(marketFigureTable(contained.market, '2026-10-01').market_month_videos.label).toBe('videos in your market in October so far')
  })
  it("the writer's figures and its week line", () => {
    expect(writerFigures(crossing).c1_month.label).toMatch(/^videos in September in which/)
    expect(writerFigures(contained).c1_month.label).toMatch(/^videos in October so far in which/)
    expect(weekPromptLine(crossing)).toBe('The week: the latest seven days, from the end of September into the start of October. "This month" below means September, the whole month.')
    expect(weekPromptLine(contained)).toBe('The week: the latest seven days, in October.')
  })
  it("the company's own posts: the whole of September for the crossing week, October so far for the contained one", () => {
    expect(postPeriods(OCT_04)).toEqual({ week: { from: '2026-09-27', to: '2026-10-04' }, month: { from: '2026-09-01', to: '2026-10-01' } })
    expect(postPeriods(OCT_11).month).toEqual({ from: '2026-10-01', to: '2026-10-11' })
    const ctx: CompanyContext = { sells: { noun: null, description: null, keywords: [] }, claims: [], posts: { week: 1, month: 3 } }
    expect(companyLines('Sealand', ctx, '2026-09-01', true)).toContain('Sealand published posts of its own in September.')
    expect(companyLines('Sealand', ctx, '2026-10-01', false)).toContain('Sealand published posts of its own in October so far.')
  })
})
