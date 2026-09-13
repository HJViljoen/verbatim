import { describe, expect, it } from 'vitest'
import { computeKeywordCandidates, type DiscoveryConfig, type DiscoveryVideo } from './keyword-discovery'
import { DISCOVERY_MAX_TERM_CHARS, DISCOVERY_MAX_TERMS, DISCOVERY_MIN_VIDEOS } from '../config'

const vid = (id: string, over: Partial<DiscoveryVideo> = {}): DiscoveryVideo => ({
  id,
  platform: 'tiktok',
  caption: null,
  hashtags: null,
  topics: null,
  source_keywords: null,
  comments_count: 0,
  is_client: false,
  is_competitor: false,
  source: 'discovered',
  ...over,
})

/** n videos that all carry the same topics/hashtags/caption. */
const many = (n: number, over: Partial<DiscoveryVideo> = {}): DiscoveryVideo[] =>
  Array.from({ length: n }, (_, i) => vid(`v${i}`, over))

const SEALAND: DiscoveryConfig = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_names: ['Cotopaxi', 'Freitag'],
  competitor_keywords: ['cotopaxi backpack'],
  industry_keywords: ['upcycled bag'],
  exclude_terms: [],
  own_handles: { tiktok: 'sealandgear', instagram: 'sealandgear' },
}

const byTerm = (rows: { term: string }[]) => rows.map((r) => r.term)

