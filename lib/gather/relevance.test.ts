import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The model is a stub: these tests are about what the gate SENDS and what it
// does when a call fails, never about a verdict.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse } } } }))

import {
  buildSystemPrompt, buildUserPrompt, classifyRelevance, definitionHash, marketDefinitionOf, RELEVANCE_MARKET_PROMPT, relevancePromptVersion, type RelevanceCandidate,
} from './relevance'
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

// ---- The market definition (5 Nov) -------------------------------------------------
//
// Where a tenant's market_description is set the gate judges by it; where it
// is null (Össur today) the prompt is the one every gather sent before, byte
// for byte. The golden was captured from 8875fe66's buildSystemPrompt for the
// two configs below (lib/test/relevance-golden/legacy-prompts.json).

const GOLDEN = JSON.parse(readFileSync(join(__dirname, '../test/relevance-golden/legacy-prompts.json'), 'utf8')) as { ossur: string; bare: string }
const SEALAND_DEFINITION = readFileSync(join(__dirname, '../../scripts/seeds/sealand-market-description.txt'), 'utf8')

const ossurConfig: GatherConfig = {
  brand_keywords: ['össur', 'ossur'], competitor_keywords: ['ottobock'], competitor_names: ['Ottobock'],
  industry_keywords: ['prosthetics', 'amputee', 'bionic leg', 'prosthetic leg', 'running blade'], exclude_terms: [],
  platforms: ['tiktok', 'youtube', 'instagram', 'reddit'], max_videos: 25, comment_depth: 50, report_period: 'weekly', own_handles: {}, subreddits: [],
}
const bareConfig: GatherConfig = { ...ossurConfig, brand_keywords: [], competitor_names: [], industry_keywords: [], exclude_terms: [' ', 'Cotopaxi the volcano', 'Sealand the micronation '] }
const sealandConfig: GatherConfig = {
  ...config,
  brand_keywords: ['sealand gear', 'sealand bag'],
  competitor_names: ['The North Face', 'Patagonia', 'Cotopaxi', 'Freitag'],
  industry_keywords: ['handmade bag', 'sustainable fashion', 'travel gear'],
  exclude_terms: ['Sealand the micronation'],
}

describe('buildSystemPrompt: no market description is the old prompt, byte for byte', () => {
  it('Össur (no description) gets exactly the bytes it got before', () => {
    expect(buildSystemPrompt(ossurConfig)).toBe(GOLDEN.ossur)
    expect(buildSystemPrompt(bareConfig)).toBe(GOLDEN.bare)
  })
  it('null, absent, empty and blank descriptions are all no description', () => {
    for (const market_description of [null, undefined, '', '   \n\t ']) {
      expect(buildSystemPrompt({ ...ossurConfig, market_description })).toBe(GOLDEN.ossur)
      expect(buildSystemPrompt({ ...bareConfig, market_description })).toBe(GOLDEN.bare)
    }
  })
  it('and the call sends that prompt, labelled as before', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, relevant: true, reason: 'legs' }]))
    const r = await classifyRelevance([cand('a', 'my new leg')], { method: 'gpt', config: { ...ossurConfig, market_description: null } })
    expect(parse.mock.calls[0][0].messages[0]).toEqual({ role: 'system', content: GOLDEN.ossur })
    expect(r.promptVersion).toBe('relevance_gpt')
  })
})

describe('buildSystemPrompt: a defined market is judged by its definition', () => {
  const prompt = buildSystemPrompt({ ...sealandConfig, market_description: SEALAND_DEFINITION })

  it('carries the whole definition, trimmed, and the brand, rivals and homonyms', () => {
    expect(prompt).toContain(SEALAND_DEFINITION.trim())
    expect(prompt).toContain('Brand: sealand gear. Competitors: The North Face, Patagonia, Cotopaxi, Freitag.')
    expect(prompt).toContain('For THIS client, matches about any of these are NOT about the brand: Sealand the micronation.')
    expect(prompt).toContain('NAME HOMONYM')
  })
  it('drops the broad-category framing, "when unsure, KEEP" and the search terms as the category', () => {
    expect(prompt).not.toMatch(/BROAD product category/)
    expect(prompt).not.toMatch(/When unsure, KEEP/)
    expect(prompt).not.toMatch(/Category \(brand’s framing\)/)
    expect(prompt).not.toContain('sustainable fashion, travel gear')
    expect(prompt).not.toMatch(/ANY content about the brand or a competitor/)
  })
  it('is the definition the call sends', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, relevant: false, reason: 'crochet tutorial' }]))
    const r = await classifyRelevance([cand('a', 'crochet bag tutorial')], { method: 'gpt', config: { ...sealandConfig, market_description: SEALAND_DEFINITION } })
    expect(parse.mock.calls[0][0].messages[0]).toEqual({ role: 'system', content: prompt })
    expect(r.promptVersion).toBe(relevancePromptVersion('gpt', { market_description: SEALAND_DEFINITION }))
  })
})

describe('relevancePromptVersion: which definition judged', () => {
  it('is unchanged without a definition, and for the methods that send no prompt', () => {
    expect(relevancePromptVersion('gpt', { market_description: null })).toBe('relevance_gpt')
    expect(relevancePromptVersion('gpt', {})).toBe('relevance_gpt')
    expect(relevancePromptVersion('heuristic', { market_description: SEALAND_DEFINITION })).toBe('relevance_heuristic')
    expect(relevancePromptVersion('off', { market_description: SEALAND_DEFINITION })).toBe('relevance_off')
  })
  it('names the definition by a short hash of its words, so it changes when they do', () => {
    const v = relevancePromptVersion('gpt', { market_description: SEALAND_DEFINITION })
    expect(v).toBe(`relevance_gpt·${RELEVANCE_MARKET_PROMPT}·${definitionHash(SEALAND_DEFINITION.trim())}`)
    expect(v).toMatch(/^relevance_gpt·market_v1·[0-9a-f]{8}$/)
    expect(relevancePromptVersion('gpt', { market_description: `${SEALAND_DEFINITION} Also tents.` })).not.toBe(v)
  })
  it('reads the words as the prompt does: surrounding space and line endings do not move it', () => {
    const v = relevancePromptVersion('gpt', { market_description: SEALAND_DEFINITION })
    expect(relevancePromptVersion('gpt', { market_description: `\n  ${SEALAND_DEFINITION.replace(/\n/g, '\r\n')}  ` })).toBe(v)
    expect(marketDefinitionOf({ market_description: ' x \r\n y ' })).toBe('x \n y')
  })
  it('the heuristic and off methods report their own versions on the result', async () => {
    const r = await classifyRelevance([cand('a', 'one')], { method: 'heuristic', config: { ...sealandConfig, market_description: SEALAND_DEFINITION } })
    expect(r.promptVersion).toBe('relevance_heuristic')
    expect(parse).not.toHaveBeenCalled()
  })
})
