import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { OSSUR_CLIENT_ID } from '../config'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import {
  batchItems, buildSystemPrompt, buildUserPrompt, catalogueCodes, CLASSIFY_BATCH, classifyRows, estimateBatchUsd, estimateTokens,
  PRODUCT_CLASSIFY_MODEL, PRODUCT_CLASSIFY_PROMPT_VERSION, PRODUCT_MODEL_RULE_VERSION, runClassifier,
  type ClassifyAnswer, type ClassifyItem, type Classifier, type VideoContext,
} from './classify'
import { commentKey, contentKey, planRules, type QueueItem } from './match'
import { compileCatalogue } from './rules'

// The classifier's contract on fixtures (depth v2 T11 "done when"): what it is
// shown, how its answers become rows, what it refuses, and the hard cap. No
// model is called: the classifier is a stub, and the module that builds the
// OpenAI client throws if anything reaches it.

const compiled = compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID)
const codes = catalogueCodes(FIXTURE_CATALOGUE)
const code = (id: string) => [...codes.product, ...codes.group].find(([, v]) => v === id)![0]
const V = '00000000-0000-4000-8000-0000000000a1'
const q = (i: number, text: string): QueueItem => ({ key: commentKey(`c${i}`), videoId: V, commentId: `c${i}`, commentMonth: '2026-09-01', text })
const classify = (item: QueueItem): ClassifyItem => ({ kind: 'classify', item })
const videos = new Map<string, VideoContext>([[V, { videoId: V, caption: 'My new Pro-Flex XC on the trail', names: ['Pro-Flex XC (Feet)'] }]])

const generic = planRules(OSSUR_CLIENT_ID, compiled, [], [
  { commentId: 'g1', videoId: V, month: '2026-09-04', text: 'my unity pump keeps hissing' },
  { commentId: 'g2', videoId: V, month: '2026-09-05', text: 'unity is strength' },
]).confirm
const confirm = (i: number): ClassifyItem => ({ kind: 'confirm', item: generic[i] })

const rowsOf = (items: ClassifyItem[], answers: ClassifyAnswer[]) =>
  classifyRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, items, answers, codes })

describe('what the model is shown', () => {
  it('codes the catalogue in display order: C a category, P a product', () => {
    expect([...codes.group.keys()]).toEqual(['C1', 'C2', 'C3', 'C4'])
    expect(codes.group.get('C2')).toBe(G('Feet'))
    expect(codes.product.get('P1')).toBe(P('Iceross Seal-In X5'))
    expect(codes.product2group.get(P('Unity'))).toBe(G('Sockets'))
  })

  it('the system prompt carries the client, every category, product and other name, and no item', () => {
    const s = buildSystemPrompt('Össur', FIXTURE_CATALOGUE)
    for (const w of ['Össur', 'C1 Liners', 'P1 Iceross Seal-In X5 (also: sealin x5)', 'families here: Iceross', 'words for it: liner, prosthetic liner', '"unclear"', 'CHECK']) {
      expect(s).toContain(w)
    }
    expect(s).not.toContain('keeps hissing')
  })

  it('the user prompt lists each video once and marks a confirm item with the word and its target', () => {
    const u = buildUserPrompt([classify(q(1, 'how long does it last?')), classify(q(2, 'nice')), confirm(0)], videos, FIXTURE_CATALOGUE, compiled)
    expect(u.match(/\[V1\] My new Pro-Flex XC/g)).toHaveLength(1)
    expect(u).toContain('| names: Pro-Flex XC (Feet)')
    expect(u).toContain('1. [V1] how long does it last?')
    expect(u).toContain(`3. CHECK "Unity" = ${code(P('Unity'))} Unity | my unity pump keeps hissing`)
  })

  it('cuts a long text, and never sends another comment\'s words', () => {
    const u = buildUserPrompt([classify(q(1, 'x'.repeat(2000)))], videos, FIXTURE_CATALOGUE, compiled)
    expect(u.length).toBeLessThan(900)
  })
})

