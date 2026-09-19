import { describe, it, expect } from 'vitest'

import { directionRe } from '../test/copy-contract'
import {
  PLAYBOOK_ROWS,
  buildHeadToHead, buildPlaybook, coverageLine, headToHeadFigures, ownSides, playbookFigures,
  type PlaybookVideo,
} from './playbook'

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
    // EACH SENTENCE NAMES ITS KEY, AND THE TWO KEYS DO NOT SHARE A
    // DENOMINATOR. `FormatReading.of` counts the videos carrying a value for
    // THIS key, so one line under both tables overstated the hook table's.
    expect(p.coverageLine).toBe(
      'Read from 60 of The category’s 72 · 9 of Össur’s 14 · 13 of Ottobock’s 13 videos published in September, for their format.',
    )
    expect(p.hookCoverageLine).toContain('for their hook.')
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

  it('orders the engagement column by MEDIAN, not by how common the format is', () => {
    // 20 videos of a dull format against 5 of a good one: the token named
    // `playbook_best_format_engagement` used to publish the dull one's 1.0%,
    // because the column was count-ordered and `[0]` was the most common row.
    const p = buildPlaybook({
      month: '2026-09-01',
      brand: 'Össur',
      rival: null,
      videos: [
        ...run('category', 20, { classified_type: 'promotional', engagement_rate: 1 }),
        ...run('category', 5, { classified_type: 'entertainment', engagement_rate: 9 }),
      ],
    })
    expect(p.formats.keys.map((k) => k.key)).toEqual(['promotional', 'entertainment'])
    expect(p.engagement.map((r) => [r.key, r.engagement.median])).toEqual([
      ['entertainment', 9],
      ['promotional', 1],
    ])
    const f = playbookFigures(p)
    expect(f['playbook_best_format_engagement']).toEqual({
      value: 9,
      unit: 'pct',
      label: 'median engagement of Entertainment',
    })
    expect(f['playbook_best_format_n'].value).toBe(5)
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

  it('cuts the TABLE at six rows and leaves the reading whole underneath it', () => {
    // Össur's category in September: the highest median of the month was
    // `review`, off four videos — ninth by count, so a six-row table drops it.
    // The table may drop a row; the sentence and the engagement column may not.
    const wide = [
      ...run('category', 40, { classified_type: 'story', engagement_rate: 3.4 }),
      ...run('category', 30, { classified_type: 'educational', engagement_rate: 2.9 }),
      ...run('category', 25, { classified_type: 'promotional', engagement_rate: 1.3 }),
      ...run('category', 20, { classified_type: 'testimonial', engagement_rate: 2.9 }),
      ...run('category', 15, { classified_type: 'entertainment', engagement_rate: 3.1 }),
      ...run('category', 10, { classified_type: 'tutorial', engagement_rate: 2.1 }),
      ...run('category', 4, { classified_type: 'review', engagement_rate: 9.7 }),
    ]
    const p = buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: null, videos: wide })
    expect(p.formats.keys).toHaveLength(PLAYBOOK_ROWS)
    expect(p.formats.keys.map((k) => k.key)).not.toContain('review')
    expect(p.formats.sides[0].of).toBe(144)
    expect(p.engagement.map((r) => r.key)).toContain('review')
    expect(p.formats.conclusion).toContain('9.7%')
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
    expect(p.formats.sides[0].byKey['story']!.engagement).toEqual({ median: 2, n: 3, band: null })
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

  it('reads its median off the same exclusion list CO7 does, whatever that list is', () => {
    // One page, two sections, one set of videos: if the head-to-head hardcodes
    // the exclusion and the playbook takes it as a parameter, a caller that
    // ever overrides it gets two medians of the same videos side by side.
    const videos = [
      ...run('client', 3, { classified_type: 'story', engagement_rate: 2 }),
      ...run('client', 3, { classified_type: 'story', engagement_rate: 40, platform: 'youtube' }),
    ]
    const den = [{ month: '2026-09-01', audience: 'client', videos: 6, comments: 60 }]
    const both = (excludePlatforms: readonly string[]) => {
      const h = buildHeadToHead({
        month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos, denominators: den, excludePlatforms,
      })
      const p = buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: null, videos, excludePlatforms })
      return [
        h.measures.find((m) => m.key === 'engagement')!.you!.figure!.value,
        p.formats.sides.find((side) => side.audience === 'client')!.median.value,
      ]
    }
    const [h2hAll, playbookAll] = both(['reddit'])
    expect(h2hAll).toBe(playbookAll)
    expect(h2hAll).toBe(21)
    const [h2hNoYouTube, playbookNoYouTube] = both(['reddit', 'youtube'])
    expect(h2hNoYouTube).toBe(playbookNoYouTube)
    expect(h2hNoYouTube).toBe(2)
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

describe('the figure tables a document may name', () => {
  it('publishes each side’s classified n, published n and median, prefixed', () => {
    const f = playbookFigures(playbook())
    expect(f['playbook_category_classified']).toEqual({ value: 60, unit: 'videos', label: 'The category’s classified videos' })
    expect(f['playbook_own_published']).toEqual({ value: 14, unit: 'videos', label: 'Össur’s published videos' })
    expect(f['playbook_rival_median'].unit).toBe('pct')
    // Every token is prefixed, because reading.ts merges the registries into
    // one table and the last writer of a token wins.
    expect(Object.keys(f).every((k) => k.startsWith('playbook_'))).toBe(true)
  })

  it('publishes nothing at all where the reading is refused', () => {
    expect(playbookFigures(null)).toEqual({})
    expect(headToHeadFigures(null)).toEqual({})
  })

  it('gives each count the unit the MEASURE counted in, not the loop’s', () => {
    const DEN = [
      { month: '2026-08-01', audience: 'client', videos: 20, comments: 237 },
      { month: '2026-09-01', audience: 'client', videos: 19, comments: 151 },
      { month: '2026-09-01', audience: 'competitor:Ottobock', videos: 42, comments: 645 },
    ]
    const f = headToHeadFigures(
      buildHeadToHead({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: VIDEOS, denominators: DEN }),
    )
    // 151 and 645 are COMMENTS. Published as `videos` they rendered a comment
    // count as a video count on any document that named the token.
    expect(f['h2h_you_comments_per_video_k']).toEqual({
      value: 151,
      unit: 'comments',
      label: 'Comments per video, your side — the count behind it',
    })
    expect(f['h2h_rival_comments_per_video_k'].unit).toBe('comments')
    expect(f['h2h_you_comments_per_video_n']).toEqual({
      value: 19,
      unit: 'videos',
      label: 'Comments per video, your side — what it is of',
    })
    // Every other row really is videos on both sides of the count.
    for (const key of ['videos', 'engagement', 'sentiment', 'posts']) {
      const k = f[`h2h_you_${key}_k`]
      if (k) expect(k.unit).toBe('videos')
    }
    // …and no two tokens share a label, because a label is what the token
    // prints as and two sides of one row are two different numbers.
    const labels = Object.values(f).map((x) => x.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('publishes the figure the engagement row PRINTS, not only its coverage', () => {
    const DEN = [
      { month: '2026-09-01', audience: 'client', videos: 19, comments: 151 },
      { month: '2026-09-01', audience: 'competitor:Ottobock', videos: 42, comments: 645 },
    ]
    const h = buildHeadToHead({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: VIDEOS, denominators: DEN })
    const engagement = h.measures.find((m) => m.key === 'engagement')!
    expect(engagement.you!.text).toBe('2.4% median')
    const f = headToHeadFigures(h)
    // The coverage is 9 of 14; the median is 2.4% and had no token at all, so
    // `qr.p5.h2h` and `mkt.p5.comparison` could not name it — and a model that
    // typed "2.4%" itself would lose the sentence to `scrubProse`, correctly.
    expect(f['h2h_you_engagement_k'].value).toBe(9)
    expect(f['h2h_you_engagement_median']).toEqual({ value: 2.4, unit: 'pct', label: 'Engagement per video, your side' })
    expect(f['h2h_rival_engagement_median'].unit).toBe('pct')
    // The rate row publishes no figure token: `FigureTable`'s units are
    // videos / comments / pts / pct and a per-video rate is none of them.
    expect(f['h2h_you_comments_per_video_rate']).toBeUndefined()
  })

  it('publishes a percentage only where the measure is one, and always the count', () => {
    const DEN = [
      { month: '2026-08-01', audience: 'client', videos: 20, comments: 237 },
      { month: '2026-09-01', audience: 'client', videos: 19, comments: 151 },
      { month: '2026-09-01', audience: 'competitor:Ottobock', videos: 42, comments: 645 },
    ]
    const f = headToHeadFigures(
      buildHeadToHead({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: VIDEOS, denominators: DEN }),
    )
    expect(f['h2h_you_videos'].unit).toBe('pct')
    // Own posts is a count with no denominator: the count is published and no
    // percentage and no "of N" are, because the token would not hold one.
    expect(f['h2h_you_posts_k'].value).toBe(9)
    expect(f['h2h_you_posts']).toBeUndefined()
    expect(f['h2h_you_posts_n']).toBeUndefined()
  })
})

describe('the invariant the narrowed previous-month read rests on', () => {
  // `loadPlaybookVideos` reads the CURRENT month whole and the PREVIOUS month
  // narrowed to `is_client OR is_competitor`, because nothing uses the previous
  // month's CATEGORY rows: `buildHeadToHead`'s `sideOf` is called for `client`
  // and for the selected rival only, and `readIn(previousMonth)` comes off
  // `month_denominators`. Measured on 2026-09-18, those discarded rows were 82%
  // of Össur's previous month and 83% of Sealand's.
  //
  // That is an ASSUMPTION ABOUT PURE CODE, so it is pinned here rather than
  // left in the loader's comment. The day the head-to-head starts reading the
  // category's previous month — a category share of last month, say — this
  // fails, which is the moment the loader has to widen again.

  const august = (n: number, over: Partial<PlaybookVideo> = {}): PlaybookVideo[] =>
    Array.from({ length: n }, (_, i) =>
      vid({ id: `aug-cat-${i}`, upload_date: '2026-08-12', classified_type: 'story', engagement_rate: 2.7, sentiment: 'positive', sentiment_source: 'audience', ...over }),
    )

  const base: PlaybookVideo[] = [
    ...Array.from({ length: 20 }, (_, i) => vid({ id: `c-sep-${i}`, is_client: true, classified_type: 'story', engagement_rate: 2.4, sentiment: 'positive', sentiment_source: 'audience' })),
    ...Array.from({ length: 14 }, (_, i) => vid({ id: `c-aug-${i}`, upload_date: '2026-08-12', is_client: true, classified_type: 'story', engagement_rate: 2.7, sentiment: 'positive', sentiment_source: 'audience' })),
    ...Array.from({ length: 30 }, (_, i) => vid({ id: `r-sep-${i}`, is_competitor: true, competitor_name: 'Ottobock', classified_type: 'story', engagement_rate: 3.1, sentiment: 'positive', sentiment_source: 'audience' })),
    ...Array.from({ length: 22 }, (_, i) => vid({ id: `r-aug-${i}`, upload_date: '2026-08-12', is_competitor: true, competitor_name: 'Ottobock', classified_type: 'story', engagement_rate: 2.9, sentiment: 'neutral', sentiment_source: 'audience' })),
    ...Array.from({ length: 40 }, (_, i) => vid({ id: `x-sep-${i}`, classified_type: 'story', engagement_rate: 3.4 })),
  ]
  const denominators = [
    { month: '2026-08-01', audience: 'client', videos: 14, comments: 180 },
    { month: '2026-08-01', audience: 'competitor:Ottobock', videos: 22, comments: 400 },
    { month: '2026-08-01', audience: 'industry-other', videos: 300, comments: 5_000 },
    { month: '2026-09-01', audience: 'client', videos: 20, comments: 240 },
    { month: '2026-09-01', audience: 'competitor:Ottobock', videos: 30, comments: 520 },
    { month: '2026-09-01', audience: 'industry-other', videos: 40, comments: 900 },
  ]
  const args = { month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', denominators }

  it('reads the same head to head with and without the previous month’s category rows', () => {
    const narrow = buildHeadToHead({ ...args, videos: base })
    const whole = buildHeadToHead({ ...args, videos: [...base, ...august(300)] })
    expect(JSON.stringify(narrow)).toBe(JSON.stringify(whole))
  })

  it('reads the same playbook either way — it is scoped to the month in hand', () => {
    const narrow = buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: base })
    const whole = buildPlaybook({ month: '2026-09-01', brand: 'Össur', rival: 'Ottobock', videos: [...base, ...august(300)] })
    expect(JSON.stringify(narrow)).toBe(JSON.stringify(whole))
  })

  it('DOES change when a branded previous-month row is dropped — so the narrowing keeps those', () => {
    // The other half of the claim: the rows the read still fetches are rows the
    // answer depends on. Without it the test above would pass on a loader that
    // dropped the previous month entirely.
    const withoutRival = base.filter((v) => !v.id.startsWith('r-aug-'))
    expect(JSON.stringify(buildHeadToHead({ ...args, videos: withoutRival })))
      .not.toBe(JSON.stringify(buildHeadToHead({ ...args, videos: base })))
  })
})
