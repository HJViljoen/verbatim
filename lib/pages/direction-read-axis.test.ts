import { describe, expect, it } from 'vitest'

import { directionWord, type SeriesPoint } from '../reading/bands'
import type { PairRow } from '../reading/comparability'
import { horizonWindow, readAxisOf } from '../reading/horizon'
import { comparableOn, laterMonthOf, pairOn, type PairOn, type UpdateRun } from '../reading/pairs'
import { readingAnchor, readingMonthFor } from '../reading/reading-month'
import { buildSeries, type DenominatorPoint, type MonthSeries } from '../reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { JUDGE_VERSION, type Subject } from '../subjects/types'
import { HYPOTHETICAL_RISING_RUN, HYPOTHETICAL_SAME_WAY } from '../test/pair-fixture'
import { CHANGES, SEALAND_SCHEDULE, SEALAND_UPDATES, sealandJudge } from '../test/sealand-pairs'
import { buildSubjects, type StoredSubjectRow } from './overview'
import { buildSides } from './subjects'

// THE THREE-MONTH READ AXIS, ON THE PAGES (market-first WP3.4, plan §2.11 and
// §5.7). The default horizon draws the reading month and reads it with the two
// months before it, so a direction word can be earned on the view every reader
// opens first; every step of the three must be a pair read the same way
// (`comparable`, decision D) and the newest month must have ended.
//
// REAL WHERE ANYTHING IS REAL. Sealand's change log, updates and schedule are
// lib/test/sealand-pairs.ts. Looks & style's calibration is staging's
// (0.857 of 33, 24 Sep: ready). October to December have not happened: their
// counts are HYPOTHETICAL_RISING_RUN (38, 60 and 90 of 377, August's real
// Looks & style count and market n, re-dated) and their pair rows are
// HYPOTHETICAL_SAME_WAY re-dated, both labelled in lib/test/pair-fixture.ts.
// The depth medians 23 and 15 are DR F39's real August and September.

const OCT = '2026-10-01'
const NOV = '2026-11-01'
const DEC = '2026-12-01'

/** Sealand's updates, on to the end of January (the Sunday 06:00 SAST slot). */
const UPDATES: UpdateRun[] = [
  ...SEALAND_UPDATES,
  ...['2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31'].map((d) => ({ id: `run-${d}`, finishedAt: `${d}T08:30:00.000Z` })),
]

/** A pair read the same way (HYPOTHETICAL_SAME_WAY), re-dated, read through
 *  the later month's latest update at the clock, with its depth. */
const sameWay = (prevMonth: string, month: string, now: string, depth = { prevMedian: 23, currMedian: 23 }): PairRow => ({
  ...HYPOTHETICAL_SAME_WAY,
  prevMonth,
  month,
  depth,
  readThroughRun: laterMonthOf(month, now, UPDATES).latestUpdateRunId,
  computedAt: now,
})

const judgeAt = (now: string, rows: readonly PairRow[]): PairOn => pairOn(sealandJudge(now, rows, CHANGES, UPDATES))

/** HYPOTHETICAL_RISING_RUN's counts on the months given, oldest first. */
const rising = (months: readonly string[]): Map<string, { k: number; videos: number }> =>
  new Map(months.map((m, i) => [m, { k: HYPOTHETICAL_RISING_RUN[i].k as number, videos: HYPOTHETICAL_RISING_RUN[i].videos as number }]))

const LOOKS: Subject = {
  id: '723d1389-4eb0-47f1-b6e1-f368d990fb2a',
  client_id: 'sealand',
  name: 'Looks & style',
  description: null,
  origin: 'category_theme',
  source_ref: null,
  named_at: '2026-09-23',
  status: 'active',
  superseded_by: null,
  embedded_at: null,
  embed_input_version: null,
  calibrated_at: '2026-09-24T11:53:17.071Z',
  calibration_precision: 0.8571428571428571,
  calibration_n: 33,
  calibration_judge_version: JUDGE_VERSION,
}

/** The default view at a clock whose reading month is `month`: the window
 *  (one month), the axis the page compares (`readAxis`) and the read axis. */
function defaultView(month: string) {
  const window = horizonWindow('this_month', `${month}T12:00:00.000Z`)
  const axis = window.months
  const readAxis = [monthBefore(axis[0]), ...axis]
  return { window, readAxis, wordAxis: readAxisOf(window) }
}

