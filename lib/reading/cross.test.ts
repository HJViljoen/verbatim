import { describe, expect, it } from 'vitest'

import { BRAND_RULE_VERSION, WATCHED_RULE_VERSION } from '../brands/aliases'
import { brandReadingRows, pooledBrandMonth, type ReadBrand } from '../brands/readings'
import type { PlannedMention } from '../brands/mentions'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import {
  brandKinds, brandMonthPair, brandMonthVideos, brandSubjects, commentVideoKey, countedMentions, creatorFollowers, creatorThemes,
  groupMonthVideos, groupSubjects, themeMonthLine, themePlatforms,
  type BrandLens, type CreatorVideo, type GroupEvidence, type GroupPersona, type MentionRowIn, type StoredBrandMonthRow, type ThemePlatformRow,
} from './cross'
import { refuseEveryPair, type PairOn } from './pairs'
import type { MonthPoint, MonthSeries } from './series'

// Hand-built fixtures throughout: every expected figure below is counted by
// hand from the rows beside it.

const SEP = '2026-09-01'
const AUG = '2026-08-01'
const COT = rivalKey('Cotopaxi')
const PAT = rivalKey('Patagonia')
const COT_ID = '11111111-1111-4111-8111-111111111111'

// ---- countedMentions -----------------------------------------------------------

describe('countedMentions', () => {
  const row = (over: Partial<MentionRowIn>): MentionRowIn => ({
    video_id: 'v1', brand_key: COT_ID, source: 'comment', comment_id: 'c1', comment_month: '2026-09-14', method: 'rule', rule_version: BRAND_RULE_VERSION, ...over,
  })

  it('keeps the rules’ own versions, once per hit, with the comment month normalised', () => {
    const out = countedMentions([
      row({}),
      row({}), // the same hit again
      row({ method: 'confirmed', rule_version: `${BRAND_RULE_VERSION}+confirm_v1` }), // repeats the rule hit
      row({ video_id: 'v2', source: 'content', comment_id: null, comment_month: null }),
      row({ video_id: 'v3', brand_key: 'watched:peak-design', rule_version: WATCHED_RULE_VERSION }),
      row({ video_id: 'v4', rule_version: 'brands_v0' }), // an older rule
    ])
    expect(out).toEqual([
      { videoId: 'v1', brandKey: COT_ID, source: 'comment', commentMonth: SEP },
      { videoId: 'v2', brandKey: COT_ID, source: 'content', commentMonth: null },
      { videoId: 'v3', brandKey: 'watched:peak-design', source: 'comment', commentMonth: SEP },
    ])
  })

  it('drops a hit a confirm rejected', () => {
    const out = countedMentions([
      row({}),
      row({ method: 'rejected', rule_version: `${BRAND_RULE_VERSION}+confirm_v1` }),
      row({ video_id: 'v2', comment_id: 'c2' }),
    ])
    expect(out.map((m) => m.videoId)).toEqual(['v2'])
  })

  it('reads nothing from nothing', () => {
    expect(countedMentions([])).toEqual([])
  })
})

// ---- brandMonthVideos -------------------------------------------------------------

