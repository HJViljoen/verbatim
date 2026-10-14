import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { gateFor } from '../quote-context'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { flattenEvidence, judge, passes, saysTheyWorkFor, type DatedEvidence } from './evidence'

// A brand's own people are not the market (T3b, 30 Sep): the narrow text rule
// that marks them, and the gate wrapper every written-read gate goes through.

const BRANDS = ['Sealand', 'Cotopaxi', 'Patagonia', 'The North Face', 'Freedom of Movement']

describe('saysTheyWorkFor', () => {
  it("catches the 27 Sep Cotopaxi employee, in the cached English of a Chinese comment", () => {
    const original = '我在Cotopaxi的纽西兰工作 真的很开心可以有博主推荐Cotopaxi，我买了很多他这个牌子的包 真的都很耐用'
    const english = "I work in New Zealand at Cotopaxi. I'm really happy that a blogger recommended Cotopaxi. I bought many bags of this brand."
    expect(saysTheyWorkFor([original, english], BRANDS)).toBe(true)
    expect(saysTheyWorkFor([original], BRANDS)).toBe(false) // the rule reads English
  })

  it('first person, at or for a tracked brand, the client included', () => {
    for (const text of [
      'I work at Patagonia and we repair these for free.',
      'i work for cotopaxi, the allpa is our best seller',
      'I currently work at The North Face in Denver.',
      "I'm working for Sealand this summer and love the bags.",
      'I am working at the North Face outlet and see these daily',
      'I also work for Freedom of Movement.',
    ]) expect(saysTheyWorkFor([text], BRANDS), text).toBe(true)
  })

  it('never a brand named elsewhere, another brand, the past, or "work out"', () => {
    for (const text of [
      'I work at a desk all day and my Cotopaxi pack is great.',
      'I work at Osprey and this is the best pack.', // Osprey is not tracked here
      'I used to work at Patagonia years ago.',
      'I work out every morning and bought this for Patagonia prices.',
      'My friend works at Cotopaxi.',
      'This is what I work with. Cotopaxi makes the best bags.', // another sentence
      'Cotopaxi works for me at work.',
    ]) expect(saysTheyWorkFor([text], BRANDS), text).toBe(false)
  })

  it('knows no brand, catches nothing', () => {
    expect(saysTheyWorkFor(['I work at Cotopaxi.'], [])).toBe(false)
    expect(saysTheyWorkFor([null, undefined, ''], BRANDS)).toBe(false)
  })
})

describe('judge and passes', () => {
  const row = (insider?: boolean): DatedEvidence => ({
    insightId: 'i1', kind: 'praise', description: 'Praises the pack.', evidenceId: 'e1', rank: 1, commentId: 'c1',
    commentDate: '2026-09-24T00:00:00+00:00', author: 'viewer', text: 'This backpack has the best straps, so comfortable on my shoulders all day.',
    lang: 'en', english: null,
    video: { uuid: 'v1', platform: 'youtube', videoId: 'yt1', audience: INDUSTRY_AUDIENCE, lane: 'full', accountName: 'Creator' },
    context: {
      platform: 'youtube', videoId: 'yt1', caption: 'My everyday backpack for travel', hashtags: ['backpack'], topics: ['travel backpack'],
      accountName: 'Creator', isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: 'market',
    },
    ...(insider === undefined ? {} : { insider }),
  })
  const gate = gateFor(SEALAND_CLIENT_ID, { claim: 'Comfort depends on structure and straps' })

  it('is the product gate for a consumer, and a refusal for a brand insider', () => {
    expect(judge(row(), gate)).toMatchObject({ ok: true })
    expect(judge(row(false), gate)).toMatchObject({ ok: true })
    expect(judge(row(true), gate)).toEqual({ ok: false, reason: 'insider' })
    expect(passes(row(true), gate)).toBe(false)
  })
})

describe('a demographic (redacted) citation: it counts, and never quotes (14 Oct)', () => {
  const insight = (redacted: boolean, quote: string | null) => ({
    id: 'i1', category: 'demographic_signal', description: 'Says who they are.', theme: 't',
    videos: { id: 'v1', platform: 'tiktok', video_id: 'n1', analyzed_lane: 'full', is_client: false, is_competitor: false, competitor_name: null, account_name: 'acct' },
    insight_evidence: [{ id: 'e1', quote, relevance_rank: 1, comment_id: 'c1', redacted, comments: { id: 'c1', comment_date: '2026-10-02T00:00:00Z', platform: 'tiktok', video_id: 'n1', author: 'a' } }],
  })

  it('flattenEvidence keeps one only where asked, with no words', () => {
    expect(flattenEvidence([insight(true, 'I am a below knee amputee')])).toEqual([])
    expect(flattenEvidence([insight(true, 'I am a below knee amputee')], { keepRedacted: true })).toEqual([
      expect.objectContaining({ evidenceId: 'e1', text: '', redacted: true, video: expect.objectContaining({ uuid: 'v1' }) }),
    ])
    expect(flattenEvidence([insight(true, null)], { keepRedacted: true })).toHaveLength(1)
    // An ordinary row with no quote is still no row.
    expect(flattenEvidence([insight(false, null)], { keepRedacted: true })).toEqual([])
  })

  it('judge refuses it, whatever the gate', () => {
    const [row] = flattenEvidence([insight(true, 'x')], { keepRedacted: true })
    expect(judge({ ...row, context: null }, {})).toEqual({ ok: false, reason: 'redacted' })
  })
})
