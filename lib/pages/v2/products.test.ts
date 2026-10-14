import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { productReadingRows } from '../../products/readings'
import { compileCatalogue } from '../../products/rules'
import { BRANDS_PANEL, refuseEveryPair, viewForAudience, type PairOn } from '../../reading/pairs'
import { KIND_LABELS } from '../../reading/kinds'
import { fakeDb } from '../../test/fake-db'
import { talkKindLabel } from '../overview-market/kinds'
import {
  ACCEPT_PAIRS, linersUnclearTexts, OSSUR_CATALOGUE, OSSUR_STANDING, ossurCrosses, ossurLinersFixture, ossurProductRows, ossurProductsFixture,
  ossurSealInXFixture, ossurTodayFixture, ossurTodayLinersFixture, ossurTodayCrosses, ossurTodayQuietFixture, ossurTodayRows, PRODUCT_IDS, PRODUCTS_FIXTURES, SEP_MARKET, sealInXTexts,
} from './products-fixture'
import {
  buildCompare, buildProductsData, catalogueBreak, categoryShareVerdict, crossesOf, firstMonthOf, monthLine, monthOptions, monthsToRead, poolLens, loadMonthPlacements, marketProductMonth, marketVideosOf, monthsBack, notchFor,
  openOf, parseProductsParams, pickStandouts, placementsInPlay, productKindLabel, productMonthSets, productQuotes, productsHref, PRODUCT_KIND_LABELS, setKey, sharePct, shelfColumns,
  SLOT_ORDER, STANDOUT_MIN, standoutSlots, topProducts, topRanked, topProductsOf, unclearLines, PRODUCTS_HREF, TOP_LABELS,
  type CategoryPanel, type ProductMonthRow, type ProductPanel, type ProductsInput, type TextRead,
} from './products'

// Your products (depth v2, T5): the page's pure half over Össur's real
// catalogue and an illustrative September, and the reads' glue over the fake
// database. No network.

const SEP = '2026-09-01'
const AUD = ['competitor:Ottobock', 'industry-other']

describe('the address', () => {
  it('reads a category, a product, the full list and the month, first of a repeated key, empty as absent', () => {
    expect(parseProductsParams({ group: ['g1', 'g2'], product: ' ', unclear: 'all', month: '2026-09', other: 'x' })).toEqual({ group: 'g1', unclear: 'all', month: '2026-09' })
  })

  it('keeps the month, opens one item with its anchor, and keeps "all" only on a category', () => {
    expect(productsHref({ month: '2026-09' })).toBe(`${PRODUCTS_HREF}?month=2026-09`)
    expect(productsHref({}, { kind: 'group', id: 'g' })).toBe('/dashboard/products?group=g#category-panel')
    expect(productsHref({}, { kind: 'group', id: 'g' }, { all: true, at: 'unclear' })).toBe('/dashboard/products?group=g&unclear=all#unclear')
    expect(productsHref({}, { kind: 'product', id: 'p' }, { all: true })).toBe('/dashboard/products?product=p#product-panel')
  })

  it('opens a product before a category, and nothing the catalogue does not hold (Settings\' "Tag them" link opens its category)', () => {
    expect(openOf(OSSUR_CATALOGUE, { group: PRODUCT_IDS.liners(), product: PRODUCT_IDS.navii() })).toEqual({ kind: 'product', id: PRODUCT_IDS.navii() })
    expect(openOf(OSSUR_CATALOGUE, { group: PRODUCT_IDS.liners() })).toEqual({ kind: 'group', id: PRODUCT_IDS.liners() })
    expect(openOf(OSSUR_CATALOGUE, { group: 'not-a-category', product: 'nor-a-product' })).toBeNull()
    expect(openOf(null, { group: PRODUCT_IDS.liners() })).toBeNull()
  })
})

describe('the basis: every video of the month, every audience (one for this page and Settings)', () => {
  const row = (audience: string, k: number, n: number, month = SEP): ProductMonthRow => ({
    month, audience, object_kind: 'product', object_id: 'p', group_id: 'g', product_id: 'p',
    k_named: k, k_unclear: 0, k_unbranded: 0, k_any: k, comments: 0, n, catalogue_version: 'pc1_0000000000000000', status: 'filling',
  })

  it('pools every audience, the client\'s included (creators about the client, comments on its own posts), a repeat counted once', () => {
    const rows = [row('industry-other', 5, 300), row('client', 1, 20), row('competitor:Ottobock', 2, 40), row('competitor:Gone', 4, 10), row('industry-other', 5, 300)]
    expect(marketProductMonth(rows, SEP, 'p')).toMatchObject({ k_named: 12, n: 370 })
    expect(marketVideosOf(rows, SEP)).toBe(370)
    // A caller may still name its audiences.
    expect(marketProductMonth(rows, SEP, 'p', AUD)).toMatchObject({ k_named: 7, n: 340 })
  })

  it('is null, never zero, for a month with no row', () => {
    expect(marketProductMonth([row('industry-other', 5, 300)], '2026-08-01', 'p')).toBeNull()
    expect(marketVideosOf([], SEP)).toBeNull()
  })

  it('prints a share in whole percents, and a share that rounds to nothing as under 1%', () => {
    expect(sharePct(117, 839)).toBe('14%')
    expect(sharePct(4, 839)).toBe('under 1%')
    expect(sharePct(0, 839)).toBe('0%')
    expect(sharePct(3, 0)).toBe('0%')
  })

  it('reads twelve months back, oldest first', () => {
    expect(monthsBack(SEP, 3)).toEqual(['2026-07-01', '2026-08-01', SEP])
  })
})