describe('brandMonthVideos', () => {
  const market = [
    { videoId: 'm1', audience: INDUSTRY_AUDIENCE },
    { videoId: 'm2', audience: INDUSTRY_AUDIENCE },
    { videoId: 'm3', audience: COT },
    { videoId: 'm4', audience: INDUSTRY_AUDIENCE },
    { videoId: 'm5', audience: INDUSTRY_AUDIENCE },
    { videoId: 'own', audience: CLIENT_AUDIENCE }, // never the market
  ]
  const mentions = countedMentions([
    // m1: named in its content (any month counts)
    { video_id: 'm1', brand_key: COT_ID, source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: BRAND_RULE_VERSION },
    // m2: named in three September comments: one video
    ...['a', 'b', 'c'].map((c) => ({ video_id: 'm2', brand_key: COT_ID, source: 'comment', comment_id: c, comment_month: '2026-09-03', method: 'rule', rule_version: BRAND_RULE_VERSION })),
    // m4: named only in an August comment: not September's
    { video_id: 'm4', brand_key: COT_ID, source: 'comment', comment_id: 'd', comment_month: '2026-08-30', method: 'rule', rule_version: BRAND_RULE_VERSION },
    // m3: Cotopaxi's own post naming itself: never the market naming it
    { video_id: 'm3', brand_key: COT_ID, source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: BRAND_RULE_VERSION },
    // m5: named, but found by our rival searches
    { video_id: 'm5', brand_key: COT_ID, source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: BRAND_RULE_VERSION },
    // the client's own post is not in the market at all
    { video_id: 'own', brand_key: 'client', source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: BRAND_RULE_VERSION },
    // not in the month's market
    { video_id: 'gone', brand_key: COT_ID, source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: BRAND_RULE_VERSION },
  ])
  const ownerOf = (v: string): string | null => (v === 'm3' ? COT_ID : v === 'own' ? 'client' : null)
  const rivalFound = new Set(['m5', 'm4'])

  it('counts each video once, by the readings step’s rule', () => {
    const [cot, client] = brandMonthVideos({
      month: '2026-09-17', brands: [{ brandKey: COT_ID, label: 'Cotopaxi' }, { brandKey: 'client', label: 'Sealand' }], mentions, market, ownerOf, rivalFound,
    })
    expect(cot).toMatchObject({ brandKey: COT_ID, month: SEP, any: ['m1', 'm2', 'm5'], organic: ['m1', 'm2'], n: 5, nOrganic: 3 })
    expect(client).toMatchObject({ brandKey: 'client', any: [], organic: [], n: 5 })
  })

  it('equals month_brand_readings’ pooled k_any and k_organic for the same inputs (parity)', () => {
    const brands: ReadBrand[] = [{ brandKey: COT_ID, ruleVersion: BRAND_RULE_VERSION, rule: { brand: 'Cotopaxi' } as ReadBrand['rule'] }]
    const planned: PlannedMention[] = mentions.map((m) => ({
      brand: 'Cotopaxi', excerpt: null,
      row: { client_id: 'x', video_id: m.videoId, brand_key: m.brandKey, source: m.source, field: null, comment_id: null, comment_month: m.commentMonth, method: 'rule', rule_version: BRAND_RULE_VERSION },
    }))
    const markets = new Map([[SEP, market.filter((v) => v.audience !== CLIENT_AUDIENCE).map((v) => ({ id: v.videoId, platform: 'tiktok', audience: v.audience, dated: 1 }))]])
    const rows = brandReadingRows('x', { brands, plan: { mentions: planned, homonymVideos: new Map(), dropped: [] }, ownerOf, markets, rivalFound })
    const pooled = pooledBrandMonth(rows, SEP, COT_ID)
    const [cot] = brandMonthVideos({ month: SEP, brands: [{ brandKey: COT_ID, label: 'Cotopaxi' }], mentions, market, ownerOf, rivalFound })
    expect([cot.any.length, cot.organic.length, cot.n, cot.nOrganic]).toEqual([pooled.k_any, pooled.k_organic, pooled.n, pooled.n_organic])
  })

  it('reads an empty month as empty', () => {
    expect(brandMonthVideos({ month: SEP, brands: [{ brandKey: COT_ID, label: 'Cotopaxi' }], mentions: [], market: [], ownerOf, rivalFound: new Set() }))
      .toEqual([{ brandKey: COT_ID, label: 'Cotopaxi', month: SEP, any: [], organic: [], n: 0, nOrganic: 0 }])
    expect(brandMonthVideos({ month: SEP, brands: [], mentions, market, ownerOf, rivalFound })).toEqual([])
  })
})

// ---- brandKinds / brandSubjects -----------------------------------------------------

