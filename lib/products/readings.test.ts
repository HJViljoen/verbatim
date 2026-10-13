import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import type { Candidate } from '../brands/mentions'
import { OSSUR_CLIENT_ID } from '../config'
import type { MonthVideo } from '../provenance/searches'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import { cataloguePattern, compileCatalogue } from './rules'
import { catalogueCodes, PRODUCT_MODEL_RULE_VERSION, runClassifier, type Classifier } from './classify'
import { commentKey, contentKey, type MentionInsert, type StandingText } from './match'
import {
  CATEGORY_WORDS_ONLY_UNDER_RELEVANT, categorySearchFinds, categorySearchTerms, contentFields, guardFreeze, itemsLeft, mergeProductRows, placeProducts, pooledProductMonth, productReadingKey, productReadingRows,
  readProductMonthVideos, type Ask, type HeldRow, type ProductCommentRow, type ProductMonthVideo, type ProductReadIO, type ProductVideoRow,
} from './readings'
import type { ProductTagRow } from './types'

const compiled = compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID)
const SEP = '2026-09-01'
const OCT = '2026-10-01'
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const IND = 'industry-other'
const OTTO = 'competitor:Ottobock'

const st = (videoId: string, month: string | null, commentId: string | null, placements: StandingText['placements']): StandingText => ({ videoId, month, commentId, placements })
const p = (placement: 'named' | 'unclear' | 'unbranded', group: string, product: string | null = null) =>
  ({ placement, groupId: G(group), productId: product ? P(product) : null, method: 'rule' as const })

