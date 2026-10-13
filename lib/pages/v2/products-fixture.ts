import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import type { StandingText, TextKey } from '../../products/match'
import { productReadingRows, type ProductMonthVideo } from '../../products/readings'
import { compileCatalogue } from '../../products/rules'
import { seedCatalogue } from '../../products/seed'
import type { ProductCatalogue } from '../../products/types'
import type { PairComparability } from '../../reading/comparability'
import type { PairOn } from '../../reading/pairs'
import { OSSUR_PRODUCTS } from '../../../scripts/seeds/ossur-products'
import {
  buildProductsData, productKindLabel, setKey,
  type Crosses, type ProductMonthRow, type ProductsData, type ProductsInput, type ProductsParams, type TextRead,
} from './products'

// Your products' render fixtures (depth v2, T5): Össur's REAL catalogue (the
// seed T12 compiled from ossur.com, scripts/seeds/ossur-products.ts: six
// categories, 63 products) over an illustrative five months of its market,
// June to September 2026, September the reading month. Every figure is built
// through the page's own builders from row-shaped inputs: the month rows come
// from the products step's own `productReadingRows` over placements made up
// here, so the shelf, the sets and the split agree as they do in production.
//
// The counts follow the board's shape (E4-Products: the Navii's first month,
// a praised Cheetah, a Rheo Knee mostly about cost) and the T12 hand check's
// proportions (most of a category's talk is about the category in general,
// Hands the largest, named products a handful). Illustrative, never Össur's.
// The words in the panels' quotes are the board's.

const SEP = '2026-09-01'
const MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', SEP] as const
const OTTOBOCK = 'competitor:Ottobock'
const CATEGORY = 'industry-other'
const CLIENT = 'client'

/** The seed as the catalogue reads once loaded (the seed's own ids). */
export const OSSUR_CATALOGUE: ProductCatalogue = seedCatalogue(OSSUR_PRODUCTS)

const groupId = (name: string): string => {
  const g = OSSUR_CATALOGUE.groups.find((x) => x.name === name)
  if (!g) throw new Error(`fixture: no category ${name}`)
  return g.id
}
const productId = (name: string): string => {
  const p = OSSUR_CATALOGUE.products.find((x) => x.name === name)
  if (!p) throw new Error(`fixture: no product ${name}`)
  return p.id
}

interface GroupSpec {
  /** Videos naming each product (each its own videos). */
  named?: Record<string, number>
  unclear?: number
  unbranded?: number
}
interface MonthSpec {
  market: number
  /** Of those, filed under Ottobock. */
  rival: number
  groups: Record<string, GroupSpec>
}