describe('brandKinds and brandSubjects', () => {
  // Cotopaxi's 14 September videos: 11 in the category, 3 filed under it.
  const lens: BrandLens = {
    brandKey: COT_ID, label: 'Cotopaxi', base: 'organic',
    rows: [
      { audience: INDUSTRY_AUDIENCE, object_kind: 'denominator', object_id: 'videos', k: 11, n: 11 },
      { audience: INDUSTRY_AUDIENCE, object_kind: 'denominator', object_id: 'comments', k: 420, n: 420 },
      { audience: INDUSTRY_AUDIENCE, object_kind: 'kind', object_id: 'praise', k: 6, n: 11 },
      { audience: INDUSTRY_AUDIENCE, object_kind: 'kind', object_id: 'pain_point', k: 4, n: 11 },
      { audience: INDUSTRY_AUDIENCE, object_kind: 'subject', object_id: 's-price', k: 5, n: 11 },
      { audience: INDUSTRY_AUDIENCE, object_kind: 'subject', object_id: 's-retired', k: 9, n: 11 },
      { audience: COT, object_kind: 'denominator', object_id: 'videos', k: 3, n: 3 },
      { audience: COT, object_kind: 'denominator', object_id: 'videos', k: 3, n: 3 }, // a repeated row is not added twice
      { audience: COT, object_kind: 'kind', object_id: 'praise', k: 2, n: 3 },
      { audience: COT, object_kind: 'kind', object_id: 'question', k: 3, n: 3 },
      { audience: COT, object_kind: 'subject', object_id: 's-durable', k: 1, n: 3 },
      { audience: COT, object_kind: 'mood', object_id: 'positive', k: 2, n: 3 },
      // a client row would be the brand's own posts: never pooled
      { audience: CLIENT_AUDIENCE, object_kind: 'denominator', object_id: 'videos', k: 5, n: 5 },
      { audience: CLIENT_AUDIENCE, object_kind: 'kind', object_id: 'praise', k: 5, n: 5 },
    ],
  }

  it('pools a brand’s kinds over the market’s audiences, k of the brand’s n', () => {
    const [row] = brandKinds('2026-09-20', [lens])
    expect(row).toMatchObject({ brandKey: COT_ID, month: SEP, base: 'organic', n: 14 })
    expect(row.cells).toEqual([
      { id: 'praise', label: 'praise', k: 8, n: 14 },
      { id: 'pain_point', label: 'pain_point', k: 4, n: 14 },
      { id: 'question', label: 'question', k: 3, n: 14 },
    ])
  })

  it('names subjects, leaves out one nobody names, and sorts largest first', () => {
    const [row] = brandSubjects(SEP, [lens], new Map([['s-price', 'Price'], ['s-durable', 'Durability']]))
    expect(row.n).toBe(14)
    expect(row.cells).toEqual([
      { id: 's-price', label: 'Price', k: 5, n: 14 },
      { id: 's-durable', label: 'Durability', k: 1, n: 14 },
    ])
  })

  it('reads a brand with no video this month as n 0 and no cells', () => {
    const empty: BrandLens = { brandKey: 'client', label: 'Sealand', base: 'organic', rows: [] }
    expect(brandKinds(SEP, [empty])).toEqual([{ brandKey: 'client', label: 'Sealand', month: SEP, base: 'organic', n: 0, cells: [] }])
    expect(brandSubjects(SEP, [], new Map())).toEqual([])
  })
})

// ---- brandMonthPair ---------------------------------------------------------------