describe('computeKeywordCandidates', () => {
  it('keeps a recurring unconfigured topic with its counts', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['thrifting'], comments_count: 10 }),
      new Map([['v0', 2], ['v1', 1]]),
      SEALAND,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      term: 'thrifting',
      kind: 'topic',
      videos: 3,
      comments: 30,
      insights: 3,
      platforms: ['tiktok'],
    })
  })

  it('excludes a configured term that the candidate is contained IN ("sealandgear" vs "#sealandgear")', () => {
    const rows = computeKeywordCandidates(
      many(4, { hashtags: ['#SealandGear', '#thrifting'] }),
      new Map(),
      SEALAND,
    )
    expect(byTerm(rows)).toEqual(['thrifting'])
  })

  it('excludes a candidate that CONTAINS a configured term ("cotopaxiofficial" vs "cotopaxi")', () => {
    const rows = computeKeywordCandidates(
      many(3, { hashtags: ['cotopaxiofficial', 'cotopaxihaul', 'sailing'] }),
      new Map(),
      SEALAND,
    )
    expect(byTerm(rows)).toEqual(['sailing'])
  })

  it('keeps a single word a multi-word configured term merely contains ("bag" vs "upcycled bag")', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['bag', 'upcycled bag tutorial'] }),
      new Map(),
      { industry_keywords: ['upcycled bag'] },
    )
    // 'bag' is a broader term of its own; only the forward direction (a
    // candidate containing the whole configured phrase) excludes.
    expect(byTerm(rows)).toEqual(['bag'])
  })

  it('still excludes both ways for a tag-shaped configured term ("sealandgear" vs "#sealandgear")', () => {
    const rows = computeKeywordCandidates(
      many(3, { hashtags: ['sealandgear', 'thrifting'] }),
      new Map(),
      { brand_keywords: ['#sealandgear'] },
    )
    expect(byTerm(rows)).toEqual(['thrifting'])
  })

  it('excludes a space-stripped configured term ("upcycledbag" vs "upcycled bag")', () => {
    const rows = computeKeywordCandidates(
      many(3, { hashtags: ['upcycledbag', 'upcycledbagtutorial', 'denim'] }),
      new Map(),
      { industry_keywords: ['upcycled bag'] },
    )
    // A hashtag cannot hold a space, so both are the configured keyword.
    expect(byTerm(rows)).toEqual(['denim'])
  })

  it('excludes a punctuation-stripped configured term ("sealandgear" vs "sea-land gear")', () => {
    const rows = computeKeywordCandidates(
      many(3, { hashtags: ['sealandgear', 'sailing'] }),
      new Map(),
      { brand_keywords: ['sea-land gear'] },
    )
    // A hashtag holds neither the space nor the hyphen, so the tag IS the
    // configured keyword.
    expect(byTerm(rows)).toEqual(['sailing'])
  })

  it('excludes own_handles values and matches accent-insensitively (fold)', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['össur', 'prosthetics'] }),
      new Map(),
      { own_handles: { instagram: 'ossur' } },
    )
    expect(byTerm(rows)).toEqual(['prosthetics'])
  })

  it('excludes exclude_terms, but a short one only by equality (no substring wipeout)', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['ai', 'art', 'smartphone', 'heartfelt', 'cartoon', 'sustainability', 'giveaway'] }),
      new Map(),
      { exclude_terms: ['ai', 'art', 'giveaway'] },
    )
    // 'ai' goes on the 1-2 char rule, 'art' and 'giveaway' on exact exclusion.
    // Everything merely CONTAINING a sub-floor exclude survives: 'ai' in
    // 'sustainability', 'art' in 'smartphone' / 'heartfelt' / 'cartoon'.
    expect(byTerm(rows)).toEqual(['cartoon', 'heartfelt', 'smartphone', 'sustainability'])
  })

  it('does not let a long configured term delete a short candidate fragment', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['gea', 'land'] }),
      new Map(),
      { brand_keywords: ['#sealandgear'] },
    )
    // Both are fragments OF the configured handle; neither is it.
    expect(byTerm(rows)).toEqual(['gea', 'land'])
  })

  it('extracts hashtags from the caption for TikTok/YouTube, where hashtags[] is empty', () => {
    const rows = computeKeywordCandidates(
      many(3, { caption: 'new drop #Thrifting #sailing not#atag', hashtags: null }),
      new Map(),
      SEALAND,
    )
    expect(byTerm(rows).sort()).toEqual(['atag', 'sailing', 'thrifting'])
    expect(rows.every((r) => r.kind === 'hashtag')).toBe(true)
  })

  it('counts a hashtag once when the column and the caption both carry it', () => {
    const rows = computeKeywordCandidates(
      many(3, { hashtags: ['#thrifting'], caption: 'look #thrifting #thrifting' }),
      new Map(),
      SEALAND,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].videos).toBe(3)
  })

  it('keeps topics and hashtags as separate rows for the same word', () => {
    const rows = computeKeywordCandidates(
      many(3, { topics: ['thrifting'], hashtags: ['thrifting'] }),
      new Map(),
      SEALAND,
    )
    expect(rows.map((r) => r.kind).sort()).toEqual(['hashtag', 'topic'])
    expect(rows.every((r) => r.term === 'thrifting')).toBe(true)
  })

  it('drops the platform-noise stoplist, 1-2 char tokens and anything with no letter', () => {
    const rows = computeKeywordCandidates(
      many(3, {
        hashtags: ['fyp', 'fypシ', 'foryoupage', 'viral', 'reels', 'capcut', 'ad', '2026', '2026_', 'xy', 'sailing'],
        topics: ['___', '!!!', '...'],
      }),
      new Map(),
      SEALAND,
    )
    expect(byTerm(rows)).toEqual(['sailing'])
  })

  it('drops a run-on term too long for the unique index, keeps one at the limit', () => {
    const long = 'a'.repeat(DISCOVERY_MAX_TERM_CHARS + 1)
    const ok = 'b'.repeat(DISCOVERY_MAX_TERM_CHARS)
    const rows = computeKeywordCandidates(
      many(3, { caption: `#${long} #${ok}`, hashtags: ['c'.repeat(500)] }),
      new Map(),
      SEALAND,
    )
    expect(byTerm(rows)).toEqual([ok])
  })

  it('drops terms under the min-videos floor', () => {
    const videos = [
      ...many(DISCOVERY_MIN_VIDEOS, { topics: ['thrifting'] }),
      vid('rare1', { topics: ['kitesurfing'] }),
      vid('rare2', { topics: ['kitesurfing'] }),
    ]
    // Two distinct ids for the rare term, DISCOVERY_MIN_VIDEOS for the other.
    expect(DISCOVERY_MIN_VIDEOS).toBeGreaterThan(2)
    expect(byTerm(computeKeywordCandidates(videos, new Map(), SEALAND))).toEqual(['thrifting'])
  })

  it('counts found_by per configured keyword, once per video', () => {
    const rows = computeKeywordCandidates(
      [
        vid('v1', { topics: ['thrifting'], source_keywords: ['upcycled bag', 'upcycled bag', 'sailcloth bag'] }),
        vid('v2', { topics: ['thrifting'], source_keywords: ['upcycled bag'] }),
        vid('v3', { topics: ['thrifting'], source_keywords: [] }),
      ],
      new Map(),
      SEALAND,
    )
    expect(rows[0].found_by).toEqual({ 'upcycled bag': 2, 'sailcloth bag': 1 })
  })

  it('splits client / competitor / owned and unions platforms', () => {
    const rows = computeKeywordCandidates(
      [
        vid('v1', { topics: ['thrifting'], platform: 'instagram', source: 'owned', is_client: true }),
        vid('v2', { topics: ['thrifting'], platform: 'tiktok', is_competitor: true }),
        vid('v3', { topics: ['thrifting'], platform: 'tiktok' }),
      ],
      new Map(),
      SEALAND,
    )
    expect(rows[0]).toMatchObject({
      owned_videos: 1,
      client_videos: 1,
      competitor_videos: 1,
      platforms: ['instagram', 'tiktok'],
    })
  })

  it('sorts by videos desc, then comments desc', () => {
    const videos = [
      ...many(5, { topics: ['thrifting'] }).map((v) => ({ ...v, id: `a${v.id}` })),
      ...many(3, { topics: ['sailing'], comments_count: 1 }).map((v) => ({ ...v, id: `b${v.id}` })),
      ...many(3, { topics: ['kitesurfing'], comments_count: 100 }).map((v) => ({ ...v, id: `c${v.id}` })),
    ]
    expect(byTerm(computeKeywordCandidates(videos, new Map(), SEALAND))).toEqual([
      'thrifting',
      'kitesurfing',
      'sailing',
    ])
  })

  it('caps the output at DISCOVERY_MAX_TERMS, keeping the strongest', () => {
    // Term i appears on (i + DISCOVERY_MIN_VIDEOS) videos, so the highest index wins.
    const total = DISCOVERY_MAX_TERMS + 5
    const videos: DiscoveryVideo[] = []
    for (let i = 0; i < total; i++) {
      for (let n = 0; n < i + DISCOVERY_MIN_VIDEOS; n++) videos.push(vid(`v${i}-${n}`, { topics: [`term${i}`] }))
    }
    const rows = computeKeywordCandidates(videos, new Map(), SEALAND)
    expect(rows).toHaveLength(DISCOVERY_MAX_TERMS)
    expect(rows[0].term).toBe(`term${total - 1}`)
  })

  it('returns nothing when there are no videos or no terms', () => {
    expect(computeKeywordCandidates([], new Map(), SEALAND)).toEqual([])
    expect(computeKeywordCandidates(many(5), new Map(), SEALAND)).toEqual([])
  })
})
