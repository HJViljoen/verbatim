import { describe, it, expect } from 'vitest'

import { directionRe } from '../test/copy-contract'
import { buildHeadToHead, buildPlaybook, coverageLine, ownSides, type PlaybookVideo } from './playbook'

// CO3 and CO7's two builders, over the rows the loader reads.
//
// The shape is Össur's own September, read read-only on 2026-09-18: a category
// far wider than either brand, a classified n well under the published one on
// every side, and a rival whose own accounts have never yielded a post.

const vid = (over: Partial<PlaybookVideo> & { id: string }): PlaybookVideo => ({
  upload_date: '2026-09-10',
  platform: 'tiktok',
  classified_type: null,
  hook_style: null,
  engagement_rate: null,
  is_client: false,
  is_competitor: false,
  competitor_name: null,
  source: 'discovered',
  sentiment: null,
  sentiment_source: null,
  analyzed_lane: 'full',
  ...over,
})

const tag = (audience: 'client' | 'rival' | 'category') =>
  audience === 'client'
    ? { is_client: true }
    : audience === 'rival'
      ? { is_competitor: true, competitor_name: 'Ottobock' }
      : {}

const run = (
  audience: 'client' | 'rival' | 'category',
  n: number,
  over: Partial<PlaybookVideo> = {},
  month = '09',
): PlaybookVideo[] =>
  Array.from({ length: n }, (_, i) =>
    vid({ id: `${audience}-${month}-${over.classified_type ?? 'x'}-${i}`, upload_date: `2026-${month}-10`, ...tag(audience), ...over }),
  )

const VIDEOS: PlaybookVideo[] = [
  ...run('category', 40, { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 3.4 }),
  ...run('category', 20, { classified_type: 'promotional', hook_style: 'bold-claim', engagement_rate: 1.3 }),
  ...run('category', 12, { classified_type: null, hook_style: null }),
  ...run('client', 6, { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 2.4, source: 'owned' }),
  ...run('client', 3, { classified_type: 'promotional', hook_style: 'bold-claim', engagement_rate: 1.1, source: 'owned' }),
  ...run('client', 5, { classified_type: null }),
  ...run('rival', 9, { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 3.1 }),
  ...run('rival', 4, { classified_type: 'tutorial', hook_style: 'question', engagement_rate: 2.6 }),
]

const playbook = (over: Partial<Parameters<typeof buildPlaybook>[0]> = {}) =>
  buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: VIDEOS, ...over })

describe('buildPlaybook · CO7', () => {
  it('puts the category first, so the key order is the widest reading’s', () => {
    const p = playbook()
    expect(p.formats.sides.map((s) => s.label)).toEqual(['The category', 'Össur', 'Ottobock'])
    expect(p.formats.keys.map((k) => k.key)).toEqual(['story', 'promotional', 'tutorial'])
  })

  it('gives every column its own classified denominator, never the published one', () => {
    const p = playbook()
    expect(p.formats.sides.map((s) => [s.of, s.published])).toEqual([
      [60, 72],
      [9, 14],
      [13, 13],
    ])
    expect(p.coverageLine).toBe(
      'Read from 60 of The category’s 72 · 9 of Össur’s 14 · 13 of Ottobock’s 13 videos published in September.',
    )
  })

  it('leaves a column’s missing format null, and says the column WAS read', () => {
    const p = playbook()
    const rival = p.formats.sides[2]
    expect(rival.byKey['promotional']).toBeNull()
    expect(rival.unread).toBeNull()
    expect(rival.of).toBe(13)
  })

  it('humanises the classifier’s slugs, and never into a direction word', () => {
    const p = buildPlaybook({
      month: '2026-09-01',
      brand: 'Össur',
      rival: null,
      videos: [...run('category', 4, { classified_type: 'behind-the-scenes', hook_style: 'trend-riding', engagement_rate: 2 })],
    })
    expect(p.formats.keys[0].label).toBe('Behind the scenes')
    // `trend-riding` humanises to "Trend riding", and `trend` is in the shared
    // movement vocabulary — `workedLabel`'s own exception, which this path
    // inherits by using it rather than rolling a second humaniser.
    expect(p.hooks.keys[0].label).toBe('Riding what is current')
    expect(directionRe().test(p.hooks.keys[0].label)).toBe(false)
  })

  it('drops the rival column entirely where no rival is selected', () => {
    const p = playbook({ rival: null })
    expect(p.formats.sides.map((s) => s.audience)).toEqual(['industry-other', 'client'])
  })

  it('reads engagement off the category and "what not to make" off your own side', () => {
    const p = playbook()
    expect(p.engagement.map((r) => [r.key, r.engagement.median])).toEqual([
      ['story', 3.4],
      ['promotional', 1.3],
    ])
    // Your own median video runs at 2.4% here, so promotional (1.1%) is the
    // one below it — stated with both numbers and its n, never as an order.
    expect(p.below.map((r) => [r.key, r.engagement.median, r.value])).toEqual([['promotional', 1.1, { k: 3, n: 9 }]])
  })

  it('excludes Reddit from every engagement figure and names the reason', () => {
    const p = buildPlaybook({
      month: '2026-09-01',
      brand: 'Össur',
      rival: null,
      videos: [
        ...run('category', 3, { classified_type: 'story', engagement_rate: 2 }),
        ...run('category', 3, { classified_type: 'story', engagement_rate: 88, platform: 'reddit' }),
      ],
    })
    expect(p.formats.sides[0].byKey['story']!.engagement).toEqual({ median: 2, n: 3 })
    expect(p.formats.sides[0].byKey['story']!.value).toEqual({ k: 6, n: 6 })
    expect(p.excludedNote).toContain('capped at 40')
  })

  it('says so when nothing published in the month has been classified', () => {
    const p = buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: null, videos: run('category', 5) })
    expect(p.unread).toContain('has been classified yet')
  })

  it('keeps the published clock on the block itself', () => {
    expect(playbook().basisLine).toBe('videos published in September')
  })
})