describe('productReadingRows: the month rows', () => {
  // September: six industry videos and two Ottobock ones; video 6 found by a rival search.
  const sep: MonthVideo[] = [1, 2, 3, 4, 5, 6].map((n) => ({ id: vid(n), platform: 'tiktok', audience: IND, dated: 3 }))
    .concat([7, 8].map((n) => ({ id: vid(n), platform: 'tiktok', audience: OTTO, dated: 3 })))
  const standing = new Map<string, StandingText>([
    // 1: content names Seal-In X5, and a September comment says liners in general: named
    [contentKey(vid(1)), st(vid(1), null, null, [p('named', 'Liners', 'Iceross Seal-In X5')])],
    [commentKey('c1'), st(vid(1), SEP, 'c1', [p('unbranded', 'Liners')])],
    // 2: a September comment, one of yours not which: unclear
    [commentKey('c2'), st(vid(2), SEP, 'c2', [p('unclear', 'Liners')])],
    // 3: an AUGUST comment only: not in September
    [commentKey('c3'), st(vid(3), '2026-08-01', 'c3', [p('named', 'Liners', 'Iceross Comfort')])],
    // 4: content about liners in general, and feet named in a comment
    [contentKey(vid(4)), st(vid(4), null, null, [p('unbranded', 'Liners')])],
    [commentKey('c4'), st(vid(4), SEP, 'c4', [p('named', 'Feet', 'Pro-Flex XC')])],
    // 6: rival-found, liners in general
    [contentKey(vid(6)), st(vid(6), null, null, [p('unbranded', 'Liners')])],
    // 7 (Ottobock's audience): two comments naming Seal-In X5
    [commentKey('c7a'), st(vid(7), SEP, 'c7a', [p('named', 'Liners', 'Iceross Seal-In X5')])],
    [commentKey('c7b'), st(vid(7), SEP, 'c7b', [p('named', 'Liners', 'Iceross Seal-In X5')])],
    // a text placed nowhere (a none) counts nowhere
    [commentKey('c5'), st(vid(5), SEP, 'c5', [])],
  ])
  const rows = productReadingRows({ clientId: OSSUR_CLIENT_ID, compiled, markets: new Map([[SEP, sep]]), rivalFound: new Set([vid(6)]), standing })
  const one = (audience: string, id: string) => rows.find((r) => r.audience === audience && r.object_id === id)!

  it('writes every category and product in every audience, zeros included', () => {
    expect(rows).toHaveLength(2 * (FIXTURE_CATALOGUE.groups.length + FIXTURE_CATALOGUE.products.length))
    expect(one(IND, G('Knees'))).toMatchObject({ k_any: 0, n: 6, n_organic: 5 })
  })

  it('splits a category exclusively per video: named over unclear over unbranded, adding up to k_any', () => {
    expect(one(IND, G('Liners'))).toMatchObject({ k_named: 1, k_unclear: 1, k_unbranded: 2, k_any: 4, n: 6 })
    for (const r of rows.filter((x) => x.object_kind === 'group')) expect(r.k_named + r.k_unclear + r.k_unbranded).toBe(r.k_any)
  })

  it('counts a comment only in its own month, and the content in every month the video is in the market', () => {
    expect(one(IND, P('Iceross Comfort')).k_any).toBe(0)
    expect(one(IND, P('Iceross Seal-In X5'))).toMatchObject({ k_named: 1, k_any: 1, k_unclear: 0, k_unbranded: 0, comments: 0 })
  })

  it('a product row is its named videos; comments are the month\'s comments standing under it', () => {
    expect(one(OTTO, P('Iceross Seal-In X5'))).toMatchObject({ k_named: 1, k_any: 1, comments: 2 })
    expect(one(OTTO, G('Liners'))).toMatchObject({ k_named: 1, k_any: 1, comments: 2 })
    expect(one(IND, G('Liners')).comments).toBe(2)
    expect(one(IND, G('Feet'))).toMatchObject({ k_named: 1, comments: 1 })
  })

  it('k_organic and n_organic leave out every video a rival search found (the brand table\'s base)', () => {
    expect(one(IND, G('Liners'))).toMatchObject({ k_any: 4, k_organic: 3, n: 6, n_organic: 5 })
    expect(one(OTTO, G('Liners'))).toMatchObject({ k_organic: 1, n_organic: 2 })
  })

  it('carries both versions, and pools a month over its audiences', () => {
    expect(rows.every((r) => r.rule_version === PRODUCT_MODEL_RULE_VERSION && r.catalogue_version === FIXTURE_CATALOGUE.version)).toBe(true)
    expect(pooledProductMonth(rows, SEP, G('Liners'))).toEqual({ k_named: 2, k_unclear: 1, k_unbranded: 2, k_any: 5, k_organic: 4, comments: 4, n: 8, n_organic: 7 })
  })

  it('merges as a month table: a frozen row kept, a new key in a held closed audience-month refused, a first back-read let in', () => {
    const fresh = rows.filter((r) => r.object_id === G('Liners') || r.object_id === G('Feet'))
    const liners = fresh.find((r) => r.audience === IND && r.object_id === G('Liners'))!
    const stored = [{ key: productReadingKey(liners), month: SEP, audience: IND, objectId: `group|${G('Liners')}`, status: 'frozen' as const, origin: 'live' as const, frozen_at: '2026-10-31T00:00:00Z' }]
    const m = mergeProductRows({ months: [SEP], fresh, stored, now: '2026-11-02T07:00:00Z', runId: 'r', closedAudienceMonths: [`${SEP}|${OTTO}`, `${SEP}|${IND}`] })
    expect(m.keptFrozen).toBe(1)
    expect(m.refusedLate.map((x) => x.key)).toEqual([productReadingKey({ month: SEP, audience: IND, object_kind: 'group', object_id: G('Feet') })])
    // Ottobock's audience-month is closed and holds no product row yet: decision K's first back-read.
    expect(m.writes.map((w) => [w.audience, w.object_id, w.status, w.origin])).toEqual([
      [OTTO, G('Liners'), 'frozen', 'back_read'],
      [OTTO, G('Feet'), 'frozen', 'back_read'],
    ])
  })
})

// ---- the pass, on a fake IO -----------------------------------------------------------

const VIDEO = (n: number, over: Partial<ProductVideoRow> = {}): ProductVideoRow => ({
  id: vid(n), platform: 'tiktok', video_id: `tt${n}`, account_name: `acct${n}`, caption: null, hashtags: null, transcript: null, transcript_en: null, ocr_text: null, ...over,
})
const COMMENT = (id: string, n: number, text: string, date = '2026-09-10T10:00:00Z', lowSignal = false): ProductCommentRow =>
  ({ id, platform: 'tiktok', video_id: `tt${n}`, text, comment_date: date, is_low_signal: lowSignal })

