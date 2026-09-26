import { describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { SEGMENT_HINTS } from './hints'
import {
  JUDGE_ROLES, ROLE_SEGMENT, SEGMENT_JUDGE_BATCH, SEGMENT_JUDGE_BATCHES_PER_STEP, SEGMENT_JUDGE_MODEL, SEGMENT_JUDGE_TIMEOUT_MS,
  SEGMENT_JUDGE_VERSION, SEGMENT_STEP_BUDGET_MS, buildJudgeSystemPrompt, buildJudgeUserPrompt, judgeReason, judgeSegmentBatch,
  judgeText, projectJudgeCost, roleOfReason, segmentJudgeBatches, segmentJudgeSteps,
  type SegmentCandidate, type SegmentJudgeClient,
} from './judge'

// The segment judge, offline: every call goes to a mock. No test here, and no
// path in the module, builds an OpenAI client.
//
// The videos are the research's own hand-labelled kinds (CQ §C facts 19–20,
// staging, 24 Sep): a jean-to-bag sewing tutorial (maker), poker found by
// "poler" and a Navy SEAL podcast found by "sealand gear" (off-topic), an
// r/onebag daypack thread (buyer). Counts are staging's: 5,256 stored Sealand
// videos, labelled by segments_v1 as market 3,458, maker 1,301, noise 497
// (WP1.4's apply, 26 Sep).

const V = (n: number, over: Partial<SegmentCandidate> = {}): SegmentCandidate => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  platform: 'youtube', account_name: `account ${n}`, caption: `video ${n}`, hashtags: [],
  ...over,
})

type Verdict = { index: number; role: string; why: string }

/** A mock client whose one call answers with these verdicts. */
function mockClient(answer: { verdicts: Verdict[] } | null | Error, usage = { prompt_tokens: 4_000, completion_tokens: 1_200 }) {
  const parse = vi.fn(async (_body: unknown, _opts?: unknown) => {
    if (answer instanceof Error) throw answer
    return { choices: [{ message: { parsed: answer, refusal: null } }], usage }
  })
  return { client: { chat: { completions: { parse } } } as unknown as SegmentJudgeClient, parse }
}

describe('the roles and what they mark', () => {
  it('asks the plan’s five roles, relative to the buyer (CQ F105)', () => {
    expect(JUDGE_ROLES).toEqual(['buyer', 'buyer-adjacent', 'maker', 'off-topic', 'other'])
    expect(SEGMENT_JUDGE_VERSION).toBe('segments_v2')
    expect(SEGMENT_JUDGE_MODEL).toBe('gpt-4.1-mini')
  })

  it('marks only maker and off-topic: buyer, buyer-adjacent and other stay the market', () => {
    expect(ROLE_SEGMENT).toEqual({ buyer: 'market', 'buyer-adjacent': 'market', maker: 'maker', 'off-topic': 'noise', other: 'market' })
  })

  it('keeps the role in the reason, and reads it back', () => {
    for (const r of JUDGE_ROLES) expect(roleOfReason(judgeReason(r))).toBe(r)
    expect(judgeReason('buyer-adjacent')).toBe('judge_role:buyer-adjacent')
    expect(roleOfReason('maker_regex:sewing')).toBeNull()
    expect(roleOfReason('judge_role:shopper')).toBeNull()
    expect(roleOfReason(null)).toBeNull()
  })
})

