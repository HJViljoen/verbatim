import { describe, it, expect } from 'vitest'
import {
  clearsFloor,
  directionWord,
  monthChange,
  quarterChange,
  thinMonth,
  type ObjectIdentity,
  type SeriesPoint,
} from './bands'
import { SENTIMENT_BAND, SHARE_BAND, proportionDelta } from '../report-bands'

const THEME: ObjectIdentity = { kind: 'theme', id: 't1', label: 'Questions about prosthetic function' }
const KEY = 'a=v4;i=none;c=0.58;f=2;m=gpt-5.4;mp=v1;k=video_v1'

const p = (month: string, k: number | null, videos: number | null, over: Partial<SeriesPoint> = {}): SeriesPoint => ({
  month,
  k,
  videos,
  audience: 'industry-other',
  clusteringKey: KEY,
  ...over,
})

describe('clearsFloor', () => {
  it('needs 100 videos in the audience', () => {
    expect(clearsFloor(p('2026-08-01', 40, 99))).toBe(false)
    expect(clearsFloor(p('2026-08-01', 40, 100))).toBe(true)
  })

  it('needs 10 of the object\'s own', () => {
    expect(clearsFloor(p('2026-08-01', 9, 628))).toBe(false)
    expect(clearsFloor(p('2026-08-01', 10, 628))).toBe(true)
  })

  it('judges a denominator-only month on the denominator alone', () => {
    expect(clearsFloor(p('2026-08-01', null, 628))).toBe(true)
    expect(clearsFloor(p('2026-08-01', null, 20))).toBe(false)
  })

  it('a hollow month clears nothing', () => {
    expect(clearsFloor(p('2026-08-01', null, null))).toBe(false)
  })

  it('takes another band when the caller has one', () => {
    expect(clearsFloor(p('2026-08-01', 3, 628), SENTIMENT_BAND)).toBe(true)
  })
})

