import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_RULE_VERSION, brandPattern, brandRulesFor, type BrandRule } from './aliases'
import {
  CONTENT_FIELD_ORDER, excerptAt, handCheckList, homonymVideosOf, mentionKey, monthBrandCounts, ownPostMentions,
  planMentions, standInCandidates, type Candidate, type PlannedMention,
} from './mentions'

// The excerpts are real staging matches (Sealand, Aug to 20 Sep 2026, the
// 26 Sep hand check). Video and comment ids are stand-ins ('v-…', 'c-…'): the
// tests pin how rows are built, not any volume.

const rules = brandRulesFor(SEALAND_CLIENT_ID)
const rule = (brand: string): BrandRule => rules.find((r) => r.brand === brand)!
const content = (video_id: string, field: string, excerpt: string): Candidate =>
  ({ video_id, source: 'content', field, comment_id: null, comment_month: null, excerpt })
const comment = (video_id: string, comment_id: string, month: string, excerpt: string): Candidate =>
  ({ video_id, source: 'comment', field: null, comment_id, comment_month: month, excerpt })

describe('planMentions', () => {
  it('writes one content row per video, recording the first field in CONTENT_FIELD_ORDER, and one row per comment', () => {
    expect(CONTENT_FIELD_ORDER).toEqual(['caption', 'hashtags', 'account', 'transcript_en', 'transcript', 'ocr'])
    const plan = planMentions(SEALAND_CLIENT_ID, BRAND_RULE_VERSION, [{
      rule: rule('Freitag'), brandKey: '73e961c9-1587-4673-9337-df7bcaa3e11c',
      hits: [
        content('v-b00aac', 'ocr', 'FREITAG'),
        content('v-b00aac', 'hashtags', 'bag freitag sustainability sustainablefashion'),
        content('v-b00aac', 'caption', 'This is SUCH a cool brand! Go check them out :) @FREITAG lab. ag  #bag #freitag'),
        comment('v-30b5e5', 'c-1', '2026-08-01', 'They are fairly big. We have a Freitag store here'),
        comment('v-30b5e5', 'c-1', '2026-08-01', 'They are fairly big. We have a Freitag store here'),
      ],
      bare: [content('v-b00aac', 'ocr', 'FREITAG')],
    }])
    expect(plan.mentions.map((m) => [m.row.video_id, m.row.source, m.row.field, m.row.comment_id, m.row.comment_month])).toEqual([
      ['v-30b5e5', 'comment', null, 'c-1', '2026-08-01'],
      ['v-b00aac', 'content', 'caption', null, null],
    ])
    for (const m of plan.mentions) {
      expect(m.row).toMatchObject({ client_id: SEALAND_CLIENT_ID, brand_key: '73e961c9-1587-4673-9337-df7bcaa3e11c', method: 'rule', rule_version: 'brands_v1' })
    }
    // A bare "FREITAG" on screen lacks a company sign; it is no evidence of the
    // weekday, so the video is not read as the other meaning.
    expect(plan.homonymVideos.get('Freitag')?.size).toBe(0)
  })

  it('reads a video whose caption names the other meaning as a homonym, though its on-screen text passed', () => {
    const r = rule('Cotopaxi')
    const hits = [content('v-6630a0', 'ocr', 'COTOPAXI'), comment('v-6630a0', 'c-2', '2026-09-01', 'Q. Bueno q Cotopaxi se está despertando')]
    const bare = [content('v-6630a0', 'caption', '🏎🏁F1 Sin Motor: Parque Nacional COTOPAXI 2026🏁🏎 ¿80 km/h O MAS sin motor? Sí. 🔥'), content('v-6630a0', 'ocr', 'COTOPAXI')]
    expect([...homonymVideosOf(r, hits, bare)]).toEqual(['v-6630a0'])
    const plan = planMentions(SEALAND_CLIENT_ID, BRAND_RULE_VERSION, [{ rule: r, brandKey: 'k', hits, bare }])
    expect(plan.mentions).toEqual([])
    expect(plan.dropped.map((d) => [d.candidate.source, d.why])).toEqual([['content', 'homonym_video'], ['comment', 'homonym_video']])
  })

  it('keeps a comment with a strong form on a homonym video, and a video whose passing field shows one', () => {
    const r = rule('Cotopaxi')
    const bare = [content('v-x', 'caption', 'Climbing Cotopaxi!🌋 Climbing the world’s second largest active volcano!')]
    const onHomonym = planMentions(SEALAND_CLIENT_ID, BRAND_RULE_VERSION, [{
      rule: r, brandKey: 'k', bare,
      hits: [comment('v-x', 'c-3', '2026-08-01', 'i have the same pants & i LOVEEE them🤩 @COTOPAXI'), comment('v-x', 'c-4', '2026-08-01', 'Cotopaxi is the best!!')],
    }])
    expect(onHomonym.mentions.map((m) => m.row.comment_id)).toEqual(['c-3'])
    const strongElsewhere = homonymVideosOf(r, [content('v-y', 'caption', 'These Cotopaxi pants are everything to me!!! @COTOPAXI')],
      [content('v-y', 'transcript', 'we drove past Cotopaxi volcano on the way')])
    expect(strongElsewhere.size).toBe(0)
  })

  it('keys a row as the unique index does (a content row takes the zero uuid)', () => {
    const k = mentionKey({ client_id: 'a', video_id: 'v', brand_key: 'client', source: 'content', comment_id: null, rule_version: 'brands_v1' })
    expect(k).toBe('a|v|client|content|00000000-0000-0000-0000-000000000000|brands_v1')
  })
})

