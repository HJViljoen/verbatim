import { describe, expect, it, vi } from 'vitest'

// The step reaches no model while BRAND_CONFIRM_ENABLED is off (decision L);
// the one test that turns it on mocks the switch and the judge both.
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in a test') }), confirmOn: false }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))
vi.mock('../config', async (orig) => {
  const real = await orig<typeof import('../config')>()
  return { ...real, brandConfirmEnabled: (id: string) => (h.confirmOn ? true : real.brandConfirmEnabled(id)) }
})

import { brandPattern, brandRulesFor } from '../brands/aliases'
import { SEALAND_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { COTOPAXI, NORTH_FACE, PATAGONIA, SEP, SEP_BRANDS, SEP_MARKET, sepMentions } from '../test/s3-run-brands'
import { planBrandReadings, runBrandMonth } from './brand-readings'

// The deploy-4 `brand-readings` step (WP3.5) on Sealand's September staging
// figures (plan §2.5; lib/test/s3-run-brands.ts): it writes k_any, k_content,
// k_comment, k_organic, n and n_organic per audience, and Patagonia, The North
// Face and Cotopaxi pool to 47 and 33, 36 and 11, 31 and 11 of 654.

const t = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: SEALAND_CLIENT_ID, ...r }))
const rules = brandRulesFor(SEALAND_CLIENT_ID)

function admin(withTable = true, ambiguous = false) {
  const { mentions, firstTerms } = sepMentions()
  // one bare-name hit no strong form backs, for the confirm
  if (ambiguous) mentions[0] = { ...mentions[0], excerpt: 'thrifted patagonia haul at the goodwill bins' }
  const byPattern = new Map(SEP_BRANDS.map((b) => [brandPattern(rules.find((r) => r.brand === b.brand)!, 'are'), b.key]))
  return fakeAdmin({
    tables: {
      ...(withTable ? { month_brand_readings: [] } : {}),
      brand_mentions: [],
      tracking_configs: t([{ competitor_names: ['Patagonia', 'The North Face', 'Cotopaxi'], competitor_keywords: [], competitor_handles: {}, own_handles: {}, brand_keywords: ['sealand gear'], watched_brands: [] }]),
      competitors: t([{ id: PATAGONIA, name: 'Patagonia', retired_at: null }, { id: NORTH_FACE, name: 'The North Face', retired_at: null }, { id: COTOPAXI, name: 'Cotopaxi', retired_at: null }]),
      videos: [], month_denominators: [],
      video_provenance: t([...firstTerms].map(([video_id, first_terms]) => ({ video_id, first_terms }))),
    },
    rpc: {
      brand_mention_candidates: (p) => {
        const key = byPattern.get(String(p.p_pattern))
        return mentions.filter((m) => m.row.brand_key === key).map((m) => ({ video_id: m.row.video_id, source: 'content', field: 'caption', comment_id: null, comment_month: null, excerpt: m.excerpt }))
      },
      market_month_videos: () => SEP_MARKET.map((v) => ({ video_id: v.id, audience: v.audience, platform: v.platform, dated_comments: v.dated })),
    },
  })
}

describe('the brand-readings step', () => {
  it('is a no-op before MF3', async () => {
    const f = admin(false)
    expect((await planBrandReadings(f.client, SEALAND_CLIENT_ID, '2026-10-11T07:00:00.000Z')).months).toEqual([])
    expect((await runBrandMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'r', now: '2026-10-11T07:00:00.000Z', month: SEP })).status).toBe('skipped')
    expect(f.writes).toEqual([])
  })

  it('writes the six counts per audience and brand, §2.5\'s September figures pooled, at $0', async () => {
    const f = admin()
    const judge = vi.fn()
    const r = await runBrandMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-10-11', now: '2026-10-11T07:00:00.000Z', month: SEP, judge })
    expect(r.status).toBe('written')
    expect(r.confirm).toBe('off')
    expect(judge).not.toHaveBeenCalled()
    expect(h.parse).not.toHaveBeenCalled()
    const pooled = (key: string) => {
      const rows = f.tables.month_brand_readings.filter((x) => x.brand_key === key)
      const sum = (c: string) => rows.reduce((s, x) => s + Number(x[c]), 0)
      return [sum('k_any'), sum('k_content'), sum('k_comment'), sum('k_organic'), sum('n'), sum('n_organic')]
    }
    expect(pooled(PATAGONIA)).toEqual([47, 47, 0, 33, 654, 640])
    expect(pooled(NORTH_FACE)).toEqual([36, 36, 0, 11, 654, 629])
    expect(pooled(COTOPAXI)).toEqual([31, 31, 0, 11, 654, 634])
    expect(f.tables.month_brand_readings.every((x) => x.status === 'filling' && x.origin === 'live')).toBe(true)
    expect(f.tables.brand_mentions).toHaveLength(47 + 36 + 31)
    // a replay inserts no mention twice
    await runBrandMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-10-11', now: '2026-10-11T07:00:00.000Z', month: SEP })
    expect(f.tables.brand_mentions).toHaveLength(47 + 36 + 31)
  })

  it('calls the confirm only with the switch on and a judge handed in (both mocked here)', async () => {
    h.confirmOn = true
    try {
      const f = admin(true, true)
      // the mocked judge rejects the one ambiguous hit
      const judge = vi.fn(async (items: readonly { key: string }[]) => ({ verdicts: new Map(items.map((it) => [it.key, false])), costUsd: 0 }))
      const r = await runBrandMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', now: '2026-11-08T07:00:00.000Z', month: SEP, judge })
      expect(r.confirm).toBe('on')
      expect(judge).toHaveBeenCalledTimes(1)
      expect(judge.mock.calls[0][0]).toHaveLength(1)
      expect(f.tables.brand_mentions.filter((m) => m.method === 'rejected')).toHaveLength(1)
      const patagonia = f.tables.month_brand_readings.filter((x) => x.brand_key === PATAGONIA).reduce((s, x) => s + Number(x.k_any), 0)
      expect(patagonia).toBe(46)
      expect(h.parse).not.toHaveBeenCalled()
      const noJudge = await runBrandMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', now: '2026-11-08T07:00:00.000Z', month: SEP })
      expect(noJudge.confirm).toBe('no_judge')
    } finally {
      h.confirmOn = false
    }
  })
})
