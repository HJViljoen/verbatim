import { SEALAND_CLIENT_ID } from '../../config'
import type { StandingText, TextKey } from '../../products/match'
import type { LevelVideoRow, ProductsInput, ProductsParams, TextRead } from './products'
import { productKindLabel, setKey, setsOf } from './products'
import { buildLevelData, type CategoryReads, type LevelAsk, type ProductReads, type ProductsLevelData } from './products-levels'
import {
  OSSUR_STANDING, ossurCrosses, ossurInput, ossurProductRows, ossurTodayInput, ossurTodayMarket, PRODUCT_IDS, fixtureGroupId, fixtureProductId,
  linersUnclearTexts, proFlexXcTexts, SEP_MARKET, todayCrosses, todayUnclearTexts,
} from './products-fixture'

// YOUR PRODUCTS' LEVEL PAGES, AS FIXTURES (17 Oct; the G4 boards): every
// state a category's and a product's page draws, built through the page's
// own builders (`buildLevelData`) over Össur's fixture catalogue and months
// (products-fixture.ts), September the reading month on 13 October.
//
// The Iceross Seal-In X's evidence carries the board's own videos and
// comments (illustrative: The Amputee Diaries' review, @stepbystep.amp's
// morning routine, an Össur post, @vida.protesis in Spanish), each comment
// placed under the product in September so the counts and the cards agree.
// The groups are Voices' four from the board, crossed with each set.

const SEP = '2026-09-01'

const text = (key: string, videoId: string, commentId: string | null, words: string | null, date: string, platform: string, account: string | null, over: Partial<TextRead> = {}): TextRead => ({
  key, videoId, commentId, text: words, lang: words ? 'en' : null, english: null, date, platform, account,
  videoUrl: `https://www.${platform === 'tiktok' ? 'tiktok.com/@x/video' : platform === 'youtube' ? 'youtube.com/watch?v=' : 'instagram.com/p'}/${videoId}`,
  platformCommentId: commentId ? `p-${commentId}` : null, ...over,
})

/** The Seal-In X's September videos (its content placements), and an Össur
 *  post of the month whose comments name it. */
const sealVideos = (): string[] => [...OSSUR_STANDING.values()].filter((t) => t.commentId == null && t.placements.some((p) => p.productId === PRODUCT_IDS.sealInX())).map((t) => t.videoId).filter((v) => v.includes('2026-09'))
const ownPost = (): string => SEP_MARKET.filter((v) => v.owned)[0].id

/** The board's comments naming the Seal-In X: [video, words, date, lang, english]. */
function sealComments(): { video: string; id: string; words: string; date: string; platform: string; lang?: string; english?: string }[] {
  const v = sealVideos()
  const own = ownPost()
  return [
    { video: v[0], id: 'sx-1', words: 'The Seal-In X doesn’t budge, even on a long hike.', date: '2026-09-04', platform: 'youtube' },
    { video: v[0], id: 'sx-2', words: 'Switched from the Comfort to the Seal-In X and the slipping stopped.', date: '2026-09-06', platform: 'youtube' },
    { video: v[0], id: 'sx-3', words: 'How long did your Seal-In take to break in? Mine still pinches at the back.', date: '2026-09-05', platform: 'youtube' },
    { video: v[1], id: 'sx-4', words: 'Takes me ten minutes to get the Seal-In on in the morning.', date: '2026-09-08', platform: 'tiktok' },
    { video: v[1], id: 'sx-5', words: 'Is that the Seal-In X? Does it hold when you sweat?', date: '2026-09-07', platform: 'tiktok' },
    { video: own, id: 'sx-6', words: 'Two years on the Seal-In X, best grip I’ve had.', date: '2026-09-03', platform: 'instagram' },
    { video: own, id: 'sx-7', words: 'Can I get the Seal-In X through my insurance or is it extra?', date: '2026-09-05', platform: 'instagram' },
    { video: v[2], id: 'sx-8', words: 'El Seal-In X me aguanta todo el día, pero ponérmelo cuesta.', date: '2026-09-09', platform: 'tiktok', lang: 'es', english: 'The Seal-In X holds all day for me, but putting it on is hard.' },
  ]
}

/** Every placement, the Seal-In X's comments added. */
export function levelStanding(): Map<TextKey, StandingText> {
  const out = new Map(OSSUR_STANDING)
  for (const c of sealComments()) out.set(`c:${c.id}`, { videoId: c.video, commentId: c.id, month: SEP, placements: [{ placement: 'named', groupId: PRODUCT_IDS.liners(), productId: PRODUCT_IDS.sealInX(), method: 'rule' }] })
  return out
}

