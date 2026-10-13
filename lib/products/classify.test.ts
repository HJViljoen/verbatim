import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { OSSUR_CLIENT_ID } from '../config'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import {
  batchItems, buildConfirmSystemPrompt, buildConfirmUserPrompt, buildSystemPrompt, buildUserPrompt, callUsd, catalogueCodes, CLASSIFY_BATCH,
  classifyRows, confirmQuestions, confirmRows, estimateBatchUsd, estimateTokens, modelFor, MODEL_PLACES_PARAPHRASE, planCalls,
  PRODUCT_CLASSIFY_MODEL, PRODUCT_CLASSIFY_PROMPT_VERSION, PRODUCT_CONFIRM_MODEL, PRODUCT_MODEL_RULE_VERSION, runClassifier,
  squashName, withinOneEdit, wordsName,
  type ClassifyAnswer, type ClassifyItem, type Classifier, type VideoContext,
} from './classify'
import { commentKey, contentKey, planRules, type QueueItem } from './match'
import { compileCatalogue } from './rules'
import { seedCatalogue } from './seed'
import { OSSUR_PRODUCTS } from '../../scripts/seeds/ossur-products'

// The model calls' contract on fixtures (depth v2 T11 "done when"): what each
// call is shown, how its answers become rows, what the checks refuse, and the
// hard cap. No model is called: the classifier is a stub, and the module that
// builds the OpenAI client throws if anything reaches it.

const compiled = compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID)
const codes = catalogueCodes(FIXTURE_CATALOGUE)
const code = (id: string) => codes.productOf.get(id) ?? codes.groupOf.get(id)!
const V = '00000000-0000-4000-8000-0000000000a1'
const V2 = '00000000-0000-4000-8000-0000000000a2'
const q = (i: number, text: string, videoId = V): QueueItem => ({ key: commentKey(`c${i}`), videoId, commentId: `c${i}`, commentMonth: '2026-09-01', text })
const classify = (item: QueueItem): ClassifyItem => ({ kind: 'classify', item })
/** V names one client product (Pro-Flex XC); V2 names none. */
const videos = new Map<string, VideoContext>([
  [V, { videoId: V, caption: 'My new Pro-Flex XC on the trail', names: ['Pro-Flex XC (Feet)'], products: [P('Pro-Flex XC')], clientGroups: [G('Feet')] }],
  [V2, { videoId: V2, caption: 'liners in general', names: ['Liners'], products: [], clientGroups: [] }],
])
const check = { catalogue: FIXTURE_CATALOGUE, compiled, videos }
const answer = (n: number, placement: ClassifyAnswer['placement'], o: Partial<ClassifyAnswer> = {}): ClassifyAnswer =>
  ({ n, placement, products: [], category: null, words: null, sure: true, ...o })
const rowsOf = (items: ClassifyItem[], answers: ClassifyAnswer[]) =>
  classifyRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, items, answers, codes, check })

const generic = planRules(OSSUR_CLIENT_ID, compiled, [], [
  { commentId: 'g1', videoId: V, month: '2026-09-04', text: 'my unity pump keeps hissing' },
  { commentId: 'g2', videoId: V, month: '2026-09-05', text: 'unity is strength, and my eye socket hurts' },
]).confirm

