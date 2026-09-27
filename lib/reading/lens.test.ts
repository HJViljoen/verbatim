import { describe, expect, it } from 'vitest'

import {
  lensCalls, lensParity, lensRowsOf, lensSizeLine, mergeLensRows, pooledLensVideos, sameSearchesLens, toStoredLens,
  type LensVideo,
} from './lens'

// The lens writer and merge (WP3.3). Counts are Sealand's staging figures:
// September's market 655 videos (626 in the category, 29 filed under a brand
// you track; decision E), August's buyer core of about 91 (decision F, CQ F31),
// and the WP2.3 populations. Video ids are labels.

const v = (id: string, segment: LensVideo['segment'], dated: number, insideSearches = true): LensVideo => ({ id, segment, dated, insideSearches })

describe('the lens calls of a month', () => {
  const videos = [v('a', 'market', 23), v('b', 'maker', 4), v('c', 'noise', 31, false), v('d', 'market', 2, false)]

  it('market reads every video; the segment lenses and same-searches read the market\'s videos; dense20 reads at 20', () => {
    expect(lensCalls('2026-10-01', videos, { withSegments: true, withSearches: true })).toEqual([
      { lens: 'market', ids: null, minDated: 1 },
      { lens: 'buyers', ids: ['a', 'd'], minDated: 1 },
      { lens: 'makers', ids: ['b'], minDated: 1 },
      { lens: 'all_but_noise', ids: ['a', 'b', 'd'], minDated: 1 },
      { lens: 'dense20', ids: null, minDated: 20 },
      { lens: 'same_searches:2026-09', ids: ['a', 'b'], minDated: 1 },
    ])
  })

  it('a tenant with no segment rule (Össur) gets no segment lens', () => {
    expect(lensCalls('2026-10-01', videos, { withSegments: false, withSearches: false }).map((c) => c.lens)).toEqual(['market', 'dense20'])
  })

  it('names the same-searches lens by the pair\'s earlier month', () => {
    expect(sameSearchesLens('2026-10-01')).toBe('same_searches:2026-10')
  })
})

const SEP = [
  { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 626, n: 626 },
  { audience: 'competitor:Cotopaxi', object_kind: 'denominator', object_id: 'videos', k: 29, n: 29 },
  { audience: 'client', object_kind: 'denominator', object_id: 'videos', k: 9, n: 9 },
  { audience: 'industry-other', object_kind: 'kind', object_id: 'praise', k: 450, n: 626 },
]

describe('the rows', () => {
  it('per audience, as lens_readings returns them; the pooled market leaves the client out', () => {
    const rows = lensRowsOf('sealand', '2026-09-01', 'market', SEP)
    expect(rows[0]).toEqual({ client_id: 'sealand', month: '2026-09-01', audience: 'industry-other', lens: 'market', object_kind: 'denominator', object_id: 'videos', k: 626, n: 626, comments: null, rule_version: 'segments_v1' })
    expect(pooledLensVideos(rows)).toBe(655)
  })

  it('prints a count, never a share, under 100: August\'s buyers', () => {
    expect(lensSizeLine('buyers', '2026-08-01', 91)).toBe('August 2026 · buyers: 91 videos, too few to read (a count, no share)')
    expect(lensSizeLine('market', '2026-09-01', 655)).toBe('September 2026 · market: 655 videos')
  })
})

describe('parity: the market lens against the stored month rows', () => {
  it('equal rows are parity; the client\'s own posts are not compared', () => {
    expect(lensParity(lensRowsOf('s', '2026-09-01', 'market', SEP), SEP.map((r) => (r.audience === 'client' ? { ...r, k: 8, n: 8 } : r)))).toEqual([])
  })
  it('a difference is named', () => {
    const main = SEP.map((r) => (r.object_kind === 'kind' ? { ...r, k: 449 } : r))
    expect(lensParity(lensRowsOf('s', '2026-09-01', 'market', SEP), main)).toEqual(['industry-other|kind|praise: lens 450 of 626 · main 449 of 626'])
  })
})

describe('the merge', () => {
  const NOW_FREEZING = '2026-12-06T07:00:00.000Z' // October's line (1 Dec) has passed: this run freezes it
  const fresh = lensRowsOf('sealand', '2026-10-01', 'buyers', SEP.slice(0, 2))

  it('writes a month that freezes in this run as frozen; a key first read on that run is marked read back, as the month tables mark it', () => {
    const r = mergeLensRows({ months: ['2026-10-01'], fresh, stored: [], now: NOW_FREEZING, runId: 'run-2026-12-06' })
    expect(r.writes.map((w) => [w.status, w.origin, w.frozen_at])).toEqual([
      ['frozen', 'back_read', NOW_FREEZING], ['frozen', 'back_read', NOW_FREEZING],
    ])
  })

  it('a row first read while filling stays live when it freezes; a frozen row is never rewritten', () => {
    const stored = toStoredLens([
      { month: '2026-10-01', audience: 'industry-other', lens: 'buyers', object_kind: 'denominator', object_id: 'videos', status: 'filling', origin: 'live', frozen_at: null },
      { month: '2026-10-01', audience: 'competitor:Cotopaxi', lens: 'buyers', object_kind: 'denominator', object_id: 'videos', status: 'frozen', origin: 'live', frozen_at: '2026-12-06T07:00:00.000Z' },
    ])
    const r = mergeLensRows({ months: ['2026-10-01'], fresh, stored, now: NOW_FREEZING, runId: 'run-2026-12-06' })
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0]).toMatchObject({ audience: 'industry-other', status: 'frozen', origin: 'live' })
    expect(r.keptFrozen).toBe(1)
  })

  it('a closed audience-month takes a new lens once: held for one lens is not held for another', () => {
    const stored = toStoredLens([
      { month: '2026-09-01', audience: 'industry-other', lens: 'market', object_kind: 'denominator', object_id: 'videos', status: 'frozen', origin: 'live', frozen_at: '2026-11-01T07:00:00.000Z' },
    ])
    const buyers = lensRowsOf('sealand', '2026-09-01', 'buyers', SEP.slice(0, 1))
    const market = lensRowsOf('sealand', '2026-09-01', 'market', [SEP[3]])
    const r = mergeLensRows({ months: ['2026-09-01'], fresh: [...buyers, ...market], stored, now: '2026-11-10T09:00:00.000Z', runId: null, closedAudienceMonths: ['2026-09-01|industry-other'] })
    // the buyers lens is new to the closed audience-month: its first reading
    expect(r.writes.map((w) => `${w.lens} ${w.object_kind}`)).toEqual(['buyers denominator'])
    // a new market key behind the held market lens is a late addition: refused
    expect(r.refusedLate.map((x) => x.key)).toEqual(['2026-09-01|industry-other|market|kind|praise'])
  })
})
