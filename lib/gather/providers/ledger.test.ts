import { describe, it, expect, vi, beforeEach } from 'vitest'

// The provider ledger's contract (28 Nov 2026): no context, no row; a row
// carries the run and step it ran in; nothing here throws, and a spend read
// that fails answers 0 (the budget is a soft stop).

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  rows: [] as { cost_usd: number | string | null }[],
  readError: null as { message: string } | null,
  throwOnClient: false,
}))
vi.mock('../../supabase-admin', async (orig) => ({
  ...(await orig<object>()),
  createAdminClient: () => {
    if (h.throwOnClient) throw new Error('no client')
    const query = {
      eq: () => query,
      order: () => query,
      abortSignal: () => query,
      range: async (from: number, to: number) => ({ data: h.readError ? null : h.rows.slice(from, to + 1), error: h.readError }),
    }
    return {
      from: () => ({
        insert: async (row: Record<string, unknown>) => { h.inserted.push(row); return { error: h.insertError } },
        select: () => query,
      }),
    }
  },
}))

import { recordProviderCall, providerSpendForRun, tapProviderCalls, type ProviderCallRow } from './ledger'
import { withApifyRunContext } from '../apify-runs'

const ROW: ProviderCallRow = {
  provider: 'tikhub', transport: 'treg', job: 'instagram.hashtag', target: 'bag:reels',
  calls: 3, cost_usd: 0.006000000001, items_seen: 70, items: 12, outcome: 'ok', error: null, duration_ms: 31000,
}

beforeEach(() => {
  h.inserted = []
  h.insertError = null
  h.rows = []
  h.readError = null
  h.throwOnClient = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('recordProviderCall', () => {
  it('writes nothing outside a run context (a script, a dry run)', async () => {
    await recordProviderCall(ROW)
    expect(h.inserted).toHaveLength(0)
  })

  it('writes one row with the run, the step and the cost to the micro-dollar', async () => {
    await withApifyRunContext({ clientId: 'C', runId: 'R', step: 'search:instagram:bag:reels' }, () => recordProviderCall(ROW))
    expect(h.inserted).toEqual([{ ...ROW, client_id: 'C', run_id: 'R', step: 'search:instagram:bag:reels', cost_usd: 0.006 }])
  })

  it('hands every row to a tap, context or not, and still writes nothing without one', async () => {
    const seen: ProviderCallRow[] = []
    tapProviderCalls((r) => seen.push(r))
    await recordProviderCall(ROW)
    tapProviderCalls(() => { throw new Error('tap broke') })
    await expect(recordProviderCall(ROW)).resolves.toBeUndefined()
    tapProviderCalls(null)
    expect(seen).toEqual([ROW])
    expect(h.inserted).toHaveLength(0)
  })

  it('never throws: a refused write and a broken client are logged', async () => {
    h.insertError = { message: 'relation "provider_calls" does not exist' }
    await expect(withApifyRunContext({ clientId: 'C' }, () => recordProviderCall(ROW))).resolves.toBeUndefined()
    h.throwOnClient = true
    await expect(withApifyRunContext({ clientId: 'C' }, () => recordProviderCall(ROW))).resolves.toBeUndefined()
  })
})

describe('providerSpendForRun', () => {
  it('sums the run’s rows (numeric arrives as text from PostgREST)', async () => {
    h.rows = [{ cost_usd: '0.016000' }, { cost_usd: 0.002 }, { cost_usd: null }]
    expect(await providerSpendForRun('R')).toBeCloseTo(0.018, 9)
  })

  it('answers 0 when the read fails, the table missing included', async () => {
    h.readError = { message: 'relation "provider_calls" does not exist' }
    expect(await providerSpendForRun('R')).toBe(0)
  })
})