describe('classifyRows: the answers as rows', () => {
  const items = [classify(q(1, 'how long does it last?')), classify(q(2, 'my ossur liner')), classify(q(3, 'liners sweat')), classify(q(4, 'so brave'))]

  it('one row per answer: named per product, unclear and unbranded per category, none as the read\'s record', () => {
    const { rows, unplaced } = rowsOf(items, [
      { n: 1, placement: 'named', products: [code(P('Pro-Flex XC'))], category: null },
      { n: 2, placement: 'unclear', products: [], category: 'c1' },
      { n: 3, placement: 'unbranded', products: [], category: 'C1' },
      { n: 4, placement: 'none', products: [], category: null },
    ])
    expect(unplaced).toBe(0)
    expect(rows.map((r) => [r.comment_id, r.placement, r.product_id, r.group_id])).toEqual([
      ['c1', 'named', P('Pro-Flex XC'), G('Feet')],
      ['c2', 'unclear', null, G('Liners')],
      ['c3', 'unbranded', null, G('Liners')],
      ['c4', 'none', null, null],
    ])
    expect(rows.every((r) => r.method === 'model' && r.model === PRODUCT_CLASSIFY_MODEL && r.prompt_version === PRODUCT_CLASSIFY_PROMPT_VERSION
      && r.rule_version === PRODUCT_MODEL_RULE_VERSION && r.source === 'comment' && r.comment_month === '2026-09-01')).toBe(true)
  })

  it('a comment naming two products is two named rows', () => {
    const { rows } = rowsOf([items[0]], [{ n: 1, placement: 'named', products: [code(P('Pro-Flex XC')), code(P('Rheo Knee'))], category: null }])
    expect(rows.map((r) => [r.product_id, r.group_id])).toEqual([[P('Pro-Flex XC'), G('Feet')], [P('Rheo Knee'), G('Knees')]])
  })

  it('refuses an answer outside the batch, a repeat, an unknown code, a named answer with no product, a category answer with none', () => {
    const { rows, unplaced } = rowsOf(items, [
      { n: 0, placement: 'none', products: [], category: null },
      { n: 9, placement: 'none', products: [], category: null },
      { n: 1, placement: 'named', products: ['P99'], category: null },
      { n: 2, placement: 'named', products: [], category: 'C1' },
      { n: 3, placement: 'unbranded', products: [], category: null },
      { n: 4, placement: 'none', products: [], category: null },
      { n: 4, placement: 'unbranded', products: [], category: 'C1' },
    ])
    expect(rows.map((r) => [r.comment_id, r.placement])).toEqual([['c4', 'none']])
    expect(unplaced).toBe(3)
  })

  it('a confirm answer counts only for its generic word\'s own product; anything else is the read\'s none', () => {
    const yes = rowsOf([confirm(0)], [{ n: 1, placement: 'named', products: [code(P('Unity'))], category: null }]).rows
    expect(yes).toEqual([expect.objectContaining({ method: 'confirmed', placement: 'named', product_id: P('Unity'), group_id: G('Sockets'), comment_id: 'g1' })])
    for (const other of [
      { n: 1, placement: 'none', products: [], category: null },
      { n: 1, placement: 'named', products: [code(P('Rheo Knee'))], category: null },
      { n: 1, placement: 'unbranded', products: [], category: code(G('Sockets')) },
    ] as ClassifyAnswer[]) {
      expect(rowsOf([confirm(1)], [other]).rows).toEqual([expect.objectContaining({ method: 'confirmed', placement: 'none', product_id: null, group_id: null, comment_id: 'g2' })])
    }
  })

  it('a confirm item on a video\'s content writes a content row with its field', () => {
    const plan = planRules(OSSUR_CLIENT_ID, compiled, [{ videoId: V, field: 'caption', text: 'Unity vacuum demo' }], [])
    const { rows } = rowsOf([{ kind: 'confirm', item: plan.confirm[0] }], [{ n: 1, placement: 'named', products: [code(P('Unity'))], category: null }])
    expect(plan.confirm[0].key).toBe(contentKey(V))
    expect(rows[0]).toMatchObject({ source: 'content', field: 'caption', comment_id: null, comment_month: null, method: 'confirmed' })
  })
})

