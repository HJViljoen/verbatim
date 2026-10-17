import { describe, expect, it } from 'vitest'

import { readingHandle } from '../../reading/read'
import { FOREIGN_CLIENT, productsDb, productsTables, PRODUCTS_DB_CLIENT } from './products-db-fixture'
import { OSSUR_CATALOGUE } from './products-fixture'
import { PRODUCT_RULE_VERSION } from '../../products/rules'
import { PRODUCT_IDS } from './products-fixture'
import { loadProducts, parseProductsParams } from './products'
import { loadProductsLevel, type LevelAsk, type ProductsLevelData } from './products-levels'

// YOUR PRODUCTS' STATEMENTS, COUNTED OFFLINE. Every `.from(table)` and
// `.rpc(fn)` a page load makes, against Össur's fixture database
// (products-db-fixture.ts), so a change to what a page reads shows up as a
// number in a diff (Market's harness, lib/pages/v2/market-statements.test.ts).
// The figures are this stand-in's: production pages more rows past the 1,000
// cap.

const NOW = new Date('2026-10-13T08:00:00.000Z').toISOString()
const LINERS: LevelAsk = { kind: 'category', id: PRODUCT_IDS.liners() }
const SEAL: LevelAsk = { kind: 'product', group: PRODUCT_IDS.liners(), id: PRODUCT_IDS.sealInX() }

async function run(raw: Record<string, string>, ask?: LevelAsk, tables?: Record<string, Record<string, unknown>[]>) {
  const db = productsDb(tables ? { tables } : {})
  const input = { supabase: db.client as never, clientId: PRODUCTS_DB_CLIENT, reading: readingHandle(PRODUCTS_DB_CLIENT, db.client as never), params: parseProductsParams(raw), role: 'owner' as const, now: NOW }
  const data = ask ? await loadProductsLevel({ ...input, ask }) : await loadProducts(input)
  const by: Record<string, number> = {}
  for (const c of db.calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: db.calls.length, by, calls: db.calls, data }
}

// TODAY'S PAGE, BEFORE THE LEVEL PAGES (17 Oct, measured at d4e1480b): the
// root 33, a category open in place 40 (its couldn't-tell-which texts:
// comments, videos, translations, the quote gate's context), a product open
// in place 39 (its comments naming it, the same reads).
//
// AS PAGES (17 Oct, the G4 boards). The root reads what it did (33): the
// panels' reads left it with the panels. A CATEGORY'S PAGE, 30: the root's
// month waves (the judge for its share's verdict), the crosses over the
// category and each of its products that came up (5 here, where the root
// reads 16), its videos once (for who's talking, and the texts' cites), one
// text read for the couldn't-tell-which list and the card products' comments
// together (comments, translations, the gate's context), and the groups (the
// profile, their evidence). A PRODUCT'S PAGE, 24: no judge (it prints no
// verdict), one cross, its videos once, the comments naming it on the videos
// it lists, the groups. Opening a video or listing every one reads nothing
// more.
describe('Your products\' statements, page by page', () => {
  it('counts each load', async () => {
    const root = await run({ month: '2026-09' })
    const hub = await run({ month: '2026-09' }, LINERS)
    const page = await run({ month: '2026-09' }, SEAL)
    expect({ root: root.total, hub: hub.total, page: page.total }).toEqual({ root: 33, hub: 30, page: 24 })
    // The root reads no text, no video and no group: its quotes are the pages'.
    for (const t of ['from:comments', 'from:videos', 'from:insight_evidence', 'from:consumer_profiles']) expect(root.by[t], t).toBeUndefined()
    // Only the hub carries a verdict, so only it reads the month-pair judge.
    expect(hub.by['from:month_pair_comparability']).toBe(1)
    expect(page.by['from:month_pair_comparability']).toBeUndefined()
    // One cross on a product's page; the hub's own five, never the root's 16.
    expect(page.by['rpc:lens_readings']).toBe(1)
    expect(hub.by['rpc:lens_readings']).toBe(5)
    // One comment read a page.
    for (const p of [hub, page]) expect(p.by['from:comments']).toBe(1)
    // Opening a video, listing every one or the whole couldn't-tell list
    // reads nothing more.
    const opened = await run({ month: '2026-09', video: 'v-2026-09-0' }, SEAL)
    const every = await run({ month: '2026-09', videos: 'all' }, SEAL)
    const all = await run({ month: '2026-09', unclear: 'all' }, LINERS)
    expect([opened.total, every.total, all.total]).toEqual([24, 24, 30])
  })

  it('reads only the first wave for an address the catalogue does not hold, or a product under another category', async () => {
    const missing = await run({ month: '2026-09' }, { kind: 'category', id: 'not-a-category' })
    const wrong = await run({ month: '2026-09' }, { kind: 'product', group: PRODUCT_IDS.knees(), id: PRODUCT_IDS.sealInX() })
    for (const r of [missing, wrong]) {
      expect(r.by['from:month_product_readings']).toBeUndefined()
      expect(r.by['rpc:product_catalogue']).toBe(1)
    }
    expect((missing.data as ProductsLevelData).missing).toBe(true)
    // A product asked under another category goes to its own, one hop, the month kept.
    expect((wrong.data as ProductsLevelData).redirect).toBe(`/dashboard/products/${PRODUCT_IDS.liners()}/${PRODUCT_IDS.sealInX()}?month=2026-09`)
  })
})

