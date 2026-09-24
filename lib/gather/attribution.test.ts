import { beforeEach, describe, expect, it, vi } from 'vitest'

// The model is a stub: these tests are about what the judge is SHOWN and what
// happens to a video when no verdict comes back for it.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse } } } }))

import { attributeVideos, buildSystemPrompt, buildUserPrompt, mentionSnippets, type AttrCandidate } from './attribution'
import type { GatherConfig } from './types'

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** Sealand's tracking config as of 2026-09-17 (scripts/sealand-config-2026-09-17.ts). */
const config: GatherConfig = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_names: ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School'],
  competitor_keywords: [
    'cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag',
    'north face backpack', 'patagonia black hole', 'fombrand',
  ],
  industry_keywords: ['eco backpack', 'upcycled bag', 'travel gear'],
  exclude_terms: ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'],
  platforms: ['youtube', 'instagram'],
  max_videos: 25,
  comment_depth: 50,
  report_period: 'weekly',
  own_handles: {},
  subreddits: [],
}

const cand = (id: string, caption: string, o: Partial<AttrCandidate> = {}): AttrCandidate => ({
  video_id: id,
  account_name: 'someone',
  caption,
  hashtags: [],
  ...o,
})

const answer = (verdicts: { index: number; entity: string; reason?: string }[]) => ({
  choices: [{ message: { parsed: { verdicts: verdicts.map((v) => ({ reason: 'x', ...v })) } } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
})

const UNTAGGED = { is_client: false, is_competitor: false, competitor_name: null }
const CLIENT = { is_client: true, is_competitor: false, competitor_name: null }
const rival = (name: string) => ({ is_client: false, is_competitor: true, competitor_name: name })

beforeEach(() => parse.mockReset())

describe('buildUserPrompt — code-point-safe text', () => {
  // Rosenheim24, YouTube 2026-09-09: 👜 with its high surrogate at UTF-16 unit
  // 199. The old `.slice(0, 200)` kept half of it, OpenAI 400'd the batch, and
  // all 86 flagged videos fell back to a substring tag.
  const rosenheim = `${'x'.repeat(199)}👜 Freitag Einkaufstipp`

  it('never cuts an emoji in half at the 200 mark', () => {
    expect(LONE_SURROGATE.test(rosenheim.slice(0, 200))).toBe(true) // the old cut
    const prompt = buildUserPrompt([{ cand: cand('v1', rosenheim), labels: ['Freitag', 'NONE'] }], config)
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(JSON.stringify(prompt)).not.toMatch(/\\ud8/i)
  })

  it('strips a stray surrogate already present in the account or a hashtag', () => {
    const prompt = buildUserPrompt([
      { cand: cand('v1', 'bag', { account_name: 'freibag\uD83D', hashtags: ['#freitag\uDC5C', '#bag'] }), labels: ['Freitag', 'NONE'] },
    ], config)
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(prompt).toContain('account=freibag |')
    expect(prompt).toContain('hashtags=#freitag #bag')
  })
})

describe('mentions= — the judge sees the evidence it is asked about', () => {
  // "Top 5 Best Backpacks" (YouTube): the name at character 778 of the
  // description, far past the 200 the judge is shown.
  const roundUp = `Top 5 Best Backpacks for travel in 2026. ${'Here is what we tested and why. '.repeat(23)}Number four is the Borealis from The North Face, a daypack with a laptop sleeve. Links below.`

  it('quotes the words around a candidate name that sits past the visible head', () => {
    expect(roundUp.indexOf('The North Face')).toBeGreaterThan(700)
    const snips = mentionSnippets(cand('v1', roundUp), ['The North Face', 'NONE'], config)
    expect(snips).toHaveLength(1)
    // Cut in front (marked …); the caption ends inside the 60 after it.
    expect(snips[0]).toMatch(/^The North Face: …is what we tested and why\. Number four is the Borealis from The North Face, a daypack with a laptop sleeve\. Links below\.$/)
    const prompt = buildUserPrompt([{ cand: cand('v1', roundUp), labels: ['The North Face', 'NONE'] }], config)
    expect(prompt).toContain('| mentions=[The North Face: …')
  })

  it('adds nothing when the name is already in what the judge is shown', () => {
    const v = cand('v1', 'The North Face Borealis review after a year of commuting')
    expect(mentionSnippets(v, ['The North Face', 'NONE'], config)).toEqual([])
    expect(buildUserPrompt([{ cand: v, labels: ['The North Face', 'NONE'] }], config)).not.toContain('mentions=')
  })

  it('counts the account and the first eight hashtags as shown', () => {
    expect(mentionSnippets(cand('v1', `${'x '.repeat(150)}cotopaxi`, { account_name: 'cotopaxi' }), ['Cotopaxi', 'NONE'], config)).toEqual([])
    expect(mentionSnippets(cand('v1', `${'x '.repeat(150)}cotopaxi`, { hashtags: ['#cotopaxi'] }), ['Cotopaxi', 'NONE'], config)).toEqual([])
  })

  it('names a hashtag past the eighth when that is the only place the name is', () => {
    const tags = ['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h', '#freitagbag']
    expect(mentionSnippets(cand('v1', 'new drop', { hashtags: tags }), ['Freitag', 'NONE'], config)).toEqual(['Freitag: #freitagbag'])
  })

  it('finds the brand by whichever configured keyword is present', () => {
    const v = cand('v1', `${'long intro words '.repeat(20)}and my sealand bag held up`)
    expect(mentionSnippets(v, ['BRAND', 'NONE'], config)[0]).toMatch(/^BRAND: ….*my sealand bag held up$/)
  })

  it('keeps an emoji whole at the snippet edge', () => {
    const v = cand('v1', `${'🎒'.repeat(260)} Freitag bag ${'🎒'.repeat(80)}`)
    const [snip] = mentionSnippets(v, ['Freitag', 'NONE'], config)
    expect(LONE_SURROGATE.test(snip)).toBe(false)
    expect(snip).toContain('Freitag bag')
  })
})

describe('buildSystemPrompt — the v2 rules', () => {
  const prompt = buildSystemPrompt(config)
  it('asks for visible company or product context where the name is also a word, a day, a place or a person', () => {
    expect(prompt).toContain('a common word, a day, a date, a place or a person needs visible sign of the company')
    expect(prompt).toContain('am/ab/diesen/jeden Freitag')
  })
  it('makes a round-up or gear list NONE unless the company is its main subject', () => {
    expect(prompt).toContain('lists, ranks or rounds up many brands')
  })
  it('makes a candidate the judge cannot see NONE', () => {
    expect(prompt).toContain('not visible in the text shown')
  })
})

describe('attributeVideos — no silent substring fallback', () => {
  // YouTube 2026-09-09: one batch 400'd and every name match became a rival.
  const homonyms = [
    cand('beni', 'Freitag 21 .8.2026'),
    cand('otto', 'Freitag ❤️🫶 #food #reels'),
    cand('live', 'Freitag Live … #friday'),
  ]
  const genuine = [
    cand('bag', 'unboxing my new freitag bag from the Zurich store'),
    cand('own', 'packing the sealand bag for the weekend'),
  ]

  it('leaves the homonyms UNTAGGED when the batch throws, and keeps the vouched tags', async () => {
    parse.mockRejectedValueOnce(new Error('400 failed to parse JSON value'))
    const r = await attributeVideos([...homonyms, ...genuine], { method: 'gpt', config })
    expect(r.tags.get('beni')).toEqual(UNTAGGED)
    expect(r.tags.get('otto')).toEqual(UNTAGGED)
    expect(r.tags.get('live')).toEqual(UNTAGGED)
    expect(r.tags.get('bag')).toEqual(rival('Freitag'))
    expect(r.tags.get('own')).toEqual(CLIENT)
    expect(r.failedBatches).toBe(1)
    expect([...r.fallbackIds].sort()).toEqual(['bag', 'beni', 'live', 'otto', 'own'])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('400')
    expect(r.gptJudged).toBe(5)
    expect(r.rejected).toBe(0) // nothing was judged
  })

  it('gives a skipped index the same strict fallback, and says so', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 3, entity: 'Freitag' }]))
    const r = await attributeVideos([...homonyms, ...genuine], { method: 'gpt', config })
    expect(r.failedBatches).toBe(0)
    expect(r.tags.get('bag')).toEqual(rival('Freitag')) // the verdict
    expect(r.tags.get('beni')).toEqual(UNTAGGED)        // skipped → strict
    expect(r.tags.get('own')).toEqual(CLIENT)           // skipped → brand keyword
    expect([...r.fallbackIds].sort()).toEqual(['beni', 'live', 'otto', 'own'])
    expect(r.errors[0]).toContain('no verdict for 4 of 5')
  })

  it('counts a verdict that leaves a video untagged as a rejection', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, entity: 'NONE' }, { index: 1, entity: 'Freitag' }]))
    const r = await attributeVideos([homonyms[0], genuine[0]], { method: 'gpt', config })
    expect(r.rejected).toBe(1)
    expect(r.fallbackIds.size).toBe(0)
    expect(r.errors).toEqual([])
  })

  it('never sends an industry video to the judge', async () => {
    const r = await attributeVideos([cand('x', 'best travel daypacks')], { method: 'gpt', config })
    expect(parse).not.toHaveBeenCalled()
    expect(r.tags.get('x')).toEqual(UNTAGGED)
    expect(r.gptJudged).toBe(0)
  })
})