function world(opts: { held?: HeldRow[] | null; tags?: ProductTagRow[] | null; searchTerms?: string[]; searchFound?: Map<string, string[]> } = {}) {
  const videos = [
    VIDEO(1, { caption: 'Trying the Pro-Flex XC on a hike' }),
    VIDEO(2, { caption: 'Unity vacuum suspension, day one' }),
    VIDEO(3, { caption: 'Morning routine' }),
  ]
  const comments = [
    COMMENT('k1', 1, 'how long does it last?'),
    COMMENT('k2', 1, 'my rheo knee beeps at night'),
    COMMENT('k3', 1, '🔥🔥'),
    COMMENT('k4', 2, 'does it hiss when you sit?'),
    COMMENT('k5', 3, 'you look great'),
    COMMENT('k6', 3, 'which prosthetic liner is that?'),
    COMMENT('k7', 1, 'my liner rubs on hills'),
  ]
  const pattern = cataloguePattern(compiled, 'js')!
  const re = new RegExp(pattern, 'isu')
  const calls: string[] = []
  const io: ProductReadIO = {
    engine: 'js',
    candidates: async (pat) => {
      calls.push('candidates')
      expect(pat).toBe(pattern)
      const out: Candidate[] = []
      for (const v of videos) if (v.caption && re.test(v.caption)) out.push({ video_id: v.id, source: 'content', field: 'caption', comment_id: null, comment_month: null, excerpt: v.caption })
      for (const c of comments) {
        const v = videos.find((x) => x.video_id === c.video_id)!
        if (c.text && re.test(c.text)) out.push({ video_id: v.id, source: 'comment', field: null, comment_id: c.id, comment_month: '2026-09-01', excerpt: c.text })
      }
      return out
    },
    monthVideos: async (m) => (m === SEP ? videos.map((v) => ({ id: v.id, platform: v.platform, audience: IND, dated: 2 })) : []),
    videos: async (ids) => { calls.push(`videos:${ids.length}`); return videos.filter((v) => ids.includes(v.id)) },
    comments: async (vs) => { calls.push(`comments:${vs.length}`); return comments.filter((c) => vs.some((v) => v.video_id === c.video_id)) },
    held: async () => (opts.held === undefined ? [] : opts.held),
    tags: async () => (opts.tags === undefined ? [] : opts.tags),
    rivalFound: async () => new Set<string>(),
    searchTerms: async () => opts.searchTerms ?? [],
    searchFound: async () => opts.searchFound ?? new Map(),
  }
  return { io, calls }
}

const codes = catalogueCodes(FIXTURE_CATALOGUE)
const code = (id: string) => [...codes.product, ...codes.group].find(([, v]) => v === id)![0]
/** A stub model: Unity is confirmed under video 2's caption; "how long does it last" is the Pro-Flex XC
 *  under video 1; "does it hiss" is one of the client's sockets, not which; the rest none. */
const stub: Classifier = async ({ kind, user }) => ({
  answers: kind === 'confirm'
    ? [...user.matchAll(/^(\d+)\. WORD .*\| TEXT: (.*)$/gm)].map(([, n, text]) => ({ n: Number(n), means: /vacuum/.test(text) }))
    : [...user.matchAll(/^(\d+)\. (.*)$/gm)].map(([, n, line]) => (
      /how long/.test(line) ? { n: Number(n), placement: 'named' as const, products: [code(P('Pro-Flex XC'))], category: null, words: 'it', sure: true }
        : /hiss/.test(line) ? { n: Number(n), placement: 'unclear' as const, products: [], category: code(G('Sockets')), words: 'it', sure: true }
          : { n: Number(n), placement: 'none' as const, products: [], category: null, words: null, sure: true })),
  usage: { prompt_tokens: 800, completion_tokens: 100 }, durationMs: 1,
})
const askWith = (classifier: Classifier, written: MentionInsert[]): Ask => (items, videos, budgetUsd) => runClassifier({
  admin: null, clientId: OSSUR_CLIENT_ID, runId: 'r', clientName: 'Össur', catalogue: FIXTURE_CATALOGUE, compiled, items, videos, budgetUsd, classifier,
  write: async (rows) => { written.push(...rows) },
})

