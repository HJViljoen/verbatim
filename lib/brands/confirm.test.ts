import { describe, expect, it, vi } from 'vitest'

// The confirm's real judge builds on the OpenAI client; nothing here reaches
// it (decision L: no spend before Heinrich's yes). The judge is mocked.
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { SEALAND_CLIENT_ID } from '../config'
import { PATAGONIA } from '../test/s3-run-brands'
import { brandRulesFor } from './aliases'
import { ambiguousMentions, confirmAmbiguous, confirmRows, CONFIRM_SUFFIX, countedUnlessRejected, hitKey, type ConfirmJudge } from './confirm'
import type { PlannedMention } from './mentions'
import type { ReadBrand } from './readings'

// Ambiguous hits are bare-name matches no strong form backs (plan WP3.5):
// "Patagonia" alone, not "@patagonia" or "Patagonia Black Hole" (the rule's
// own strong forms, lib/brands/aliases.ts).

const patagonia: ReadBrand = { rule: brandRulesFor(SEALAND_CLIENT_ID).find((r) => r.brand === 'Patagonia')!, brandKey: PATAGONIA, ruleVersion: 'brands_v1' }
const hit = (video: string, excerpt: string): PlannedMention => ({
  brand: 'Patagonia', excerpt,
  row: { client_id: 'sealand', video_id: video, brand_key: PATAGONIA, source: 'content', field: 'caption', comment_id: null, comment_month: null, method: 'rule', rule_version: 'brands_v1' },
})
const HITS = [
  hit('v1', 'my patagonia black hole duffel after a year'),
  hit('v2', 'thrifted patagonia haul at the goodwill bins'),
  hit('v3', 'follow @patagonia for the worn wear tour'),
  hit('v4', 'patagonia puffer vs the north face nuptse'),
]

describe('ambiguous hits', () => {
  it('are the bare-name matches no strong form backs', () => {
    expect(ambiguousMentions(HITS, [patagonia]).map((m) => m.row.video_id)).toEqual(['v2', 'v4'])
  })
})

describe('the confirm, with the judge mocked', () => {
  it('asks only about hits no confirm row holds, and writes a verdict as a new row', async () => {
    const judge = vi.fn<ConfirmJudge>(async (items) => ({ verdicts: new Map(items.map((it) => [it.key, !it.excerpt.includes('thrifted')])), costUsd: 0.0004 }))
    const ambiguous = ambiguousMentions(HITS, [patagonia])
    const r = await confirmAmbiguous(ambiguous, judge, new Set([hitKey(HITS[3].row)]))
    expect(judge).toHaveBeenCalledTimes(1)
    expect(judge.mock.calls[0][0].map((i) => i.excerpt)).toEqual(['thrifted patagonia haul at the goodwill bins'])
    expect(r.rows).toEqual([{ ...HITS[1].row, method: 'rejected', rule_version: `brands_v1${CONFIRM_SUFFIX}` }])
    expect(h.parse).not.toHaveBeenCalled()
  })

  it('a rejected hit is not counted; a hit with no verdict is', () => {
    const rows = confirmRows([HITS[1], HITS[3]], new Map([[hitKey(HITS[1].row), false]]))
    const counted = countedUnlessRejected(new Set(rows.filter((r) => r.method === ('rejected' as typeof r.method)).map(hitKey)))
    expect(HITS.filter(counted).map((m) => m.row.video_id)).toEqual(['v1', 'v3', 'v4'])
  })
})
