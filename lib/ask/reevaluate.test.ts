import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaimResult } from './types'

// The weekly `ask-reevaluate` step with the hold in it (walkthrough item 5).
// What matters for the run: the hold holds, a failed evidence read still
// holds, and a hold that throws prints the fresh reading instead of failing
// the check into retries.

const verdictPass = vi.fn()
const fetchInsightsByIds = vi.fn()
vi.mock('./engine', () => ({ verdictPass: (...a: unknown[]) => verdictPass(...a) }))
vi.mock('../quotes', () => ({ fetchInsightsByIds: (...a: unknown[]) => fetchInsightsByIds(...a) }))

const { reevaluatePlanChecks } = await import('./reevaluate')

const claim = (verdict: ClaimResult['verdict'], videos: number, over: Partial<ClaimResult> = {}): ClaimResult => ({
  ref: 'C1',
  claim: 'price is the barrier',
  verdict,
  theySay: verdict === 'silent' ? null : 'they say so',
  conversationCount: verdict === 'silent' ? 0 : videos,
  themeRefs: [],
  insightIds: Array.from({ length: verdict === 'silent' ? 0 : videos }, (_, i) => `i${i}`),
  source: null,
  ...over,
})

/** A chainable stand-in for the admin client: every builder call returns the
 *  chain, awaiting it answers the table's rows, and upserts are recorded. */
function adminWith(tables: Record<string, unknown>, writes: Record<string, unknown>[]) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? null, error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in']) chain[m] = () => chain
      chain.maybeSingle = () => Promise.resolve(result)
      chain.upsert = (row: Record<string, unknown>) => { writes.push(row); return Promise.resolve({ error: null }) }
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return chain
    },
  }
}

const args = { clientId: 'client', runId: 'run-2', runDate: '2026-10-04', companyName: 'Sealand' }

describe('reevaluatePlanChecks — the hold inside the weekly step', () => {
  beforeEach(() => {
    verdictPass.mockReset()
    fetchInsightsByIds.mockReset()
  })

  const run = async (previous: ClaimResult[], fresh: ClaimResult[]) => {
    const writes: Record<string, unknown>[] = []
    verdictPass.mockResolvedValue({ claims: fresh, costUsd: 0.01 })
    const admin = adminWith({
      plan_checks: [{ id: 'pc1', title: 'Plan', claims: previous }],
      plan_check_evaluations: { claims: previous },
    }, writes)
    const out = await reevaluatePlanChecks(admin as never, args)
    return { out, written: writes[0]?.claims as ClaimResult[] | undefined }
  }

  it('keeps a standing verdict that a re-reading calls untested', async () => {
    fetchInsightsByIds.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, source_video_id: `v${i}` })))
    const { out, written } = await run([claim('echoes', 6)], [claim('silent', 0)])
    expect(written?.[0].verdict).toBe('echoes')
    expect(out[0].moved).toEqual([])
  })

  it('still holds when the evidence videos cannot be read', async () => {
    fetchInsightsByIds.mockRejectedValue(new Error('statement timeout'))
    const { out, written } = await run([claim('echoes', 6)], [claim('silent', 0)])
    expect(written?.[0].verdict).toBe('echoes')
    expect(out).toHaveLength(1)
  })

  it('prints the fresh reading, and never fails the check, where the hold throws', async () => {
    fetchInsightsByIds.mockResolvedValue([])
    // A stored claim whose ids are not a list: the hold cannot read it.
    const odd = claim('echoes', 6, { insightIds: 'i0' as unknown as string[] })
    const { out, written } = await run([odd], [claim('contradicts', 5)])
    expect(written?.[0].verdict).toBe('contradicts')
    expect(out[0].moved).toEqual([{ ref: 'C1', claim: 'price is the barrier', from: 'echoes', to: 'contradicts' }])
  })
})