describe('brandMonthPair', () => {
  const r = (month: string, audience: string, k_organic: number, n_organic: number, k_any = k_organic, n = n_organic): StoredBrandMonthRow =>
    ({ month, audience, brand_key: COT_ID, k_any, k_organic, n, n_organic })
  const audiences = [INDUSTRY_AUDIENCE, COT, PAT]
  const brands = [{ brandKey: COT_ID, label: 'Cotopaxi' }]

  it('pools the market’s audiences and bands this month against last', () => {
    const rows = [
      r(SEP, INDUSTRY_AUDIENCE, 70, 380, 75, 400), r(SEP, COT, 10, 20, 12, 25),
      r(SEP, rivalKey('Retired'), 50, 50), // not a market audience here
      r(SEP, CLIENT_AUDIENCE, 9, 9), // never the market
      r(AUG, INDUSTRY_AUDIENCE, 10, 280), r(AUG, COT, 2, 20),
    ]
    const [p] = brandMonthPair({ month: SEP, brands, rows, audiences, pair: null })
    expect(p).toMatchObject({ month: SEP, prevMonth: AUG, curr: { k: 80, n: 400 }, prev: { k: 12, n: 300 }, currAny: { k: 87, n: 425 } })
    expect(p.verdict).toMatchObject({ objectKind: 'rival', objectId: COT_ID, state: 'moved', value: { k: 80, n: 400 }, baseline: { k: 12, n: 300 } })
    expect(p.verdict?.countedOver?.measure).toBe('videos')
    expect(p.verdict?.direction).toBeUndefined()
  })

  it('says too little where a side is under the floor', () => {
    const [p] = brandMonthPair({ month: SEP, brands, rows: [r(SEP, COT, 4, 30), r(AUG, COT, 2, 25)], audiences, pair: null })
    expect(p.verdict?.state).toBe('too_little_data')
    expect(p.prev).toEqual({ k: 2, n: 25 })
  })

  it('prints this month alone where the month pair is refused', () => {
    const rows = [r(SEP, INDUSTRY_AUDIENCE, 80, 400), r(AUG, INDUSTRY_AUDIENCE, 12, 300)]
    const [p] = brandMonthPair({ month: SEP, brands, rows, audiences, pair: refuseEveryPair })
    expect(p.verdict?.state).toBe('refused')
    expect(p.verdict?.baseline).toBeUndefined()
    expect(p.prev).toBeNull()
    expect(p.curr).toEqual({ k: 80, n: 400 })
  })

  it('judges the pair on the brands view', () => {
    const asked: string[] = []
    const pair: PairOn = (prev, month, audience) => { asked.push(`${prev}>${month}@${audience}`); return { prevMonth: prev, month, mode: 'comparable', reasons: [], row: null } }
    brandMonthPair({ month: SEP, brands, rows: [r(SEP, INDUSTRY_AUDIENCE, 1, 100)], audiences, pair })
    expect(asked).toEqual([`${AUG}>${SEP}@panel:brands`])
  })

  it('gives no verdict to a brand with no row this month, and nothing for no brands', () => {
    const [p] = brandMonthPair({ month: SEP, brands, rows: [r(AUG, INDUSTRY_AUDIENCE, 3, 300)], audiences, pair: null })
    expect(p).toMatchObject({ curr: null, prev: { k: 3, n: 300 }, verdict: null })
    expect(brandMonthPair({ month: SEP, brands: [], rows: [], audiences, pair: null })).toEqual([])
  })
})

// ---- creatorThemes ----------------------------------------------------------------

