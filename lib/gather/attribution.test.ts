import { beforeEach, describe, expect, it, vi } from 'vitest'

// The model is a stub: these tests are about what the judge is SHOWN, how an
// answer becomes a tag, and what happens to a video when no verdict comes back.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse } } } }))

import { ATTRIBUTION_JUDGE, attributeVideos, buildSystemPrompt, buildUserPrompt, proofIsShown, type AttrCandidate } from './attribution'
import { ATTRIBUTION_MODEL } from '../config'
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

/** A tenant with none of Sealand's names — the prompt is shared by every tenant. */
const ossur: GatherConfig = {
  ...config,
  brand_keywords: ['össur'],
  competitor_names: ['Ottobock', 'Fillauer'],
  competitor_keywords: [],
  industry_keywords: ['prosthetic knee', 'running blade'],
  exclude_terms: [],
}

const cand = (id: string, caption: string, o: Partial<AttrCandidate> = {}): AttrCandidate => ({
  video_id: id,
  account_name: 'someone',
  caption,
  hashtags: [],
  ...o,
})

/** A v3 answer: a verdict per index; a tag is marked ABOUT with a proof unless
 *  the test says otherwise. */
const answer = (verdicts: { index: number; entity: string; proof?: string; about?: boolean; subject?: string }[]) => ({
  choices: [{
    message: {
      parsed: {
        verdicts: verdicts.map((v) => ({
          index: v.index,
          subject: v.subject ?? 's',
          candidates: v.entity === 'NONE' ? [] : [{ label: v.entity, sense: '', about: v.about ?? true, proof: v.proof ?? '' }],
          entity: v.entity,
        })),
      },
    },
  }],
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
    const prompt = buildUserPrompt([{ cand: cand('v1', rosenheim), labels: ['Freitag', 'NONE'] }])
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(JSON.stringify(prompt)).not.toMatch(/\\ud8/i)
  })

  it('strips a stray surrogate already present in the account or a hashtag', () => {
    const prompt = buildUserPrompt([
      { cand: cand('v1', 'bag', { account_name: 'freibag\uD83D', hashtags: ['#freitag\uDC5C', '#bag'] }), labels: ['Freitag', 'NONE'] },
    ])
    expect(LONE_SURROGATE.test(prompt)).toBe(false)
    expect(prompt).toContain('account=freibag |')
    expect(prompt).toContain('hashtags=#freitag #bag')
  })
})

describe('buildUserPrompt — the judge sees the head, and nothing past it', () => {
  // "Top 5 Best Backpacks" (YouTube): the name at character 778 of the
  // description. v2 quoted the words around it (mentions=) and the judge
  // confirmed gear lists off them; v3 shows only the head, so the name is not
  // in front of the judge and "no proof in the text shown" makes it NONE.
  const roundUp = `Top 5 Best Backpacks for travel in 2026. ${'Here is what we tested and why. '.repeat(23)}Number four is the Borealis from The North Face, a daypack with a laptop sleeve. Links below.`

  it('prints no mentions= and no words past the 200th code point', () => {
    expect(roundUp.indexOf('The North Face')).toBeGreaterThan(700)
    const prompt = buildUserPrompt([{ cand: cand('v1', roundUp), labels: ['The North Face', 'NONE'] }])
    expect(prompt).not.toContain('mentions=')
    expect(prompt).not.toContain('Borealis')
    expect(prompt).toContain('candidates=[The North Face, NONE]')
  })

  it('shows the account and the first eight hashtags only', () => {
    const tags = ['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h', '#freitagbag']
    const prompt = buildUserPrompt([{ cand: cand('v1', 'new drop', { account_name: 'freitag.pluto', hashtags: tags }), labels: ['Freitag', 'NONE'] }])
    expect(prompt).toContain('account=freitag.pluto')
    expect(prompt).toContain('hashtags=#a #b #c #d #e #f #g #h')
    expect(prompt).not.toContain('#freitagbag')
  })
})