/** The video rows the evidence reads (the board's four first). */
function sealVideoRows(): Map<string, LevelVideoRow> {
  const v = sealVideos()
  const own = ownPost()
  const named: [string, Partial<LevelVideoRow>][] = [
    [v[0], { platform: 'youtube', account_name: 'The Amputee Diaries', caption: 'Twelve miles on the Seal-In X: an honest review after a month', comments_count: 148, upload_date: '2026-09-02' }],
    [v[1], { platform: 'tiktok', account_name: '@stepbystep.amp', caption: 'My morning routine with a new liner, start to finish', comments_count: 87, upload_date: '2026-09-06' }],
    [own, { platform: 'instagram', account_name: 'ossur', caption: 'Meet the people who make our liners', comments_count: 64, upload_date: '2026-09-01' }],
    [v[2], { platform: 'tiktok', account_name: '@vida.protesis', caption: 'Un día completo con mi pierna nueva', comments_count: 33, upload_date: '2026-09-08' }],
    ...v.slice(3).map((id, i): [string, Partial<LevelVideoRow>] => [id, { platform: ['youtube', 'instagram', 'tiktok'][i % 3], account_name: ['amputee.life', 'legday.club', 'bladerunner.daily'][i % 3], caption: 'A day out on a new liner', comments_count: 20 + i, upload_date: `2026-09-${String(10 + i).padStart(2, '0')}` }]),
  ]
  return new Map(named.map(([id, row]) => [id, { id, platform: null, video_id: `p-${id}`, video_url: `https://www.tiktok.com/@x/video/${id}`, account_name: null, ...row }]))
}

/** The comments naming the Seal-In X, newest first, as the loader reads them. */
function sealTexts(): TextRead[] {
  return sealComments()
    .map((c) => text(`c:${c.id}`, c.video, c.id, c.words, c.date, c.platform, null, c.lang ? { lang: c.lang, english: c.english ?? null } : {}))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** Voices' four groups (the board's), each on a slice of the set's videos. */
function groupsOver(ids: readonly string[]): NonNullable<CategoryReads['groups']> {
  const pick = (from: number, n: number) => ids.slice(from, from + n)
  const share = (f: number) => Math.max(1, Math.round(ids.length * f))
  return [
    { key: 'new', name: 'New amputees, first year', videoIds: pick(0, share(0.4)) },
    { key: 'long', name: 'Long-time users upgrading', videoIds: pick(share(0.2), share(0.23)) },
    { key: 'carers', name: 'Caregivers and family', videoIds: pick(share(0.5), share(0.15)) },
    { key: 'active', name: 'Active and athletic', videoIds: pick(share(0.7), share(0.1)) },
  ]
}