describe('creatorThemes', () => {
  const v = (videoId: string, account: string | null, over: Partial<CreatorVideo> = {}): CreatorVideo =>
    ({ videoId, audience: INDUSTRY_AUDIENCE, platform: 'tiktok', account, followers: null, scrapedAt: null, ...over })
  const videos: CreatorVideo[] = [
    v('a1', 'runclub', { followers: 9000, scrapedAt: '2026-09-02T00:00:00Z' }),
    v('a2', 'runclub', { followers: 9500, scrapedAt: '2026-09-20T00:00:00Z' }),
    v('a3', 'runclub', { followers: 12000, scrapedAt: '2026-09-10T00:00:00Z' }),
    v('a1', 'runclub'), // the same video twice: once
    v('b1', 'r/amputee', { platform: 'reddit', followers: 48000, scrapedAt: '2026-09-21T00:00:00Z' }),
    v('b2', 'r/amputee', { platform: 'reddit', followers: 48100 }),
    v('c1', 'clinic', { audience: COT, followers: 0 }),
    v('x1', null),
    v('own1', 'ossur', { audience: CLIENT_AUDIENCE }),
  ]
  const refs = [
    { themeId: 'run', audience: INDUSTRY_AUDIENCE, videoIds: ['a1', 'a2', 'b1', 'z1', 'z2'] },
    { themeId: 'run', audience: COT, videoIds: ['c1', 'a1'] }, // a1 again: once
    { themeId: 'pay', audience: INDUSTRY_AUDIENCE, videoIds: ['a3', 'b1', 'b2'] },
    { themeId: 'own', audience: CLIENT_AUDIENCE, videoIds: ['own1'] },
  ]

  it('counts each creator’s videos in each conversation, of theirs and of the conversation’s', () => {
    const out = creatorThemes({ month: '2026-09-30', videos, refs, audiences: [INDUSTRY_AUDIENCE, COT] })
    expect(out.month).toBe(SEP)
    expect(out.videos).toBe(7)
    expect(out.themeVideos).toEqual({ run: 6, pay: 3 })
    expect(out.creators.map((c) => [c.key, c.videos, c.followers])).toEqual([
      ['tiktok|runclub', 3, 9500],
      ['reddit|r/amputee', 2, null],
      ['tiktok|clinic', 1, null],
    ])
    expect(out.creators[0].themes).toEqual([
      { themeId: 'run', k: 2, ofCreator: 3, ofTheme: 6 },
      { themeId: 'pay', k: 1, ofCreator: 3, ofTheme: 3 },
    ])
    expect(out.creators[1].themes).toEqual([
      { themeId: 'pay', k: 2, ofCreator: 2, ofTheme: 3 },
      { themeId: 'run', k: 1, ofCreator: 2, ofTheme: 6 },
    ])
  })

  it('reads every audience given when none is named', () => {
    const out = creatorThemes({ month: SEP, videos, refs })
    expect(out.videos).toBe(8)
    expect(out.themeVideos.own).toBe(1)
  })

  it('reads empty inputs as empty', () => {
    expect(creatorThemes({ month: SEP, videos: [], refs: [] })).toEqual({ month: SEP, videos: 0, themeVideos: {}, creators: [] })
  })
})

describe('creatorFollowers', () => {
  it('takes the newest snapshot above zero, never Reddit’s', () => {
    const f = creatorFollowers([
      { videoId: '1', audience: INDUSTRY_AUDIENCE, platform: 'instagram', account: 'a', followers: 300, scrapedAt: '2026-09-01T00:00:00Z' },
      { videoId: '2', audience: INDUSTRY_AUDIENCE, platform: 'instagram', account: 'a', followers: 0, scrapedAt: '2026-09-30T00:00:00Z' },
      { videoId: '3', audience: INDUSTRY_AUDIENCE, platform: 'instagram', account: 'a', followers: 280, scrapedAt: '2026-09-15T00:00:00Z' },
      { videoId: '4', audience: INDUSTRY_AUDIENCE, platform: 'reddit', account: 'r/x', followers: 90000, scrapedAt: '2026-09-15T00:00:00Z' },
      { videoId: '5', audience: INDUSTRY_AUDIENCE, platform: 'youtube', account: 'y', followers: null, scrapedAt: null },
    ])
    expect(f).toEqual(new Map([['instagram|a', 280], ['reddit|r/x', null], ['youtube|y', null]]))
  })
})

// ---- groups -----------------------------------------------------------------------

