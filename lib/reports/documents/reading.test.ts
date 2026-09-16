import { describe, expect, it } from 'vitest'

import type { Block } from '../../blocks/types'
import { blockContext } from '../../blocks/types'
import { EMAIL } from '../../email/theme'
import { methodItems } from './compose'
import {
  CLUSTERING_CAVEAT,
  blockReading,
  briefStamp,
  denominatorLine,
  denominatorsOf,
  mergeReadings,
  platformLine,
  type BriefDenominator,
} from './reading'
import type { FigureTable as ReadingFigures, Verdict } from '../../reading/verdicts'

const verdict = (objectId: string): Verdict => ({
  objectKind: 'subject',
  objectId,
  objectLabel: objectId,
  audience: 'industry-other',
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  value: { k: 28, n: 388 },
  changePts: null,
  bandPts: null,
  state: 'no_clear_change',
  flags: [],
})

const blockOf = (key: string, figures: ReadingFigures, verdicts: Verdict[] = []): Block<null> => ({
  key,
  title: key,
  render: () => null,
  figures: () => figures,
  verdicts: () => verdicts,
  emptyState: () => null,
})

describe('CLUSTERING_CAVEAT', () => {
  it('is the one wording, and the method page prints it rather than its own', () => {
    expect(CLUSTERING_CAVEAT).toContain('not like for like')
    expect(CLUSTERING_CAVEAT).toContain('no direction word is claimed over it')
    expect(methodItems(
      { reading: { crossesClustering: true, monthLabel: 'September 2026', monthStatus: 'frozen', month: '2026-09-01', readingAt: '2026-09-16T05:00:00.000Z', denominators: [], platformMix: {} }, competitors: [], company: 'Ossur', phrases: [], heldBackPhrases: 0, run: { conversations: 1, videos: 1 }, missing: [] } as never,
      'x', false, 5, ['method'],
    ).join(' ')).toContain(CLUSTERING_CAVEAT)
  })
})

describe('briefStamp', () => {
  it('names the month, the instant, and the day a filling month stops moving', () => {
    expect(briefStamp({ month: '2026-09-01', monthStatus: 'filling', readingAt: '2026-09-16T05:00:00.000Z' }))
      .toBe('September 2026 · reading as at 16 Sep 2026 · still filling until 31 Oct 2026')
  })

  it('drops the filling clause once the month is frozen', () => {
    expect(briefStamp({ month: '2026-07-01', monthStatus: 'frozen', readingAt: '2026-09-16T05:00:00.000Z' }))
      .toBe('July 2026 · reading as at 16 Sep 2026')
  })

  it('never says "update"', () => {
    const s = briefStamp({ month: '2026-09-01', monthStatus: 'filling', readingAt: '2026-09-16T05:00:00.000Z' })
    expect(s.toLowerCase()).not.toContain('update')
    expect(s.toLowerCase()).not.toContain('run')
  })
})

describe('denominatorLine', () => {
  const rows: BriefDenominator[] = [
    { audience: 'industry-other', label: 'the category', videos: 388, comments: 1406 },
    { audience: 'client', label: 'your own brand', videos: 158, comments: 198 },
  ]

  it('prints every audience and one comment total', () => {
    expect(denominatorLine(rows))
      .toBe('388 videos in the category · 158 videos in your own brand · 1,604 comments read.')
  })

  it('says so rather than printing nothing', () => {
    expect(denominatorLine([])).toBe('No denominator recorded for this month.')
  })

  it('agrees in number with one video and one comment', () => {
    expect(denominatorLine([{ audience: 'client', label: 'your own brand', videos: 1, comments: 1 }]))
      .toBe('1 video in your own brand · 1 comment read.')
  })
})

describe('platformLine', () => {
  it('is the mix biggest first, in the product\'s platform names', () => {
    expect(platformLine({ tiktok: 161, youtube: 135, instagram: 85, reddit: 68 }))
      .toBe('TikTok 161 · YouTube 135 · Instagram 85 · Reddit 68')
  })

  it('is empty where nothing was recorded, and a zero is not a platform', () => {
    expect(platformLine({})).toBe('')
    expect(platformLine({ reddit: 0 })).toBe('')
  })
})

describe('blockReading', () => {
  it('gathers every block\'s figures and verdicts without rendering one', () => {
    const blocks = [
      blockOf('overview.sentence', { share: { value: 7.2, unit: 'pct', label: 'share of the category' } }, [verdict('a')]),
      blockOf('overview.subjects', { videos: { value: 388, unit: 'videos', label: 'videos read for the category' } }, [verdict('b')]),
    ]
    const r = blockReading(blocks, null)
    expect(Object.keys(r.measured).sort()).toEqual(['share', 'videos'])
    expect(r.verdicts.map((v) => v.objectId)).toEqual(['a', 'b'])
  })

  it('crosses to printed figures exactly once, through proseFigures', () => {
    const r = blockReading([blockOf('overview.sentence', { share: { value: 7.25, unit: 'pct', label: 'share' } })], null)
    expect(r.figures.share).toEqual({ label: 'share', value: '7.3%', kind: 'pct' })
    expect(r.measured.share.value).toBe(7.25)
  })

  it('a block that answers neither costs nothing', () => {
    const bare: Block<null> = { key: 'x.y', title: 'x', render: () => null, emptyState: () => null }
    expect(blockReading([bare], null)).toEqual({ measured: {}, figures: {}, verdicts: [] })
  })

  it('renders nothing — the context is never used', () => {
    // blockReading is the answer a report reads WITHOUT rendering; this asserts
    // the shape a caller would otherwise be tempted to build.
    expect(blockContext('', EMAIL).image('overview.sentence')).toBeNull()
  })
})

describe('mergeReadings', () => {
  it('folds several surfaces into one table and one verdict list', () => {
    const a = { measured: { x: { value: 1, unit: 'videos' as const, label: 'x' } }, verdicts: [verdict('a')] }
    const b = { measured: { y: { value: 2, unit: 'videos' as const, label: 'y' } }, verdicts: [verdict('b')] }
    const r = mergeReadings([a, b])
    expect(Object.keys(r.measured).sort()).toEqual(['x', 'y'])
    expect(r.verdicts).toHaveLength(2)
    expect(r.figures.y.value).toBe('2')
  })

  it('the last surface wins a clash, which is what figureConflicts names', () => {
    const a = { measured: { x: { value: 1, unit: 'videos' as const, label: 'x' } }, verdicts: [] }
    const b = { measured: { x: { value: 9, unit: 'videos' as const, label: 'x' } }, verdicts: [] }
    expect(mergeReadings([a, b]).measured.x.value).toBe(9)
  })
})

describe('denominatorsOf', () => {
  const label = (a: string) => (a === 'client' ? 'your own brand' : a === 'industry-other' ? 'the category' : a.replace('competitor:', ''))

  it('is null-safe and orders by videos', () => {
    expect(denominatorsOf(null, label)).toEqual([])
    const rows = denominatorsOf(
      [
        { audience: 'client', videos: 158, comments: 198, platformMix: {}, dualMention: 0, excludedUndated: 0 },
        { audience: 'industry-other', videos: 388, comments: 1406, platformMix: {}, dualMention: 0, excludedUndated: 0 },
        { audience: 'competitor:Ottobock', videos: 0, comments: 0, platformMix: {}, dualMention: 0, excludedUndated: 0 },
      ],
      label,
    )
    expect(rows.map((r) => r.label)).toEqual(['the category', 'your own brand'])
  })
})
