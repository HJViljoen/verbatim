import { beforeEach, describe, expect, it, vi } from 'vitest'

// The model is a stub: these tests are about what the gate SENDS and what it
// does when a call fails, never about a verdict.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse } } } }))

import { buildUserPrompt, classifyRelevance, type RelevanceCandidate } from './relevance'
import type { GatherConfig } from './types'

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const config: GatherConfig = {
  brand_keywords: ['sealand gear'],
  competitor_keywords: ['freitag bag'],
  competitor_names: ['Freitag'],
  industry_keywords: ['upcycled bag'],
  exclude_terms: [],
  platforms: ['youtube'],
  max_videos: 25,
  comment_depth: 50,
  report_period: 'weekly',
  own_handles: {},
  subreddits: [],
}

const cand = (id: string, caption: string, o: Partial<RelevanceCandidate> = {}): RelevanceCandidate => ({
  video_id: id,
  account_name: 'someone',
  caption,
  hashtags: [],
  ...o,
})

const answer = (verdicts: { index: number; relevant: boolean; reason: string }[]) => ({
  choices: [{ message: { parsed: { verdicts } } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
})

beforeEach(() => parse.mockReset())

describe('buildUserPrompt — code-point-safe text', () => {
  // The Rosenheim24 shape: an emoji whose high surrogate sits at UTF-16 unit
  // 199, so `.slice(0, 200)` kept half of it and the whole batch 400'd.
  const rosenheim = `${'x'.repeat(199)}👜 Freitag Einkaufstipp`

  it('never cuts an emoji in half at the 200 mark', () => {
    expect(LONE_SURROGATE.test(rosenheim.slice(0, 200))).toBe(true) // the old cut
    const prompt = buildUserPrompt([cand('v1', rosenheim)])
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(JSON.stringify(prompt)).not.toMatch(/\\ud8/i)
  })

  it('strips a stray surrogate already present in the account or a hashtag', () => {
    const prompt = buildUserPrompt([cand('v1', 'bag', { account_name: 'shop\uD83D', hashtags: ['#bag\uDC5C', '#ok'] })])
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(prompt).toContain('account=shop |')
    expect(prompt).toContain('hashtags=#bag #ok')
  })
})

describe('classifyRelevance — a failed batch', () => {
  it('is counted, and still fails OPEN: every video in it is kept unjudged', async () => {
    parse.mockRejectedValueOnce(new Error('400 failed to parse JSON value'))
    const r = await classifyRelevance([cand('a', 'one'), cand('b', 'two')], { method: 'gpt', config })
    expect(r.failedBatches).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('400')
    expect(r.verdicts.get('a')).toMatchObject({ relevant: true, source: 'default' })
    expect(r.verdicts.get('b')).toMatchObject({ relevant: true, source: 'default' })
  })

  it('counts only the batch that failed — the next one is judged', async () => {
    const many = Array.from({ length: 61 }, (_, i) => cand(`v${i}`, `caption ${i}`))
    parse
      .mockRejectedValueOnce(new Error('400'))
      .mockResolvedValueOnce(answer([{ index: 0, relevant: false, reason: 'news' }]))
    const r = await classifyRelevance(many, { method: 'gpt', config })
    expect(parse).toHaveBeenCalledTimes(2)
    expect(r.failedBatches).toBe(1)
    expect(r.verdicts.get('v0')?.source).toBe('default')
    expect(r.verdicts.get('v60')).toMatchObject({ relevant: false, source: 'gpt' })
  })

  it('reports no failure on a clean run', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, relevant: true, reason: 'bags' }]))
    const r = await classifyRelevance([cand('a', 'one')], { method: 'gpt', config })
    expect(r.failedBatches).toBe(0)
    expect(r.errors).toEqual([])
  })
})