describe('groupMonthVideos and groupSubjects', () => {
  const market = new Map([
    [commentVideoKey('tiktok', 'T1'), 'v1'],
    [commentVideoKey('tiktok', 'T2'), 'v2'],
    [commentVideoKey('youtube', 'Y1'), 'v3'],
  ])
  const personas: GroupPersona[] = [
    { key: 'caretaker', name: 'Caretakers', insightIds: ['i1', 'i2', 'i3'] },
    { key: 'athlete', name: 'Athletes', insightIds: ['i4'] },
    { key: 'quiet', name: 'Quiet', insightIds: [] },
  ]
  const e = (insightId: string, commentId: string, platform: string, platformVideoId: string, commentDate: string | null): GroupEvidence =>
    ({ insightId, commentId, platform, platformVideoId, commentDate })
  const evidence: GroupEvidence[] = [
    // v1 carries four of the caretakers' comments this month: one video
    e('i1', 'c1', 'tiktok', 'T1', '2026-09-02T10:00:00Z'),
    e('i1', 'c2', 'tiktok', 'T1', '2026-09-03T10:00:00Z'),
    e('i2', 'c3', 'tiktok', 'T1', '2026-09-04T10:00:00Z'),
    e('i3', 'c4', 'tiktok', 'T1', '2026-09-30T23:59:59Z'),
    // a comment in another month: not September's
    e('i2', 'c5', 'tiktok', 'T2', '2026-08-31T23:59:59Z'),
    e('i2', 'c6', 'tiktok', 'T2', '2026-10-01T00:00:00Z'),
    // undated, and on a video that is not the market's: left out
    e('i3', 'c7', 'youtube', 'Y1', null),
    e('i3', 'c8', 'youtube', 'OWN', '2026-09-10T00:00:00Z'),
    // the same platform video id on another platform is another video
    e('i3', 'c9', 'youtube', 'T1', '2026-09-10T00:00:00Z'),
    e('i3', 'c10', 'youtube', 'Y1', '2026-09-11T00:00:00Z'),
    e('i4', 'c11', 'tiktok', 'T2', '2026-09-12T00:00:00Z'),
  ]

  it('counts a group’s market videos with a comment dated in the month, each video once', () => {
    expect(groupMonthVideos({ month: SEP, personas, evidence, market })).toEqual([
      { key: 'caretaker', name: 'Caretakers', month: SEP, videoIds: ['v1', 'v3'], n: 2 },
      { key: 'athlete', name: 'Athletes', month: SEP, videoIds: ['v2'], n: 1 },
      { key: 'quiet', name: 'Quiet', month: SEP, videoIds: [], n: 0 },
    ])
  })

  it('counts a subject over the group’s own member insights only, k of the group’s n', () => {
    const memberships = [
      { subjectId: 's-cost', insightId: 'i1' },
      { subjectId: 's-cost', insightId: 'i4' }, // the athletes' insight: theirs, not the caretakers'
      { subjectId: 's-fit', insightId: 'i3' },
      { subjectId: 's-fit', insightId: 'i2' }, // i2's only September evidence is on v1 too
      { subjectId: 's-retired', insightId: 'i1' },
    ]
    const subjects = new Map([['s-cost', 'Cost'], ['s-fit', 'Fit']])
    const [care, ath, quiet] = groupSubjects({ month: SEP, personas, evidence, memberships, subjects, market })
    expect(care).toEqual({
      key: 'caretaker', name: 'Caretakers', month: SEP, n: 2,
      subjects: [{ subjectId: 's-fit', label: 'Fit', k: 2, n: 2 }, { subjectId: 's-cost', label: 'Cost', k: 1, n: 2 }],
    })
    expect(ath.subjects).toEqual([{ subjectId: 's-cost', label: 'Cost', k: 1, n: 1 }])
    expect(quiet).toEqual({ key: 'quiet', name: 'Quiet', month: SEP, n: 0, subjects: [] })
  })

  it('reads empty inputs as empty', () => {
    expect(groupMonthVideos({ month: SEP, personas: [], evidence: [], market: new Map() })).toEqual([])
    expect(groupSubjects({ month: SEP, personas, evidence: [], memberships: [], subjects: new Map(), market })
      .map((g) => [g.n, g.subjects.length])).toEqual([[0, 0], [0, 0], [0, 0]])
  })
})

// ---- themePlatforms ---------------------------------------------------------------

describe('themePlatforms', () => {
  const rows: ThemePlatformRow[] = [
    { audience: INDUSTRY_AUDIENCE, videos: 20, platform_mix: { tiktok: 11, youtube: 6, reddit: 3 } },
    { audience: COT, videos: 4, platform_mix: { tiktok: 1, instagram: 3 } },
    { audience: INDUSTRY_AUDIENCE, videos: 20, platform_mix: { tiktok: 11 } }, // a repeated audience is not added twice
  ]

  it('splits the category’s videos by platform, k of n, largest first', () => {
    const out = themePlatforms({ themeId: 't', month: '2026-09-09', rows, audiences: [INDUSTRY_AUDIENCE] })
    expect(out).toEqual({
      themeId: 't', month: SEP, n: 20,
      platforms: [
        { platform: 'tiktok', label: 'TikTok', k: 11, n: 20 },
        { platform: 'youtube', label: 'YouTube', k: 6, n: 20 },
        { platform: 'reddit', label: 'Reddit', k: 3, n: 20 },
      ],
    })
  })

  it('pools the audiences named', () => {
    const out = themePlatforms({ themeId: 't', month: SEP, rows, audiences: [INDUSTRY_AUDIENCE, COT] })
    expect(out?.n).toBe(24)
    expect(out?.platforms.map((p) => [p.platform, p.k])).toEqual([['tiktok', 12], ['youtube', 6], ['instagram', 3], ['reddit', 3]])
  })

  it('is null where the month holds none of it', () => {
    expect(themePlatforms({ themeId: 't', month: SEP, rows: [] })).toBeNull()
    expect(themePlatforms({ themeId: 't', month: SEP, rows, audiences: [PAT] })).toBeNull()
  })
})