describe('what the model is shown', () => {
  it('codes the catalogue in display order: C a category, P a product', () => {
    expect([...codes.group.keys()]).toEqual(['C1', 'C2', 'C3', 'C4'])
    expect(codes.group.get('C2')).toBe(G('Feet'))
    expect(codes.product.get('P1')).toBe(P('Iceross Seal-In X5'))
    expect(codes.product2group.get(P('Unity'))).toBe(G('Sockets'))
  })

  it('the classifier\'s system prompt: the client, the catalogue, the rules, and no comment', () => {
    const s = buildSystemPrompt('Össur', FIXTURE_CATALOGUE)
    for (const w of ['Össur', 'C1 Liners', 'P1 Iceross Seal-In X5 (also: sealin x5)', 'families here: Iceross', 'words for it: liner, prosthetic liner', 'MOST COMMENTS ARE NONE', '"words"', '"sure"']) {
      expect(s).toContain(w)
    }
    expect(s).not.toContain('keeps hissing')
  })

  it('lists a video only where it names the client\'s products, by those names, never its caption', () => {
    const u = buildUserPrompt([classify(q(1, 'how long does it last?')), classify(q(2, 'nice')), classify(q(3, 'which one', V2))], videos)
    expect(u.match(/\[V1\] a video that names: Pro-Flex XC \(Feet\)/g)).toHaveLength(1)
    expect(u).not.toContain('on the trail')
    expect(u).not.toContain('liners in general')
    expect(u).toContain('1. [V1] how long does it last?')
    expect(u).toContain('3. which one')
  })

  it('cuts a long text between code points, and leaves no lone surrogate in the request', () => {
    const u = buildUserPrompt([classify(q(1, `${'x'.repeat(499)}😍😍 and more`))], videos)
    expect(u.length).toBeLessThan(700)
    expect(u).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('the confirm asks one word at a time, with what it would mean', () => {
    const qs = confirmQuestions(generic)
    expect(qs.map((x) => x.alias.alias)).toEqual(['Unity', 'socket', 'Unity'])
    const u = buildConfirmUserPrompt(qs, compiled, 'Össur')
    expect(u).toContain(`1. WORD "Unity" = Össur's product Unity (Sockets) | TEXT: my unity pump keeps hissing`)
    expect(u).toContain('2. WORD "socket" = the kind of product in Sockets (a prosthetic or orthotic product)')
    expect(buildConfirmSystemPrompt('Össur')).toMatch(/means: false if the word is used in any other sense/)
  })
})

describe('classifyRows: every answer held to what the comment says', () => {
  it('named: kept when its words name the product (the slip rule is tested on the seed below)', () => {
    const { rows, downgraded } = rowsOf([classify(q(1, 'is the proflex xc good for running?', V2)), classify(q(2, 'my rheo knee beeps', V2))], [
      answer(1, 'named', { products: [code(P('Pro-Flex XC'))], words: 'proflex xc' }),
      answer(2, 'named', { products: [code(P('Rheo Knee'))], words: 'rheo knee' }),
    ])
    expect(downgraded).toBe(0)
    expect(rows.map((r) => [r.comment_id, r.placement, r.product_id, r.group_id])).toEqual([
      ['c1', 'named', P('Pro-Flex XC'), G('Feet')], ['c2', 'named', P('Rheo Knee'), G('Knees')],
    ])
    expect(rows.every((r) => r.method === 'model' && r.model === PRODUCT_CLASSIFY_MODEL && r.prompt_version === PRODUCT_CLASSIFY_PROMPT_VERSION
      && r.rule_version === PRODUCT_MODEL_RULE_VERSION && r.source === 'comment' && r.comment_month === '2026-09-01')).toBe(true)
  })

  it('named by "it": kept only for the ONE product the video names', () => {
    const { rows } = rowsOf([classify(q(1, 'how long does it last?')), classify(q(2, 'how long does it last?', V2))], [
      answer(1, 'named', { products: [code(P('Pro-Flex XC'))], words: 'it' }),
      answer(2, 'named', { products: [code(P('Cheetah Xcel'))], words: 'it' }),
    ])
    expect(rows.map((r) => [r.comment_id, r.placement, r.product_id])).toEqual([['c1', 'named', P('Pro-Flex XC')], ['c2', 'none', null]])
  })

  it('named with nothing naming it, or words not in the comment: the read\'s none', () => {
    const { rows, downgraded } = rowsOf([classify(q(1, 'You need a Winter Soldier arm', V2)), classify(q(2, 'nice foot', V2))], [
      answer(1, 'named', { products: [code(P('Cheetah Xcel'))], words: 'Winter Soldier arm' }),
      answer(2, 'named', { products: [code(P('Pro-Flex XC'))], words: 'pro-flex xc' }),
    ])
    expect(rows.map((r) => r.placement)).toEqual(['none', 'none'])
    expect(downgraded).toBe(2)
  })

  it('unclear: kept with the client\'s name or a family in the comment, or a client product of the category in the video; else the category in general', () => {
    const { rows } = rowsOf([
      classify(q(1, 'my ossur liner slips', V2)), classify(q(2, 'my iceross is worn', V2)), classify(q(3, 'does it bend?')), classify(q(4, 'my liner, which one?', V2)),
    ], [
      answer(1, 'unclear', { category: code(G('Liners')), words: 'my ossur liner' }),
      answer(2, 'unclear', { category: code(G('Liners')), words: 'my iceross' }),
      answer(3, 'unclear', { category: code(G('Feet')), words: 'it' }),
      answer(4, 'unclear', { category: code(G('Liners')), words: 'my liner' }),
    ])
    expect(rows.map((r) => [r.comment_id, r.placement, r.group_id])).toEqual([
      ['c1', 'unclear', G('Liners')], ['c2', 'unclear', G('Liners')], ['c3', 'unclear', G('Feet')], ['c4', 'unbranded', G('Liners')],
    ])
  })

  it('unbranded: kept only where its words name the category (a misspelt word); a paraphrase is the read\'s none while MODEL_PLACES_PARAPHRASE is off', () => {
    expect(MODEL_PLACES_PARAPHRASE).toBe(false)
    const { rows } = rowsOf([classify(q(1, 'which prostetic liner is best', V2)), classify(q(2, 'It takes me longer to put my shoes on', V2))], [
      answer(1, 'unbranded', { category: code(G('Liners')), words: 'prostetic liner' }),
      answer(2, 'unbranded', { category: code(G('Feet')), words: 'put my shoes on' }),
    ])
    expect(rows.map((r) => [r.comment_id, r.placement])).toEqual([['c1', 'unbranded'], ['c2', 'none']])
  })

  it('an answer the model was not sure of is the read\'s none', () => {
    const { rows } = rowsOf([classify(q(1, 'is the proflex xc good', V2))], [answer(1, 'named', { products: [code(P('Pro-Flex XC'))], words: 'proflex xc', sure: false })])
    expect(rows.map((r) => r.placement)).toEqual(['none'])
  })

  it('refuses an answer outside the batch, a repeat, an unknown code, a category answer with no category', () => {
    const items = [classify(q(1, 'a', V2)), classify(q(2, 'b', V2)), classify(q(3, 'c', V2))]
    const { rows, unplaced } = rowsOf(items, [
      answer(0, 'none'), answer(9, 'none'), answer(1, 'named', { products: ['P99'], words: 'a' }),
      answer(2, 'unbranded', { category: null, words: 'b' }), answer(3, 'none'), answer(3, 'unbranded', { category: 'C1', words: 'c' }),
    ])
    expect(rows.map((r) => [r.comment_id, r.placement])).toEqual([['c3', 'none']])
    expect(unplaced).toBe(2)
  })
})

describe('confirmRows: one yes or no a word, a row a text', () => {
  const qs = confirmQuestions(generic)
  it('a yes places the word\'s own target; a text with no yes is one none row', () => {
    const { rows } = confirmRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, questions: qs, answers: [{ n: 1, means: true }, { n: 2, means: false }, { n: 3, means: false }] })
    expect(rows).toEqual([
      expect.objectContaining({ method: 'confirmed', model: PRODUCT_CONFIRM_MODEL, placement: 'named', product_id: P('Unity'), group_id: G('Sockets'), comment_id: 'g1' }),
      expect.objectContaining({ method: 'confirmed', placement: 'none', product_id: null, group_id: null, comment_id: 'g2' }),
    ])
  })

  it('a generic category word, confirmed, is the category in general', () => {
    const { rows } = confirmRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, questions: qs, answers: [{ n: 1, means: false }, { n: 2, means: true }, { n: 3, means: false }] })
    expect(rows.find((r) => r.comment_id === 'g2')).toMatchObject({ placement: 'unbranded', group_id: G('Sockets'), product_id: null })
  })

  it('a text with a question unanswered writes nothing and is asked again', () => {
    const { rows, unplaced } = confirmRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, questions: qs, answers: [{ n: 1, means: true }, { n: 3, means: true }] })
    expect(rows.map((r) => r.comment_id)).toEqual(['g1'])
    expect(unplaced).toBe(1)
  })

  it('a content item writes a content row with its field', () => {
    const plan = planRules(OSSUR_CLIENT_ID, compiled, [{ videoId: V, field: 'caption', text: 'Unity vacuum demo' }], [])
    const { rows } = confirmRows({ clientId: OSSUR_CLIENT_ID, version: FIXTURE_CATALOGUE.version, questions: confirmQuestions(plan.confirm), answers: [{ n: 1, means: true }] })
    expect(plan.confirm[0].key).toBe(contentKey(V))
    expect(rows[0]).toMatchObject({ source: 'content', field: 'caption', comment_id: null, comment_month: null, method: 'confirmed' })
  })
})

