import { describe, expect, it } from 'vitest'
import {
  MONTHLY_SPARK_MONTHS,
  briefStaleLine,
  leadOf,
  nextReadingOf,
  pickLed,
  spanOf,
  sparkMonths,
  trailPointOf,
  voiceNote,
  type BriefLink,
  type MoverRow,
  type ReadableSent,
} from './monthly'
import type { MonthPoint } from '../reading/series'
import type { Verdict } from '../reading/verdicts'

const themeVerdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Durability',
  audience: 'industry',
  window: { from: '2026-09-01', to: '2026-10-01', kind: 'month' },
  value: { k: 130, n: 1388 },
  changePts: 2.6,
  bandPts: 1.8,
  state: 'moved',
  flags: [],
  ...over,
})

const moverRow = (verdict: Verdict): MoverRow => ({
  id: verdict.objectId,
  label: verdict.objectLabel,
  k: verdict.value.k,
  n: verdict.value.n,
  pct: 9.4,
  verdict,
  direction: null,
  isNew: false,
  spark: [],
  sparkMonths: [],
  trail: '',
})

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

describe('what the subject line leads with', () => {
  // The page's own pool is its subjects plus its movers THREE a side; this
  // artefact prints ten a side, so the largest banded change on it can be a row
  // the page never named.
  it('is the largest banded change on the artefact, not on the page', () => {
    const lead = leadOf([themeVerdict({ objectId: 't1', changePts: 2.6 })], {
      growing: [moverRow(themeVerdict({ objectId: 't8', objectLabel: 'Rank eight', changePts: 5.3 }))],
      fading: [],
    })
    expect(lead?.objectId).toBe('t8')
  })

  it('still refuses a row that did not clear its band', () => {
    const lead = leadOf([], {
      growing: [moverRow(themeVerdict({ objectId: 't8', changePts: 9, state: 'no_clear_change' }))],
      fading: [],
    })
    expect(lead).toBeNull()
  })
})

// THE TRAIL IS THE ARTEFACT'S CLAIM, NOT ITS PICTURE. Every point used to be
// `points.get(m)?.pct ?? null` with no readability gate, so a month under
// SHARE_BAND.minN — one every verdict in the product refuses to band — printed
// as a point on the same line as a full month, indistinguishable.
describe('which months a mover’s trail may carry', () => {
  const point = (over: Partial<MonthPoint> = {}): MonthPoint => ({
    month: '2026-08-01',
    state: 'frozen',
    videos: 388,
    comments: 4_100,
    k: 34,
    kComments: 300,
    pct: 8.8,
    audience: 'industry',
    status: 'frozen',
    origin: 'live',
    readAt: null,
    runId: null,
    frozenAt: null,
    clusteringKey: null,
    labels: [],
    ...over,
  })

  it('takes a frozen or filling month, with its denominator', () => {
    expect(trailPointOf(point())).toEqual({ pct: 8.8, n: 388 })
    expect(trailPointOf(point({ state: 'filling', status: 'filling' }))).toEqual({ pct: 8.8, n: 388 })
  })

  it('refuses a month under the floor, and every other unreadable state', () => {
    for (const state of ['below_floor', 'hollow', 'missing', 'not_seeded'] as const) {
      expect(trailPointOf(point({ state }))).toBeNull()
    }
  })

  it('refuses a month nobody read at all', () => {
    expect(trailPointOf(undefined)).toBeNull()
    expect(trailPointOf(point({ pct: null }))).toBeNull()
    expect(trailPointOf(point({ videos: null }))).toBeNull()
  })

  // A THEME ABSENT FROM A READABLE MONTH READ ZERO, and zero is a reading.
  it('keeps a zero, which is not the same fact as a silence', () => {
    expect(trailPointOf(point({ k: 0, pct: 0 }))).toEqual({ pct: 0, n: 388 })
  })
})