const SPECS: Record<(typeof MONTHS)[number], MonthSpec> = {
  '2026-06-01': {
    market: 410, rival: 30,
    groups: {
      Liners: { named: { 'Iceross Seal-In X': 4, 'Iceross Comfort': 2, 'Iceross Dermo': 1 }, unclear: 8, unbranded: 25 },
      Feet: { named: { 'Flex-Foot Cheetah': 5, 'Pro-Flex XC': 3 }, unclear: 4, unbranded: 18 },
      Knees: { named: { 'Rheo Knee': 4, 'Power Knee': 2 }, unclear: 3, unbranded: 11 },
      'Sockets & Locks': { unbranded: 5 },
      Hands: { named: { 'i-Limb Quantum': 2 }, unclear: 2, unbranded: 21 },
      'Bracing & Supports': { unbranded: 2 },
    },
  },
  '2026-07-01': {
    market: 520, rival: 41,
    groups: {
      Liners: { named: { 'Iceross Seal-In X': 5, 'Iceross Comfort': 3, 'Iceross Dermo': 2 }, unclear: 10, unbranded: 35 },
      Feet: { named: { 'Flex-Foot Cheetah': 6, 'Pro-Flex XC': 4, 'Pro-Flex Terra': 1 }, unclear: 5, unbranded: 25 },
      Knees: { named: { 'Rheo Knee': 5, 'Power Knee': 3 }, unclear: 4, unbranded: 18 },
      'Sockets & Locks': { named: { 'Connect TF': 1 }, unbranded: 5 },
      Hands: { named: { 'i-Limb Quantum': 3 }, unclear: 3, unbranded: 24 },
      'Bracing & Supports': { unbranded: 3 },
    },
  },
  '2026-08-01': {
    market: 612, rival: 52,
    groups: {
      Liners: { named: { 'Iceross Seal-In X': 6, 'Iceross Comfort': 4, 'Iceross Synergy': 2 }, unclear: 12, unbranded: 49 },
      Feet: { named: { 'Flex-Foot Cheetah': 8, 'Pro-Flex XC': 5, 'Pro-Flex Terra': 2, 'Proprio Foot': 1 }, unclear: 8, unbranded: 36 },
      Knees: { named: { 'Rheo Knee': 6, 'Power Knee': 3 }, unclear: 5, unbranded: 27 },
      'Sockets & Locks': { named: { 'Connect TF': 1 }, unclear: 1, unbranded: 6 },
      Hands: { named: { 'i-Limb Quantum': 3, 'i-Limb Ultra': 1 }, unclear: 4, unbranded: 46 },
      'Bracing & Supports': { named: { 'Unloader One X': 1 }, unbranded: 1 },
    },
  },
  [SEP]: {
    market: 839, rival: 64,
    groups: {
      Liners: { named: { 'Iceross Seal-In X': 9, 'Iceross Comfort': 5, 'Iceross Synergy': 3, 'Iceross Dermo': 1 }, unclear: 21, unbranded: 78 },
      Feet: { named: { 'Flex-Foot Cheetah': 9, 'Pro-Flex XC': 6, 'Pro-Flex Terra': 3, 'Proprio Foot': 2 }, unclear: 12, unbranded: 63 },
      Knees: { named: { 'Rheo Knee': 7, 'Power Knee': 5, Navii: 3 }, unclear: 9, unbranded: 52 },
      'Sockets & Locks': { named: { 'Connect TF': 1 }, unclear: 1, unbranded: 8 },
      Hands: { named: { 'i-Limb Quantum': 4, 'i-Limb Ultra': 2 }, unclear: 6, unbranded: 98 },
      'Bracing & Supports': { named: { 'Unloader One X': 2 }, unbranded: 2 },
    },
  },
}

/** A month's market and the placements on it, made up per the spec: each
 *  named product, then the unclear and the unbranded videos, each on videos
 *  of its own, the rest of the market placed nowhere. In September, five of
 *  the Liners' unclear videos are placed by a comment rather than by the
 *  video (so the panel's list has words to show). */
function monthOf(month: string, spec: MonthSpec, opts: { prefix?: string; commented?: { group: string; count: number } | null } = {}): { market: ProductMonthVideo[]; standing: [TextKey, StandingText][] } {
  const tag = `${opts.prefix ?? ''}${month.slice(0, 7)}`
  const commented = opts.commented === undefined ? (month === SEP ? { group: 'Liners', count: 5 } : null) : opts.commented
  const platforms = ['tiktok', 'instagram', 'youtube', 'reddit']
  // Every audience is in the month (the lead's ruling, 13 Oct): Ottobock's,
  // the category's, and the client's (creators' videos about Össur, every
  // ninth, and Össur's own posts, the month's last 25, placed by no word of
  // their own and by none of their comments here).
  const market: ProductMonthVideo[] = Array.from({ length: spec.market }, (_, i) => {
    const owned = i >= spec.market - 25
    const audience = owned || i % 9 === 4 ? CLIENT : i % 13 === 0 && i / 13 < spec.rival ? OTTOBOCK : CATEGORY
    return { id: `v-${tag}-${i}`, platform: platforms[i % platforms.length], audience, dated: 6, ...(owned ? { owned: true } : {}) }
  })
  const standing: [TextKey, StandingText][] = []
  let at = 0
  const take = () => market[at++].id
  const content = (videoId: string, placement: 'named' | 'unclear' | 'unbranded', group: string, product: string | null) =>
    standing.push([`v:${videoId}`, { videoId, commentId: null, month: null, placements: [{ placement, groupId: group, productId: product, method: 'rule' }] }])
  for (const [name, g] of Object.entries(spec.groups)) {
    const gid = groupId(name)
    for (const [product, k] of Object.entries(g.named ?? {})) for (let i = 0; i < k; i++) content(take(), 'named', gid, productId(product))
    for (let i = 0; i < (g.unclear ?? 0); i++) {
      const videoId = take()
      if (commented && name === commented.group && i < commented.count) {
        const commentId = `c-${tag}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${i}`
        standing.push([`c:${commentId}`, { videoId, commentId, month, placements: [{ placement: 'unclear', groupId: gid, productId: null, method: 'rule' }] }])
      } else {
        content(videoId, 'unclear', gid, null)
      }
    }
    for (let i = 0; i < (g.unbranded ?? 0); i++) content(take(), 'unbranded', gid, null)
  }
  return { market, standing }
}

