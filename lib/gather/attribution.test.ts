import { beforeEach, describe, expect, it, vi } from 'vitest'

// The model is a stub: these tests are about what the judge is SHOWN and what
// happens to a video when no verdict comes back for it.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse } } } }))

import { buildUserPrompt, type AttrCandidate } from './attribution'

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const cand = (id: string, caption: string, o: Partial<AttrCandidate> = {}): AttrCandidate => ({
  video_id: id,
  account_name: 'someone',
  caption,
  hashtags: [],
  ...o,
})

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