describe('placeProducts: the pass', () => {
  const window = { from: SEP, to: OCT }

  it('dry: asks nothing, prices the confirm and the queue, writes nothing', async () => {
    const { io, calls } = world({ held: null, tags: null })
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: null, budgetUsd: 0 })
    expect(calls).toEqual(['candidates', 'videos:2', 'comments:1'])
    expect(r.confirm.map((c) => c.key)).toEqual([contentKey(vid(2))])
    // relevant: video 1 (rules); video 2 waits on the confirm of its generic name, and a dry run does not read it
    expect([...r.relevant]).toEqual([vid(1)])
    expect([...r.waitingOnConfirm]).toEqual([vid(2)])
    expect(r.queue.map((q) => q.commentId)).toEqual(['k1'])
    expect(r.priced.calls).toBe(2)
    expect(r.priceUsd).toBeGreaterThan(0)
    expect(r.costUsd).toBe(0)
    expect(r.modelRows).toEqual([])
    expect(h.parse).not.toHaveBeenCalled()
  })

  it('live: rules, then the confirm, then the queue under the relevant videos, then the months', async () => {
    const { io } = world()
    const written: MentionInsert[] = []
    const inserted: MentionInsert[] = []
    const r = await placeProducts({
      clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window,
      ask: askWith(stub, written), insert: async (rows) => { inserted.push(...rows) }, budgetUsd: 1,
    })
    expect(inserted.map((x) => [x.source, x.comment_id, x.placement, x.product_id ?? x.group_id])).toEqual([
      ['content', null, 'named', P('Pro-Flex XC')],
      ['comment', 'k2', 'named', P('Rheo Knee')],
      ['comment', 'k6', 'unbranded', G('Liners')],
      ['comment', 'k7', 'unbranded', G('Liners')],
    ])
    expect(written.map((x) => [x.method, x.comment_id ?? x.video_id, x.placement])).toEqual([
      ['confirmed', vid(2), 'named'],
      ['model', 'k1', 'named'],
      ['model', 'k4', 'unclear'],
    ])
    const one = (id: string) => r.rows.find((x) => x.object_id === id)!
    expect(one(G('Feet'))).toMatchObject({ k_named: 1, k_any: 1, comments: 1, n: 3 })
    expect(one(G('Sockets'))).toMatchObject({ k_named: 1, k_unclear: 0, k_any: 1, comments: 1 })
    expect(one(G('Knees'))).toMatchObject({ k_named: 1, comments: 1 })
    // "which prosthetic liner is that?" sits under a video no category stands on: counted
    // (CATEGORY_WORDS_ONLY_UNDER_RELEVANT is off), and the pass says how many such there are
    expect(CATEGORY_WORDS_ONLY_UNDER_RELEVANT).toBe(false)
    expect(one(G('Liners'))).toMatchObject({ k_unbranded: 2, k_any: 2, comments: 2 })
    expect(r.offTopicWords).toBe(1)
    expect(r.costUsd).toBeGreaterThan(0)
  })

  it('a replay asks nothing the table holds and inserts no rule row twice', async () => {
    const first = world()
    const written: MentionInsert[] = []
    const inserted: MentionInsert[] = []
    await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io: first.io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(stub, written), insert: async (rows) => { inserted.push(...rows) }, budgetUsd: 1 })
    const held = [...inserted, ...written].map((x) => ({ ...x })) as HeldRow[]
    const again = world({ held })
    const call = vi.fn(stub)
    const ins2: MentionInsert[] = []
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io: again.io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(call, []), insert: async (rows) => { ins2.push(...rows) }, budgetUsd: 1 })
    expect(call).not.toHaveBeenCalled()
    expect(ins2).toEqual([])
    expect(r.rows.find((x) => x.object_id === G('Sockets'))).toMatchObject({ k_named: 1 })
  })

  it('a person\'s tag stands over the model on its comment, and its text is never asked', async () => {
    const tag: ProductTagRow = {
      id: 't1', client_id: OSSUR_CLIENT_ID, video_id: vid(1), comment_id: 'k1', placement: 'unbranded', product_id: null, group_id: G('Feet'),
      supersedes: null, actor_kind: 'user', actor_user_id: null, actor_label: 'member', created_at: '2026-10-13T10:00:00Z',
    }
    const tagRow = { client_id: OSSUR_CLIENT_ID, video_id: vid(1), source: 'comment', comment_id: 'k1', comment_month: SEP, placement: 'unbranded', product_id: null, group_id: G('Feet'), method: 'tag', rule_version: 'product_tag_v1', catalogue_version: 'pc1_0000000000000000', tag_id: 't1' } as HeldRow
    const { io } = world({ tags: [tag], held: [tagRow] })
    const written: MentionInsert[] = []
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(stub, written), budgetUsd: 1 })
    expect(written.some((x) => x.comment_id === 'k1')).toBe(false)
    expect(r.rows.find((x) => x.object_id === G('Feet'))).toMatchObject({ k_named: 1, k_unbranded: 0, comments: 1 })
  })

  it('a video outside every month\'s market (a client\'s own post) is never relevant: its comments are not read', async () => {
    const { io } = world()
    const own: ProductReadIO = { ...io, monthVideos: async (m) => ((await io.monthVideos(m)) ?? []).filter((v) => v.id !== vid(1)) }
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io: own, catalogue: FIXTURE_CATALOGUE, window, ask: null, budgetUsd: 0 })
    expect([...r.relevant]).toEqual([])
    expect(r.queue).toEqual([])
  })

  it('the organic base is the category\'s: a search in its own words leaves its finds out, and only its', async () => {
    const { io } = world({ searchTerms: ['prosthetic knee', 'ossur', 'amputee', 'running blade'], searchFound: new Map([[vid(1), ['running blade']], [vid(2), ['prosthetic knee']]]) })
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: null, budgetUsd: 0 })
    expect(r.organic.get(G('Feet'))).toEqual({ terms: ['running blade'], videos: 1 })
    expect(r.organic.get(G('Knees'))).toEqual({ terms: ['prosthetic knee'], videos: 1 })
    expect(r.organic.get(G('Liners'))).toEqual({ terms: [], videos: 0 })
    const one = (id: string) => r.rows.find((x) => x.object_id === id)!
    // Feet: video 1 (named Pro-Flex XC) was found by "running blade": out of Feet's base and its products', not Liners'
    expect(one(G('Feet'))).toMatchObject({ k_any: 1, k_organic: 0, n: 3, n_organic: 2 })
    expect(one(P('Pro-Flex XC'))).toMatchObject({ k_any: 1, k_organic: 0, n_organic: 2 })
    expect(one(G('Liners'))).toMatchObject({ n_organic: 3 })
    expect(one(G('Knees'))).toMatchObject({ n_organic: 2 })
  })

  it('categorySearchTerms: a term is a category\'s when the rules read it as that category', () => {
    const byGroup = categorySearchTerms(compiled, ['#runningblade', 'prosthetic arm', 'ossur', 'Prosthetic Knee', 'socket'])
    expect(Object.fromEntries([...byGroup].map(([g, ts]) => [compiled.groupName.get(g), ts]))).toEqual({ Feet: ['#runningblade'], Knees: ['Prosthetic Knee'] })
    expect(categorySearchFinds(byGroup, new Map([['v1', ['#RunningBlade']], ['v2', ['ossur']]])).get(G('Feet'))).toEqual(new Set(['v1']))
  })

  it('THE ONE-SHOT GUARD, the back-read: a 429 leaves items, and a closed month\'s rows are not written; a full read writes them', async () => {
    const { io } = world()
    const rateLimited: Classifier = async () => { throw new Error('429 rate limit reached') }
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(rateLimited, []), budgetUsd: 1 })
    expect(r.confirmResult?.rateLimited).toBe(true)
    const left = itemsLeft(r)
    expect(left).toBeGreaterThan(0)
    const closing = mergeProductRows({ months: [SEP], fresh: r.rows, stored: [], now: '2026-11-02T07:00:00Z', runId: null })
    expect(closing.writes.every((w) => w.status === 'frozen')).toBe(true)
    expect(guardFreeze(closing, left, 'skip')).toEqual({ merged: null, held: closing.writes.length })
    const live = guardFreeze(closing, left, 'filling')
    expect(live.held).toBe(closing.writes.length)
    expect(live.merged!.writes.every((w) => w.status === 'filling' && w.frozen_at === null && w.origin === 'live')).toBe(true)
    // nothing left: written as merged
    expect(guardFreeze(closing, 0, 'skip')).toEqual({ merged: closing, held: 0 })
    // a month still filling is written as merged whatever was left
    const open = mergeProductRows({ months: [SEP], fresh: r.rows, stored: [], now: '2026-10-11T07:00:00Z', runId: null })
    expect(guardFreeze(open, left, 'skip')).toEqual({ merged: open, held: 0 })
  })

  it('itemsLeft counts what a cap kept from the queue', async () => {
    const { io } = world()
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(stub, []), budgetUsd: 1, queueCap: 0 })
    expect(itemsLeft(r, 0)).toBe(r.queue.length)
    expect(itemsLeft(r)).toBe(0)
  })

  it('the cap: the queue past it is left for the next run, priced', async () => {
    const { io } = world()
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io, catalogue: FIXTURE_CATALOGUE, window, ask: askWith(stub, []), budgetUsd: 1, queueCap: 1 })
    expect(r.classifyResult?.asked).toBe(1)
    expect(r.queue).toHaveLength(2)
    expect(r.priceUsd).toBeGreaterThan(0)
  })
})