describe('the checks\' name matching', () => {
  it('squashes a name to letters and digits, accents dropped', () => {
    expect(squashName('Pro-Flex XC')).toBe('proflexxc')
    expect(squashName('Össur')).toBe('ossur')
  })
  it('one slip: a letter added, dropped or changed', () => {
    for (const [a, b] of [['proprio', 'propio'], ['rheoknee', 'reoknee'], ['liner', 'lainer'], ['cheetah', 'cheeta']]) expect(withinOneEdit(a, b), `${a} ${b}`).toBe(true)
    // a swap of two letters is two slips, and is not taken
    for (const [a, b] of [['liner', 'lady'], ['rheoknee', 'rhoeknee']]) expect(withinOneEdit(a, b), `${a} ${b}`).toBe(false)
  })
  // On the real seed's names (scripts/seeds/ossur-products.ts): the fresh check's cases (13 Oct).
  const ossur = compileCatalogue(seedCatalogue(OSSUR_PRODUCTS), OSSUR_CLIENT_ID)
  const alias = (name: string) => ossur.aliases.find((a) => a.alias.toLowerCase() === name.toLowerCase())!
  it('a whole word, as the rules read it: never inside another word', () => {
    for (const [words, name] of [['what action do you take', 'CTi'], ['it is a function', 'CTi'], ['sealing the deal', 'Seal-In'], ['my bracelet', 'brace'], ['my phone pocket', 'socket'], ['my liver hurts', 'liner']]) {
      expect(wordsName(words, alias(name)), `${words} / ${name}`).toBe(false)
    }
    for (const [words, name] of [['the CTi brace', 'CTi'], ['my seal in liner', 'Seal-In'], ['knee braces', 'brace'], ['the liners', 'liner']]) {
      expect(wordsName(words, alias(name)), `${words} / ${name}`).toBe(true)
    }
  })
  it('one slip only on a one-word name, the longer word six letters or more, the same first letter', () => {
    expect(wordsName('una prótesis con lainer', alias('liner'))).toBe(true)
    expect(wordsName('my propio is charging', alias('Proprio'))).toBe(true)
    expect(wordsName('rhoe knee', alias('Rheo'))).toBe(false)
    expect(wordsName('pocket', alias('socket'))).toBe(false)
    expect(wordsName('', alias('liner'))).toBe(false)
  })
})

