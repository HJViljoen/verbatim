import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import {
  classifierQueue, commentKey, contentKey, excerptAround, mentionKey, planRules, relevantVideos, standingPlacements, worthReading,
  type PlacedRow,
} from './match'
import { compileCatalogue, PRODUCT_RULE_VERSION } from './rules'
import type { ProductTagRow } from './types'

const compiled = compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID)
const V1 = '00000000-0000-4000-8000-0000000000a1'
const V2 = '00000000-0000-4000-8000-0000000000b2'
const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'
const C3 = '00000000-0000-4000-8000-0000000000c3'
const active = { groups: new Set(FIXTURE_CATALOGUE.groups.map((g) => g.id)), products: new Set(FIXTURE_CATALOGUE.products.map((p) => p.id)) }

describe('planRules: the rows the rules give', () => {
  const plan = planRules(OSSUR_CLIENT_ID, compiled, [
    { videoId: V1, field: 'transcript', text: 'today the Pro-Flex XC and a new liner' },
    { videoId: V1, field: 'caption', text: 'Pro-Flex XC review' },
    { videoId: V1, field: 'ocr', text: 'UNITY' },
    { videoId: V2, field: 'hashtags', text: 'amputee life' },
  ], [
    { commentId: C1, videoId: V1, month: '2026-09-14', text: 'does the rheo knee beep?' },
    { commentId: C2, videoId: V1, month: '2026-09-20', text: 'unity is everything' },
    { commentId: C3, videoId: V2, month: '2026-10-02', text: 'so brave' },
  ])

  it('one content row per video and target, recorded at the first field that places it', () => {
    const content = plan.rows.filter((r) => r.source === 'content')
    expect(content.map((r) => [r.placement, r.product_id ?? r.group_id, r.field])).toEqual([
      ['named', P('Pro-Flex XC'), 'caption'],
      ['unbranded', G('Liners'), 'transcript'],
    ])
    expect(content.every((r) => r.method === 'rule' && r.rule_version === PRODUCT_RULE_VERSION && r.catalogue_version === FIXTURE_CATALOGUE.version)).toBe(true)
    expect(content.every((r) => r.comment_id === null && r.comment_month === null)).toBe(true)
  })

  it('a comment row per comment and target, dated by the first of its month', () => {
    const comment = plan.rows.filter((r) => r.source === 'comment')
    expect(comment).toHaveLength(1)
    expect(comment[0]).toMatchObject({ comment_id: C1, comment_month: '2026-09-01', placement: 'named', product_id: P('Rheo Knee'), group_id: G('Knees'), field: null })
  })

  it('a generic name is a confirm item, for the content and for a comment, and places nothing', () => {
    expect(plan.confirm.map((c) => [c.key, c.aliases.map((a) => a.alias)])).toEqual([
      [contentKey(V1), ['Unity']],
      [commentKey(C2), ['Unity']],
    ])
    expect(plan.confirm[0]).toMatchObject({ source: 'content', field: 'ocr', commentId: null })
    expect(plan.confirm[1]).toMatchObject({ source: 'comment', commentId: C2, commentMonth: '2026-09-01' })
    expect(plan.rows.some((r) => r.group_id === G('Sockets'))).toBe(false)
  })

  it('records what each text places', () => {
    expect([...plan.placed.keys()].sort()).toEqual([commentKey(C1), contentKey(V1)].sort())
    // across a video's fields, the strongest placement per category
    expect(plan.placed.get(contentKey(V1))!.map((p) => p.placement).sort()).toEqual(['named', 'unbranded'])
  })

  it('the unique key skips a held row, and differs by method and version', () => {
    const r = plan.rows[0]
    expect(mentionKey(r)).toBe(mentionKey({ ...r }))
    expect(mentionKey(r)).not.toBe(mentionKey({ ...r, method: 'model' }))
    expect(mentionKey(r)).not.toBe(mentionKey({ ...r, catalogue_version: 'pc1_ffffffffffffffff' }))
  })
})

describe('excerptAround', () => {
  it('keeps the words around the hit, marked where cut', () => {
    const text = `${'a'.repeat(400)} Unity ${'b'.repeat(400)}`
    const e = excerptAround(text, 401, 100)
    expect(e.startsWith('…')).toBe(true)
    expect(e.endsWith('…')).toBe(true)
    expect(e).toContain('Unity')
    expect(excerptAround('short Unity', 6)).toBe('short Unity')
  })
})