describe('monthChange', () => {
  const curr = p('2026-08-01', 102, 628)
  const prev = p('2026-07-01', 9, 118)

  it('bands the two months with each month\'s video count as n', () => {
    const v = monthChange({ object: THEME, audience: 'industry-other', curr, prev })
    expect(v.value).toEqual({ k: 102, n: 628 })
    expect(v.baseline).toEqual({ k: 9, n: 118 })
    expect(v.window).toEqual({ kind: 'month', from: '2026-08-01', to: '2026-09-01' })
    expect(v.basis).toEqual({ from: '2026-07-01', to: '2026-08-01' })
  })

  it('is the product\'s band and not a second one', () => {
    const v = monthChange({ object: THEME, audience: 'industry-other', curr, prev })
    const direct = proportionDelta(
      { nowPct: (102 / 628) * 100, prevPct: (9 / 118) * 100, nowN: 628, prevN: 118, nowK: 102, prevK: 9 },
      SHARE_BAND,
    )
    expect([v.changePts, v.bandPts, v.state]).toEqual([direct.change, direct.band, direct.state])
  })

  it('a hollow previous month is too_little_data, not a rise from zero', () => {
    const v = monthChange({ object: THEME, audience: 'industry-other', curr, prev: p('2026-07-01', null, null) })
    expect(v.state).toBe('too_little_data')
    expect(v.baseline).toEqual({ k: 0, n: 0 })
  })

  it('a below-floor month is too_little_data through the band, with no special case', () => {
    const v = monthChange({
      object: THEME,
      audience: 'client',
      curr: p('2026-08-01', 6, 20, { audience: 'client' }),
      prev: p('2026-07-01', 2, 8, { audience: 'client' }),
    })
    expect(v.state).toBe('too_little_data')
  })

  it('marks a clustering change and still prints the band (decision L)', () => {
    const v = monthChange({
      object: THEME,
      audience: 'industry-other',
      curr: p('2026-08-01', 251, 1000, { clusteringKey: 'a=v5' }),
      prev: p('2026-07-01', 120, 1000),
    })
    expect(v.flags).toContain('clustering_changed')
    expect(v.state).toBe('moved')
    expect(v.changePts).not.toBeNull()
  })

  it('treats two unrecorded groupings as a change, never as agreement', () => {
    const v = monthChange({
      object: THEME,
      audience: 'industry-other',
      curr: p('2026-08-01', 251, 1000, { clusteringKey: null }),
      prev: p('2026-07-01', 120, 1000, { clusteringKey: null }),
    })
    // …but it is NOT the claim "themes were re-grouped", which is what the one
    // token used to say about every comparison on the seeded history.
    expect(v.flags).toContain('clustering_unknown')
    expect(v.flags).not.toContain('clustering_changed')
  })

  it('says unknown, not changed, when only ONE side carries a key', () => {
    const v = monthChange({
      object: THEME,
      audience: 'industry-other',
      curr: p('2026-08-01', 251, 1000, { clusteringKey: 'a=v5' }),
      prev: p('2026-07-01', 120, 1000, { clusteringKey: null }),
    })
    expect(v.flags).toEqual(['clustering_unknown'])
    expect(v.state).toBe('moved')
  })

  it('does not mark a clustering change when the keys agree', () => {
    const v = monthChange({ object: THEME, audience: 'industry-other', curr, prev })
    expect(v.flags).not.toContain('clustering_changed')
  })

  it('REFUSES across a rename — a hard break, because the string may be what moved', () => {
    const v = monthChange({
      object: { kind: 'rival', id: 'competitor:Topo Designs', label: 'Topo Designs' },
      audience: 'competitor:Topo Designs',
      curr: p('2026-08-01', 251, 1000, { audience: 'competitor:Topo Designs' }),
      prev: p('2026-07-01', 120, 1000, { audience: 'competitor:Topo' }),
    })
    expect(v.state).toBe('refused')
    expect(v.refusedReason).toBe('rename')
    expect(v.changePts).toBeNull()
    expect(v.flags).toContain('renamed')
    // the counts survive, so a level still prints
    expect(v.value).toEqual({ k: 251, n: 1000 })
  })

  it('carries flags the caller adds without dropping the ones it finds', () => {
    const v = monthChange({
      object: THEME,
      audience: 'industry-other',
      curr: p('2026-08-01', 251, 1000, { clusteringKey: 'a=v5' }),
      prev,
      flags: ['thin'],
    })
    expect(v.flags).toEqual(['thin', 'clustering_changed'])
  })
})

describe('quarterChange', () => {
  const window = { kind: 'quarter' as const, from: '2026-07-01', to: '2026-10-01' }
  const basis = { from: '2026-04-01', to: '2026-07-01' }

  it('is baseline_forming until six monthly readings stand behind it', () => {
    const v = quarterChange({
      object: THEME,
      audience: 'industry-other',
      window,
      basis,
      value: { k: 175, n: 1034 },
      baseline: { k: 120, n: 900 },
      readings: 5,
    })
    expect(v.state).toBe('baseline_forming')
    expect(v.changePts).toBeNull()
    expect(v.bandPts).toBeNull()
    expect(v.baseline).toBeUndefined()
  })

  it('unlocks at six and bands the two windows', () => {
    const v = quarterChange({
      object: THEME,
      audience: 'industry-other',
      window,
      basis,
      value: { k: 175, n: 1034 },
      baseline: { k: 120, n: 900 },
      readings: 6,
    })
    expect(v.state).not.toBe('baseline_forming')
    expect(v.baseline).toEqual({ k: 120, n: 900 })
    expect(v.changePts).not.toBeNull()
  })

  it('still answers too_little_data when a window is under the floor', () => {
    const v = quarterChange({
      object: THEME,
      audience: 'client',
      window,
      basis,
      value: { k: 12, n: 62 },
      baseline: { k: 8, n: 40 },
      readings: 12,
    })
    expect(v.state).toBe('too_little_data')
  })
})