describe('the month\'s video sets', () => {
  it('are the products step\'s own counts, as sets (parity with productReadingRows)', () => {
    const sets = productMonthSets({ month: SEP, market: SEP_MARKET, standing: OSSUR_STANDING, groups: OSSUR_CATALOGUE.groups.map((g) => g.id), products: OSSUR_CATALOGUE.products.map((p) => p.id) })
    const rows = ossurProductRows()
    for (const g of OSSUR_CATALOGUE.groups) {
      const p = marketProductMonth(rows, SEP, g.id)!
      const s = sets.groups.get(g.id)!
      expect([s.any.size, s.named.size, s.unclear.size, s.unbranded.size], g.name).toEqual([p.k_any, p.k_named, p.k_unclear, p.k_unbranded])
    }
    for (const pr of OSSUR_CATALOGUE.products) expect(sets.products.get(pr.id)!.size, pr.name).toBe(marketProductMonth(rows, SEP, pr.id)!.k_named)
    expect(sets.all.size).toBe([...sets.groups.values()].reduce((n, s) => n + s.any.size, 0))
  })

  it('count a video named in one category and placed in general in another in both, and once in the whole', () => {
    const standing = new Map([
      ['v:a', { videoId: 'a', commentId: null, month: null, placements: [{ placement: 'named' as const, groupId: 'g1', productId: 'p1', method: 'rule' as const }] }],
      ['c:x', { videoId: 'a', commentId: 'x', month: SEP, placements: [{ placement: 'unbranded' as const, groupId: 'g2', productId: null, method: 'rule' as const }] }],
      ['c:y', { videoId: 'b', commentId: 'y', month: '2026-08-01', placements: [{ placement: 'unclear' as const, groupId: 'g1', productId: null, method: 'rule' as const }] }],
    ])
    const sets = productMonthSets({ month: SEP, market: [{ id: 'a' }, { id: 'b' }], standing, groups: ['g1', 'g2'], products: ['p1'] })
    expect([...sets.groups.get('g1')!.named]).toEqual(['a'])
    expect([...sets.groups.get('g2')!.unbranded]).toEqual(['a'])
    // A comment from another month places nothing in this one.
    expect(sets.groups.get('g1')!.unclear.size).toBe(0)
    expect(sets.all.size).toBe(1)
    // The rows say the same.
    const compiled = compileCatalogue({ version: 'pc1_0123456789abcdef', groups: [{ id: 'g1', name: 'A', sort: 0 }, { id: 'g2', name: 'B', sort: 1 }], products: [{ id: 'p1', group_id: 'g1', name: 'P', sort: 0 }], aliases: [] }, OSSUR_CLIENT_ID)
    const rows = productReadingRows({ clientId: OSSUR_CLIENT_ID, compiled, markets: new Map([[SEP, [{ id: 'a', platform: 'tiktok', audience: 'industry-other', dated: 1 }, { id: 'b', platform: 'tiktok', audience: 'industry-other', dated: 1 }]]]), rivalFound: new Set(), standing })
    expect(rows.find((r) => r.object_id === 'g2')!.k_unbranded).toBe(1)
    expect(rows.find((r) => r.object_id === 'g1')!.k_unclear).toBe(0)
  })

  it('an own post stands by its comments only, never by its own words (a placement from before included)', () => {
    const standing = new Map([
      ['v:own', { videoId: 'own', commentId: null, month: null, placements: [{ placement: 'named' as const, groupId: 'g1', productId: 'p1', method: 'rule' as const }] }],
      ['c:q', { videoId: 'own', commentId: 'q', month: SEP, placements: [{ placement: 'unclear' as const, groupId: 'g2', productId: null, method: 'rule' as const }] }],
    ])
    const sets = productMonthSets({ month: SEP, market: [{ id: 'own', owned: true }], standing, groups: ['g1', 'g2'], products: ['p1'] })
    expect(sets.products.get('p1')!.size).toBe(0)
    expect(sets.groups.get('g1')!.any.size).toBe(0)
    expect([...sets.groups.get('g2')!.unclear]).toEqual(['own'])
  })

  it('stand on this catalogue\'s rule and model rows only, and drop a tag row (tags stand through standingPlacements)', () => {
    const base = { video_id: 'v', source: 'content' as const, comment_id: null, comment_month: null, placement: 'unbranded' as const, product_id: null, group_id: 'g' }
    const rows = [
      { ...base, method: 'rule' as const, rule_version: 'product_rules_v1', catalogue_version: 'pc1_a' },
      { ...base, method: 'rule' as const, rule_version: 'product_rules_v0', catalogue_version: 'pc1_a' },
      { ...base, method: 'rule' as const, rule_version: 'product_rules_v1', catalogue_version: 'pc1_b' },
    ]
    expect(placementsInPlay(rows, 'pc1_a')).toHaveLength(1)
  })
})

describe('verdicts', () => {
  const rows = ossurProductRows()
  const g = (name: string) => OSSUR_CATALOGUE.groups.find((x) => x.name === name)!

  it('bands a category\'s share of the market against last month, with no clustering caveat (a placement is the catalogue\'s)', () => {
    const hands = g('Hands')
    const v = categoryShareVerdict({ group: hands, month: SEP, curr: marketProductMonth(rows, SEP, hands.id), prev: marketProductMonth(rows, '2026-08-01', hands.id), pair: ACCEPT_PAIRS })!
    expect(v).toMatchObject({ objectKind: 'product', objectId: hands.id, state: 'moved', value: { k: 110, n: 839 }, baseline: { k: 54, n: 612 } })
    expect(v.flags).not.toContain('clustering_unknown')
    expect(v.direction ?? null).toBeNull()
    const liners = g('Liners')
    expect(categoryShareVerdict({ group: liners, month: SEP, curr: marketProductMonth(rows, SEP, liners.id), prev: marketProductMonth(rows, '2026-08-01', liners.id), pair: ACCEPT_PAIRS })!.state).toBe('no_clear_change')
  })

  it('refuses a pair the month-pair judge refuses, and a pair read under two catalogues', () => {
    const hands = g('Hands')
    const curr = marketProductMonth(rows, SEP, hands.id)!
    const prev = marketProductMonth(rows, '2026-08-01', hands.id)!
    expect(categoryShareVerdict({ group: hands, month: SEP, curr, prev, pair: refuseEveryPair })!.state).toBe('refused')
    const edited = categoryShareVerdict({ group: hands, month: SEP, curr: { ...curr, catalogueVersion: 'pc1_ffffffffffffffff' }, prev, pair: ACCEPT_PAIRS })!
    expect(edited.state).toBe('refused')
    expect(edited.baseline).toBeUndefined()
    expect(categoryShareVerdict({ group: hands, month: SEP, curr: null, prev, pair: ACCEPT_PAIRS })).toBeNull()
  })

  it('a product\'s first month: videos now, none in at least two earlier months read under the same catalogue', () => {
    const navii = { id: PRODUCT_IDS.navii(), name: 'Navii' }
    const f = firstMonthOf({ product: navii, month: SEP, rows })!
    expect(f.verdict.flags).toEqual(['new'])
    expect(f.verdict.state).toBe('too_little_data')
    expect(f.months.map((m) => m.k)).toEqual([0, 0, 0, 3])
    // Seal-In X had videos before.
    expect(firstMonthOf({ product: { id: PRODUCT_IDS.sealInX(), name: 'Seal-In X' }, month: SEP, rows })).toBeNull()
    // One earlier month is too few to say "the first time".
    expect(firstMonthOf({ product: navii, month: SEP, rows: rows.filter((r) => r.month >= '2026-08-01') })).toBeNull()
    // Earlier months read under another catalogue do not count.
    const other = rows.map((r) => (r.month < SEP ? { ...r, catalogue_version: 'pc1_ffffffffffffffff' } : r))
    expect(firstMonthOf({ product: navii, month: SEP, rows: other })).toBeNull()
  })
})