describe('pricing', () => {
  it('counts about four characters a token for Latin script and one and a half for CJK', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateTokens('漢'.repeat(150))).toBe(100)
  })

  it('prices a call from its prompt and its items\' most output, at gpt-4.1-mini\'s rate', () => {
    const e = estimateBatchUsd('s'.repeat(4000), 'u'.repeat(4000), 25)
    expect(e.input).toBe(2012)
    expect(e.output).toBe(25 * 30 + 10)
    expect(e.usd).toBeCloseTo((2012 * 0.4 + 760 * 1.6) / 1e6, 10)
  })

  it('batches CLASSIFY_BATCH items a call', () => {
    expect(CLASSIFY_BATCH).toBe(25)
    expect(batchItems(Array.from({ length: 60 }, (_, i) => classify(q(i, 'x')))).map((b) => b.length)).toEqual([25, 25, 10])
  })
})

describe('runClassifier: the calls, the hard cap and the clock', () => {
  const items = Array.from({ length: 60 }, (_, i) => classify(q(i, `comment ${i} about liners`)))
  const answerAll: Classifier = async (_s, user) => ({
    answers: [...user.matchAll(/^(\d+)\. /gm)].map((m) => ({ n: Number(m[1]), placement: 'unbranded' as const, products: [], category: 'C1' })),
    usage: { prompt_tokens: 1000, completion_tokens: 500 }, durationMs: 1,
  })
  const base = { admin: null, clientId: OSSUR_CLIENT_ID, runId: null, clientName: 'Össur', catalogue: FIXTURE_CATALOGUE, compiled, videos }

  it('asks every item, writes each call\'s rows as it returns, and spends what the usage says', async () => {
    const written: number[] = []
    const r = await runClassifier({ ...base, items, budgetUsd: 1, classifier: answerAll, parallel: 2, write: async (rows) => { written.push(rows.length) } })
    expect(r).toMatchObject({ asked: 60, answered: 60, unplaced: 0, deferred: 0, failedCalls: 0 })
    expect(written).toEqual([25, 25, 10])
    expect(r.costUsd).toBeCloseTo(3 * (1000 * 0.4 + 500 * 1.6) / 1e6, 10)
    expect(h.parse).not.toHaveBeenCalled()
  })

  it('stops before a wave whose worst case would pass the budget, and defers the rest', async () => {
    const one = estimateBatchUsd(buildSystemPrompt('Össur', FIXTURE_CATALOGUE), buildUserPrompt(items.slice(0, 25), videos, FIXTURE_CATALOGUE, compiled), 25).usd
    const call = vi.fn(answerAll)
    const r = await runClassifier({ ...base, items, budgetUsd: one * 1.5, classifier: call, parallel: 1 })
    expect(call).toHaveBeenCalledTimes(1)
    expect(r.deferred).toBe(35)
  })

  it('stops at the clock', async () => {
    let t = 0
    const call = vi.fn(async (s: string, u: string) => { t += 100; return answerAll(s, u) })
    const r = await runClassifier({ ...base, items, budgetUsd: 10, classifier: call, parallel: 1, deadline: 150, now: () => t })
    expect(call).toHaveBeenCalledTimes(2)
    expect(r.deferred).toBe(10)
  })

  it('a failed call never throws: its items wait for the next run, and a rate limit stops the rest', async () => {
    const r = await runClassifier({ ...base, items, budgetUsd: 10, parallel: 1, classifier: async () => { throw new Error('429 rate limit') } })
    expect(r).toMatchObject({ failedCalls: 1, failed: 25, rateLimited: true, asked: 0, answered: 0, deferred: 35 })
    expect(r.errors[0]).toMatch(/429/)
  })

  it('a write that fails keeps the spend and drops the rows from the result', async () => {
    const r = await runClassifier({ ...base, items: items.slice(0, 5), budgetUsd: 1, classifier: answerAll, write: async () => { throw new Error('insert refused') } })
    expect(r.rows).toEqual([])
    expect(r.costUsd).toBeGreaterThan(0)
    expect(r.errors[0]).toMatch(/insert refused/)
  })
})