// ISOLATION: another workspace's rows sit in every table a page reads by id
// (a month row under Össur's own category id, a mention naming the Seal-In X,
// its video and its comment). No page of Össur's may count, list or quote
// them, and every read names the session's client; removing a reader's
// client filter fails this.
describe('Your products\' pages read the tenant\'s own rows only', () => {
  it('counts, lists and quotes nothing of another workspace\'s, and filters every read on the session\'s client', async () => {
    const hub = await run({ month: '2026-09' }, LINERS)
    const page = await run({ month: '2026-09' }, SEAL)
    const h = hub.data as ProductsLevelData
    const p = page.data as ProductsLevelData
    // The foreign month row's 297 videos never reach the split (it sits in
    // an audience of its own, so an unfiltered read would pool it).
    expect(h.category?.detail.split?.any).toBe(117)
    expect(h.base.market).toBe(839)
    // Its mention and its tag never move a count: the Seal-In X's busiest
    // video keeps exactly Össur's two comments naming it.
    expect(p.product?.evidence.videos.find((v) => v.id === 'v-2026-09-0')?.named).toBe(2)
    // Its video and comment never reach the evidence or the list.
    expect(p.product?.evidence.videos.map((v) => v.id)).not.toContain('v-foreign-1')
    expect(JSON.stringify(h)).not.toContain('Other workspace')
    expect(JSON.stringify(p)).not.toContain('Other workspace')
    for (const r of [hub, page]) {
      for (const c of r.calls.filter((x) => ['videos', 'comments', 'product_mentions', 'month_product_readings', 'product_tags'].includes(x.table))) {
        expect(c.filters, `${c.table}: ${c.filters.join(' ')}`).toContain(`client_id=${PRODUCTS_DB_CLIENT}`)
      }
    }
  })

  it('honours ?video= only for one of the product\'s own videos this month', async () => {
    const tables = productsTables()
    const foreign = await run({ month: '2026-09', video: 'v-foreign-1' }, SEAL, tables)
    const other = await run({ month: '2026-09', video: 'v-2026-09-800' }, SEAL)
    const junk = await run({ month: '2026-09', video: '\'; drop table videos; --' }, SEAL)
    for (const r of [foreign, other, junk]) {
      const ev = (r.data as ProductsLevelData).product!.evidence
      expect(ev.videos.some((v) => v.open)).toBe(false)
      expect(ev.videos.map((v) => v.id)).not.toContain('v-foreign-1')
      // The param never reaches a query.
      expect(r.calls.some((c) => c.filters.some((f) => f.includes('drop table')))).toBe(false)
    }
    const own = await run({ month: '2026-09', video: 'v-2026-09-0' }, SEAL)
    expect((own.data as ProductsLevelData).product!.evidence.videos.find((v) => v.open)?.id).toBe('v-2026-09-0')
  })

  it('opens nothing for a category or product of another workspace\'s catalogue', async () => {
    // The stand-in answers the catalogue only for Össur's client: another
    // client asking for Össur's ids reads an empty catalogue.
    const db = productsDb()
    const data = await loadProductsLevel({ supabase: db.client as never, clientId: FOREIGN_CLIENT, reading: readingHandle(FOREIGN_CLIENT, db.client as never), params: {}, role: 'owner', now: NOW, ask: LINERS })
    expect(data.missing).toBe(true)
    expect(data.category).toBeNull()
    expect(db.calls.some((c) => c.table === 'month_product_readings')).toBe(false)
  })
})

// ONE BUSY VIDEO NEVER CROWDS ANOTHER OUT (the fresh check, 17 Oct). The
// comments naming the product on the videos a page lists were one text read
// cut at one cap, newest first: a video with more newer comments than the cap
// took every place, the others printed "None of the comments naming it can
// be quoted here." for comments that could, and the busy one's "Show all"
// named the cap instead of its own count. Each video is its own list now.
describe('Your products\' evidence counts every video\'s comments', () => {
  it('a video with hundreds of newer comments naming it leaves another\'s comment on its card, and counts all of its own', async () => {
    const tables = productsTables()
    const BUSY = 'v-2026-09-0'
    for (let i = 0; i < 250; i++) {
      const id = `c-busy-${String(i).padStart(3, '0')}`
      tables.comments.push({ id, client_id: PRODUCTS_DB_CLIENT, text: 'The Seal-In X finally stopped slipping on my long walks to work.', comment_date: '2026-09-27T10:00:00.000Z', platform: 'tiktok', video_id: `p-${BUSY}`, comment_id: `pc-${id}`, author: 'viewer' })
      tables.product_mentions.push({ id: `m-busy-${i}`, client_id: PRODUCTS_DB_CLIENT, video_id: BUSY, source: 'comment', comment_id: id, comment_month: '2026-09-01', placement: 'named', product_id: PRODUCT_IDS.sealInX(), group_id: PRODUCT_IDS.liners(), method: 'rule', rule_version: PRODUCT_RULE_VERSION, catalogue_version: OSSUR_CATALOGUE.version, tag_id: null })
    }
    const r = await run({ month: '2026-09' }, SEAL, tables)
    const videos = (r.data as ProductsLevelData).product!.evidence.videos
    const busy = videos.find((v) => v.id === BUSY)!
    const other = videos.find((v) => v.id === 'v-2026-09-1')!
    expect(busy).toMatchObject({ named: 252, quotable: 252 })
    expect(other.named).toBe(1)
    expect(other.quotes).toHaveLength(1)
  })
})