describe('the counts in a month', () => {
  const m = (brandKey: string, video_id: string, source: 'content' | 'comment', month: string | null = null): PlannedMention => ({
    brand: brandKey, excerpt: null,
    row: { client_id: 'a', video_id, brand_key: brandKey, source, field: source === 'content' ? 'caption' : null, comment_id: source === 'comment' ? `c-${video_id}` : null, comment_month: month, method: 'rule', rule_version: 'brands_v1' },
  })

  it('counts videos in the month market, content or a comment dated in the month; own posts apart; the headline count leaves out every video a rival search found', () => {
    const mentions = [
      m('P', 'v1', 'content'), m('P', 'v1', 'comment', '2026-09-01'), // one video, counted once
      m('P', 'v2', 'comment', '2026-08-01'), // a comment dated in August does not count in September
      m('P', 'v3', 'content'), // found by a rival search of ours
      m('P', 'v9', 'content'), // not in September's market
      m('N', 'v4', 'content'), m('N', 'v5', 'content'), // v5 found by a rival search too, whichever brand's
      m('client', 'own', 'content'), // the client's own post
    ]
    const counts = monthBrandCounts(mentions, [{ brand: 'Patagonia', brandKey: 'P' }, { brand: 'The North Face', brandKey: 'N' }, { brand: 'Sealand', brandKey: 'client' }], {
      markets: new Map([['2026-09-01', ['v1', 'v2', 'v3', 'v4', 'v5', 'own']]]),
      ownerOf: (v) => (v === 'own' ? 'client' : null),
      rivalFound: new Set(['v3', 'v5']),
    })
    expect(counts.find((c) => c.brandKey === 'P')).toMatchObject({ month: '2026-09-01', n: 6, kAny: 2, kContent: 2, kComment: 1, kOrganic: 1, nOrganic: 4 })
    expect(counts.find((c) => c.brandKey === 'N')).toMatchObject({ n: 6, kAny: 2, kOrganic: 1, nOrganic: 4 })
    // One base: every brand's headline count sits over the same 4.
    expect(new Set(counts.map((c) => c.nOrganic))).toEqual(new Set([4]))
    expect(counts.find((c) => c.brandKey === 'client')).toMatchObject({ kAny: 0, n: 6 })
    expect(ownPostMentions(mentions, (v) => (v === 'own' ? 'client' : null))).toEqual(new Map([['client', 1]]))
  })
})

describe('the hand check', () => {
  it("lists every match of the client's name outside its own posts, a fixed sample of the others, and own posts apart", () => {
    const mk = (key: string, id: string): PlannedMention => ({
      brand: key, excerpt: id,
      row: { client_id: 'a', video_id: id, brand_key: key, source: 'content', field: 'caption', comment_id: null, comment_month: null, method: 'rule', rule_version: 'brands_v1' },
    })
    const mentions = [...Array.from({ length: 5 }, (_, i) => mk('client', `s${i}`)), ...Array.from({ length: 40 }, (_, i) => mk('P', `p${i}`))]
    const ownerOf = (v: string) => (v === 's0' ? 'client' : null)
    const a = handCheckList(mentions, { sample: 30, all: new Set(['client']), ownerOf })
    const b = handCheckList([...mentions].reverse(), { sample: 30, all: new Set(['client']), ownerOf })
    expect(a.filter((e) => e.brandKey === 'client')).toHaveLength(5)
    expect(a.filter((e) => e.brandKey === 'client' && e.ownPost).map((e) => e.videoId)).toEqual(['s0'])
    expect(a.filter((e) => e.brandKey === 'P')).toHaveLength(30)
    expect(new Set(b.filter((e) => e.brandKey === 'P').map((e) => e.videoId))).toEqual(new Set(a.filter((e) => e.brandKey === 'P').map((e) => e.videoId)))
  })
})

describe('the staging stand-in', () => {
  it("cuts the excerpt as PG's substr(body, greatest(pos - 60, 1), 160) does, in characters", () => {
    const body = `${'🎒'.repeat(70)}Freitag bag`
    const at = body.indexOf('Freitag')
    const ex = excerptAt(body, at)
    // 'F' is character 71; the excerpt starts at 11: the 60 emoji before it and the 11 after.
    expect(Array.from(ex)).toHaveLength(71)
    expect(ex).toBe(`${'🎒'.repeat(60)}Freitag bag`)
    expect(excerptAt('Freitag bag', 0)).toBe('Freitag bag')
  })

  it('returns what brand_mention_candidates does: each matching content field, and each matching comment with its month', () => {
    const pattern = brandPattern(rule('The North Face'), 'js')
    const got = standInCandidates(pattern, [{
      id: 'v1', account_name: 'r/backpacks', caption: 'Anyone here use the North Face Jester backpack?', hashtags: ['northface', 'backpack'],
      transcript: null, transcript_en: null, ocr_text: 'if i have aura loss im switching back to my north face backpack',
    }], [
      { id: 'c1', videoId: 'v1', text: 'Nike elite mogs north face btw', comment_date: '2026-08-14' },
      { id: 'c2', videoId: 'v1', text: 'Jansport forever', comment_date: '2026-08-14' },
    ])
    expect(got.map((c) => [c.source, c.field, c.comment_id, c.comment_month])).toEqual([
      ['content', 'caption', null, null], ['content', 'hashtags', null, null], ['content', 'ocr', null, null],
      ['comment', null, 'c1', '2026-08-01'],
    ])
  })
})