describe('the standouts, picked by code', () => {
  it('Össur\'s September: the Navii\'s first month, Hands mostly in general, the Cheetah praised, the Rheo Knee about cost', () => {
    const d = ossurProductsFixture()
    expect(d.standouts.map((s) => [s.kind, s.name])).toEqual([
      ['first', 'Navii'], ['general', 'Hands'], ['praised', 'Flex-Foot Cheetah'], ['focus', 'Rheo Knee'],
    ])
    const [first, general, praised, focus] = d.standouts
    expect(first).toMatchObject({ videos: 3, where: 'Knees', lead: { label: 'Function & movement', k: 2, n: 3 }, href: `/dashboard/products?product=${PRODUCT_IDS.navii()}#product-panel` })
    expect(general).toMatchObject({ inGeneral: { k: 98, n: 110 }, yours: { k: 12, n: 110 } })
    expect(praised).toMatchObject({ praised: { k: 7, n: 9 }, where: 'Feet' })
    expect(focus).toMatchObject({ subject: 'Cost & access', level: { k: 5, n: 7 } })
  })

  it('draws the gap card only where a product against its category clears its band, and then before "in general"', () => {
    const d = ossurProductsFixture()
    const liners = PRODUCT_IDS.liners()
    const crosses = new Map(ossurCrosses())
    crosses.set(setKey('group', liners), { n: 400, subjects: [{ id: 's-heat', label: 'Sweat and heat', k: 150 }], kinds: [] })
    crosses.set(setKey('product', PRODUCT_IDS.sealInX()), { n: 120, subjects: [{ id: 's-heat', label: 'Sweat and heat', k: 12 }], kinds: [] })
    const shelf = d.shelf.map((c) => (c.id === liners ? { ...c, products: c.products.map((p) => (p.id === PRODUCT_IDS.sealInX() ? { ...p, videos: 120 } : p)) } : c))
    const picked = pickStandouts({ month: SEP, params: {}, catalogue: OSSUR_CATALOGUE, shelf, firsts: new Map(), crosses, splits: new Map() })
    const gap = picked.find((s) => s.kind === 'gap')
    expect(gap).toMatchObject({ name: 'Liners', subject: 'Sweat and heat', category: { k: 150, n: 400 }, product: { name: 'Iceross Seal-In X', k: 12, n: 120 } })
    expect(gap?.kind === 'gap' && gap.verdict.state).toBe('moved')
    expect(picked.some((s) => s.kind === 'general')).toBe(false)
  })

  it('draws nothing it cannot stand behind: no card from a thin set, and fewer cards where fewer earn one', () => {
    const picked = pickStandouts({ month: SEP, params: {}, catalogue: OSSUR_CATALOGUE, shelf: [], firsts: new Map(), crosses: new Map(), splits: new Map() })
    expect(picked).toEqual([])
  })
})

describe('the page, from its reads', () => {
  it('the shelf: every category in the catalogue\'s order, six across, every product a tile, those with videos first', () => {
    const d = ossurProductsFixture()
    expect(d.shelf.map((c) => c.name)).toEqual(['Liners', 'Feet', 'Knees', 'Sockets & Locks', 'Hands', 'Bracing & Supports'])
    expect(shelfColumns(d.shelf.length)).toBe(6)
    expect(d.shelf.reduce((n, c) => n + c.products.length, 0)).toBe(OSSUR_CATALOGUE.products.length)
    const liners = d.shelf[0]
    expect(liners.products.slice(0, 4).map((p) => [p.name, p.videos])).toEqual([['Iceross Seal-In X', 9], ['Iceross Comfort', 5], ['Iceross Synergy', 3], ['Iceross Dermo', 1]])
    expect(liners).toMatchObject({ videos: 117, share: { k: 117, n: 839 }, unclear: 21, lead: { label: 'Fit & comfort', k: 70 } })
    expect(d.shelf.find((c) => c.name === 'Knees')!.products.find((p) => p.name === 'Navii')!.flag?.flags).toEqual(['new'])
    expect(d.header).toEqual({ cameUp: 15, products: OSSUR_CATALOGUE.products.length, videos: 412 })
    expect(d.market).toBe(839)
  })

  it('opens a category with its split (exclusive, so it adds up), month line, comparison and couldn\'t-tell-which list', () => {
    const d = ossurLinersFixture()
    expect(d.shelf[0].selected).toBe(true)
    const p = d.panel!
    expect(p.kind).toBe('group')
    if (p.kind !== 'group') return
    expect(p.split).toEqual({ any: 117, named: 18, unclear: 21, unbranded: 78 })
    expect(p.split!.named + p.split!.unclear + p.split!.unbranded).toBe(p.split!.any)
    expect(p.line.map((b) => [b.label, b.k, b.n])).toEqual([['Jun', 40, 410], ['Jul', 55, 520], ['Aug', 73, 612], ['Sep', 117, 839]])
    expect(p.compare!.columns.map((c) => c.label)).toEqual(['All liners', 'Iceross Seal-In X', 'Iceross Comfort', 'Iceross Synergy'])
    expect(p.compare!.verdicts.every((v) => v.state === 'too_little_data')).toBe(true)
    expect(p.unclear).toMatchObject({ videos: 21, more: 3, withheld: 1 })
    expect(p.unclear.lines).toHaveLength(3)
    expect(p.unclear.allHref).toBe(`/dashboard/products?group=${PRODUCT_IDS.liners()}&unclear=all#unclear`)
    expect(p.unclear.options.map((o) => o.label).slice(-3)).toEqual(['One of your products in Liners, not sure which', 'Liners in general', 'Not about your products'])
    expect(p.notchAt).toBeCloseTo(notchFor(OSSUR_CATALOGUE.groups, PRODUCT_IDS.liners()))
  })

  it('lists every line with "all", and offers no Tag choice to a reader who may not tag', () => {
    const all = PRODUCTS_FIXTURES['ossur-liners-all']().panel
    expect(all?.kind === 'group' && [all.unclear.lines.length, all.unclear.more, all.unclear.allHref]).toEqual([6, 0, null])
    const member = PRODUCTS_FIXTURES['ossur-liners-member']()
    expect(member.canTag).toBe(false)
    expect(member.panel?.kind === 'group' && member.panel.unclear.options).toEqual([])
  })

  it('opens a product with its videos against the market and its category, and three of its comments, one a video', () => {
    const p = ossurSealInXFixture().panel!
    expect(p.kind).toBe('product')
    if (p.kind !== 'product') return
    expect(p).toMatchObject({ videos: 9, market: 839, categoryVideos: 117, groupName: 'Liners' })
    expect(p.quotes).toHaveLength(3)
    expect(p.quotes.map((q) => q.cite)).toEqual(['YouTube · 28 Sep', 'TikTok · 22 Sep', 'Instagram · 12 Sep'])
    expect(p.compare!.columns.map((c) => c.label)).toEqual(['All liners', 'Iceross Seal-In X'])
  })

  it('says why it prints no count: no migration, no catalogue, not switched on, a month not read, a failed read', () => {
    expect(PRODUCTS_FIXTURES['not-applied']()).toMatchObject({ state: 'not_applied', shelf: [], standouts: [], header: null })
    expect(PRODUCTS_FIXTURES.sealand()).toMatchObject({ state: 'no_catalogue', settingsHref: '/dashboard/settings/products' })
    expect(PRODUCTS_FIXTURES['not-on']()).toMatchObject({ state: 'not_on', catalogue: { categories: 6 } })
    expect(PRODUCTS_FIXTURES.unread()).toMatchObject({ state: 'unread', monthWords: 'October so far' })
    const failed = buildProductsData({ ...baseInput(), catalogue: null })
    expect(failed.state).toBe('failed')
    expect(buildProductsData({ ...baseInput(), rows: null }).state).toBe('failed')
  })

  it('prints the distinct videos only where the sets agree with the stored months', () => {
    const rows = ossurProductRows().map((r) => (r.month === SEP && r.object_kind === 'group' && r.audience === 'industry-other' ? { ...r, k_any: r.k_any + 1, k_unbranded: r.k_unbranded + 1 } : r))
    expect(buildProductsData({ ...baseInput(), rows }).header?.videos).toBeNull()
  })
})

