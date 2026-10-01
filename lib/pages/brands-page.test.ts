import { describe, expect, it } from 'vitest'

import {
  brandList, buildPosts, buildWorks, findingsShown, marketLabel, paneKindLabel, quoteWords, sharePct, windowWords, worksSentence,
  type FindingsBlock, type TopicRow, type WorksBlock, type WorksVideo,
} from './brands'
import { findingAbout, postPlatforms } from './brands-load'
import type { OwnPostCensus } from '../reading/own-posts'

// The Competitive page's pure seams (pages build, 1 Oct; Page-Competitive.dc.
// html): the brand list with you on it, the window's words, the pane's kind
// words, the findings' order and who their talk is about, the brands' posts,
// and what works in the market's videos with its one composed sentence.

const row = (label: string, count: TopicRow['count'], k: number | null): TopicRow =>
  ({ brandKey: label.toLowerCase(), label, count, kAny: k, kOrganic: k, prevK: null })
const topics = (tracked: TopicRow[]) => ({ month: '2026-09-01', prevMonth: null, n: 852, nOrganic: 672, prevN: null, tracked, watched: null, chip: null, read: 'live' as const })
const name = (k: number | null) => (k == null ? { month: '2026-09-01', counted: null } : { month: '2026-09-01', counted: { n: 852, k, ownPosts: 8, ownPostComments: 0, ownPostCommentPosts: 0 } })

describe('brandList', () => {
  it('lists the counted brands by count with you among them, and names the ones never named', () => {
    const l = brandList({
      topics: topics([row('Patagonia', 'counted', 13), row('Rareform', 'counted', 1), row('Cotopaxi', 'counted', 4), row('Freedom of Movement', 'none', null), row('Old School', 'none', null)]),
      name: name(1),
    }, 'Sealand')
    expect(l?.rows).toEqual([
      { label: 'Patagonia', k: 13, you: false },
      { label: 'Cotopaxi', k: 4, you: false },
      { label: 'Rareform', k: 1, you: false },
      { label: 'Sealand', k: 1, you: true },
    ])
    expect(l?.notNamed).toEqual(['Freedom of Movement', 'Old School'])
  })

  it('omits a brand whose count is not measured: no row and no name', () => {
    const l = brandList({ topics: topics([row('Patagonia', 'counted', 13), row('Freitag', 'noise', null), row('Cotopaxi', 'not_yet', null)]), name: name(null) }, 'Sealand')
    expect(l?.rows.map((r) => r.label)).toEqual(['Patagonia'])
    expect(l?.notNamed).toEqual([])
  })

  it('says a counted zero, yours included, as not named unprompted', () => {
    const l = brandList({ topics: topics([row('Patagonia', 'counted', 3), row('Freitag', 'counted', 0)]), name: name(0) }, 'Sealand')
    expect(l?.notNamed).toEqual(['Freitag', 'Sealand'])
  })

  it('is null with no brand read (a tenant with no brand rule)', () => {
    expect(brandList({ topics: null, name: null }, 'Össur')).toBeNull()
    expect(brandList({ topics: topics([row('Cotopaxi', 'not_yet', null)]), name: name(null) }, 'Sealand')).toBeNull()
  })
})

describe('the pane’s words', () => {
  it('states the ninety days by their first and last day', () => {
    expect(windowWords({ from: '2026-06-30', to: '2026-09-28' })).toBe('30 Jun to 27 Sep')
  })

  it('says what people did in the artboard’s words, with what the tenant sells', () => {
    expect(paneKindLabel('praise', 'bags')).toBe('Praised a bag')
    expect(paneKindLabel('praise', null)).toBe('Praised it')
    expect(paneKindLabel('switching_signal', 'bags')).toBe('Said they’re switching')
    expect(marketLabel('bags')).toBe('Other bags in your market')
    expect(marketLabel('bags', true)).toBe('other bags in your market')
    expect(marketLabel(null)).toBe('Others in your market')
  })

  it('sets a quote’s English, without emoji', () => {
    expect(quoteWords({ text: 'Lo estás haciendo excelente!!! ❤️', english: 'You are doing excellent!!! ❤️' })).toBe('You are doing excellent!!!')
    expect(quoteWords({ text: 'Love it 🙌🏽 so much', english: null })).toBe('Love it so much')
  })
})

describe('findings', () => {
  const card = (id: string, impact: string | null) => ({ id, category: 'content_gap', kindWords: 'where the content differs', title: id, quote: null, seen: null, impact })
  it('lays the weightiest first, then in the brands’ order', () => {
    const b: FindingsBlock = { groups: [{ rival: 'Patagonia', findings: [card('p1', 'medium'), card('p2', 'low')] }, { rival: 'Cotopaxi', findings: [card('c1', 'high'), card('c2', 'medium')] }], thin: [], floor: 10 }
    expect(findingsShown(b).map((f) => `${f.rival}:${f.id}`)).toEqual(['Cotopaxi:c1', 'Patagonia:p1', 'Cotopaxi:c2', 'Patagonia:p2'])
  })

  it('reads who the talk is about off the cited themes’ buckets', () => {
    const brands = new Map([['competitor:Cotopaxi', 'Cotopaxi'], ['competitor:Patagonia', 'Patagonia']])
    expect(findingAbout({ rival: 'Cotopaxi', buckets: ['competitor:Cotopaxi', 'industry-other'], brands, client: 'Sealand', body: 'while Sealand commentary does not' }))
      .toEqual({ brands: [], market: true, client: true })
    expect(findingAbout({ rival: 'Cotopaxi', buckets: ['competitor:Cotopaxi', 'competitor:Patagonia', 'client'], brands, client: 'Sealand', body: null }))
      .toEqual({ brands: ['Patagonia'], market: false, client: true })
    // Never from a near-miss of the name.
    expect(findingAbout({ rival: 'Cotopaxi', buckets: ['competitor:Cotopaxi'], brands, client: 'Sealand', body: 'Sealandia and others' }))
      .toEqual({ brands: [], market: false, client: false })
    expect(findingAbout({ rival: 'Cotopaxi', buckets: [], brands, client: 'Sealand', body: null })).toBeNull()
  })
})