const row = (over: Partial<PlacedRow>): PlacedRow => ({
  video_id: V1, source: 'comment', comment_id: C1, comment_month: '2026-09-01', placement: 'unbranded', product_id: null, group_id: G('Liners'), method: 'rule', ...over,
})
const tag = (over: Partial<ProductTagRow>): ProductTagRow => ({
  id: 't1', client_id: OSSUR_CLIENT_ID, video_id: V1, comment_id: C1, placement: 'named', product_id: P('Iceross Seal-In X5'), group_id: G('Liners'),
  supersedes: null, actor_kind: 'user', actor_user_id: null, actor_label: 'member', created_at: '2026-10-13T10:00:00Z', ...over,
})

describe('standingPlacements: which placements stand on a text', () => {
  it('the rules, the confirm and the classifier add up; a none places nothing but marks the text read', () => {
    const s = standingPlacements({
      active,
      rows: [
        row({}),
        row({ method: 'confirmed', placement: 'named', product_id: P('Unity'), group_id: G('Sockets') }),
        row({ comment_id: C2, method: 'model', placement: 'none', group_id: null }),
        row({ comment_id: C2, method: 'model', placement: 'none', group_id: null }),
      ],
    })
    expect(s.get(commentKey(C1))!.placements.map((p) => `${p.method}:${p.placement}`)).toEqual(['rule:unbranded', 'confirmed:named'])
    expect(s.get(commentKey(C2))).toMatchObject({ month: '2026-09-01', placements: [] })
  })

  it('a person\'s tag is the whole answer on its text, a none tag included', () => {
    const tags = new Map([['a', tag({})], ['b', tag({ id: 't2', comment_id: C2, placement: 'none', product_id: null, group_id: null })]])
    const s = standingPlacements({
      active, tags, tagMonths: new Map([['t1', '2026-09-01'], ['t2', '2026-09-01']]),
      rows: [row({}), row({ comment_id: C2, placement: 'named', product_id: P('Rheo Knee'), group_id: G('Knees') })],
    })
    expect(s.get(commentKey(C1))!.placements).toEqual([{ placement: 'named', groupId: G('Liners'), productId: P('Iceross Seal-In X5'), method: 'tag' }])
    expect(s.get(commentKey(C2))!.placements).toEqual([])
  })

  it('a video\'s tag (comment null) speaks for its content, not its comments', () => {
    const tags = new Map([['a', tag({ comment_id: null, placement: 'unbranded', product_id: null, group_id: G('Feet') })]])
    const s = standingPlacements({ active, tags, rows: [row({ source: 'content', comment_id: null, comment_month: null }), row({})] })
    expect(s.get(contentKey(V1))).toMatchObject({ month: null, placements: [{ placement: 'unbranded', groupId: G('Feet') }] })
    expect(s.get(commentKey(C1))!.placements[0].method).toBe('rule')
  })

  it('a comment tag that cannot be dated is dropped; a placement under a retired category is not counted', () => {
    const tags = new Map([['a', tag({ comment_id: C3 })]])
    const s = standingPlacements({ active: { groups: new Set([G('Feet')]), products: new Set() }, tags, rows: [row({})] })
    expect(s.has(commentKey(C3))).toBe(false)
    expect(s.get(commentKey(C1))!.placements).toEqual([])
  })
})

describe('the classifier\'s queue', () => {
  const comments = [
    { commentId: C1, videoId: V1, month: '2026-09-03', text: 'how long does it last?' },
    { commentId: C2, videoId: V1, month: '2026-08-30', text: '😍😍😍' },
    { commentId: C3, videoId: V2, month: '2026-08-01', text: 'what size do you wear?' },
    { commentId: 'c4', videoId: V1, month: '2026-08-12', text: 'does it get sweaty', lowSignal: true },
    { commentId: 'c5', videoId: V1, month: '2026-08-12', text: 'the liner is great' },
  ]

  it('reads only relevant videos\' comments nothing spoke on, worth reading, oldest month first', () => {
    const q = classifierQueue({ comments, relevant: new Set([V1]), spoken: new Set([commentKey('c5')]) })
    expect(q.map((x) => [x.commentId, x.commentMonth])).toEqual([[C1, '2026-09-01']])
    const all = classifierQueue({ comments, relevant: new Set([V1, V2]), spoken: new Set() })
    expect(all.map((x) => x.commentId)).toEqual(['c5', C3, C1])
  })

  it('worthReading: a letter or digit run of three, a handle or a link alone is not', () => {
    expect(worthReading('😍😍')).toBe(false)
    expect(worthReading('@ossur_corp')).toBe(false)
    expect(worthReading('https://x.co/abc')).toBe(false)
    expect(worthReading('wow')).toBe(true)
    expect(worthReading('いいですね')).toBe(true)
  })

  it('relevantVideos: the videos whose content stands under a category', () => {
    const s = standingPlacements({ active, rows: [row({ source: 'content', comment_id: null, comment_month: null, video_id: V2 }), row({})] })
    expect([...relevantVideos(s)]).toEqual([V2])
  })
})