function baseInput(): ProductsInput {
  return {
    clientId: OSSUR_CLIENT_ID, client: 'Össur', month: SEP, soFar: false, catalogue: { state: 'ready', catalogue: OSSUR_CATALOGUE }, enabled: true,
    rows: ossurProductRows(), market: SEP_MARKET, standing: OSSUR_STANDING, crosses: ossurCrosses(), pair: ACCEPT_PAIRS, params: {}, canTag: true,
  }
}

describe('the panel\'s words', () => {
  const t = (over: Partial<TextRead>): TextRead => ({
    key: 'c:1', videoId: 'v1', commentId: '1', text: 'My liner keeps rolling down at the knee on hot days.', lang: 'en', english: null,
    date: '2026-09-20', platform: 'youtube', account: 'amp.life', videoUrl: 'https://www.youtube.com/watch?v=abc', platformCommentId: 'Ugx', ...over,
  })

  it('a couldn\'t-tell-which line: the gated words, where and when, a link to the comment where the platform has one', () => {
    const { lines } = unclearLines([t({})], OSSUR_CLIENT_ID, 3)
    expect(lines[0]).toMatchObject({ commentId: '1', cite: 'YouTube · 20 Sep · video by @amp.life', watchHref: 'https://www.youtube.com/watch?v=abc&lc=Ugx' })
  })

  it('keeps a comment the gate refuses off the page, counted; a video\'s own words always listed; cut at the limit', () => {
    const r = unclearLines([t({ key: 'c:2', commentId: '2', text: 'liner?' }), t({ key: 'v:v9', videoId: 'v9', commentId: null, text: null }), t({}), t({ key: 'c:3', commentId: '3' })], OSSUR_CLIENT_ID, 2)
    expect(r.withheld).toBe(1)
    expect(r.lines.map((l) => l.key)).toEqual(['v:v9', 'c:1'])
    expect(r.more).toBe(1)
  })

  it('a product\'s quotes: gated, one a video, three at most, newest first as read', () => {
    expect(productQuotes(sealInXTexts(), OSSUR_CLIENT_ID).map((q) => q.key)).toEqual(['c:x-0', 'c:x-1', 'c:x-2'])
    expect(productQuotes([t({}), t({ key: 'c:9', commentId: '9', text: 'Another line under the same video about the liner.' })], OSSUR_CLIENT_ID)).toHaveLength(1)
    expect(linersUnclearTexts().length).toBe(7)
  })
})

describe('the Dashboard\'s tile (T8)', () => {
  it('names the first-month product, into its open panel', () => {
    const d = ossurProductsFixture()
    const top = topProductsOf(d, d.standouts.filter((s) => s.kind === 'first') as never)
    expect(top).toMatchObject({ state: 'ready', monthWords: 'September', standout: { label: TOP_LABELS.first, name: 'Navii', k: 3, n: null }, href: PRODUCTS_HREF, cameUp: 15 })
    expect(top.standout!.href).toContain(`product=${PRODUCT_IDS.navii()}`)
    expect(top.standout!.label).not.toMatch(/\d/)
    expect(top.columns).toHaveLength(6)
  })

  it('falls back to the product talked about most, of the market, then a category', () => {
    const d = ossurProductsFixture()
    expect(topProductsOf(d).standout).toMatchObject({ label: TOP_LABELS.most, name: 'Iceross Seal-In X', k: 9, n: 839 })
    const noProducts = { ...d, shelf: d.shelf.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, videos: 0 })) })) }
    expect(topProductsOf(noProducts).standout).toMatchObject({ name: 'Liners', k: 117, n: 839 })
    const quiet = { ...noProducts, shelf: noProducts.shelf.map((c) => ({ ...c, videos: 0 })) }
    expect(topProductsOf(quiet)).toMatchObject({ state: 'quiet', standout: null })
  })

  it('maps every honest state, and sends a workspace with no catalogue to Settings', () => {
    expect(topProductsOf(PRODUCTS_FIXTURES['not-applied']())).toMatchObject({ state: 'not_applied', standout: null })
    expect(topProductsOf(PRODUCTS_FIXTURES.sealand())).toMatchObject({ state: 'no_catalogue', href: '/dashboard/settings/products' })
    expect(topProductsOf(PRODUCTS_FIXTURES['not-on']())).toMatchObject({ state: 'not_on' })
    expect(topProductsOf(PRODUCTS_FIXTURES.unread())).toMatchObject({ state: 'quiet', note: 'unread' })
  })

  // Decision 3: the label rides to the tile where the tile reads a month,
  // and never on a state that reads none.
  it('carries the month\'s label where the tile reads a month, and none where it reads none', () => {
    const d = ossurProductsFixture()
    expect(d.monthLabel).toBe('the last full month')
    expect(topProductsOf(d).monthLabel).toBe('the last full month')
    expect(topProductsOf(ossurProductsFixture({}, { now: '2026-09-20T08:00:00.000Z' })).monthLabel).toBeNull()
    for (const key of ['not-applied', 'sealand', 'not-on'] as const) expect(topProductsOf(PRODUCTS_FIXTURES[key]()).monthLabel, key).toBeNull()
    // The unread month is October, the fixture's current month: no label.
    expect(topProductsOf(PRODUCTS_FIXTURES.unread()).monthLabel).toBeNull()
  })

  it('never throws: a workspace with no migration answers not_applied off the fake database', async () => {
    const db = fakeDb({}, { product_catalogue: () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.product_catalogue(p_client) in the schema cache' } }) })
    const top = await topProducts({ supabase: db.client as never, clientId: OSSUR_CLIENT_ID, reading: { client: db.client as never, clientId: OSSUR_CLIENT_ID }, now: '2026-10-13T10:00:00Z' })
    expect(top.state).toBe('not_applied')
    expect(db.calls.some((c) => c.table === 'month_product_readings')).toBe(false)
  })
})