describe('posts', () => {
  const census = (audience: string, label: string, k: number, claims: { id: string; claim: string; k: number; on: string }[]): OwnPostCensus => ({
    month: '2026-09-01', basis: '', audience, audienceLabel: label, published: { k, n: k }, overFloor: { k: 0, n: k }, commentFloor: 3,
    hooks: [], formats: [], subjects: [], subjectsNote: null, unread: null, claimsNote: null,
    claims: claims.map((c) => ({ id: c.id, entity: audience, entityLabel: label, claim: c.claim, quote: null, postedOn: c.on, posts: { k: c.k, n: k }, echo: { kind: 'none' } as never })),
  })

  it('gives each brand its platforms and up to two claims, the most carried first, each said once', () => {
    const p = buildPosts({
      month: '2026-09-01',
      censuses: [census('competitor:Cotopaxi', 'Cotopaxi', 29, [
        { id: 'a', claim: 'Packs fold into their own pouches.', k: 1, on: '2026-09-03' },
        { id: 'b', claim: 'The new sling holds a day pack.', k: 2, on: '2026-09-09' },
        { id: 'c', claim: 'packs fold into their own pouches', k: 1, on: '2026-09-04' },
        { id: 'd', claim: 'A third claim.', k: 1, on: '2026-09-05' },
      ])],
      platforms: new Map([['competitor:Cotopaxi', ['Instagram', 'TikTok']]]),
    })
    expect(p.rows[0]).toMatchObject({ label: 'Cotopaxi', posts: 29, platforms: ['Instagram', 'TikTok'] })
    expect(p.rows[0].said?.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('reads each brand’s platforms off its own posts in the month', () => {
    const m = postPlatforms([{ month: '2026-09-01', audience: 'competitor:Freitag', audienceLabel: 'Freitag', claims: [], videos: [
      { id: '1', upload_date: '2026-09-02', comments_count: 0, hook_style: null, classified_type: null, platform: 'tiktok' },
      { id: '2', upload_date: '2026-09-12', comments_count: 0, hook_style: null, classified_type: null, platform: 'instagram' },
      { id: '3', upload_date: '2026-08-30', comments_count: 0, hook_style: null, classified_type: null, platform: 'youtube' },
    ] } as never], '2026-09-01')
    expect(m.get('competitor:Freitag')).toEqual(['Instagram', 'TikTok'])
  })
})

describe('what works in your market’s videos', () => {
  const v = (over: Partial<WorksVideo>): WorksVideo => ({ upload_date: '2026-09-10', platform: 'tiktok', classified_type: null, hook_style: null, engagement_rate: null, is_client: false, is_competitor: false, competitor_name: null, ...over })

  it('shares the category’s month, with each row’s engagement against the median rated video, floored', () => {
    const videos: WorksVideo[] = [
      // 12 rated stories at 6%, 12 rated tutorials at 2%: median 4 (well, the middle of 24).
      ...Array.from({ length: 12 }, () => v({ classified_type: 'story', engagement_rate: 6 })),
      ...Array.from({ length: 12 }, () => v({ classified_type: 'tutorial', engagement_rate: 2 })),
      // 5 reviews, unrated (Reddit): a share, no multiple.
      ...Array.from({ length: 5 }, () => v({ classified_type: 'review', platform: 'reddit', engagement_rate: 9 })),
      // Not the category's, or not the month's.
      v({ classified_type: 'story', is_client: true, engagement_rate: 50 }),
      v({ classified_type: 'story', is_competitor: true, competitor_name: 'Cotopaxi', engagement_rate: 50 }),
      v({ classified_type: 'story', upload_date: '2026-08-31', engagement_rate: 50 }),
    ]
    const w = buildWorks({ month: '2026-09-01', videos, audience: 'industry-other', label: (k) => k[0].toUpperCase() + k.slice(1) })
    expect(w?.formatsOf).toBe(29)
    expect(w?.formats.map((r) => [r.key, r.k, r.multiple])).toEqual([['story', 12, 1.5], ['tutorial', 12, 0.5], ['review', 5, null]])
    expect(w?.hooks).toEqual([])
  })

  it('writes the artboard’s sentence from the rows, in code', () => {
    const w: WorksBlock = {
      month: '2026-09-01', formatsOf: 2623, hooksOf: 2439, hooks: [],
      formats: [
        { key: 'promotional', label: 'Promotional', k: 737, multiple: 2.26 },
        { key: 'tutorial', label: 'Tutorial', k: 538, multiple: 1.4 },
        { key: 'story', label: 'Story', k: 348, multiple: 3.02 },
        { key: 'review', label: 'Review', k: 338, multiple: 2.25 },
        { key: 'educational', label: 'Educational', k: 254, multiple: 1.46 },
        { key: 'how-to', label: 'How-to', k: 112, multiple: 1.88 },
      ],
    }
    expect(worksSentence(w)?.map((b) => b.s).join('')).toBe(
      'Story videos draw the strongest response of the common formats, 3.0 times the engagement of the median video. Tutorials, the second most common format, draw 1.4 times.',
    )
    expect(sharePct(737, 2623)).toBe(28)
    expect(worksSentence({ ...w, formats: w.formats.map((r, i) => (i === 0 ? r : { ...r, multiple: null })) })).toBeNull()
  })
})
