import { describe, it, expect } from 'vitest'

import { pooledDenominators } from '../../reading/market'
import { brandsBlockFor, brandsLine } from './brands'
import { buildMarketKinds, marketKindLabel, marketLevel } from './kinds'
import { byMarketSize, CALIBRATION_TAG, marketCalibration, marketSubjectSide } from './subjects'

// Staging's stored month rows for Sealand, August and September 2026 (read
// 26 Sep from `zfmxrrugaihxpubunleu`, data to 20 Sep): the denominators, the
// kinds, the mood and the subjects, per audience. The market pools the
// category with the four tracked rivals (decision E): September 625 + 12 + 6 +
// 5 + 6 = 654 videos, August 351 + 22 + 4 = 377.
const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']
const DEN = [
  ['2026-08-01', 'competitor:Cotopaxi', 22, 389], ['2026-08-01', 'competitor:Freitag', 4, 93], ['2026-08-01', 'industry-other', 351, 10188],
  ['2026-09-01', 'competitor:Cotopaxi', 12, 206], ['2026-09-01', 'competitor:Freitag', 6, 40], ['2026-09-01', 'competitor:Patagonia', 5, 122],
  ['2026-09-01', 'competitor:The North Face', 6, 44], ['2026-09-01', 'industry-other', 625, 15792],
  // The client's own posts are never in the market.
  ['2026-09-01', 'client', 9, 234],
].map(([month, audience, videos, comments]) => ({ month: month as string, audience: audience as string, videos: videos as number, comments: comments as number }))
const COUNTS = pooledDenominators(DEN, RIVALS)

const K = (month: string, audience: string, kind: string, videos: number) => ({ month, audience, kind, videos })
const KINDS = [
  K('2026-09-01', 'industry-other', 'praise', 449), K('2026-09-01', 'competitor:Cotopaxi', 'praise', 7), K('2026-09-01', 'competitor:Freitag', 'praise', 4),
  K('2026-09-01', 'competitor:Patagonia', 'praise', 3), K('2026-09-01', 'competitor:The North Face', 'praise', 5),
  K('2026-09-01', 'industry-other', 'purchase_intent', 371), K('2026-09-01', 'competitor:Cotopaxi', 'purchase_intent', 5), K('2026-09-01', 'competitor:Freitag', 'purchase_intent', 2),
  K('2026-09-01', 'competitor:Patagonia', 'purchase_intent', 2), K('2026-09-01', 'competitor:The North Face', 'purchase_intent', 1),
  K('2026-09-01', 'industry-other', 'buying_trigger', 5),
  K('2026-08-01', 'industry-other', 'praise', 279), K('2026-08-01', 'competitor:Cotopaxi', 'praise', 18), K('2026-08-01', 'competitor:Freitag', 'praise', 3),
  K('2026-08-01', 'industry-other', 'purchase_intent', 179), K('2026-08-01', 'competitor:Cotopaxi', 'purchase_intent', 15),
  K('2026-08-01', 'industry-other', 'buying_trigger', 3),
  // The client's own row is left out.
  K('2026-09-01', 'client', 'praise', 6),
]
const S = (month: string, audience: string, judged: number, positive: number, mixed: number, neutral: number, negative: number) =>
  ({ month, audience, judged, positive, mixed, neutral, negative })
const STATS = [
  S('2026-09-01', 'industry-other', 625, 483, 91, 39, 12), S('2026-09-01', 'competitor:Cotopaxi', 12, 7, 3, 1, 1), S('2026-09-01', 'competitor:Freitag', 6, 5, 0, 1, 0),
  S('2026-09-01', 'competitor:Patagonia', 5, 0, 4, 1, 0), S('2026-09-01', 'competitor:The North Face', 6, 3, 2, 1, 0),
  S('2026-08-01', 'industry-other', 351, 241, 71, 28, 11), S('2026-08-01', 'competitor:Cotopaxi', 22, 17, 2, 3, 0), S('2026-08-01', 'competitor:Freitag', 4, 4, 0, 0, 0),
]