function monthBefore(month: string): string {
  const d = new Date(`${month}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

// ---- Your market's subject rows (overview `buildSubjects`; the briefs' sheet prints the word) ----

function overviewRow(month: string, counts: Map<string, { k: number; videos: number }>, pair: PairOn, asOf: string, withWord = true) {
  const { readAxis, wordAxis } = defaultView(month)
  const perAudience = new Map<string, number>()
  const rows: StoredSubjectRow[] = []
  for (const [m, c] of counts) {
    perAudience.set(`${m}|${INDUSTRY_AUDIENCE}`, c.videos)
    // Comments are not read by the word or the row's level.
    rows.push({ month: m, audience: INDUSTRY_AUDIENCE, subject_id: LOOKS.id, videos: c.k, comments: 0 })
  }
  const drawn = rows.filter((r) => readAxis.includes(r.month))
  return buildSubjects({
    pair,
    asOf,
    subjects: [LOOKS],
    months: drawn,
    ...(withWord ? { word: { axis: wordAxis, months: rows } } : {}),
    denominators: new Map(),
    perAudience,
    axis: readAxis,
    month,
    prevMonth: readAxis[0],
    leadRival: null,
    atLastMonth: null,
    thin: false,
  }).rows[0]
}

describe('the default view reads three months: a subject row (Your market, the briefs)', () => {
  const JAN10 = '2027-01-10T12:00:00.000Z'

  it('December still leads on 10 Jan (January is under half over), and the default view reads October to December', () => {
    const rm = readingMonthFor({
      now: JAN10,
      updates: UPDATES.map((u) => u.finishedAt),
      videosByMonth: new Map([[OCT, 377], [NOV, 377], [DEC, 377]]),
      firstRunMonth: '2026-06-01',
      nextUpdateAfter: SEALAND_SCHEDULE,
    })
    expect(rm.month).toBe(DEC)
    const window = horizonWindow('this_month', readingAnchor(rm))
    expect(window.months).toEqual([DEC])
    expect(readAxisOf(window)).toEqual([OCT, NOV, DEC])
  })

  it('October to December rising, both pairs read the same way and December ended: "growing" on the default view', () => {
    const pair = judgeAt(JAN10, [sameWay(OCT, NOV, JAN10), sameWay(NOV, DEC, JAN10)])
    const row = overviewRow(DEC, rising([OCT, NOV, DEC]), pair, JAN10)
    expect(row.direction).toBe('growing')
    // The line is drawn over the months it always was: November and December.
    expect(row.sparkMonths).toEqual([NOV, DEC])
    expect(row.spark).toEqual([15.9, 23.9])
  })

  it('the two-month read the default view had before could never carry it', () => {
    const pair = judgeAt(JAN10, [sameWay(OCT, NOV, JAN10), sameWay(NOV, DEC, JAN10)])
    expect(overviewRow(DEC, rising([OCT, NOV, DEC]), pair, JAN10, false).direction).toBeNull()
  })

  it('3 Jan, December not yet filled (23 against 15 dated comments a video): no word', () => {
    const JAN3 = '2027-01-03T12:00:00.000Z'
    const pair = judgeAt(JAN3, [sameWay(OCT, NOV, JAN3), sameWay(NOV, DEC, JAN3, { prevMedian: 23, currMedian: 15 })])
    expect(pair(NOV, DEC, INDUSTRY_AUDIENCE).reasons[0].kind).toBe('depth')
    expect(overviewRow(DEC, rising([OCT, NOV, DEC]), pair, JAN3).direction).toBeNull()
  })

  it('3 Jan, no November against December row yet: no word', () => {
    const JAN3 = '2027-01-03T12:00:00.000Z'
    expect(overviewRow(DEC, rising([OCT, NOV, DEC]), judgeAt(JAN3, [sameWay(OCT, NOV, JAN3)]), JAN3).direction).toBeNull()
  })

  it('20 Dec, December still so far: no word, whatever the pairs', () => {
    const DEC20 = '2026-12-20T12:00:00.000Z'
    const pair = judgeAt(DEC20, [sameWay(OCT, NOV, DEC20), sameWay(NOV, DEC, DEC20)])
    expect(overviewRow(DEC, rising([OCT, NOV, DEC]), pair, DEC20).direction).toBeNull()
  })

  it('November read on 10 Dec reaches back to September, which our September search changes refuse: no word', () => {
    const DEC10 = '2026-12-10T12:00:00.000Z'
    const counts = rising(['2026-09-01', OCT, NOV])
    const pair = judgeAt(DEC10, [sameWay(OCT, NOV, DEC10)])
    expect(pair('2026-09-01', OCT, INDUSTRY_AUDIENCE).mode).toBe('refuse')
    expect(overviewRow(NOV, counts, pair, DEC10).direction).toBeNull()
    // The same months with every step open would carry the word: the
    // refusal is the only reason there is none.
    const open: PairOn = () => ({ prevMonth: '', month: '', mode: 'comparable', reasons: [], row: null, checkWith: null })
    expect(overviewRow(NOV, counts, open, DEC10).direction).toBe('growing')
  })
})

// ---- The Subjects pane (`buildSides`): the word off the chart's own line ----

function paneSides(month: string, counts: Map<string, { k: number; videos: number }>, pair: PairOn, asOf: string, withWord = true) {
  const { readAxis, wordAxis } = defaultView(month)
  const chartAxis = [...counts.keys()]
  const denominators: DenominatorPoint[] = []
  const perAudience = new Map<string, number>()
  for (const [m, c] of counts) {
    denominators.push({ month: m, audience: INDUSTRY_AUDIENCE, videos: c.videos, comments: 0, status: 'frozen', origin: 'live', read_at: `${m}T00:00:00Z`, run_id: null })
    perAudience.set(`${m}|${INDUSTRY_AUDIENCE}`, c.videos)
    // Sealand's own audience: about 9 videos a month (plan §2.11, F4).
    denominators.push({ month: m, audience: CLIENT_AUDIENCE, videos: 9, comments: 0, status: 'frozen', origin: 'live', read_at: `${m}T00:00:00Z`, run_id: null })
    perAudience.set(`${m}|${CLIENT_AUDIENCE}`, 9)
  }
  const lineOver = (axis: readonly string[]) => (subjectId: string, audience: string): MonthSeries =>
    buildSeries({
      axis: [...axis],
      audience,
      denominators,
      readings: audience === INDUSTRY_AUDIENCE ? [...counts].map(([m, c]) => ({ month: m, audience, videos: c.k, comments: 0 })) : [],
      objectId: subjectId,
      regimes: [],
    })
  return buildSides({
    pair,
    asOf,
    subject: LOOKS,
    rivals: [],
    leadRival: null,
    month,
    prevMonth: readAxis[0],
    axis: readAxis,
    ...(withWord ? { word: { axis: wordAxis, seriesFor: lineOver(chartAxis) } } : {}),
    perAudience,
    kindRows: null,
    seriesFor: lineOver(readAxis),
    thin: false,
  })
}

describe('the default view reads three months: the Subjects pane', () => {
  const JAN10 = '2027-01-10T12:00:00.000Z'

  it('the category side earns "growing" off the chart\'s line; your own 9 videos a month earn none', () => {
    const pair = judgeAt(JAN10, [sameWay(OCT, NOV, JAN10), sameWay(NOV, DEC, JAN10)])
    const sides = paneSides(DEC, rising([OCT, NOV, DEC]), pair, JAN10)
    expect(sides.find((s) => s.kind === 'category')?.direction).toBe('growing')
    expect(sides.find((s) => s.kind === 'you')?.direction).toBeNull()
    // The level and the month before are the page's read, as before.
    expect(sides.find((s) => s.kind === 'category')).toMatchObject({ k: 90, n: 377, previous: { month: NOV, pct: 15.9 } })
  })

  it('without the read axis (the two months the page compares) there is no word', () => {
    const pair = judgeAt(JAN10, [sameWay(OCT, NOV, JAN10), sameWay(NOV, DEC, JAN10)])
    expect(paneSides(DEC, rising([OCT, NOV, DEC]), pair, JAN10, false).find((s) => s.kind === 'category')?.direction).toBeNull()
  })

  it('no word while any step is refused or December has not filled', () => {
    const JAN3 = '2027-01-03T12:00:00.000Z'
    const shallow = judgeAt(JAN3, [sameWay(OCT, NOV, JAN3), sameWay(NOV, DEC, JAN3, { prevMedian: 23, currMedian: 15 })])
    expect(paneSides(DEC, rising([OCT, NOV, DEC]), shallow, JAN3).find((s) => s.kind === 'category')?.direction).toBeNull()
    const DEC10 = '2026-12-10T12:00:00.000Z'
    const september = judgeAt(DEC10, [sameWay(OCT, NOV, DEC10)])
    expect(paneSides(NOV, rising(['2026-09-01', OCT, NOV]), september, DEC10).find((s) => s.kind === 'category')?.direction).toBeNull()
  })
})

// ---- §5.7: no word on any Sealand series before October to December ----------

describe('directionWord on Sealand, clock by clock (§5.7)', () => {
  // The default view at each clock: the month that leads (decision A), its
  // read axis, and the word over it. Pair rows: October against November from
  // the 6 Dec update; November against December from the 3 Jan update, short
  // on depth then (23 against 15) and filled from the 10 Jan update
  // (HYPOTHETICAL, as above). Every step before October is refused by our own
  // September changes, so the first word is October to December's.
  const rowsAt = (now: string): PairRow[] => {
    const out: PairRow[] = []
    if (now >= '2026-12-06T08:30:00.000Z') out.push(sameWay(OCT, NOV, now))
    if (now >= '2027-01-03T08:30:00.000Z') out.push(sameWay(NOV, DEC, now, now >= '2027-01-10T08:30:00.000Z' ? undefined : { prevMedian: 23, currMedian: 15 }))
    return out
  }
  // HYPOTHETICAL: every month from July at August's real 377, rising by 22 a
  // month from 16, so the floors and the band would carry a word over any
  // three of them: only the rule can refuse one.
  const series: SeriesPoint[] = ['2026-07-01', '2026-08-01', '2026-09-01', OCT, NOV, DEC, '2027-01-01'].map((month, i) => ({
    month, videos: 377, k: 16 + i * 22, audience: INDUSTRY_AUDIENCE, regime: 'n/a',
  }))
  const wordAt = (now: string, explicit: string | null = null) => {
    const rm = readingMonthFor({
      now,
      updates: UPDATES.map((u) => u.finishedAt),
      videosByMonth: new Map(series.map((p) => [p.month, p.videos as number])),
      firstRunMonth: '2026-06-01',
      nextUpdateAfter: SEALAND_SCHEDULE,
      explicit,
    })
    const read = readAxisOf(horizonWindow('this_month', readingAnchor(rm)))
    const points = read.map((m) => series.find((p) => p.month === m) as SeriesPoint)
    return {
      month: rm.month,
      read,
      word: directionWord(points, { asOf: now, comparable: comparableOn(judgeAt(now, rowsAt(now)), INDUSTRY_AUDIENCE) }),
    }
  }

  it.each([
    // [clock, the month that leads, the word]
    ['2026-10-11T12:00:00.000Z', '2026-09-01', null], // August to September: our September search changes
    ['2026-11-02T06:00:00.000Z', OCT, null], // September to October: the same
    ['2026-11-08T12:00:00.000Z', OCT, null],
    ['2026-12-07T06:00:00.000Z', NOV, null], // September to November: September to October still refused
    ['2026-12-20T12:00:00.000Z', DEC, null], // December so far
    ['2027-01-03T12:00:00.000Z', DEC, null], // December not filled (depth)
    ['2027-01-10T12:00:00.000Z', DEC, 'growing'], // October to December, read the same way
    ['2027-01-24T12:00:00.000Z', '2027-01-01', null], // January leads from mid-month, so far
  ] as const)('at %s the default view reads %s: %s', (now, month, word) => {
    const at = wordAt(now)
    expect(at.month).toBe(month)
    expect(at.read).toHaveLength(3)
    expect(at.read[2]).toBe(month)
    expect(at.word).toBe(word)
  })

  it('once January leads, October to December\'s word stays on December\'s own view (?month=2026-12)', () => {
    expect(wordAt('2027-01-24T12:00:00.000Z', DEC)).toEqual({ month: DEC, read: [OCT, NOV, DEC], word: 'growing' })
  })
})