describe('the time bound: a step never outruns its 300 s', () => {
  it('two batches a step, each capped at 120 s, is inside the route cap', () => {
    expect(SEGMENT_JUDGE_BATCH).toBe(50)
    expect(SEGMENT_STEP_BUDGET_MS).toBe(300_000)
    expect(SEGMENT_JUDGE_TIMEOUT_MS * SEGMENT_JUDGE_BATCHES_PER_STEP).toBeLessThan(SEGMENT_STEP_BUDGET_MS)
  })

  it('splits staging’s 5,256 stored videos into 106 batches over 53 steps', () => {
    const all = Array.from({ length: 5_256 }, (_, i) => i)
    const batches = segmentJudgeBatches(all)
    expect(batches).toHaveLength(106)
    expect(batches.every((b) => b.length <= SEGMENT_JUDGE_BATCH)).toBe(true)
    expect(batches.at(-1)).toHaveLength(5_256 - 105 * 50)
    const steps = segmentJudgeSteps(all)
    expect(steps).toHaveLength(53)
    expect(steps.every((s) => s.length <= SEGMENT_JUDGE_BATCHES_PER_STEP)).toBe(true)
    expect(steps.flat(2)).toEqual(all)
    expect(segmentJudgeSteps([])).toEqual([])
  })

  it('sends the call with the 120 s timeout and no SDK retry', async () => {
    const { client, parse } = mockClient({ verdicts: [{ index: 0, role: 'buyer', why: 'daypack question' }] })
    await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: [V(1)], client })
    expect(parse).toHaveBeenCalledTimes(1)
    const [body, opts] = parse.mock.calls[0] as [{ model: string; temperature: number; messages: { role: string }[]; response_format: { type: string } }, unknown]
    expect(opts).toEqual({ timeout: 120_000, maxRetries: 0 })
    expect(body.model).toBe('gpt-4.1-mini')
    expect(body.temperature).toBe(0)
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(body.response_format.type).toBe('json_schema')
  })

  it('refuses an oversized batch or a duplicated video before any call', async () => {
    const { client, parse } = mockClient({ verdicts: [] })
    await expect(judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: Array.from({ length: 51 }, (_, i) => V(i)), client }))
      .rejects.toThrow(/at most 50/)
    await expect(judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: [V(1), V(1)], client })).rejects.toThrow(/twice/)
    expect(parse).not.toHaveBeenCalled()
  })
})

describe('judgeSegmentBatch', () => {
  const batch = [
    V(1, { caption: 'Jeans to bag sewing tutorial', hashtags: ['#upcycling'] }),
    V(2, { caption: 'Poker night highlights', account_name: 'poler poker' }),
    V(3, { platform: 'reddit', caption: 'r/onebag: which daypack for Japan' }),
    V(4, { caption: 'Navy SEAL podcast, episode 12' }),
  ]

  it('maps each role to its segment, with method judge’s reason, and prices the call', async () => {
    const { client } = mockClient({
      verdicts: [
        { index: 0, role: 'maker', why: 'a sewing how-to' },
        { index: 1, role: 'off-topic', why: 'poker, not bags' },
        { index: 2, role: 'buyer', why: 'choosing a daypack' },
        { index: 3, role: 'off-topic', why: 'a military podcast' },
      ],
    })
    const r = await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: batch, client })
    expect(r.error).toBeNull()
    expect(r.missing).toEqual([])
    expect(r.judgements.map((j) => [j.videoId, j.role, j.segment, j.reason])).toEqual([
      [batch[0].id, 'maker', 'maker', 'judge_role:maker'],
      [batch[1].id, 'off-topic', 'noise', 'judge_role:off-topic'],
      [batch[2].id, 'buyer', 'market', 'judge_role:buyer'],
      [batch[3].id, 'off-topic', 'noise', 'judge_role:off-topic'],
    ])
    expect(r.usage).toEqual({ prompt_tokens: 4_000, completion_tokens: 1_200 })
    // gpt-4.1-mini at $0.40 in and $1.60 out per million (lib/config.ts MODEL_PRICING)
    expect(r.costUsd).toBeCloseTo(0.0016 + 0.00192, 10)
    expect(r.call.model).toBe('gpt-4.1-mini')
    expect(r.call.promptVersion).toBe('segments_v2.p1')
  })

  it('lists a video the model skipped as missing and never guesses it; ignores a stray or repeated index', async () => {
    const { client } = mockClient({
      verdicts: [
        { index: 0, role: 'maker', why: 'sewing' },
        { index: 0, role: 'buyer', why: 'second verdict for the same index' },
        { index: 9, role: 'buyer', why: 'no such video' },
        { index: 2, role: 'buyer', why: 'daypack' },
      ],
    })
    const r = await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: batch, client })
    expect(r.judgements.map((j) => [j.videoId, j.role])).toEqual([[batch[0].id, 'maker'], [batch[2].id, 'buyer']])
    expect(r.missing).toEqual([batch[1].id, batch[3].id])
  })

  it('never fails open: a thrown call or an unparsed answer labels nothing', async () => {
    const thrown = await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: batch, client: mockClient(new Error('Request timed out.')).client })
    expect(thrown.error).toBe('Request timed out.')
    expect(thrown.judgements).toEqual([])
    expect(thrown.missing).toEqual(batch.map((c) => c.id))

    const empty = await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: batch, client: mockClient(null).client })
    expect(empty.error).toBe('no parsed answer')
    expect(empty.judgements).toEqual([])
    expect(empty.missing).toHaveLength(4)
  })

  it('makes no call for an empty batch', async () => {
    const { client, parse } = mockClient({ verdicts: [] })
    const r = await judgeSegmentBatch({ clientId: SEALAND_CLIENT_ID, candidates: [], client })
    expect(parse).not.toHaveBeenCalled()
    expect(r.judgements).toEqual([])
    expect(r.costUsd).toBe(0)
  })

  it('refuses a tenant with no hints: it is not judged', async () => {
    const { client, parse } = mockClient({ verdicts: [] })
    await expect(judgeSegmentBatch({ clientId: '11111111-1111-4111-8111-111111111111', candidates: [V(1)], client }))
      .rejects.toThrow(/no hints/)
    expect(parse).not.toHaveBeenCalled()
  })

  it('reads the tenant’s hints: Össur is judged on prostheses, not bags', async () => {
    const { client, parse } = mockClient({ verdicts: [{ index: 0, role: 'other', why: 'a motivation reel' }] })
    await judgeSegmentBatch({ clientId: OSSUR_CLIENT_ID, candidates: [V(1, { caption: 'Never give up #amputee' })], client })
    const system = (parse.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content
    expect(system).toContain('The market: prostheses and prosthetic care')
    expect(system).toContain('lived experience or inspiration with no product talk')
    expect(system).not.toContain('backpack')
  })

  it('folds in the tenant’s homonyms and a stored market description', async () => {
    const { client, parse } = mockClient({ verdicts: [] })
    await judgeSegmentBatch({
      clientId: SEALAND_CLIENT_ID, candidates: [V(1)], client,
      excludeTerms: [' Cotopaxi volcano ', 'Sealand container line', 'Cotopaxi volcano'],
      marketDescription: 'bags and backpacks for travel',
    })
    const system = (parse.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content
    expect(system).toContain('The market: bags and backpacks for travel.')
    expect(system).toContain('other senses of its names, not the brands: Cotopaxi volcano, Sealand container line.')
  })
})