describe('what people did in the comments, pooled over the market (decision E)', () => {
  const m = buildMarketKinds({ kindRows: KINDS, statsRows: STATS, counts: COUNTS, month: '2026-09-01', prevMonth: '2026-08-01', rivalAudiences: RIVALS, chip: 'not read as a change: we changed our searches in September' })

  it('sums each kind over the category and the tracked brands, never the client', () => {
    expect(m.n).toBe(654)
    expect(m.prev).toEqual({ month: '2026-08-01', n: 377, judged: 377 })
    expect(m.kinds.map((r) => [r.label, r.k, r.prevK])).toEqual([
      ['Praising it', 468, 300],
      ['Ready to buy', 381, 194],
      ['What made them look', 5, 3],
    ])
  })

  it('pools the four moods the same way, over the market’s judged videos', () => {
    expect(m.judged).toBe(654)
    expect(m.mood.map((r) => [r.label, r.k, r.prevK])).toEqual([
      ['Positive', 498, 262], ['Mixed', 100, 73], ['Neutral', 43, 31], ['Negative', 13, 11],
    ])
  })

  it('prints a kind under 10 as a count, never a share (§2.12)', () => {
    expect(marketLevel(468, 654)).toEqual({ text: '72%', kind: 'share' })
    expect(marketLevel(5, 654)).toEqual({ text: '5', kind: 'count' })
    expect(marketLevel(40, 45)).toEqual({ text: '40', kind: 'count' })
  })

  it('reads "Praising it" for praise, and every other kind as it reads everywhere', () => {
    expect(marketKindLabel('praise')).toBe('Praising it')
    expect(marketKindLabel('question')).toBe('Asking how it works')
  })

  it('leaves the kinds and the mood empty where their tables are not there', () => {
    const none = buildMarketKinds({ kindRows: null, statsRows: null, counts: COUNTS, month: '2026-09-01', prevMonth: '2026-08-01', rivalAudiences: RIVALS, chip: null })
    expect(none.kinds).toEqual([])
    expect(none.mood).toEqual([])
  })
})

describe('the market by subject (decision C and E)', () => {
  // Staging's `month_subject_readings` for Looks & style (the category's 102,
  // Freitag's 1) and Community & purpose (no row anywhere: never read).
  const SUBJECT_ROWS = [
    { month: '2026-09-01', audience: 'industry-other', subject_id: 'looks', videos: 102 },
    { month: '2026-09-01', audience: 'competitor:Freitag', subject_id: 'looks', videos: 1 },
    { month: '2026-08-01', audience: 'industry-other', subject_id: 'looks', videos: 37 },
    { month: '2026-08-01', audience: 'competitor:Cotopaxi', subject_id: 'looks', videos: 1 },
    { month: '2026-09-01', audience: 'client', subject_id: 'looks', videos: 4 },
  ]

  it('reads the pooled market side, never the client’s', () => {
    expect(marketSubjectSide(SUBJECT_ROWS, COUNTS, 'looks', '2026-09-01', RIVALS)).toEqual({ k: 103, n: 654, pct: 15.7 })
    expect(marketSubjectSide(SUBJECT_ROWS, COUNTS, 'looks', '2026-08-01', RIVALS)).toEqual({ k: 38, n: 377, pct: 10.1 })
  })

  it('a subject never read is "not read", not zero', () => {
    expect(marketSubjectSide(SUBJECT_ROWS, COUNTS, 'community', '2026-09-01', RIVALS)).toEqual({ k: null, n: 654, pct: null })
  })

  it('reads the three states, and a pre-WP1.1 "calibrating" as provisional', () => {
    expect(marketCalibration('calibrating')).toBe('provisional')
    expect(marketCalibration('ready')).toBe('ready')
    expect(marketCalibration('failed')).toBe('failed')
    expect(marketCalibration(null)).toBe('provisional')
    expect(CALIBRATION_TAG.failed).toBe('being re-described')
    expect(CALIBRATION_TAG.ready).toBeNull()
  })

  it('ranks by the market’s size, with a failed or unread subject last', () => {
    const rows = [
      { label: 'Comfort', market: { k: 43 }, calibration: 'ready' as const },
      { label: 'Repair & warranty', market: { k: 36 }, calibration: 'failed' as const },
      { label: 'Looks & style', market: { k: 103 }, calibration: 'provisional' as const },
      { label: 'Community & purpose', market: { k: null }, calibration: 'provisional' as const },
    ]
    expect([...rows].sort(byMarketSize).map((r) => r.label)).toEqual(['Looks & style', 'Comfort', 'Community & purpose', 'Repair & warranty'])
  })
})

describe('brands in your market, one line at deploy 2', () => {
  it('names the 4 Oct update while it is ahead, and Competitive by its current label', () => {
    expect(brandsLine(brandsBlockFor('2026-09-27T08:30:00.000Z'), 'Competitive')).toBe(
      'Brands in your market, counted in every video they come up in, arrive with the 4 Oct update. Until then, Competitive lists what was filed under each brand you track.',
    )
  })

  it('stops naming a date once that update has passed', () => {
    expect(brandsLine(brandsBlockFor('2026-10-04T08:30:00.000Z'), 'Competitive')).toContain('arrive with a coming update')
  })

  it('promises no update to a paused tenant (Össur, §2.13)', () => {
    const line = brandsLine(brandsBlockFor('2026-09-13T06:26:49.308Z', { paused: true }), 'Competitive')
    // No "Until then": a paused workspace has no update coming (deploy 2 review).
    expect(line).toBe('Brands in your market, counted in every video they come up in, are not read for this workspace yet. Competitive lists what was filed under each brand you track.')
  })
})