/** Össur's September, the Seal-In X's comments placed, as the level's input. */
export function levelInput(over: Partial<ProductsInput> = {}): ProductsInput {
  const standing = levelStanding()
  const crosses = new Map(ossurCrosses())
  const sub = (label: string, k: number) => ({ id: `s-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, label, k })
  const kind = (id: string, k: number) => ({ id, label: productKindLabel(id), k })
  // The Seal-In X's ten videos (its own posts' comments included), as the
  // board reads them: one subject not measured yet, two on none of them.
  crosses.set(setKey('product', PRODUCT_IDS.sealInX()), {
    n: 10,
    subjects: [sub('Fit & comfort', 8), sub('Choosing the right device', 3), sub('Cost & access', 1)],
    quiet: [sub('Community & encouragement', 0), sub('Look & style', 0)].map(({ id, label }) => ({ id, label })),
    kinds: [kind('praise', 7), kind('question', 6), kind('pain_point', 3)],
    pending: [{ id: 's-function-movement', label: 'Function & movement', state: 'provisional' }],
  })
  crosses.set(setKey('product', fixtureProductId('Iceross Dermo')), { n: 1, subjects: [sub('Fit & comfort', 1)], kinds: [kind('question', 1)] })
  return ossurInput({ rows: ossurProductRows(standing), standing, crosses, ...over })
}

/** The Liners' card products' comments (the board's three). */
function hubNamed(): Map<string, TextRead[]> {
  const synergy = fixtureProductId('Iceross Synergy')
  return new Map([
    [PRODUCT_IDS.sealInX(), sealTexts()],
    [PRODUCT_IDS.comfort(), [text('c:cf-1', 'v-c', 'cf-1', 'Ordered the Comfort a size up and it bunches behind my knee. Anyone else?', '2026-09-07', 'instagram', null)]],
    [synergy, [text('c:sy-1', 'v-s', 'sy-1', 'Trying the Synergy for summer. Ask me in a month.', '2026-09-09', 'tiktok', null)]],
  ])
}

/** A category's page: the Liners (an owner reading) by default. */
export function categoryFixture(opts: { group?: string; params?: ProductsParams; over?: Partial<ProductsInput>; reads?: Partial<CategoryReads> | null } = {}): ProductsLevelData {
  const input = levelInput({ params: opts.params ?? {}, ...opts.over })
  const id = opts.group ?? PRODUCT_IDS.liners()
  const ids = [...(setsOf(input)?.groups.get(id)?.any ?? [])]
  const reads: CategoryReads | null = opts.reads === null ? null : { unclear: linersUnclearTexts(), named: hubNamed(), groups: groupsOver(ids), ...opts.reads }
  return buildLevelData({ in: input, ask: { kind: 'category', id }, category: reads })
}

/** A product's page: the Seal-In X by default. */
export function productFixture(opts: { product?: string; params?: ProductsParams; over?: Partial<ProductsInput>; reads?: Partial<ProductReads> | null } = {}): ProductsLevelData {
  const input = levelInput({ params: opts.params ?? {}, ...opts.over })
  const id = opts.product ?? PRODUCT_IDS.sealInX()
  const group = input.catalogue?.state === 'ready' ? input.catalogue.catalogue.products.find((p) => p.id === id)!.group_id : ''
  const ids = [...(setsOf(input)?.products.get(id) ?? [])]
  const reads: ProductReads | null = opts.reads === null ? null : { videos: sealVideoRows(), named: id === PRODUCT_IDS.sealInX() ? sealTexts() : [], groups: groupsOver(ids), ...opts.reads }
  return buildLevelData({ in: input, ask: { kind: 'product', group, id }, product: reads })
}

/** Össur today (production's shape on 13 Oct): every subject provisional, no
 *  liner named, three couldn't tell which. */
export function todayCategoryFixture(opts: { group?: string; calibrated?: boolean; thin?: boolean } = {}): ProductsLevelData {
  const id = opts.group ?? PRODUCT_IDS.liners()
  const feet = id === PRODUCT_IDS.feet()
  const input = ossurTodayInput(opts.thin ?? false, { params: {}, ...(feet ? { crosses: todayCrosses(false, ['Pro-Flex XC', 'Proprio Foot', 'Pro-Flex Terra'], opts.calibrated ?? false) } : {}) }, opts.calibrated ?? false)
  const ids = [...(setsOf(input)?.groups.get(id)?.any ?? [])]
  const reads: CategoryReads = {
    unclear: todayUnclearTexts(opts.thin ?? false, feet ? 'Feet' : 'Liners'),
    named: feet ? new Map([[PRODUCT_IDS.proFlexXc(), proFlexXcTexts()]]) : new Map(),
    groups: groupsOver(ids),
  }
  return buildLevelData({ in: input, ask: { kind: 'category', id }, category: reads })
}

/** A quiet product (G4-Products-Thin, frame 1): October so far, the Proprio
 *  Foot named in no video, one in September. */
export function quietProductFixture(): ProductsLevelData {
  const input = ossurTodayInput(false, { month: '2026-10-01', soFar: true, market: ossurTodayMarket(false, '2026-10-01'), params: {} })
  return buildLevelData({ in: input, ask: { kind: 'product', group: PRODUCT_IDS.feet(), id: PRODUCT_IDS.proprio() }, product: { videos: new Map(), named: [], groups: [] } })
}

const ask = (kind: 'category' | 'product', id: string): LevelAsk => (kind === 'category'
  ? { kind, id }
  : { kind, group: fixtureGroupId('Liners'), id })

export const PRODUCTS_LEVEL_FIXTURES = {
  'liners': () => categoryFixture(),
  'liners-all': () => categoryFixture({ params: { unclear: 'all' } }),
  'liners-member': () => categoryFixture({ over: { canTag: false } }),
  'knees': () => categoryFixture({ group: PRODUCT_IDS.knees(), reads: { unclear: [], named: new Map() } }),
  'sealinx': () => productFixture(),
  'sealinx-open': () => productFixture({ params: { video: sealVideos()[0] } }),
  'sealinx-all': () => productFixture({ params: { videos: 'all' } }),
  'navii': () => productFixture({ product: PRODUCT_IDS.navii() }),
  'today-liners': () => todayCategoryFixture(),
  'today-feet': () => todayCategoryFixture({ group: PRODUCT_IDS.feet() }),
  'today-feet-calibrated': () => todayCategoryFixture({ group: PRODUCT_IDS.feet(), calibrated: true }),
  'quiet-product': () => quietProductFixture(),
  /** Switched off (every tenant but Össur, G4-Products-Thin frame 2). */
  'not-on': () => buildLevelData({ in: levelInput({ enabled: false }), ask: ask('category', PRODUCT_IDS.liners()) }),
  'not-on-product': () => buildLevelData({ in: levelInput({ enabled: false }), ask: ask('product', PRODUCT_IDS.sealInX()) }),
  /** October has no product rows yet. */
  'unread': () => buildLevelData({ in: levelInput({ month: '2026-10-01', soFar: true }), ask: ask('category', PRODUCT_IDS.liners()) }),
  'missing': () => buildLevelData({ in: levelInput(), ask: { kind: 'category', id: 'not-a-category' } }),
  'missing-product': () => buildLevelData({ in: levelInput(), ask: { kind: 'product', group: PRODUCT_IDS.liners(), id: 'not-a-product' } }),
  'sealand': () => buildLevelData({ in: { ...levelInput(), clientId: SEALAND_CLIENT_ID, client: 'Sealand', catalogue: { state: 'empty' } }, ask: { kind: 'category', id: 'x' } }),
} as const

export { sealVideos }