describe('thinMonth', () => {
  const trailing = [600, 600, 600, 600, 600, 600]

  it('is thin under 60% of the trailing median', () => {
    expect(thinMonth(p('2026-09-01', null, 359), trailing)).toBe(true)
    expect(thinMonth(p('2026-09-01', null, 360), trailing)).toBe(false)
  })

  it('ignores hollow months when taking the median instead of counting them as zeros', () => {
    // With the nulls counted as zeros the median would be 0 and nothing would
    // ever read thin.
    expect(thinMonth(p('2026-09-01', null, 100), [null, null, 600, 600, null])).toBe(true)
  })

  it('says nothing about a hollow month — that has its own token', () => {
    expect(thinMonth(p('2026-09-01', null, null), trailing)).toBe(false)
  })

  it('says nothing when there is no trailing series yet', () => {
    expect(thinMonth(p('2026-09-01', null, 10), [])).toBe(false)
    expect(thinMonth(p('2026-09-01', null, 10), [0, 0])).toBe(false)
  })

  it('is thin on fewer than two updates, but only from the tenant\'s first run', () => {
    const before = thinMonth(p('2026-02-01', null, 600), trailing, { updates: 0, firstRunMonth: '2026-04-01' })
    const after = thinMonth(p('2026-05-01', null, 600), trailing, { updates: 1, firstRunMonth: '2026-04-01' })
    expect(before).toBe(false)
    expect(after).toBe(true)
  })

  it('the updates arm sleeps when nobody has counted the updates', () => {
    expect(thinMonth(p('2026-05-01', null, 600), trailing, { updates: null, firstRunMonth: '2026-04-01' })).toBe(false)
  })

  it('the updates arm sleeps when the tenant has no first run recorded', () => {
    expect(thinMonth(p('2026-05-01', null, 600), trailing, { updates: 0 })).toBe(false)
  })

  it('two updates is enough', () => {
    expect(thinMonth(p('2026-05-01', null, 600), trailing, { updates: 2, firstRunMonth: '2026-04-01' })).toBe(false)
  })
})