describe('buildSystemPrompt — v3', () => {
  const prompt = buildSystemPrompt(config)

  it('asks for the subject, then per candidate its other sense, ABOUT or not, and a proof', () => {
    expect(prompt).toContain('first write its subject')
    expect(prompt).toMatch(/- sense: if the name is also an ordinary word, a day, a place or a person/)
    expect(prompt).toContain('- about: true when ABOUT, false when NOT ABOUT')
    expect(prompt).toContain('- proof: for an ABOUT candidate, the shortest exact words')
    expect(prompt).toContain('No proof in the text shown → NOT ABOUT.')
  })

  it('carries each failure class the gold set showed', () => {
    expect(prompt).toContain('only the COMPANY counts as proof') // homonyms
    expect(prompt).toContain('a round-up, top-N list') // round-ups, gear and outfit lists, affiliate links
    expect(prompt).toContain('a comparison of this company against another brand') // A vs B
    expect(prompt).toContain('other brands named in the text count, whether or not they are candidates')
    expect(prompt).toContain('news about the company: a lawsuit') // the company in the news IS about it
  })

  it('is built from the tenant’s config and names no client in its examples', () => {
    expect(prompt).toContain('a brand ("sealand gear") and its competitors (Cotopaxi, Freitag, Rareform, The North Face, Patagonia, Freedom of Movement, Old School)')
    expect(prompt).toContain('They make: eco backpack, upcycled bag, travel gear.')
    const other = buildSystemPrompt(ossur)
    expect(other).toContain('They make: prosthetic knee, running blade.')
    for (const name of ['sealand', 'Cotopaxi', 'Freitag', 'Patagonia', 'North Face', 'bags, clothing']) expect(other).not.toContain(name)
  })

  it('renders the client’s exclusions as senses, and none when there are none', () => {
    expect(prompt).toContain('Senses of the names this client has flagged as NOT the company: argentina, chile,')
    expect(buildSystemPrompt(ossur)).not.toContain('flagged as NOT the company')
  })
})

describe('proofIsShown — the deterministic half of "no proof → NOT ABOUT"', () => {
  const amy = cand('amy', 'Such a nice size backpack that holds a lot. Great brand and designs. Perfect backpack #hiking #backtoschoolshopping #backpack #cotopaxi #tiktokshopcreatorpicks')

  it('accepts a proof stitched from pieces of what was shown', () => {
    expect(proofIsShown('Great brand and designs. Perfect backpack #cotopaxi', amy)).toBe(true)
    expect(proofIsShown('Perfect backpack … #cotopaxi', amy)).toBe(true)
  })

  it('refuses an empty proof, and one the judge could not have read', () => {
    expect(proofIsShown('', amy)).toBe(false)
    expect(proofIsShown('Cotopaxi Allpa 35L review', amy)).toBe(false)
    // The name sits past the 200-code-point head: quoting it is quoting
    // something the judge was never shown.
    const deep = cand('deep', `${'Packing for the trip. '.repeat(12)}Hip pack: Cotopaxi Kapai 1.5L`)
    expect(proofIsShown('Hip pack: Cotopaxi Kapai', deep)).toBe(false)
  })

  it('reads styled letters, accents and case as the plain text they show', () => {
    expect(proofIsShown('F41 HAWAII FIVE-O', cand('th', '𝐅𝟒𝟏 𝐇𝐀𝐖𝐀𝐈𝐈 𝐅𝐈𝐕𝐄-𝐎 (𝐂𝐡𝐚𝐫𝐜𝐨𝐚𝐥 𝐆𝐫𝐚𝐲)'))).toBe(true)
    expect(proofIsShown('ossur rheo knee', cand('o', 'The ÖSSUR Rheo Knee after a month'))).toBe(true)
  })
})