describe('pricing', () => {
  it('counts about four characters a token for Latin script and one and a half for CJK', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateTokens('漢'.repeat(150))).toBe(100)
  })

  it('prices a call from its prompt and its items\' most output, at its model\'s rate', () => {
    const e = estimateBatchUsd('s'.repeat(4000), 'u'.repeat(4000), 25)
    expect(e.input).toBe(2012)
    expect(e.output).toBe(25 * 40 + 10)
    expect(e.usd).toBeCloseTo((2012 * 0.4 + 1010 * 1.6) / 1e6, 10)
    const c = estimateBatchUsd('s'.repeat(4000), 'u'.repeat(4000), 25, 'confirm')
    expect(c.usd).toBeCloseTo((2012 * 2 + (25 * 15 + 10) * 8) / 1e6, 10)
    expect([modelFor('classify'), modelFor('confirm')]).toEqual(['gpt-4.1-mini', 'gpt-4.1'])
  })

  it('batches CLASSIFY_BATCH items a call; the confirm calls come first and keep a text\'s words together', () => {
    expect(CLASSIFY_BATCH).toBe(25)
    expect(batchItems(Array.from({ length: 60 }, (_, i) => i)).map((b) => b.length)).toEqual([25, 25, 10])
    const calls = planCalls([classify(q(1, 'x')), { kind: 'confirm', item: generic[1] }, { kind: 'confirm', item: generic[0] }], { clientName: 'Össur', catalogue: FIXTURE_CATALOGUE, compiled, videos })
    expect(calls.map((c) => [c.kind, c.items.length, c.questions?.length ?? null])).toEqual([['confirm', 2, 3], ['classify', 1, null]])
    expect(callUsd(calls[0]).usd).toBeGreaterThan(0)
  })
})

