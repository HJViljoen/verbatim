import { describe, expect, it } from 'vitest'

import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import { marketAudiences, pooledDenominators, pooledSide } from './market'

// ---- Fixtures: Sealand's stored rows, staging (a production copy to about 20 Sep) ----------
//
// DR F11, `month_denominators` (September is 1–20 Sep): the category, and each
// rival audience with a row. Rareform, Freedom of Movement and Old School have
// none. The client has no stored September row; the live function reads 8
// videos and 230 comments (DR F11, Q4), used here to show the client is left out.

const RIVALS = ['Cotopaxi', 'Freitag', 'Patagonia', 'The North Face', 'Rareform', 'Freedom of Movement', 'Old School'].map(rivalKey)
const COT = rivalKey('Cotopaxi')
const FRE = rivalKey('Freitag')
const PAT = rivalKey('Patagonia')
const TNF = rivalKey('The North Face')

const DENOMINATORS = [
  { month: '2026-04-01', audience: INDUSTRY_AUDIENCE, videos: 4, comments: 34 },
  { month: '2026-04-01', audience: COT, videos: 1, comments: 12 },
  { month: '2026-05-01', audience: INDUSTRY_AUDIENCE, videos: 8, comments: 25 },
  { month: '2026-05-01', audience: COT, videos: 3, comments: 16 },
  { month: '2026-06-01', audience: INDUSTRY_AUDIENCE, videos: 45, comments: 925 },
  { month: '2026-06-01', audience: COT, videos: 5, comments: 74 },
  { month: '2026-07-01', audience: INDUSTRY_AUDIENCE, videos: 35, comments: 710 },
  { month: '2026-07-01', audience: COT, videos: 1, comments: 5 },
  { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, videos: 351, comments: 10188 },
  { month: '2026-08-01', audience: COT, videos: 22, comments: 389 },
  { month: '2026-08-01', audience: FRE, videos: 4, comments: 93 },
  { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, videos: 625, comments: 15792 },
  { month: '2026-09-01', audience: COT, videos: 12, comments: 206 },
  { month: '2026-09-01', audience: FRE, videos: 6, comments: 40 },
  { month: '2026-09-01', audience: PAT, videos: 5, comments: 122 },
  { month: '2026-09-01', audience: TNF, videos: 6, comments: 44 },
  { month: '2026-09-01', audience: CLIENT_AUDIENCE, videos: 8, comments: 230 },
]

// DR F30, `month_subject_readings`, category k, and the rival subject cells.
// Community & purpose was created after the read and has no stored rows.
const LOOKS = [
  { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, k: 37 },
  { month: '2026-08-01', audience: COT, k: 1 },
  { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, k: 102 },
  { month: '2026-09-01', audience: FRE, k: 1 },
]
const COMFORT = [
  { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, k: 22 },
  { month: '2026-08-01', audience: COT, k: 6 },
  { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, k: 37 },
  { month: '2026-09-01', audience: COT, k: 2 },
  { month: '2026-09-01', audience: PAT, k: 2 },
  { month: '2026-09-01', audience: TNF, k: 2 },
]
const PRICE = [
  { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, k: 5 },
  { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, k: 23 },
  { month: '2026-09-01', audience: COT, k: 1 },
  { month: '2026-09-01', audience: FRE, k: 1 },
]

const COUNTS = pooledDenominators(DENOMINATORS, RIVALS)

describe('marketAudiences', () => {
  it('is the tracked rivals and the category, never the client', () => {
    expect(marketAudiences(RIVALS)).toEqual([...RIVALS, INDUSTRY_AUDIENCE])
    expect(marketAudiences([COT, CLIENT_AUDIENCE, COT, INDUSTRY_AUDIENCE])).toEqual([COT, INDUSTRY_AUDIENCE])
    expect(marketAudiences([])).toEqual([INDUSTRY_AUDIENCE])
  })
})

