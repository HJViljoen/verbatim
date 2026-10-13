import { describe, expect, it, vi } from 'vitest'

// No model is reached unless a test hands in a stub classifier; the switch is
// mocked per test (it is off for every tenant in lib/config.ts).
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }), on: true }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))
vi.mock('../config', async (orig) => {
  const real = await orig<typeof import('../config')>()
  return { ...real, productReadingsEnabled: () => h.on }
})

import { OSSUR_CLIENT_ID } from '../config'
import { catalogueCodes, type Classifier } from '../products/classify'
import { cataloguePattern, compileCatalogue } from '../products/rules'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import { planProductReadings, productSpendSoFar, productSummary, runProductMonth } from './product-readings'

const t = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: OSSUR_CLIENT_ID, ...r }))
const SEP = '2026-09-01'
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NOW = '2026-10-11T07:00:00.000Z'
const re = new RegExp(cataloguePattern(compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID), 'js')!, 'isu')

const VIDEOS = [
  { id: vid(1), platform: 'tiktok', video_id: 'tt1', account_name: 'a1', caption: 'Pro-Flex XC on the trail', hashtags: null, transcript: null, transcript_en: null, ocr_text: null },
  { id: vid(2), platform: 'tiktok', video_id: 'tt2', account_name: 'a2', caption: 'morning routine', hashtags: null, transcript: null, transcript_en: null, ocr_text: null },
]
const COMMENTS = [
  { id: 'k1', platform: 'tiktok', video_id: 'tt1', text: 'how long does it last?', comment_date: '2026-09-12T10:00:00Z', is_low_signal: false },
  { id: 'k2', platform: 'tiktok', video_id: 'tt2', text: 'which prosthetic liner is that', comment_date: '2026-09-12T10:00:00Z', is_low_signal: false },
]

function admin(opts: { schema?: boolean; catalogue?: boolean; frozenDenominator?: boolean } = {}) {
  const schema = opts.schema ?? true
  return fakeAdmin({
    tables: {
      ...(schema ? { month_product_readings: [], product_mentions: [], product_tags: [] } : {}),
      month_denominators: t([{ month: SEP, audience: 'industry-other', status: opts.frozenDenominator ? 'frozen' : 'filling' }]),
      videos: t(VIDEOS), comments: t(COMMENTS),
      clients: [{ id: OSSUR_CLIENT_ID, company_name: 'Össur' }],
      tracking_configs: t([{ competitor_keywords: ['ottobock genium'] }]),
      keyword_performance: t([{ id: 'kp1', keyword: 'ottobock genium', bucket: 'competitor' }]),
      video_provenance: [],
      ai_call_log: [{ id: 'l1', run_id: 'run-1', pass: 'product-classify', cost_usd: 0.25 }, { id: 'l2', run_id: 'run-1', pass: 'pass-a', cost_usd: 3 }],
    },
    rpc: {
      ...(schema ? { product_catalogue: () => ({ data: opts.catalogue === false ? null : FIXTURE_CATALOGUE }) } : {}),
      brand_mention_candidates: () => [
        ...VIDEOS.filter((v) => re.test(v.caption)).map((v) => ({ video_id: v.id, source: 'content', field: 'caption', comment_id: null, comment_month: null, excerpt: v.caption })),
        ...COMMENTS.filter((c) => re.test(c.text)).map((c) => ({ video_id: VIDEOS.find((v) => v.video_id === c.video_id)!.id, source: 'comment', field: null, comment_id: c.id, comment_month: SEP, excerpt: c.text })),
      ],
      market_month_videos: () => VIDEOS.map((v) => ({ video_id: v.id, audience: 'industry-other', platform: v.platform, dated_comments: 1 })),
    },
  })
}

const codes = catalogueCodes(FIXTURE_CATALOGUE)
const stub: Classifier = async ({ user }) => ({
  answers: [...user.matchAll(/^(\d+)\. (.*)$/gm)].map(([, n]) => ({ n: Number(n), placement: 'named' as const, products: [codes.productOf.get(P('Pro-Flex XC'))!], category: null, words: 'it', sure: true })),
  usage: { prompt_tokens: 900, completion_tokens: 60 }, durationMs: 1,
})