describe('directionWord', () => {
  const rising = [p('2026-06-01', 100, 1000), p('2026-07-01', 160, 1000), p('2026-08-01', 230, 1000)]

  it('needs three readings — two is a change, not a direction', () => {
    expect(directionWord(rising.slice(1))).toBeNull()
    expect(directionWord(rising)).toBe('growing')
  })

  it('reads fading the same way', () => {
    const falling = [p('2026-06-01', 230, 1000), p('2026-07-01', 160, 1000), p('2026-08-01', 100, 1000)]
    expect(directionWord(falling)).toBe('fading')
  })

  it('takes the LAST three of a longer series', () => {
    expect(directionWord([p('2026-04-01', 900, 1000), p('2026-05-01', 20, 1000), ...rising])).toBe('growing')
  })

  it('gives a series with NO clustering its word — absence is not disagreement', () => {
    // month_kind_readings and month_audience_stats carry no clustering column on
    // purpose, and an absent key is UNKNOWN, which is never equal to another
    // unknown — so every kind was refused a direction word in every month, for
    // ever, and the caller was told "we never had three readings".
    const noKey = rising.map((point) => ({ ...point, clusteringKey: null }))
    expect(directionWord(noKey)).toBeNull()
    expect(directionWord(noKey.map((point) => ({ ...point, regime: 'n/a' as const })))).toBe('growing')
  })

  it('still refuses a run that mixes a declared absence with a real key', () => {
    const mixed = [
      { ...rising[0], clusteringKey: null, regime: 'n/a' as const },
      { ...rising[1], clusteringKey: 'a1b2' },
      { ...rising[2], clusteringKey: 'a1b2' },
    ]
    expect(directionWord(mixed)).toBeNull()
  })

  it('still refuses a run whose keys are simply absent', () => {
    expect(directionWord(rising)).toBe('growing')
    const unknown = [
      { ...rising[0], clusteringKey: null },
      { ...rising[1], clusteringKey: null },
      { ...rising[2], clusteringKey: null },
    ]
    expect(directionWord(unknown)).toBeNull()
  })

  it('returns null — not flat — when a month in the run is hollow', () => {
    const gapped = [p('2026-06-01', 100, 1000), p('2026-07-01', null, null), p('2026-08-01', 230, 1000)]
    expect(directionWord(gapped)).toBeNull()
  })

  it('returns null when a month in the run is below the floor', () => {
    const thin = [p('2026-06-01', 100, 1000), p('2026-07-01', 16, 99), p('2026-08-01', 230, 1000)]
    expect(directionWord(thin)).toBeNull()
  })

  it('returns null when a month in the run is under the numerator floor', () => {
    const thin = [p('2026-06-01', 100, 1000), p('2026-07-01', 9, 1000), p('2026-08-01', 230, 1000)]
    expect(directionWord(thin)).toBeNull()
  })

  it('breaks on a calendar gap rather than skipping over it', () => {
    const skipped = [p('2026-05-01', 100, 1000), p('2026-07-01', 160, 1000), p('2026-08-01', 230, 1000)]
    expect(directionWord(skipped)).toBeNull()
  })

  it('never speaks across a clustering boundary', () => {
    const crossed = [rising[0], rising[1], p('2026-08-01', 230, 1000, { clusteringKey: 'a=v5' })]
    expect(directionWord(crossed)).toBeNull()
  })

  it('never speaks over a stretch with no recorded grouping — two unknowns are not one regime', () => {
    const unknown = rising.map((r) => ({ ...r, clusteringKey: null }))
    expect(directionWord(unknown)).toBeNull()
  })

  it('never speaks across a rename', () => {
    const renamed = [rising[0], rising[1], { ...rising[2], audience: 'competitor:Topo Designs' }]
    expect(directionWord(renamed)).toBeNull()
  })

  it('is flat when the two steps disagree in sign', () => {
    const zigzag = [p('2026-06-01', 100, 1000), p('2026-07-01', 230, 1000), p('2026-08-01', 140, 1000)]
    expect(directionWord(zigzag)).toBe('flat')
  })

  it('is flat when the steps agree but the whole move stays inside the band', () => {
    const creep = [p('2026-06-01', 600, 1000), p('2026-07-01', 602, 1000), p('2026-08-01', 605, 1000)]
    expect(directionWord(creep)).toBe('flat')
  })

  it('is flat when nothing moves at all', () => {
    const still = [p('2026-06-01', 200, 1000), p('2026-07-01', 200, 1000), p('2026-08-01', 200, 1000)]
    expect(directionWord(still)).toBe('flat')
  })

  it('allows one step to stand still as long as the other agrees and the span clears the band', () => {
    const paused = [p('2026-06-01', 100, 1000), p('2026-07-01', 100, 1000), p('2026-08-01', 230, 1000)]
    expect(directionWord(paused)).toBe('growing')
  })

  it('null and flat are different answers — no run at all is not a reading of no movement', () => {
    expect(directionWord([])).toBeNull()
    expect(directionWord([p('2026-08-01', 200, 1000)])).toBeNull()
  })

  it('a longer run can be asked for, and it holds the same rules', () => {
    const four = [p('2026-05-01', 80, 1000), ...rising]
    expect(directionWord(four, { run: 4 })).toBe('growing')
    expect(directionWord(rising, { run: 4 })).toBeNull()
  })
})

describe('directionWord — a series with no numerator earns no word', () => {
  const month = (m: string, videos: number, k: number | null): SeriesPoint => ({
    month: m, videos, k, clusteringKey: 'k1', audience: 'industry-other',
  })

  it('answers null, not flat, on a denominator-only series', () => {
    // pct() reads `k ?? 0`, so every point is 0%, both steps agree at zero and
    // the old answer was `flat` — a direction word earned from nothing.
    // clearsFloor passes a null k on purpose, so the call is invited.
    expect(directionWord([
      month('2026-06-01', 400, null),
      month('2026-07-01', 420, null),
      month('2026-08-01', 440, null),
    ])).toBeNull()
  })

  it('answers null when only ONE month of the run has no k', () => {
    expect(directionWord([
      month('2026-06-01', 400, 40),
      month('2026-07-01', 420, null),
      month('2026-08-01', 440, 80),
    ])).toBeNull()
  })

  it('still answers flat when three real readings disagree', () => {
    expect(directionWord([
      month('2026-06-01', 400, 40),
      month('2026-07-01', 400, 60),
      month('2026-08-01', 400, 40),
    ])).toBe('flat')
  })
})