describe('the prompt', () => {
  it('names the five roles in the tenant’s words, and asks for maker and off-topic only when plain', () => {
    const p = buildJudgeSystemPrompt(SEGMENT_HINTS[SEALAND_CLIENT_ID])
    for (const r of JUDGE_ROLES) expect(p).toContain(`- ${r}: `)
    expect(p).toContain('found by "poler"')
    expect(p).toContain('jeans turned into a bag')
    expect(p).toContain('Use maker and off-topic only when the video makes it plain. When unsure, choose other.')
    expect(p).not.toContain('other senses of its names')
  })

  it('shows the gate’s fields plus the platform, clipped by code point, never the row id', () => {
    const emoji = '🎒'.repeat(250)
    const u = buildJudgeUserPrompt([V(7, { caption: emoji, hashtags: Array.from({ length: 10 }, (_, i) => `#t${i}`) }), V(8, { account_name: null, caption: null, hashtags: null })])
    expect(u).not.toContain(V(7).id)
    const [, first, second] = u.split('\n')
    expect(first).toMatch(/^\[0\] platform=youtube \| account=account 7 \| caption=(🎒){200} \| hashtags=#t0 #t1 #t2 #t3 #t4 #t5 #t6 #t7$/)
    expect(second).toBe('[1] platform=youtube | account=(none) | caption=(none) | hashtags=(none)')
    expect(judgeText('a\n\n  b', 10)).toBe('a b')
    expect(judgeText('\ud83c', 5)).not.toContain('\ud83c')
  })
})

describe('the projection: what the spend would be, with no call', () => {
  it('prices every stored Sealand video at staging’s count inside decision L’s band', () => {
    // Captions the gate's length: 200 characters each, eight tags.
    const vids = Array.from({ length: 5_256 }, (_, i) => V(i, { caption: 'x'.repeat(200), hashtags: Array.from({ length: 8 }, () => '#upcycledbag') }))
    const p = projectJudgeCost(vids, SEGMENT_HINTS[SEALAND_CLIENT_ID])
    expect(p.videos).toBe(5_256)
    expect(p.batches).toBe(106)
    expect(p.steps).toBe(53)
    expect(p.completionTokens).toBe(5_256 * 30)
    // decision L: $0.50–1.00 once. The projection sits inside it for a corpus of this size.
    expect(p.usd).toBeGreaterThan(0.3)
    expect(p.usd).toBeLessThan(1)
  })
})