// ---- themeMonthLine ---------------------------------------------------------------

describe('themeMonthLine', () => {
  const point = (month: string, k: number | null, videos: number | null, clusteringKey: string | null, state: MonthPoint['state'] = 'frozen'): MonthPoint => ({
    month, state, videos, comments: null, k, kComments: null,
    pct: k != null && videos ? Math.round((k / videos) * 1000) / 10 : null,
    audience: INDUSTRY_AUDIENCE, status: null, origin: null, readAt: null, runId: null, frozenAt: null, clusteringKey, labels: [],
  })
  const series = (points: MonthPoint[]): MonthSeries => ({
    audience: INDUSTRY_AUDIENCE, names: [INDUSTRY_AUDIENCE], objectId: 'theme-1', objectLabel: 'Running on a blade',
    points, notes: [{ kind: 'clustering_changed', text: 'grouped differently', months: ['2026-07-01'] }], firstReadable: null, substrate: 'seeded',
  })
  const s = series([
    point('2026-06-01', 8, 300, null),
    point('2026-07-01', 12, 320, 'k1'),
    point(AUG, 30, 400, 'k1'),
    point(SEP, 64, 410, 'k2', 'filling'),
    point('2026-10-01', 5, 90, 'k2', 'filling'),
  ])

  it('draws the months up to the one read, each step’s regime named', () => {
    const line = themeMonthLine(s, SEP, null)
    expect(line.points.map((p) => [p.month, p.k, p.n, p.regimeStep])).toEqual([
      ['2026-06-01', 8, 300, null],
      ['2026-07-01', 12, 320, 'unknown'],
      [AUG, 30, 400, 'same'],
      [SEP, 64, 410, 'changed'],
    ])
    expect(line.notes).toHaveLength(1)
    expect(line.label).toBe('Running on a blade')
  })

  it('bands the month against the one before and carries the clustering caveat, never a direction', () => {
    const line = themeMonthLine(s, SEP, null)
    expect(line.verdict).toMatchObject({ objectKind: 'theme', objectId: 'theme-1', state: 'moved', value: { k: 64, n: 410 }, baseline: { k: 30, n: 400 } })
    expect(line.verdict?.flags).toContain('clustering_changed')
    expect(line.verdict?.direction).toBeUndefined()
    expect(themeMonthLine(s, '2026-07-01', null).verdict?.flags).toContain('clustering_unknown')
  })

  it('names a refused step and refuses the verdict where the month pair is refused', () => {
    const line = themeMonthLine(s, SEP, refuseEveryPair)
    expect(line.verdict?.state).toBe('refused')
    expect(line.verdict?.baseline).toBeUndefined()
    expect(line.points.slice(1).every((p) => p.refusedStep != null)).toBe(true)
    expect(line.points[0].refusedStep).toBeNull()
  })

  it('reads a first month as too little, and a month with no row as no verdict', () => {
    const first = themeMonthLine(series([point(SEP, 12, 410, 'k2')]), SEP, null)
    expect(first.verdict?.state).toBe('too_little_data')
    expect(themeMonthLine(series([point(SEP, null, null, null, 'hollow')]), SEP, null).verdict).toBeNull()
    expect(themeMonthLine(series([]), SEP, null)).toMatchObject({ points: [], verdict: null })
  })
})