describe('the product-readings step', () => {
  it('is off for a tenant whose switch is off: nothing read', async () => {
    h.on = false
    const f = admin()
    expect(await planProductReadings(f.client, OSSUR_CLIENT_ID, NOW)).toMatchObject({ months: [], note: expect.stringMatching(/off for this tenant/) })
    expect((await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: NOW, month: SEP, budgetUsd: 1, cap: 100 })).status).toBe('skipped')
    expect(f.reads).toEqual([])
    expect(f.rpcCalls).toEqual([])
    h.on = true
  })

  it('is a no-op before the products migration, and for a tenant with no catalogue', async () => {
    const before = admin({ schema: false })
    expect((await planProductReadings(before.client, OSSUR_CLIENT_ID, NOW)).note).toMatch(/not applied/)
    expect((await runProductMonth(before.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: NOW, month: SEP, budgetUsd: 1, cap: 100 })).note).toMatch(/not applied/)
    const none = admin({ catalogue: false })
    expect((await planProductReadings(none.client, OSSUR_CLIENT_ID, NOW)).note).toBe('no catalogue for this tenant')
    expect(before.writes).toEqual([])
    expect(none.writes).toEqual([])
  })

  it('plans the months still open, then writes a month: the rules\' rows, the model\'s, and the rows per audience and object', async () => {
    const f = admin()
    const plan = await planProductReadings(f.client, OSSUR_CLIENT_ID, NOW)
    expect(plan.months).toEqual(['2026-09-01', '2026-10-01'])
    const r = await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: NOW, month: SEP, budgetUsd: 1, cap: 100, classifier: stub })
    expect(r).toMatchObject({ status: 'written', ruleRowsInserted: 2, classified: 1, itemsAsked: 1, deferred: 0, frozen: 0 })
    expect(r.costUsd).toBeGreaterThan(0)
    expect(f.tables.product_mentions.map((m) => [m.method, m.comment_id ?? m.video_id, m.placement])).toEqual([
      ['rule', vid(1), 'named'], ['rule', 'k2', 'unbranded'], ['model', 'k1', 'named'],
    ])
    const row = (id: string) => f.tables.month_product_readings.find((x) => x.object_id === id)!
    expect(row(G('Feet'))).toMatchObject({ k_named: 1, k_any: 1, k_organic: 1, comments: 1, n: 2, n_organic: 2, status: 'filling', origin: 'live', run_id: 'run-1' })
    expect(row(G('Liners'))).toMatchObject({ k_unbranded: 1, k_any: 1, comments: 1 })
    expect(row(P('Pro-Flex XC'))).toMatchObject({ k_named: 1, comments: 1 })
    expect(productSummary(r)).toMatch(/^2026-09: 2 new rule placements, 0 generic names checked, 1 comments classified/)
    expect(h.parse).not.toHaveBeenCalled()

    // A replay inserts nothing twice and asks the model nothing.
    const call = vi.fn(stub)
    const again = await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: NOW, month: SEP, budgetUsd: 1, cap: 100, classifier: call })
    expect(again).toMatchObject({ ruleRowsInserted: 0, itemsAsked: 0 })
    expect(call).not.toHaveBeenCalled()
    expect(f.tables.product_mentions).toHaveLength(3)
  })

  it('writes a month that freezes on this run frozen, before freeze-months\' marker, when the pass read it in full', async () => {
    const f = admin()
    const r = await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: '2026-11-02T07:00:00.000Z', month: SEP, budgetUsd: 1, cap: 100, classifier: stub })
    expect(r).toMatchObject({ deferred: 0, heldOpen: 0 })
    expect(r.frozen).toBe(r.written)
    expect(f.tables.month_product_readings.every((x) => x.status === 'frozen' && x.frozen_at === '2026-11-02T07:00:00.000Z')).toBe(true)
  })

  it('THE ONE-SHOT GUARD: a month this run would freeze, with items left (a 429), is written filling, and the next run reads it again and freezes it', async () => {
    const f = admin()
    const r = await runProductMonth(f.client, {
      clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: '2026-11-02T07:00:00.000Z', month: SEP, budgetUsd: 1, cap: 100,
      classifier: async () => { throw new Error('429 rate limit reached') },
    })
    expect(r.deferred).toBeGreaterThan(0)
    expect(r.heldOpen).toBe(r.written)
    expect(f.tables.month_product_readings.every((x) => x.status === 'filling' && x.frozen_at === null && x.origin === 'live')).toBe(true)
    expect(productSummary(r)).toMatch(/held filling because items were left: the next run freezes them/)
    // the next run's plan finds the filling row, and a full read freezes it
    const plan = await planProductReadings(f.client, OSSUR_CLIENT_ID, '2026-11-09T07:00:00.000Z')
    expect(plan.months).toContain(SEP)
    const again = await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-2', now: '2026-11-09T07:00:00.000Z', month: SEP, budgetUsd: 1, cap: 100, classifier: stub })
    expect(again).toMatchObject({ deferred: 0, heldOpen: 0 })
    expect(f.tables.month_product_readings.every((x) => x.status === 'frozen')).toBe(true)
  })

  it('a cap of nothing asks nothing and leaves the queue for the next run (a filling month is written as ever)', async () => {
    const f = admin()
    const call = vi.fn(stub)
    const r = await runProductMonth(f.client, { clientId: OSSUR_CLIENT_ID, runId: 'run-1', now: NOW, month: SEP, budgetUsd: 1, cap: 0, classifier: call })
    expect(call).not.toHaveBeenCalled()
    expect(r).toMatchObject({ itemsAsked: 0, deferred: 1, heldOpen: 0 })
    expect(r.written).toBeGreaterThan(0)
  })

  it('reads the run\'s product spend from the ledger, and nothing else\'s', async () => {
    const f = admin()
    expect(await productSpendSoFar(f.client, 'run-1')).toBe(0.25)
    expect(await productSpendSoFar(f.client, null)).toBe(0)
  })
})