// ---- the client's own posts (depth v2 T5, the lead's ruling of 13 Oct) ------------------
//
// A product read is the MARKET's words about the products. The brand's own
// words (an own post's caption, hashtags, account, voice and on-screen text)
// never place anything; the comments under an own post are the market's and
// do, and the video then counts in its month (the client's audience).

describe('the client\'s own posts: their words never place, their comments do', () => {
  const window = { from: SEP, to: OCT }
  const CLIENT = 'client'

  it('contentFields reads nothing of an owned video, everything of anyone else\'s', () => {
    expect(contentFields(VIDEO(1, { caption: 'Our new Pro-Flex XC', hashtags: ['proflexxc'], source: 'owned' }))).toEqual([])
    expect(contentFields(VIDEO(1, { caption: 'My new Pro-Flex XC', source: 'discovered' })).map((f) => f.field)).toEqual(['account', 'caption'])
    // A row read before T5 carries no source: read as not owned.
    expect(contentFields(VIDEO(1, { caption: 'My new Pro-Flex XC' })).map((f) => f.field)).toEqual(['account', 'caption'])
  })

  it('the pass: an own post\'s caption places nothing, a comment under it does, and the video counts under the client', async () => {
    const { io } = world()
    const own: ProductReadIO = {
      ...io,
      videos: async (ids) => (await io.videos(ids)).map((v) => (v.id === vid(1) ? { ...v, source: 'owned' } : v)),
      monthVideos: async (m) => ((await io.monthVideos(m)) ?? []).map((v) => (v.id === vid(1) ? { ...v, audience: CLIENT, owned: true } : v)),
    }
    const inserted: MentionInsert[] = []
    const r = await placeProducts({ clientId: OSSUR_CLIENT_ID, clientName: 'Össur', io: own, catalogue: FIXTURE_CATALOGUE, window, ask: null, insert: async (rows) => { inserted.push(...rows) }, budgetUsd: 0 })
    // "Trying the Pro-Flex XC on a hike" is the brand's own caption: no row.
    expect(inserted.some((x) => x.video_id === vid(1) && x.source === 'content')).toBe(false)
    // "my rheo knee beeps at night", under it, is the market's.
    expect(inserted.find((x) => x.comment_id === 'k2')).toMatchObject({ placement: 'named', product_id: P('Rheo Knee') })
    // Its words place nothing, so it is not category-relevant: its other comments are not queued.
    expect(r.relevant.has(vid(1))).toBe(false)
    expect(r.queue.some((q) => q.videoId === vid(1))).toBe(false)
    const row = (audience: string, id: string) => r.rows.find((x) => x.audience === audience && x.object_id === id)!
    expect(row(CLIENT, G('Knees'))).toMatchObject({ k_named: 1, k_any: 1, n: 1 })
    expect(row(CLIENT, P('Rheo Knee'))).toMatchObject({ k_named: 1, comments: 1 })
    expect(row(CLIENT, G('Feet'))).toMatchObject({ k_any: 0 })
  })

  it('productReadingRows counts a creator\'s video about the client, and never an own post\'s own words (a placement from before included)', () => {
    const sep: ProductMonthVideo[] = [
      { id: vid(1), platform: 'tiktok', audience: CLIENT, dated: 3, owned: true },
      { id: vid(2), platform: 'tiktok', audience: CLIENT, dated: 3, owned: false },
      { id: vid(3), platform: 'tiktok', audience: IND, dated: 3 },
    ]
    const standing = new Map<string, StandingText>([
      [contentKey(vid(1)), st(vid(1), null, null, [p('named', 'Liners', 'Iceross Seal-In X5')])],
      [commentKey('o1'), st(vid(1), SEP, 'o1', [p('unclear', 'Feet')])],
      [contentKey(vid(2)), st(vid(2), null, null, [p('named', 'Liners', 'Iceross Seal-In X5')])],
    ])
    const rows = productReadingRows({ clientId: OSSUR_CLIENT_ID, compiled, markets: new Map([[SEP, sep]]), rivalFound: new Set(), standing })
    const one = (id: string) => rows.find((r) => r.audience === CLIENT && r.object_id === id)!
    expect(one(P('Iceross Seal-In X5'))).toMatchObject({ k_named: 1, n: 2 })
    expect(one(G('Liners'))).toMatchObject({ k_named: 1, k_any: 1 })
    expect(one(G('Feet'))).toMatchObject({ k_unclear: 1, k_any: 1 })
  })

  it('readProductMonthVideos: every audience with the own posts marked; market_month_videos where the migration is not applied', async () => {
    const calls: string[] = []
    const db = (fns: Record<string, () => { data: unknown; error: unknown }>) => ({
      rpc: (fn: string) => { calls.push(fn); return { order: () => ({ range: async () => fns[fn]() }) } },
    })
    const rows = await readProductMonthVideos(db({
      product_month_videos: () => ({ data: [{ video_id: 'a', audience: CLIENT, platform: 'tiktok', dated_comments: 4, owned: true }, { video_id: 'b', audience: IND, platform: 'youtube', dated_comments: 2, owned: false }], error: null }),
    }) as never, OSSUR_CLIENT_ID, SEP)
    expect(rows).toEqual([
      { id: 'a', platform: 'tiktok', audience: CLIENT, dated: 4, owned: true },
      { id: 'b', platform: 'youtube', audience: IND, dated: 2, owned: false },
    ])
    const missing = { code: 'PGRST202', message: 'Could not find the function public.product_month_videos(p_client, p_month) in the schema cache' }
    const fallback = await readProductMonthVideos(db({
      product_month_videos: () => ({ data: null, error: missing }),
      market_month_videos: () => ({ data: [{ video_id: 'b', audience: IND, platform: 'youtube', dated_comments: 2 }], error: null }),
    }) as never, OSSUR_CLIENT_ID, SEP)
    expect(fallback).toEqual([{ id: 'b', platform: 'youtube', audience: IND, dated: 2 }])
    expect(calls.slice(-2)).toEqual(['product_month_videos', 'market_month_videos'])
    await expect(readProductMonthVideos(db({ product_month_videos: () => ({ data: null, error: { code: '57014', message: 'statement timeout' } }) }) as never, OSSUR_CLIENT_ID, SEP)).rejects.toThrow('statement timeout')
  })
})