const built = MONTHS.map((m) => ({ month: m, ...monthOf(m, SPECS[m]) }))

/** Every placement the fixture makes, every month. */
export const OSSUR_STANDING: ReadonlyMap<TextKey, StandingText> = new Map(built.flatMap((b) => b.standing))

/** The four months' rows, as the products step writes them. */
export function ossurProductRows(): ProductMonthRow[] {
  const compiled = compileCatalogue(OSSUR_CATALOGUE, OSSUR_CLIENT_ID)
  const markets = new Map(built.map((b) => [b.month, b.market]))
  return productReadingRows({ clientId: OSSUR_CLIENT_ID, compiled, markets, rivalFound: new Set(), standing: OSSUR_STANDING })
    .map((r) => ({ ...r, status: r.month === SEP ? 'filling' as const : 'frozen' as const }))
}

/** September's market, as the page reads it. */
export const SEP_MARKET = built.find((b) => b.month === SEP)!.market.map((v) => ({ id: v.id, audience: v.audience, platform: v.platform, owned: v.owned === true }))

const cross = (n: number, subjects: [string, number][], kinds: [string, number][]): Crosses => ({
  n,
  subjects: subjects.map(([label, k]) => ({ id: `s-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, label, k })),
  kinds: kinds.map(([id, k]) => ({ id, label: productKindLabel(id), k })),
})

/** September's crosses: what each category's and each product's videos are
 *  about (subjects named like Össur's), and what people did in them. */
export function ossurCrosses(): Map<string, Crosses> {
  const g = (name: string) => setKey('group', groupId(name))
  const p = (name: string) => setKey('product', productId(name))
  return new Map<string, Crosses>([
    [g('Liners'), cross(117, [['Fit & comfort', 70], ['Cost & access', 18], ['Choosing the right device', 12], ['Look & style', 4]], [['pain_point', 52], ['question', 40], ['praise', 21], ['purchase_intent', 6]])],
    [g('Feet'), cross(95, [['Function & movement', 51], ['Fit & comfort', 20], ['Cost & access', 15]], [['praise', 38], ['question', 30], ['pain_point', 22]])],
    [g('Knees'), cross(76, [['Cost & access', 41], ['Function & movement', 22], ['Fit & comfort', 10]], [['question', 33], ['objection', 18], ['praise', 15]])],
    [g('Sockets & Locks'), cross(10, [['Fit & comfort', 7]], [['pain_point', 5], ['question', 3]])],
    [g('Hands'), cross(110, [['Look & style', 40], ['Function & movement', 38], ['Cost & access', 30]], [['praise', 44], ['question', 36], ['purchase_intent', 9]])],
    [g('Bracing & Supports'), cross(4, [['Fit & comfort', 2]], [['question', 2]])],
    [p('Iceross Seal-In X'), cross(9, [['Fit & comfort', 6], ['Cost & access', 1], ['Choosing the right device', 2]], [['pain_point', 4], ['praise', 3], ['question', 2]])],
    [p('Iceross Comfort'), cross(5, [['Fit & comfort', 3], ['Cost & access', 1]], [['praise', 2], ['pain_point', 2]])],
    [p('Iceross Synergy'), cross(3, [['Fit & comfort', 1]], [['praise', 1], ['question', 1]])],
    [p('Flex-Foot Cheetah'), cross(9, [['Function & movement', 8], ['Look & style', 1]], [['praise', 7], ['question', 2]])],
    [p('Pro-Flex XC'), cross(6, [['Function & movement', 4], ['Cost & access', 1]], [['praise', 3], ['question', 2]])],
    [p('Pro-Flex Terra'), cross(3, [['Function & movement', 2]], [['praise', 1]])],
    [p('Rheo Knee'), cross(7, [['Cost & access', 5], ['Function & movement', 2]], [['question', 4], ['praise', 3], ['objection', 2]])],
    [p('Power Knee'), cross(5, [['Cost & access', 2], ['Function & movement', 2]], [['question', 2], ['praise', 1]])],
    [p('Navii'), cross(3, [['Function & movement', 2]], [['question', 2]])],
    [p('i-Limb Quantum'), cross(4, [['Look & style', 2], ['Function & movement', 2]], [['praise', 2]])],
  ])
}

/** A month pair the fixture judges comparable (the reading month has ended
 *  and nothing of ours changed in it). */
export const ACCEPT_PAIRS: PairOn = (prevMonth, month): PairComparability => ({ prevMonth, month, mode: 'comparable', reasons: [], row: null, checkWith: null })

const text = (key: string, videoId: string, commentId: string | null, words: string | null, date: string, platform: string, account: string | null, over: Partial<TextRead> = {}): TextRead => ({
  key, videoId, commentId, text: words, lang: words ? 'en' : null, english: null, date, platform, account,
  videoUrl: `https://www.${platform === 'tiktok' ? 'tiktok.com/@x/video' : platform === 'youtube' ? 'youtube.com/watch?v=' : 'instagram.com/p'}/${videoId}`,
  platformCommentId: commentId ? `p-${commentId}` : null, ...over,
})

/** The Liners' couldn't-tell-which texts, newest first: five comments (one
 *  the gate keeps off the page: too short to be a voice) and the videos whose
 *  own words name one of Össur's liners. */
export function linersUnclearTexts(): TextRead[] {
  const liner = built.find((b) => b.month === SEP)!.standing.filter(([k, t]) => k.startsWith('c:') || t.placements.some((p) => p.placement === 'unclear' && p.groupId === groupId('Liners')))
  const comments = liner.filter(([k]) => k.startsWith('c:')).map(([, t]) => t)
  const videos = liner.filter(([k]) => k.startsWith('v:')).map(([, t]) => t)
  const words = [
    ['This liner gave me a rash after a week, back to my old one now.', '2026-09-29', 'tiktok'],
    ['Mine finally stopped smelling after I switched to the Össur one.', '2026-09-27', 'instagram'],
    ['Does anyone else have their liner roll down at the knee when it is hot?', '2026-09-24', 'youtube'],
    ['liner?', '2026-09-20', 'tiktok'],
    ['My prosthetist put me in the Össur gel liner and the sweating is so much better now.', '2026-09-18', 'instagram'],
  ] as const
  return [
    ...comments.map((t, i) => text(`c:${t.commentId}`, t.videoId, t.commentId, words[i][0], words[i][1], words[i][2], i === 0 ? 'stepbystep.amp' : null)),
    ...videos.slice(0, 2).map((t, i) => text(`v:${t.videoId}`, t.videoId, null, null, '2026-09-15', i === 0 ? 'youtube' : 'tiktok', i === 0 ? 'amputee.life' : 'legday.club')),
  ]
}

/** Comments naming the Iceross Seal-In X, newest first. */
export function sealInXTexts(): TextRead[] {
  const videos = built.find((b) => b.month === SEP)!.standing
    .filter(([, t]) => t.placements.some((p) => p.productId === productId('Iceross Seal-In X'))).map(([, t]) => t.videoId)
  const words = [
    ['The Seal-In X is the first liner that has not slipped on me during a long walk.', '2026-09-28', 'youtube'],
    ['Seal-In X here, hard to get on in the morning but it holds all day.', '2026-09-22', 'tiktok'],
    ['Does the Seal-In X come in a smaller size for kids?', '2026-09-12', 'instagram'],
    ['Seal-In X', '2026-09-03', 'tiktok'],
  ] as const
  return words.map(([w, d, p], i) => text(`c:x-${i}`, videos[i], `x-${i}`, w, d, p, null))
}

/** The fixtures' day: 13 October, while the reading month is still
 *  September, so the bar carries its label (decision 3). */
export const PRODUCTS_FIXTURE_NOW = '2026-10-13T08:00:00.000Z'

const BASE = (over: Partial<ProductsInput> = {}): ProductsInput => ({
  clientId: OSSUR_CLIENT_ID,
  client: 'Össur',
  month: SEP,
  soFar: false,
  now: PRODUCTS_FIXTURE_NOW,
  catalogue: { state: 'ready', catalogue: OSSUR_CATALOGUE },
  enabled: true,
  rows: ossurProductRows(),
  market: SEP_MARKET,
  standing: OSSUR_STANDING,
  crosses: ossurCrosses(),
  pair: ACCEPT_PAIRS,
  params: {},
  canTag: true,
  ...over,
})

/** Össur's September, nothing open. */
export function ossurProductsFixture(params: ProductsParams = {}, over: Partial<ProductsInput> = {}): ProductsData {
  return buildProductsData(BASE({ params, ...over }))
}

/** The Liners open, the reader an owner (the Tag controls drawn). */
export function ossurLinersFixture(params: ProductsParams = {}, over: Partial<ProductsInput> = {}): ProductsData {
  return buildProductsData(BASE({ params: { group: groupId('Liners'), ...params }, panelReads: { unclear: linersUnclearTexts() }, ...over }))
}

/** The Iceross Seal-In X open. */
export function ossurSealInXFixture(): ProductsData {
  return buildProductsData(BASE({ params: { product: productId('Iceross Seal-In X') }, panelReads: { named: sealInXTexts() } }))
}

/** The Navii open: its first month. */
export function ossurNaviiFixture(): ProductsData {
  return buildProductsData(BASE({ params: { product: productId('Navii') }, panelReads: { named: [] } }))
}

// ---- Össur today (the parity pass, 13 Oct night) ----------------------------------
//
// THE STATE PRODUCTION HOLDS after the June to October back-read (Össur's
// catalogue `pc1_a630b2cdb5a8c01f`: the same six categories and 65 products as
// the seed), built from the figures the lead read off it, since a builder may
// not read production:
//   September, of 539 videos: Liners 23, Feet 29 (Pro-Flex XC 2, Proprio Foot
//   1, Pro-Flex Terra 1), Knees 22 (Power Knee 1, Total Knee 2000 1), Sockets
//   & Locks 49 (Direct Socket 2), Hands 60, Bracing & Supports 12 (Rebound
//   Post-Op Knee 1);
//   October so far, of 294: Liners 12, Feet 14, Knees 10, Sockets 24, Hands
//   23, Bracing 11.
// Everything else is made up in that shape and is illustrative: June to August
// (smaller markets, a named product now and then), how each category's videos
// split between "couldn't tell which" (short lists) and talk about the category
// in general (most of it), October's named products, and the crosses (what the
// videos are about and what people did, in Össur's own subjects and roughly
// the market's kinds). September is the reading month (the last full month on
// 13 October), as production reads it.
//
// Two versions of it, both with no product's first month (none reaches three
// videos) and nothing worth a flag:
//   `today`  four products named for the first time in September (one video
//            each), praise in most of the Feet videos, Liners mostly about
//            fit and comfort;
//   `thin`   every product named in September was named before, and nothing
//            reaches half of anything: praise and subjects spread thin.

const OCT = '2026-10-01'
const TODAY_MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', SEP, OCT] as const
type TodayMonth = (typeof TODAY_MONTHS)[number]

function todaySpecs(thin: boolean): Record<TodayMonth, MonthSpec> {
  return {
    '2026-06-01': {
      market: 402, rival: 28,
      groups: {
        Liners: { unclear: 1, unbranded: 14 },
        Feet: { named: { 'Pro-Flex XC': 1 }, unbranded: 17 },
        Knees: { unbranded: 14 },
        'Sockets & Locks': { named: { 'Direct Socket': 1 }, unbranded: 29 },
        Hands: { unbranded: 41 },
        'Bracing & Supports': { unbranded: 6 },
      },
    },
    '2026-07-01': {
      market: 455, rival: 33,
      groups: {
        Liners: { unbranded: 17 },
        Feet: { named: { 'Pro-Flex XC': 1 }, unclear: 1, unbranded: 20 },
        Knees: { unclear: 1, unbranded: 15 },
        'Sockets & Locks': { unbranded: 35 },
        Hands: { unclear: 1, unbranded: 43 },
        'Bracing & Supports': { unbranded: 8 },
      },
    },
    '2026-08-01': {
      market: 498, rival: 37,
      groups: thin
        ? {
          Liners: { unclear: 1, unbranded: 19 },
          Feet: { named: { 'Pro-Flex XC': 1, 'Proprio Foot': 1, 'Pro-Flex Terra': 1 }, unbranded: 21 },
          Knees: { named: { 'Power Knee': 1, 'Total Knee 2000': 1 }, unbranded: 17 },
          'Sockets & Locks': { named: { 'Direct Socket': 1 }, unbranded: 40 },
          Hands: { unbranded: 52 },
          'Bracing & Supports': { named: { 'Rebound Post-Op Knee': 1 }, unbranded: 8 },
        }
        : {
          Liners: { unclear: 1, unbranded: 19 },
          Feet: { named: { 'Pro-Flex XC': 1 }, unbranded: 23 },
          Knees: { named: { 'Power Knee': 1 }, unbranded: 18 },
          'Sockets & Locks': { named: { 'Direct Socket': 1 }, unbranded: 40 },
          Hands: { unbranded: 52 },
          'Bracing & Supports': { unbranded: 9 },
        },
    },
    [SEP]: {
      market: 539, rival: 41,
      groups: {
        Liners: { unclear: 3, unbranded: 20 },
        Feet: { named: { 'Pro-Flex XC': 2, 'Proprio Foot': 1, 'Pro-Flex Terra': 1 }, unclear: 2, unbranded: 23 },
        Knees: { named: { 'Power Knee': 1, 'Total Knee 2000': 1 }, unclear: 1, unbranded: 19 },
        'Sockets & Locks': { named: { 'Direct Socket': 2 }, unclear: 1, unbranded: 46 },
        Hands: { unclear: 1, unbranded: 59 },
        'Bracing & Supports': { named: { 'Rebound Post-Op Knee': 1 }, unbranded: 11 },
      },
    },
    [OCT]: {
      market: 294, rival: 20,
      groups: {
        Liners: { unclear: 1, unbranded: 11 },
        Feet: { named: { 'Pro-Flex XC': 1 }, unbranded: 13 },
        Knees: { unbranded: 10 },
        'Sockets & Locks': { named: { 'Direct Socket': 1 }, unclear: 1, unbranded: 22 },
        Hands: { unbranded: 23 },
        'Bracing & Supports': { unbranded: 11 },
      },
    },
  }
}

interface TodayBuilt {
  months: { month: string; market: ProductMonthVideo[]; standing: [TextKey, StandingText][] }[]
  standing: Map<TextKey, StandingText>
  rows: ProductMonthRow[]
}

const todayCache = new Map<boolean, TodayBuilt>()

/** The five months, their placements and their rows (June to August frozen,
 *  September and October still filling, as production holds them). Two of
 *  September's three Liners "couldn't tell which" videos are placed by a
 *  comment, so the panel's list has words. */
function todayBuilt(thin: boolean): TodayBuilt {
  const hit = todayCache.get(thin)
  if (hit) return hit
  const specs = todaySpecs(thin)
  const months = TODAY_MONTHS.map((m) => ({ month: m as string, ...monthOf(m, specs[m], { prefix: thin ? 'thin-' : 'today-', commented: m === SEP ? { group: 'Liners', count: 2 } : null }) }))
  const standing = new Map(months.flatMap((b) => b.standing))
  const compiled = compileCatalogue(OSSUR_CATALOGUE, OSSUR_CLIENT_ID)
  const rows = productReadingRows({ clientId: OSSUR_CLIENT_ID, compiled, markets: new Map(months.map((b) => [b.month, b.market])), rivalFound: new Set(), standing })
    .map((r) => ({ ...r, status: r.month >= SEP ? 'filling' as const : 'frozen' as const }))
  const built: TodayBuilt = { months, standing, rows }
  todayCache.set(thin, built)
  return built
}

/** Össur today's month rows, June to October (`thin` for the thinner state). */
export const ossurTodayRows = (thin = false): ProductMonthRow[] => todayBuilt(thin).rows

/** September's crosses as production would read them at level 1: each
 *  category (the loader reads every category with a video, and a product only
 *  from three videos, which none has), in Össur's own subjects. */
function todayCrosses(thin: boolean, products: readonly string[] = []): Map<string, Crosses> {
  const g = (name: string) => setKey('group', groupId(name))
  const p = (name: string) => setKey('product', productId(name))
  const groups: [string, Crosses][] = thin
    ? [
      [g('Liners'), cross(23, [['Fit & comfort', 9], ['Cost & access', 4], ['Choosing the right device', 3]], [['pain_point', 9], ['question', 8], ['praise', 6]])],
      [g('Feet'), cross(29, [['Function & movement', 11], ['Fit & comfort', 6], ['Cost & access', 3]], [['praise', 12], ['question', 9], ['pain_point', 7]])],
      [g('Knees'), cross(22, [['Function & movement', 8], ['Cost & access', 6], ['Choosing the right device', 4]], [['question', 9], ['praise', 8], ['pain_point', 6]])],
      [g('Sockets & Locks'), cross(49, [['Fit & comfort', 19], ['Function & movement', 9], ['Cost & access', 6]], [['pain_point', 21], ['question', 18], ['praise', 17]])],
      [g('Hands'), cross(60, [['Function & movement', 22], ['Look & style', 17], ['Community & encouragement', 14]], [['praise', 28], ['question', 19], ['pain_point', 12]])],
      [g('Bracing & Supports'), cross(12, [['Fit & comfort', 5], ['Function & movement', 3]], [['question', 5], ['pain_point', 4], ['praise', 3]])],
    ]
    : [
      [g('Liners'), cross(23, [['Fit & comfort', 12], ['Cost & access', 4], ['Choosing the right device', 3], ['Community & encouragement', 2]], [['pain_point', 11], ['question', 9], ['praise', 8], ['purchase_intent', 2]])],
      [g('Feet'), cross(29, [['Function & movement', 13], ['Fit & comfort', 6], ['Look & style', 3], ['Cost & access', 3]], [['praise', 16], ['question', 9], ['pain_point', 6]])],
      [g('Knees'), cross(22, [['Function & movement', 9], ['Cost & access', 6], ['Choosing the right device', 4]], [['question', 10], ['praise', 9], ['pain_point', 7], ['objection', 2]])],
      [g('Sockets & Locks'), cross(49, [['Fit & comfort', 21], ['Function & movement', 9], ['Cost & access', 6]], [['pain_point', 22], ['question', 18], ['praise', 17]])],
      [g('Hands'), cross(60, [['Function & movement', 22], ['Look & style', 17], ['Community & encouragement', 14], ['Cost & access', 9]], [['praise', 38], ['question', 19], ['pain_point', 12], ['purchase_intent', 3]])],
      [g('Bracing & Supports'), cross(12, [['Fit & comfort', 5], ['Function & movement', 3]], [['question', 5], ['pain_point', 4], ['praise', 3]])],
    ]
  // A panel's own products (the loader reads each one with a video in the
  // open category, or the open product).
  const own: Record<string, Crosses> = {
    'Pro-Flex XC': cross(2, [['Function & movement', 1]], [['praise', 1], ['question', 1]]),
    'Proprio Foot': cross(1, [['Function & movement', 1]], [['question', 1]]),
    'Pro-Flex Terra': cross(1, [['Look & style', 1]], [['praise', 1]]),
  }
  return new Map<string, Crosses>([...groups, ...products.filter((x) => own[x]).map((x): [string, Crosses] => [p(x), own[x]])])
}

/** A category's couldn't-tell-which texts in September, newest first: the
 *  Liners' two comments, then the videos whose own words name one of Össur's
 *  products there (the loader lists those too). */
function todayUnclearTexts(thin: boolean, group = 'Liners'): TextRead[] {
  const sep = todayBuilt(thin).months.find((b) => b.month === SEP)!.standing
  const liners = sep.filter(([, t]) => t.placements.some((x) => x.placement === 'unclear' && x.groupId === groupId(group)))
  const comments = liners.filter(([k]) => k.startsWith('c:')).map(([, t]) => t)
  const videos = liners.filter(([k]) => k.startsWith('v:')).map(([, t]) => t)
  const words = [
    ['Which Össur liner is this? Mine keeps slipping by the afternoon.', '2026-09-26', 'tiktok', 'legday.club'],
    ['Is that the Össur liner with the seal ring? It looks so much thinner than mine.', '2026-09-17', 'instagram', null],
  ] as const
  return [
    ...comments.map((t, i) => text(`c:${t.commentId}`, t.videoId, t.commentId, words[i][0], words[i][1], words[i][2], words[i][3])),
    ...videos.map((t, i) => text(`v:${t.videoId}`, t.videoId, null, null, `2026-09-${String(9 - i).padStart(2, '0')}`, i % 2 === 0 ? 'youtube' : 'tiktok', i % 2 === 0 ? 'amputee.life' : 'bladerunner.daily')),
  ]
}

/** The comments naming the Pro-Flex XC in September. */
function proFlexXcTexts(): TextRead[] {
  const sep = todayBuilt(false).months.find((b) => b.month === SEP)!.standing
  const videos = sep.filter(([, t]) => t.placements.some((x) => x.productId === productId('Pro-Flex XC'))).map(([, t]) => t.videoId)
  return [
    text('c:xc-0', videos[0], 'xc-0', 'Got my Pro-Flex XC last month and the stairs at work are finally not a problem.', '2026-09-21', 'instagram', null),
    text('c:xc-1', videos[1], 'xc-1', 'Is the Pro-Flex XC worth it over the LP if you mostly walk on grass?', '2026-09-11', 'youtube', null),
  ]
}

/** A month pair the thin state refuses (a change of ours between August and
 *  September: Össur's 15 September handles change, on the brands view). */
const REFUSE_PAIRS: PairOn = (prevMonth, month): PairComparability => ({ prevMonth, month, mode: 'refuse', reasons: [{ kind: 'searches', changeId: null, share: null }], row: null, checkWith: null })

const TODAY = (thin: boolean, over: Partial<ProductsInput> = {}): ProductsInput => {
  const b = todayBuilt(thin)
  const sep = b.months.find((m) => m.month === SEP)!
  return {
    ...BASE(),
    // The loader reads every month up to the calendar month (`monthsToRead`).
    rows: b.rows,
    market: sep.market.map((v) => ({ id: v.id, audience: v.audience, platform: v.platform, owned: v.owned === true })),
    standing: b.standing,
    crosses: todayCrosses(thin),
    pair: thin ? REFUSE_PAIRS : ACCEPT_PAIRS,
    ...over,
  }
}

/** Össur today: September, nothing open (`thin` for the thinner state). */
export function ossurTodayFixture(opts: { thin?: boolean; params?: ProductsParams; over?: Partial<ProductsInput> } = {}): ProductsData {
  return buildProductsData(TODAY(opts.thin ?? false, { params: opts.params ?? {}, ...opts.over }))
}

/** Össur today with the Liners open: no liner named, three couldn't tell
 *  which (two comments and a video). */
export function ossurTodayLinersFixture(thin = false): ProductsData {
  return buildProductsData(TODAY(thin, { params: { group: groupId('Liners') }, panelReads: { unclear: todayUnclearTexts(thin) } }))
}

/** Össur today with the Feet open: three of its products named, one or two
 *  videos each. */
export function ossurTodayFeetFixture(): ProductsData {
  return buildProductsData(TODAY(false, { params: { group: groupId('Feet') }, crosses: todayCrosses(false, ['Pro-Flex XC', 'Proprio Foot', 'Pro-Flex Terra']), panelReads: { unclear: todayUnclearTexts(false, 'Feet') } }))
}

/** Össur today with the Pro-Flex XC open (two videos). */
export function ossurTodayProductFixture(): ProductsData {
  return buildProductsData(TODAY(false, { params: { product: productId('Pro-Flex XC') }, crosses: todayCrosses(false, ['Pro-Flex XC']), panelReads: { named: proFlexXcTexts() } }))
}

/** Össur today with the Iceross Seal-In X open: nobody named it in September. */
export function ossurTodayQuietFixture(): ProductsData {
  return buildProductsData(TODAY(false, { params: { product: productId('Iceross Seal-In X') }, panelReads: { named: [] } }))
}

export const PRODUCT_IDS = { liners: () => groupId('Liners'), knees: () => groupId('Knees'), sealInX: () => productId('Iceross Seal-In X'), navii: () => productId('Navii'), rheo: () => productId('Rheo Knee') }

export const PRODUCTS_FIXTURES = {
  ossur: () => ossurProductsFixture(),
  'ossur-liners': () => ossurLinersFixture(),
  'ossur-liners-all': () => ossurLinersFixture({ unclear: 'all' }),
  'ossur-liners-member': () => ossurLinersFixture({}, { canTag: false }),
  'ossur-product': () => ossurSealInXFixture(),
  'ossur-navii': () => ossurNaviiFixture(),
  /** Sealand: no catalogue. */
  sealand: () => buildProductsData({ ...BASE(), clientId: SEALAND_CLIENT_ID, client: 'Sealand', catalogue: { state: 'empty' } }),
  /** Production today: the migration is not applied. */
  'not-applied': () => buildProductsData({ ...BASE(), catalogue: { state: 'missing' } }),
  /** Össur with its catalogue loaded and the step not switched on. */
  'not-on': () => buildProductsData({ ...BASE(), enabled: false }),
  /** Switched on, the month not read yet. */
  unread: () => buildProductsData({ ...BASE(), month: '2026-10-01', soFar: true, rows: ossurProductRows() }),
  // The parity pass (13 Oct night): production's real state, and a thinner one.
  'ossur-today': () => ossurTodayFixture(),
  'ossur-today-liners': () => ossurTodayLinersFixture(),
  'ossur-today-feet': () => ossurTodayFeetFixture(),
  'ossur-today-product': () => ossurTodayProductFixture(),
  'ossur-today-quiet': () => ossurTodayQuietFixture(),
  'ossur-thin': () => ossurTodayFixture({ thin: true }),
  'ossur-thin-liners': () => ossurTodayLinersFixture(true),
} as const