describe('attributeVideos — a verdict becomes a tag only with ABOUT and a shown proof', () => {
  it('runs the v3 judge on its own model', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, entity: 'Freitag', proof: 'unboxing my new freitag bag' }]))
    const r = await attributeVideos([cand('bag', 'unboxing my new freitag bag from the Zurich store')], { method: 'gpt', config })
    expect(ATTRIBUTION_MODEL).toBe('gpt-4.1')
    expect(parse.mock.calls[0][0].model).toBe(ATTRIBUTION_MODEL)
    expect(ATTRIBUTION_JUDGE.version).toBe('attribution_v3')
    expect(r.tags.get('bag')).toEqual(rival('Freitag'))
    expect(r.reasons.get('bag')).toBe('s — "unboxing my new freitag bag"')
  })

  it('makes a label the model did not mark ABOUT, or proved with unshown words, NONE — and counts it', async () => {
    parse.mockResolvedValueOnce(answer([
      { index: 0, entity: 'Freitag', about: false, proof: 'FREITAG PARTY' },
      { index: 1, entity: 'Cotopaxi', proof: 'Cotopaxi Allpa 35L — main travel backpack' },
      { index: 2, entity: 'Patagonia', proof: '' },
    ]))
    const r = await attributeVideos([
      cand('party', 'FREITAG PARTY PEOPLE 🎉'),
      cand('gear', `VLOG | Hanoi street food 🇻🇳 ${'Our travel gear, all linked below. '.repeat(6)}Cotopaxi Allpa 35L — main travel backpack`),
      cand('hat', 'Patagonia cap'),
    ], { method: 'gpt', config })
    expect(r.tags.get('party')).toEqual(UNTAGGED)
    expect(r.tags.get('gear')).toEqual(UNTAGGED)
    expect(r.tags.get('hat')).toEqual(UNTAGGED)
    expect(r.rejected).toBe(3)
    expect(r.fallbackIds.size).toBe(0)
    expect(r.reasons.get('party')).toContain('not marked ABOUT')
    expect(r.reasons.get('gear')).toContain('proof not in the text shown')
  })

  it('never trusts a label that was not a candidate', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, entity: 'Osprey', proof: 'Osprey Farpoint 40' }]))
    const r = await attributeVideos([cand('o', 'Osprey Farpoint 40 vs Cotopaxi Allpa')], { method: 'gpt', config })
    expect(r.tags.get('o')).toEqual(UNTAGGED)
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
    parse.mockResolvedValueOnce(answer([{ index: 3, entity: 'Freitag', proof: 'my new freitag bag' }]))
    const r = await attributeVideos([...homonyms, ...genuine], { method: 'gpt', config })
    expect(r.failedBatches).toBe(0)
    expect(r.tags.get('bag')).toEqual(rival('Freitag')) // the verdict
    expect(r.tags.get('beni')).toEqual(UNTAGGED)        // skipped → strict
    expect(r.tags.get('own')).toEqual(CLIENT)           // skipped → brand keyword
    expect([...r.fallbackIds].sort()).toEqual(['beni', 'live', 'otto', 'own'])
    expect(r.errors[0]).toContain('no verdict for 4 of 5')
  })

  // A refusal or an empty parse returns without throwing; it answered nothing
  // and was counted nowhere.
  it('counts a batch that answers nothing as FAILED, not only its fallbacks', async () => {
    parse.mockResolvedValueOnce(answer([]))
    const r = await attributeVideos([...homonyms, ...genuine], { method: 'gpt', config })
    expect(r.failedBatches).toBe(1)
    expect(r.errors).toEqual(['batch 1 of 1 (5 videos): no verdicts returned'])
    expect(r.fallbackIds.size).toBe(5)
    expect(r.tags.get('otto')).toEqual(UNTAGGED)
    parse.mockResolvedValueOnce({ choices: [{ message: { parsed: null, refusal: 'no' } }] })
    const refused = await attributeVideos([...homonyms, ...genuine], { method: 'gpt', config })
    expect(refused.failedBatches).toBe(1)
  })

  it('counts a verdict that leaves a video untagged as a rejection', async () => {
    parse.mockResolvedValueOnce(answer([{ index: 0, entity: 'NONE' }, { index: 1, entity: 'Freitag', proof: 'my new freitag bag' }]))
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

describe('attributeVideos — the exclusions still have the last word over a verdict', () => {
  it('strips a GPT "Cotopaxi" on the volcano, and keeps one that @-mentions the company', async () => {
    parse.mockResolvedValueOnce(answer([
      { index: 0, entity: 'Cotopaxi', proof: '#cotopaxi' },
      { index: 1, entity: 'Cotopaxi', proof: '@COTOPAXI apparel and backpack' },
    ]))
    const r = await attributeVideos([
      cand('alexa', '', { account_name: 'alexa', hashtags: ['#cotopaxi', '#ecuador', '#travel'] }),
      cand('joel', '@COTOPAXI apparel and backpack at Cotopaxi volcano in Ecuador', { account_name: 'JoelWestBarish' }),
    ], { method: 'gpt', config })
    expect(r.tags.get('alexa')).toEqual(UNTAGGED)
    expect(r.tags.get('joel')).toEqual(rival('Cotopaxi'))
    expect(r.rejected).toBe(1)
  })
})