describe('loadMonthPlacements (the product_mentions loader)', () => {
  const V = 'pc1_0123456789abcdef'
  const m = (over: Record<string, unknown>) => ({
    id: String(Math.random()), client_id: OSSUR_CLIENT_ID, video_id: 'v1', source: 'comment', field: null, comment_id: 'c1', comment_month: SEP,
    placement: 'unclear', product_id: null, group_id: PRODUCT_IDS.liners(), method: 'rule', rule_version: 'product_rules_v1', catalogue_version: V,
    model: null, prompt_version: null, tag_id: null, found_at: '2026-10-01T00:00:00Z', ...over,
  })

  it('reads the month\'s comment rows and every content row of the catalogue version, and lets a person\'s tag stand over them', async () => {
    const db = fakeDb({
      product_mentions: [
        m({}),
        m({ comment_id: 'c2', comment_month: '2026-08-01' }),
        m({ source: 'content', comment_id: null, comment_month: null, video_id: 'v2', placement: 'unbranded' }),
        m({ catalogue_version: 'pc1_ffffffffffffffff', comment_id: 'c3' }),
        m({ method: 'tag', rule_version: 'product_tag_v1', tag_id: 't1', placement: 'named', product_id: PRODUCT_IDS.sealInX() }),
      ],
      product_tags: [{ id: 't1', client_id: OSSUR_CLIENT_ID, video_id: 'v1', comment_id: 'c1', placement: 'named', product_id: PRODUCT_IDS.sealInX(), group_id: PRODUCT_IDS.liners(), supersedes: null, actor_kind: 'user', actor_user_id: 'u', actor_label: 'Ann', created_at: '2026-10-02T00:00:00Z' }],
    })
    const standing = (await loadMonthPlacements(db.client as never, OSSUR_CLIENT_ID, { month: SEP, version: V, catalogue: OSSUR_CATALOGUE }))!
    expect([...standing.keys()].sort()).toEqual(['c:c1', 'v:v2'])
    expect(standing.get('c:c1')!.placements).toEqual([{ placement: 'named', groupId: PRODUCT_IDS.liners(), productId: PRODUCT_IDS.sealInX(), method: 'tag' }])
    for (const c of db.calls.filter((c) => c.table === 'product_mentions')) expect(c.filters).toContain(`client_id=${OSSUR_CLIENT_ID}`)
    expect(db.calls.some((c) => c.table === 'product_mentions' && c.filters.includes(`comment_month=${SEP}`))).toBe(true)
  })

  it('answers null where the products migration is not applied', async () => {
    expect(await loadMonthPlacements(fakeDb({}).client as never, OSSUR_CLIENT_ID, { month: SEP, version: V, catalogue: OSSUR_CATALOGUE })).toBeNull()
  })
})

describe('the fresh check\'s fixes (13 Oct)', () => {
  it('1. the quote gate takes the client\'s audience: one line, under an own post, a creator\'s video about the client and a market video, prints all three', () => {
    const words = 'My liner keeps rolling down at the knee on hot days, any tips?'
    const base = { lang: 'en', english: null, date: '2026-09-20', platform: 'tiktok', account: null, videoUrl: null, platformCommentId: null }
    const video = (over: Record<string, unknown>) => ({ platform: 'tiktok', caption: 'A day with my leg', hashtags: [], topics: [], accountName: 'someone', isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: 'market', ...over })
    const texts: TextRead[] = [
      { ...base, key: 'c:own', videoId: 'v-own', commentId: 'own', text: words, video: video({ videoId: 'own', isClient: true, source: 'owned', accountName: 'ossur' }) },
      { ...base, key: 'c:about', videoId: 'v-about', commentId: 'about', text: words, video: video({ videoId: 'about', isClient: true, caption: 'My new Össur liner' }) },
      { ...base, key: 'c:market', videoId: 'v-market', commentId: 'market', text: words, video: video({ videoId: 'market' }) },
    ]
    const r = unclearLines(texts, OSSUR_CLIENT_ID, 10)
    expect(r.lines.map((l) => l.key)).toEqual(['c:own', 'c:about', 'c:market'])
    expect(r.withheld).toBe(0)
    // A product's quotes print one wording once; three different lines under the three print all three.
    const distinct = texts.map((t, i) => ({ ...t, text: `${words} (${['one', 'two', 'three'][i]})` }))
    expect(productQuotes(distinct, OSSUR_CLIENT_ID).map((q) => q.key)).toEqual(['c:own', 'c:about', 'c:market'])
  })

  it('2. the crosses pool every audience, the client\'s included: 10 videos, 8 of them the client\'s, read as 10, as the stats count them', () => {
    const rows = [
      { audience: 'client', object_kind: 'denominator', object_id: 'videos', k: 8, n: 8 },
      { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 2, n: 2 },
      { audience: 'client', object_kind: 'subject', object_id: 's1', k: 6, n: 8 },
      { audience: 'industry-other', object_kind: 'subject', object_id: 's1', k: 1, n: 2 },
      { audience: 'client', object_kind: 'kind', object_id: 'praise', k: 5, n: 8 },
      { audience: 'client', object_kind: 'kind', object_id: 'misinformation', k: 1, n: 8 },
      { audience: 'client', object_kind: 'subject', object_id: 'gone', k: 3, n: 8 },
      // a repeated audience-object counted once
      { audience: 'client', object_kind: 'denominator', object_id: 'videos', k: 8, n: 8 },
    ]
    expect(poolLens(rows)).toMatchObject({ n: 10 })
    const c = crossesOf(rows, new Map([['s1', { name: 'Fit & comfort', state: 'ready' as const }]]))
    expect(c.n).toBe(10)
    expect(c.subjects).toEqual([{ id: 's1', label: 'Fit & comfort', k: 7 }])
    expect(c.pending).toBeUndefined()
    expect(c.kinds.map((k) => [k.id, k.k])).toEqual([['praise', 5]])
    expect(c.kinds[0].label).toBe('Praise in the comments')
  })

  it('names a kind by where it was found, on this page only; the shared label is unchanged everywhere else', () => {
    // A product's set is the videos naming it; a kind's count is those with
    // that kind anywhere in their comments, which may be about something
    // else in the video. So "Praised it" overclaims here, and only here.
    expect(productKindLabel('praise')).toBe('Praise in the comments')
    expect(productKindLabel('question')).toBe('Questions in the comments')
    expect(productKindLabel('pain_point')).toBe('Complaints in the comments')
    expect(productKindLabel('purchase_intent')).toBe('Talk of buying in the comments')
    expect(productKindLabel('objection')).toBe('Pushback in the comments')
    for (const kind of Object.keys(KIND_LABELS).filter((k) => k !== 'misinformation')) {
      expect(PRODUCT_KIND_LABELS[kind], kind).toMatch(/in the comments$/)
    }
    expect(talkKindLabel('praise', null)).toBe('Praised it')
    expect(talkKindLabel('praise', 'bags')).toBe('Praised a bag')
    expect(talkKindLabel('pain_point', null)).toBe('Complained about something')
  })

  it('5. a product with no row in a read month is not read yet (null), never quiet; its tile and the Dashboard\'s small shelf say so', () => {
    const navii = PRODUCT_IDS.navii()
    const rows = ossurProductRows().filter((r) => !(r.object_id === navii && r.month === SEP))
    const d = buildProductsData({ ...baseInput(), rows, params: { product: navii } })
    const tile = d.shelf.find((c) => c.name === 'Knees')!.products.find((p) => p.id === navii)!
    expect(tile.videos).toBeNull()
    expect(d.shelf.find((c) => c.name === 'Knees')!.products.at(-1)!.id).toBe(navii)
    expect(d.panel?.kind === 'product' && d.panel.videos).toBeNull()
    expect(topProductsOf(d).columns!.flatMap((c) => c.products).some((p) => p.id === navii)).toBe(false)
    // A category with no row this month is not read either.
    const knees = PRODUCT_IDS.knees()
    const noKnees = ossurProductRows().filter((r) => !(r.month === SEP && (r.object_id === knees || r.group_id === knees)))
    expect(buildProductsData({ ...baseInput(), rows: noKnees }).shelf.find((c) => c.id === knees)!.videos).toBeNull()
  })

  it('7. a first month needs STANDOUT_MIN videos: one or two is not a standout', () => {
    const navii = { id: PRODUCT_IDS.navii(), name: 'Navii' }
    const thin = ossurProductRows().map((r) => (r.object_id === navii.id && r.month === SEP ? { ...r, k_named: r.audience === 'industry-other' ? 2 : 0, k_any: r.audience === 'industry-other' ? 2 : 0 } : r))
    expect(marketProductMonth(thin, SEP, navii.id)!.k_named).toBe(2)
    expect(firstMonthOf({ product: navii, month: SEP, rows: thin })).toBeNull()
    expect(buildProductsData({ ...baseInput(), rows: thin }).standouts.some((s) => s.kind === 'first')).toBe(false)
  })

  it('8. a category\'s share is judged on the brands view (cut by handles changes and every search change), never the market\'s', () => {
    const asked: string[] = []
    const pair: PairOn = (prevMonth, month, audience) => { asked.push(audience); return ACCEPT_PAIRS(prevMonth, month, audience) }
    const rows = ossurProductRows()
    const hands = OSSUR_CATALOGUE.groups.find((x) => x.name === 'Hands')!
    categoryShareVerdict({ group: hands, month: SEP, curr: marketProductMonth(rows, SEP, hands.id), prev: marketProductMonth(rows, '2026-08-01', hands.id), pair })
    expect(asked).toEqual([BRANDS_PANEL])
    expect(viewForAudience(BRANDS_PANEL)).toBe('brands')
  })

  it('10. the month line: the reading month marked, a catalogue change named, the product line as a share with its n', () => {
    const rows = ossurProductRows().map((r) => (r.month < '2026-08-01' ? { ...r, catalogue_version: 'pc1_ffffffffffffffff' } : r))
    const line = monthLine(rows, SEP, PRODUCT_IDS.liners(), (p) => p.k_any, () => false)
    expect(line.map((b) => b.current)).toEqual([false, false, false, true])
    expect(catalogueBreak(line)).toBe('2026-08-01')
    expect(catalogueBreak(monthLine(ossurProductRows(), SEP, PRODUCT_IDS.liners(), (p) => p.k_any, () => false))).toBeNull()
  })

  it('11. the comparison sets each product\'s own largest subject in weight', () => {
    const p = ossurLinersFixture().panel
    if (p?.kind !== 'group' || !p.compare) throw new Error('expected a comparison')
    const fit = p.compare.rows.find((r) => r.label === 'Fit & comfort')!
    expect(fit.cells.map((c) => c?.highlight ?? false)).toEqual([false, true, true, true])
    expect(p.compare.rows.find((r) => r.label === 'Cost & access')!.cells.some((c) => c?.highlight)).toBe(false)
  })
})