describe('pooledDenominators: Sealand', () => {
  it('August is 377 videos: 351 in the category and 26 filed under a tracked brand (decision E)', () => {
    expect(COUNTS.get('2026-08-01')).toEqual({ month: '2026-08-01', videos: 377, comments: 10670, category: 351, rivalFiled: 26 })
  })

  it('September (to 20 Sep) is 654: the client’s own 8 videos and 230 comments left out (BC F35, n 654)', () => {
    expect(COUNTS.get('2026-09-01')).toEqual({ month: '2026-09-01', videos: 654, comments: 16204, category: 625, rivalFiled: 29 })
    // With the client, the month's readable total is 662 videos and 16,434 comments (DR F11).
    const client = DENOMINATORS.find((r) => r.audience === CLIENT_AUDIENCE)
    expect(654 + (client?.videos ?? 0)).toBe(662)
    expect(16204 + (client?.comments ?? 0)).toBe(16434)
  })

  it('pools the back-read months the same way, oldest first', () => {
    expect([...COUNTS.keys()]).toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect([...COUNTS.values()].map((c) => c.videos)).toEqual([5, 11, 50, 36, 377, 654])
  })

  it('does not move when a video is re-filed between a tracked brand and the category', () => {
    // The re-tag decision H weighs: August's four Freitag videos (the German
    // word for Friday) moved into the category.
    const retagged = DENOMINATORS
      .filter((r) => !(r.month === '2026-08-01' && r.audience === FRE))
      .map((r) => (r.month === '2026-08-01' && r.audience === INDUSTRY_AUDIENCE ? { ...r, videos: 355, comments: 10281 } : r))
    const aug = pooledDenominators(retagged, RIVALS).get('2026-08-01')
    expect(aug?.videos).toBe(377)
    expect(aug?.comments).toBe(10670)
    expect(aug?.category).toBe(355)
    expect(aug?.rivalFiled).toBe(22)
  })

  it('counts only the rivals it is handed', () => {
    expect(pooledDenominators(DENOMINATORS, [FRE]).get('2026-08-01')?.videos).toBe(355)
  })

  it('a month with only the client’s row is not a market month', () => {
    const onlyClient = [{ month: '2026-09-01', audience: CLIENT_AUDIENCE, videos: 8, comments: 230 }]
    expect(pooledDenominators(onlyClient, RIVALS).size).toBe(0)
  })

  it('a row that is not a count makes the month null, not a smaller number', () => {
    const broken = DENOMINATORS.map((r) => (r.month === '2026-08-01' && r.audience === COT ? { ...r, videos: Number.NaN } : r))
    const aug = pooledDenominators(broken, RIVALS).get('2026-08-01')
    expect(aug?.videos).toBeNull()
    expect(aug?.rivalFiled).toBeNull()
    expect(aug?.category).toBe(351)
    expect(aug?.comments).toBe(10670)
  })

  it('reads one row per audience-month and ignores a repeat', () => {
    const doubled = [...DENOMINATORS, { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, videos: 351, comments: 10188 }]
    expect(pooledDenominators(doubled, RIVALS).get('2026-08-01')?.videos).toBe(377)
  })

  it('normalises the month key', () => {
    const at = [{ month: '2026-08-01T00:00:00.000Z', audience: INDUSTRY_AUDIENCE, videos: 351, comments: 10188 }]
    expect([...pooledDenominators(at, RIVALS).keys()]).toEqual(['2026-08-01'])
  })
})

describe('pooledSide: Sealand’s subjects on the market', () => {
  it('Looks & style: 38 of 377 in August and 103 of 654 in September', () => {
    expect(pooledSide(LOOKS, COUNTS, '2026-08-01', RIVALS)).toEqual({ k: 38, n: 377 })
    expect(pooledSide(LOOKS, COUNTS, '2026-09-01', RIVALS)).toEqual({ k: 103, n: 654 })
  })

  it('Comfort and Price pool their rival cells', () => {
    expect(pooledSide(COMFORT, COUNTS, '2026-08-01', RIVALS)).toEqual({ k: 28, n: 377 })
    expect(pooledSide(COMFORT, COUNTS, '2026-09-01', RIVALS)).toEqual({ k: 43, n: 654 })
    expect(pooledSide(PRICE, COUNTS, '2026-08-01', RIVALS)).toEqual({ k: 5, n: 377 })
    expect(pooledSide(PRICE, COUNTS, '2026-09-01', RIVALS)).toEqual({ k: 25, n: 654 })
  })

  it('a subject with no row in the month was not read: k is null, not 0 (Community & purpose)', () => {
    expect(pooledSide([], COUNTS, '2026-09-01', RIVALS)).toEqual({ k: null, n: 654 })
  })

  it('a row with no k makes the side null rather than a partial sum', () => {
    const partial = [...LOOKS, { month: '2026-09-01', audience: COT, k: null }]
    expect(pooledSide(partial, COUNTS, '2026-09-01', RIVALS)).toEqual({ k: null, n: 654 })
  })

  it('leaves out the client’s own posts and untracked audiences, and reads each audience once', () => {
    // A client row as large as Sealand's own 8 September videos: whatever it
    // holds, it is not the market.
    const withClient = [...LOOKS, { month: '2026-09-01', audience: CLIENT_AUDIENCE, k: 8 }, { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, k: 102 }]
    expect(pooledSide(withClient, COUNTS, '2026-09-01', RIVALS)).toEqual({ k: 103, n: 654 })
  })

  it('n is null for a month with no pooled denominator', () => {
    expect(pooledSide(LOOKS, COUNTS, '2026-10-01', RIVALS)).toEqual({ k: null, n: null })
  })
})