describe('buildHeadToHead · CO3', () => {
  const DEN = [
    { month: '2026-08-01', audience: 'client', videos: 20, comments: 237 },
    { month: '2026-08-01', audience: 'competitor:Ottobock', videos: 73, comments: 1264 },
    { month: '2026-08-01', audience: 'industry-other', videos: 628, comments: 23542 },
    { month: '2026-09-01', audience: 'client', videos: 19, comments: 151 },
    { month: '2026-09-01', audience: 'competitor:Ottobock', videos: 42, comments: 645 },
    { month: '2026-09-01', audience: 'industry-other', videos: 388, comments: 10534 },
  ]
  const h2h = (videos: readonly PlaybookVideo[] = VIDEOS) =>
    buildHeadToHead({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos, denominators: DEN })

  it('takes the share measures off the denominators and the rest off the videos', () => {
    const r = h2h()
    const share = r.measures.find((m) => m.key === 'videos')!
    expect(share.you!.value).toEqual({ k: 19, n: 449 })
    expect(share.you!.prev!.value).toEqual({ k: 20, n: 721 })
    const engagement = r.measures.find((m) => m.key === 'engagement')!
    expect(engagement.you!.text).toBe('2.4% median')
    expect(engagement.you!.value).toEqual({ k: 9, n: 14 })
  })

  it('names which clock each row keeps, because they are not the same clock', () => {
    const r = h2h()
    expect(r.measures.find((m) => m.key === 'videos')!.basisLine).toBe('videos and comments dated in September')
    expect(r.measures.find((m) => m.key === 'engagement')!.basisLine).toBe('videos published in September')
    expect(r.measures.find((m) => m.key === 'sentiment')!.basisLine).toBe('videos published in September')
  })

  it('reads own posts off videos.source, not off a configured handle', () => {
    const posts = h2h().measures.find((m) => m.key === 'posts')!
    expect(posts.you!.value.k).toBe(9)
    // Ottobock's accounts have never yielded a post — a zero there would tell a
    // paying client their rival went quiet, so the side is null with a reason.
    expect(posts.them).toBeNull()
    expect(posts.why).toContain('tracked accounts only')
  })

  it('counts only audience-family sentiment, never how a video framed itself', () => {
    const videos = [
      ...run('client', 6, { sentiment: 'positive', sentiment_source: 'audience' }),
      ...run('client', 4, { sentiment: 'positive', sentiment_source: 'framing' }),
      ...run('client', 4, { sentiment: 'negative', sentiment_source: 'audience' }),
      ...run('rival', 12, { sentiment: 'positive', sentiment_source: 'audience' }),
    ]
    const sentiment = h2h(videos).measures.find((m) => m.key === 'sentiment')!
    expect(sentiment.you!.value).toEqual({ k: 6, n: 10 })
    expect(sentiment.them!.value).toEqual({ k: 12, n: 12 })
  })

  it('names the rival’s videos and what they are of, in the footer', () => {
    expect(h2h().footerLine).toBe('42 videos of theirs read in Sep 2026, of 449 read in all.')
  })
})

describe('coverageLine', () => {
  it('prints both numbers per column, so the classified gap is visible', () => {
    expect(coverageLine([{ audienceLabel: 'The category', of: 569, published: 1388 }], '2026-09-01')).toBe(
      'Read from 569 of The category’s 1,388 videos published in September.',
    )
  })
})

describe('ownSides · week.worked.yourhooks', () => {
  it('keeps your column alone, with the month’s own denominator and its basis', () => {
    const sides = ownSides({
      month: '2026-09-01',
      brand: 'Össur',
      videos: [
        ...run('client', 6, { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 2.4, source: 'owned' }),
        ...run('client', 3, { classified_type: null, source: 'owned' }),
        ...run('category', 40, { classified_type: 'story', engagement_rate: 3.4 }),
      ],
    })
    expect(sides.formats.sides.map((s) => s.audience)).toEqual(['client'])
    expect(sides.formats.sides[0].of).toBe(6)
    expect(sides.formats.sides[0].published).toBe(9)
    expect(sides.basisLine).toBe('videos published in September')
    expect(sides.coverageLine).toBe('Read from 6 of Össur’s 9 videos published in September.')
  })

  it('states the month, not the update — the two are different figures', () => {
    const sides = ownSides({
      month: '2026-09-01',
      brand: 'Össur',
      videos: [
        ...run('client', 4, { classified_type: 'story', engagement_rate: 2 }),
        ...run('client', 9, { classified_type: 'story', engagement_rate: 2 }, '08'),
      ],
    })
    expect(sides.formats.sides[0].of).toBe(4)
  })
})