// THE PARITY PASS (13 Oct night; Heinrich: "the page shouldn't look too
// different if everything isn't as populated as the design"): the board's
// shape in production's real state (Össur after the June to October
// back-read, `ossur-today`, and a thinner one, `ossur-thin`).
describe('the parity pass: the board\'s shape in the real, thin state', () => {
  const places = (d: ReturnType<typeof ossurTodayFixture>) => d.slots.map((s) => `${s.slot}:${s.tier}:${s.card?.name ?? s.newest?.name ?? '-'}`)

  it('Össur today: the real counts, no first month that reaches a standout, every product on the shelf', () => {
    const d = ossurTodayFixture()
    expect(d.state).toBe('ready')
    expect(d.market).toBe(539)
    expect(d.header).toEqual({ cameUp: 7, products: 65, videos: 195 })
    expect(d.shelf.map((c) => `${c.name} ${c.videos}`)).toEqual(['Liners 23', 'Feet 29', 'Knees 22', 'Sockets & Locks 49', 'Hands 60', 'Bracing & Supports 12'])
    expect(d.shelf.flatMap((c) => c.products)).toHaveLength(65)
    expect(d.shelf.flatMap((c) => c.products).filter((p) => (p.videos ?? 0) > 0).map((p) => `${p.name} ${p.videos}`))
      .toEqual(['Pro-Flex XC 2', 'Proprio Foot 1', 'Pro-Flex Terra 1', 'Power Knee 1', 'Total Knee 2000 1', 'Direct Socket 2', 'Rebound Post-Op Knee 1'])
    // The strict picks the Dashboard and the email read: no first month, and
    // no subject (every one of Össur's is provisional: ruling U6).
    expect(d.standouts.map((s) => s.kind)).toEqual(['general', 'praised'])
    expect(ossurTodayFixture({ calibrated: true }).standouts.map((s) => s.kind)).toEqual(['general', 'praised', 'focus'])
  })

  it('always fills the board\'s four places, in its order: a pick, else the nearest honest card, else an empty frame', () => {
    const today = ossurTodayFixture()
    expect(today.slots.map((s) => s.slot)).toEqual([...SLOT_ORDER])
    expect(places(today)).toEqual(['first:next:Proprio Foot', 'category:pick:Hands', 'praised:pick:Feet', 'focus:none:-'])
    // Össur's subjects are provisional: the subject place names none.
    expect(today.slots[3].reason).toBe('pending')
    expect(places(ossurTodayFixture({ calibrated: true }))).toEqual(['first:next:Proprio Foot', 'category:pick:Hands', 'praised:pick:Feet', 'focus:pick:Liners'])
    // The first place under the floor: one video, and the others named for
    // the first time beside it; never the Dashboard's standout.
    const first = today.slots[0].card!
    expect(first).toMatchObject({ kind: 'first', videos: 1 })
    expect(first.kind === 'first' && first.videos).toBeLessThan(STANDOUT_MIN)
    expect(first.kind === 'first' && first.others!.map((o) => o.name)).toEqual(['Pro-Flex Terra', 'Total Knee 2000', 'Rebound Post-Op Knee'])
    expect(topProductsOf(today, today.standouts.filter((s) => s.kind === 'first') as never).standout).toMatchObject({ label: TOP_LABELS.most, name: 'Pro-Flex XC', k: 2 })

    const thin = PRODUCTS_FIXTURES['ossur-thin']()
    expect(places(thin)).toEqual(['first:none:Proprio Foot', 'category:pick:Hands', 'praised:next:Feet', 'focus:none:-'])
    const thinCalibrated = ossurTodayFixture({ thin: true, calibrated: true })
    expect(places(thinCalibrated)).toEqual(['first:none:Proprio Foot', 'category:pick:Hands', 'praised:next:Feet', 'focus:next:Bracing & Supports'])
    // Nothing new: the months read for the strip, and the newest on the shelf.
    expect(thin.slots[0]).toMatchObject({ tier: 'none', card: null, months: ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'], newest: { name: 'Proprio Foot', month: '2026-08-01' } })
    // Under half, and an object already shown is passed over where another
    // has the figure (Hands' praise is the highest, and Hands is the
    // category card).
    expect(thin.slots[2].card).toMatchObject({ kind: 'praised', praised: { k: 12, n: 29 } })
    expect(thinCalibrated.slots[3].card).toMatchObject({ kind: 'focus', subject: 'Fit & comfort', level: { k: 5, n: 12 } })
  })

  it('an empty place says why: nothing to show, or not read (the crosses were not read at all)', () => {
    const d = ossurTodayFixture({ over: { crosses: new Map() } })
    expect(places(d)).toEqual(['first:next:Proprio Foot', 'category:pick:Hands', 'praised:none:-', 'focus:none:-'])
    expect(d.slots.slice(2).map((s) => s.reason)).toEqual(['unread', 'unread'])
  })

  it('the bar\'s switch: three contiguous months around the page\'s, marked, "so far" on the calendar month', () => {
    const d = ossurTodayFixture()
    expect(d.months.map((m) => `${m.label}${m.current ? '*' : ''} ${m.href}`)).toEqual([
      'August /dashboard/products?month=2026-08', 'September* /dashboard/products?month=2026-09', 'October so far /dashboard/products?month=2026-10',
    ])
    const read = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((month) => ({ month } as ProductMonthRow))
    // Contiguous months around the page's own, clipped to what is read.
    expect(monthOptions(read, '2026-06-01', {}, '2026-10-13T08:00:00Z').map((m) => `${m.label}${m.current ? '*' : ''}`)).toEqual(['June*', 'July', 'August'])
    expect(monthOptions(read, '2026-08-01', {}, '2026-10-13T08:00:00Z').map((m) => `${m.label}${m.current ? '*' : ''}`)).toEqual(['July', 'August*', 'September'])
    expect(monthOptions(read, '2026-10-01', {}, '2026-10-13T08:00:00Z').map((m) => `${m.label}${m.current ? '*' : ''}`)).toEqual(['August', 'September', 'October so far*'])
    // A month with no reading yet keeps its place, so the way back is there.
    expect(monthOptions(read.slice(0, 4), '2026-10-01', {}, '2026-10-13T08:00:00Z').map((m) => `${m.label}${m.current ? '*' : ''}`)).toEqual(['August', 'September', 'October so far*'])
    expect(PRODUCTS_FIXTURES.unread().months.map((m) => `${m.label}${m.current ? '*' : ''}`)).toEqual(['August', 'September', 'October so far*'])
    expect(monthOptions([], '2026-09-01', {}, null)).toEqual([])
    // The loader reads past the page's month up to the calendar month, for
    // the switch alone.
    expect(monthsToRead('2026-09-01', '2026-10-13T08:00:00Z').slice(-3)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
    expect(monthsToRead('2026-09-01', '2026-09-20T08:00:00Z').at(-1)).toBe('2026-09-01')
  })

  it('reading past the page\'s month moves no figure of it', () => {
    const all = ossurTodayFixture()
    const upTo = ossurTodayFixture({ over: { rows: ossurTodayRows().filter((r) => r.month <= SEP) } })
    expect(upTo.header).toEqual(all.header)
    expect(upTo.shelf).toEqual(all.shelf)
    expect(upTo.standouts).toEqual(all.standouts)
    expect(upTo.slots).toEqual(all.slots)
    expect(upTo.months.map((m) => m.label)).toEqual(['July', 'August', 'September'])
    // An open panel too: its split, crosses, line and comparison.
    const open = { params: { group: PRODUCT_IDS.liners() } }
    const panelAll = ossurTodayFixture({ ...open, calibrated: true }).panel
    const panelUpTo = ossurTodayFixture({ ...open, calibrated: true, over: { rows: ossurTodayRows().filter((r) => r.month <= SEP) } }).panel
    expect(panelAll).not.toBeNull()
    expect(panelUpTo).toEqual(panelAll)
    const product = { params: { product: PRODUCT_IDS.sealInX() } }
    expect(ossurTodayFixture({ ...product, over: { rows: ossurTodayRows().filter((r) => r.month <= SEP) } }).panel).toEqual(ossurTodayFixture(product).panel)
  })

  it('a category with no product named keeps its comparison: the category\'s column counted, the products\' empty', () => {
    const liners = ossurTodayLinersFixture(false, true).panel as CategoryPanel
    expect(liners.compare).toMatchObject({ empty: 'none_named', verdicts: [] })
    expect(liners.compare!.columns.map((c) => c.label)).toEqual(['All liners', 'Iceross Seal-In X', 'Iceross Dermo', 'Iceross Seal-In V'])
    expect(liners.compare!.rows[0].cells).toEqual([{ k: 12, n: 23 }, null, null, null])
    // Subjects not measured yet (today): the same table, each row a subject's
    // name, every cell empty, the category's included.
    const today = ossurTodayLinersFixture().panel as CategoryPanel
    expect(today.compare).toMatchObject({ empty: 'pending', verdicts: [] })
    expect(today.compare!.rows.map((r) => r.label)).toEqual(['Choosing the right device', 'Community & encouragement', 'Cost & access', 'Fit & comfort', 'Function & movement'])
    expect(today.compare!.rows.every((r) => r.cells.every((c) => c === null))).toBe(true)
    // A quiet product's own panel: its one column, empty.
    const quiet = ossurTodayQuietFixture().panel as ProductPanel
    expect(quiet.compare).toMatchObject({ empty: 'pending' })
    expect(quiet.compare!.columns.map((c) => c.label)).toEqual(['All liners', 'Iceross Seal-In X'])
    expect(quiet).toMatchObject({ videos: 0, market: 539, categoryVideos: 23, categoryUnbranded: 20 })
    // Named, but what their videos are about not read: said as such.
    const g = { id: 'g', name: 'Feet' }
    const crosses = new Map([[setKey('group', 'g'), { n: 5, subjects: [{ id: 's', label: 'Fit', k: 2 }], kinds: [] }]])
    expect(buildCompare({ month: SEP, group: g, products: [{ id: 'p', name: 'P', videos: 2 }], crosses })).toMatchObject({ empty: 'not_read' })
    expect(buildCompare({ month: SEP, group: g, products: [{ id: 'p', name: 'P', videos: 2 }], crosses: new Map() })).toBeNull()
  })

  it('a state with the catalogue and no reading still carries the catalogue for the shelf, every count null', () => {
    for (const key of ['not-on', 'unread'] as const) {
      const d = PRODUCTS_FIXTURES[key]()
      expect(d.shelf, key).toHaveLength(6)
      expect(d.shelf.flatMap((c) => c.products), key).toHaveLength(65)
      expect(d.shelf.every((c) => c.videos === null && c.products.every((p) => p.videos === null)), key).toBe(true)
      expect(d.slots, key).toEqual([])
    }
    expect(PRODUCTS_FIXTURES.sealand().shelf).toEqual([])
  })
})

// RULING U6 (`printsMarket`, lib/subjects/calibration-state.ts): a subject
// whose check has not passed prints no figure that rests on its membership,
// on this page as on Market: no count, no share, no "leads", no "mostly
// about". Its name stands where the layout needs one.
describe('ruling U6: Össur\'s provisional subjects print no figure', () => {
  it('the crosses count only a ready subject; the rest are pending by name with their state, whatever their count, a failed one too (14 Oct)', () => {
    const rows = [
      { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 10, n: 10 },
      { audience: 'industry-other', object_kind: 'subject', object_id: 'ready', k: 4, n: 10 },
      { audience: 'industry-other', object_kind: 'subject', object_id: 'prov', k: 9, n: 10 },
      { audience: 'industry-other', object_kind: 'subject', object_id: 'bad', k: 8, n: 10 },
    ]
    const subjects = new Map([
      ['quiet', { name: 'Quiet one', state: 'provisional' as const }],
      ['ready', { name: 'Ready one', state: 'ready' as const }],
      ['prov', { name: 'Provisional one', state: 'provisional' as const }],
      ['bad', { name: 'Failed one', state: 'failed' as const }],
    ])
    const c = crossesOf(rows, subjects)
    expect(c.subjects).toEqual([{ id: 'ready', label: 'Ready one', k: 4 }])
    // In the subjects' own order, a provisional one with no video here too,
    // and a failed one named with its state (a tracked subject is never hidden).
    expect(c.pending).toEqual([
      { id: 'quiet', label: 'Quiet one', state: 'provisional' },
      { id: 'prov', label: 'Provisional one', state: 'provisional' },
      { id: 'bad', label: 'Failed one', state: 'failed' },
    ])
    expect(c.quiet).toBeUndefined()
  })

  it('a ready subject on none of the set\'s videos is quiet: printed at 0, never a pick (14 Oct)', () => {
    const rows = [
      { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 10, n: 10 },
      { audience: 'industry-other', object_kind: 'subject', object_id: 'big', k: 6, n: 10 },
    ]
    const subjects = new Map([
      ['thin', { name: 'Thin one', state: 'ready' as const }],
      ['big', { name: 'Big one', state: 'ready' as const }],
    ])
    const c = crossesOf(rows, subjects)
    expect(c.subjects).toEqual([{ id: 'big', label: 'Big one', k: 6 }])
    expect(c.quiet).toEqual([{ id: 'thin', label: 'Thin one' }])
    expect(topRanked(c)).toBe(true)
    // No video in the set: nothing to count over, so nothing is quiet either.
    expect(crossesOf([], subjects).quiet).toBeUndefined()
    // The comparison lists it at 0 after the rest, and bands no pair on it.
    const cmp = buildCompare({
      month: '2026-09-01', group: { id: 'g', name: 'Liners' }, products: [{ id: 'p', name: 'P', videos: 3 }],
      crosses: new Map([[setKey('group', 'g'), c], [setKey('product', 'p'), crossesOf([{ audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 3, n: 3 }, { audience: 'industry-other', object_kind: 'subject', object_id: 'big', k: 2, n: 3 }], subjects)]]),
    })!
    expect(cmp.rows.map((r) => [r.label, r.cells[0]])).toEqual([['Big one', { k: 6, n: 10 }], ['Thin one', { k: 0, n: 10 }]])
    expect(cmp.verdicts).toHaveLength(1)
  })

  it('Össur today: no shelf head names a subject as leading, and none prints a subject\'s count', () => {
    const d = ossurTodayFixture()
    expect(d.shelf.every((c) => c.lead === null && c.subjectsPending)).toBe(true)
    const calibrated = ossurTodayFixture({ calibrated: true })
    expect(calibrated.shelf.find((c) => c.name === 'Liners')).toMatchObject({ lead: { label: 'Fit & comfort', k: 12 }, subjectsPending: false })
  })

  it('no card, panel or comparison draws a provisional subject\'s figure', () => {
    const d = ossurTodayLinersFixture()
    expect(d.slots.some((s) => s.card?.kind === 'focus' || s.card?.kind === 'gap')).toBe(false)
    expect(d.slots.find((s) => s.slot === 'first')!.card).toMatchObject({ lead: null })
    const panel = d.panel as CategoryPanel
    expect(panel.crosses!.subjects).toEqual([])
    expect(panel.crosses!.pending!.map((x) => x.label)).toEqual(['Choosing the right device', 'Community & encouragement', 'Cost & access', 'Fit & comfort', 'Function & movement', 'Look & style'])
    const product = PRODUCTS_FIXTURES['ossur-today-product']().panel as ProductPanel
    expect(product.crosses!.subjects).toEqual([])
  })
})

// THE FRESH CHECK ON THE PARITY PASS (13 Oct night).
describe('the fresh check\'s fixes on the parity pass', () => {
  const cross = (subjects: [string, number][], pending: string[] = []) => ({
    n: 12, kinds: [], subjects: subjects.map(([label, k]) => ({ id: label, label, k })),
    ...(pending.length ? { pending: pending.map((label) => ({ id: label, label })) } : {}),
  })

  it('a subject leads only outright: no tie, and none of the client\'s subjects pending', () => {
    expect(topRanked(cross([['Fit', 5], ['Function', 3]]))).toBe(true)
    expect(topRanked(cross([['Fit', 5], ['Function', 5]]))).toBe(false)
    expect(topRanked(cross([['Fit', 5]], ['Cost']))).toBe(false)
    expect(topRanked(cross([]))).toBe(false)
  })

  it('the subject card on a tie and beside a pending subject says the level, not a rank; the shelf head says no "leads"', () => {
    const base = ossurTodayFixture({ thin: true, calibrated: true })
    expect(base.slots[3].card).toMatchObject({ kind: 'focus', subject: 'Fit & comfort', ranked: true })
    const bracing = setKey('group', base.shelf.find((c) => c.name === 'Bracing & Supports')!.id)
    for (const [why, edit] of [
      ['a tie', { subjects: [{ id: 'fit', label: 'Fit & comfort', k: 5 }, { id: 'fn', label: 'Function & movement', k: 5 }] }],
      ['a pending subject beside it', { subjects: [{ id: 'fit', label: 'Fit & comfort', k: 5 }], pending: [{ id: 'cost', label: 'Cost & access' }] }],
    ] as const) {
      const d = ossurTodayFixture({ thin: true, calibrated: true, over: { crosses: withCross(bracing, edit) } })
      expect(d.slots[3].card, why).toMatchObject({ kind: 'focus', subject: 'Fit & comfort', ranked: false })
      expect(d.shelf.find((c) => c.name === 'Bracing & Supports'), why).toMatchObject({ lead: { label: 'Fit & comfort', k: 5 }, leads: false })
    }
  })

  it('a quiet month that was read is not "not read": unread only where some category has a video and nothing was crossed', () => {
    const d = ossurTodayFixture()
    const args = { month: SEP, params: {}, catalogue: OSSUR_CATALOGUE, rows: [] as ProductMonthRow[], crosses: new Map(), splits: new Map(), picked: [] }
    const quietShelf = d.shelf.map((c) => ({ ...c, videos: 0 }))
    expect(standoutSlots({ ...args, shelf: quietShelf }).slice(2).map((s) => s.reason)).toEqual(['quiet', 'quiet'])
    expect(standoutSlots({ ...args, shelf: d.shelf }).slice(2).map((s) => s.reason)).toEqual(['unread', 'unread'])
  })
})

/** Össur's thin, calibrated crosses with one set's subjects replaced. */
function withCross(key: string, edit: { readonly subjects: readonly { id: string; label: string; k: number }[]; readonly pending?: readonly { id: string; label: string }[] }) {
  const crosses = new Map(ossurTodayCrosses({ thin: true, calibrated: true }))
  const c = crosses.get(key)!
  crosses.set(key, { ...c, subjects: [...edit.subjects], ...(edit.pending ? { pending: [...edit.pending] } : {}) })
  return crosses
}