describe('runClassifier: the calls, the hard cap and the clock', () => {
  const items = Array.from({ length: 60 }, (_, i) => classify(q(i, `comment ${i} about my prostetic liner`, V2)))
  const answerAll: Classifier = async ({ user }) => ({
    answers: [...user.matchAll(/^(\d+)\. /gm)].map((m) => answer(Number(m[1]), 'unbranded', { category: 'C1', words: 'prostetic liner' })),
    usage: { prompt_tokens: 1000, completion_tokens: 500 }, durationMs: 1,
  })
  const base = { admin: null, clientId: OSSUR_CLIENT_ID, runId: null, clientName: 'Össur', catalogue: FIXTURE_CATALOGUE, compiled, videos }

  it('asks every item, writes each call\'s rows as it returns, and spends what the usage says', async () => {
    const written: number[] = []
    const r = await runClassifier({ ...base, items, budgetUsd: 1, classifier: answerAll, parallel: 2, write: async (rows) => { written.push(rows.length) } })
    expect(r).toMatchObject({ asked: 60, answered: 60, unplaced: 0, deferred: 0, failed: 0, failedCalls: 0 })
    expect(written).toEqual([25, 25, 10])
    expect(r.costUsd).toBeCloseTo(3 * (1000 * 0.4 + 500 * 1.6) / 1e6, 10)
    expect(h.parse).not.toHaveBeenCalled()
  })

  it('asks the confirm with its own call shape, on gpt-4.1', async () => {
    const seen: string[] = []
    const r = await runClassifier({
      ...base, items: [{ kind: 'confirm', item: generic[0] }], budgetUsd: 1,
      classifier: async ({ kind }) => { seen.push(kind); return { answers: [{ n: 1, means: true }], usage: { prompt_tokens: 100, completion_tokens: 10 }, durationMs: 1 } },
    })
    expect(seen).toEqual(['confirm'])
    expect(r.rows).toEqual([expect.objectContaining({ method: 'confirmed', product_id: P('Unity') })])
    expect(r.costUsd).toBeCloseTo((100 * 2 + 10 * 8) / 1e6, 10)
  })

  it('stops before a wave whose worst case would pass the budget, and defers the rest', async () => {
    const one = callUsd(planCalls(items.slice(0, 25), { clientName: 'Össur', catalogue: FIXTURE_CATALOGUE, compiled, videos })[0]).usd
    const call = vi.fn(answerAll)
    const r = await runClassifier({ ...base, items, budgetUsd: one * 1.5, classifier: call, parallel: 1 })
    expect(call).toHaveBeenCalledTimes(1)
    expect(r.deferred).toBe(35)
  })

  it('stops at the clock, and never lets a call wait past it', async () => {
    let t = 0
    const timeouts: (number | undefined)[] = []
    const call = vi.fn(async (req: Parameters<Classifier>[0]) => { timeouts.push(req.timeoutMs); t += 30_000; return answerAll(req) })
    const r = await runClassifier({ ...base, items, budgetUsd: 10, classifier: call, parallel: 1, deadline: 65_000, now: () => t })
    // 65 s left: a call capped at 60 s; 35 s left: capped at 35 s; 5 s left: under the 10 s floor, the rest waits
    expect(timeouts).toEqual([60_000, 35_000])
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

  it('an answer that does not parse is dropped, and its item asked again', async () => {
    const r = await runClassifier({
      ...base, items: items.slice(0, 2), budgetUsd: 1,
      classifier: async () => ({ answers: [{ n: 1, placement: 'maybe' }, answer(2, 'none')], usage: { prompt_tokens: 10, completion_tokens: 10 }, durationMs: 1 }),
    })
    expect(r).toMatchObject({ answered: 1, unplaced: 1 })
  })
})
