import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaimResult, Judgement } from './types'

// "What I'd take from that", written again on each weekly re-reading (Heinrich,
// 9 Nov). The rewrite runs inside `ask-reevaluate` after every check's
// verdicts, one call a check, each held to the step's clock, and stores on that
// reading's own row. It never leaves a blank, never fails the step, and spends
// nothing where the column to keep it in is not applied yet.

const verdictPass = vi.fn()
const judgePass = vi.fn()
vi.mock('./engine', () => ({
  verdictPass: (...a: unknown[]) => verdictPass(...a),
  judgePass: (...a: unknown[]) => judgePass(...a),
}))
vi.mock('../quotes', () => ({ fetchInsightsByIds: () => Promise.resolve([]) }))

const { reevaluatePlanChecks, PLAN_JUDGE_CALL_CAP_MS } = await import('./reevaluate')

const claim = (ref: string, verdict: ClaimResult['verdict'], videos: number): ClaimResult => ({
  ref,
  claim: `claim ${ref}`,
  verdict,
  theySay: verdict === 'silent' ? null : 'they say so',
  conversationCount: verdict === 'silent' ? 0 : videos,
  themeRefs: [],
  insightIds: Array.from({ length: verdict === 'silent' ? 0 : videos }, (_, i) => `${ref}-i${i}`),
  source: null,
})

const JUDGEMENT: Judgement[] = [{ text: 'Lead with fit, then price.', basedOnRefs: ['C1'] }]

interface Write { op: 'upsert' | 'update'; row: Record<string, unknown>; filters: string[] }

/** The admin client as the step sees it: two checks, their last readings, the
 *  writes recorded. `judgementColumn: false` answers the probe as PostgREST
 *  does for a column that is not there. */
function admin(writes: Write[], opts: { judgementColumn?: boolean } = {}) {
  const checks = [
    { id: 'pc1', title: 'Plan one', claims: [claim('C1', 'echoes', 9)] },
    { id: 'pc2', title: 'Plan two', claims: [claim('C1', 'contradicts', 7)] },
  ]
  return {
    from(table: string) {
      const filters: string[] = []
      let selected = ''
      let patch: Record<string, unknown> | null = null
      const result = () => {
        if (table === 'plan_checks') return { data: checks, error: null }
        if (selected === 'judgement') {
          return opts.judgementColumn === false
            ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'judgement' column of 'plan_check_evaluations' in the schema cache" } }
            : { data: [], error: null }
        }
        return { data: null, error: null }
      }
      const chain: Record<string, unknown> = {}
      chain.select = (cols: string) => { selected = cols; return chain }
      for (const m of ['neq', 'order', 'limit', 'in']) chain[m] = () => chain
      chain.eq = (col: string, v: unknown) => { filters.push(`${col}=${String(v)}`); return chain }
      chain.maybeSingle = () => Promise.resolve(result())
      chain.upsert = (row: Record<string, unknown>) => { writes.push({ op: 'upsert', row, filters: [] }); return Promise.resolve({ error: null }) }
      chain.update = (p: Record<string, unknown>) => { patch = p; return chain }
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        if (patch) writes.push({ op: 'update', row: patch, filters })
        return Promise.resolve(patch ? { error: null } : result()).then(res, rej)
      }
      return chain
    },
  }
}

const args = { clientId: 'client', runId: 'run-9', runDate: '2026-11-08', companyName: 'Össur' }

describe('ask-reevaluate writes the judgement again on each new reading', () => {
  beforeEach(() => {
    verdictPass.mockReset()
    judgePass.mockReset()
    verdictPass.mockImplementation((_a: unknown, x: { claims: { ref: string }[] }) =>
      Promise.resolve({ claims: x.claims.map((c) => claim(c.ref, 'contradicts', 11)), costUsd: 0.06 }))
  })

  it('makes one call a check on the reading it stored, after every verdict, and keeps it on that reading’s row', async () => {
    const order: string[] = []
    verdictPass.mockImplementation((_a: unknown, x: { claims: { ref: string }[] }) => {
      order.push('verdict')
      return Promise.resolve({ claims: x.claims.map((c) => claim(c.ref, 'contradicts', 11)), costUsd: 0.06 })
    })
    judgePass.mockImplementation(() => { order.push('judge'); return Promise.resolve({ judgement: JUDGEMENT, costUsd: 0.03, ok: true }) })
    const writes: Write[] = []
    const out = await reevaluatePlanChecks(admin(writes) as never, { ...args, judgeBy: null })
    expect(order).toEqual(['verdict', 'verdict', 'judge', 'judge'])
    expect(judgePass).toHaveBeenCalledTimes(2)
    // The judgement reads the reading just STORED, after the hold: plan one's
    // fresh "contradicted" on 11 videos had 2 new ones, so its supported on 9
    // was kept, and that is what the judgement reasons from.
    const [, first] = judgePass.mock.calls[0] as [unknown, { claims: ClaimResult[]; request: unknown; runId: string }]
    expect(first.claims.map((c) => [c.ref, c.verdict, c.conversationCount])).toEqual([['C1', 'echoes', 9]])
    const stored = writes.find((w) => w.op === 'upsert' && w.row.plan_check_id === 'pc1')!.row.claims
    expect(first.claims).toEqual(stored)
    expect(first.runId).toBe('run-9')
    expect(first.request).toEqual({ timeout: PLAN_JUDGE_CALL_CAP_MS, maxRetries: 1 })
    const updates = writes.filter((w) => w.op === 'update')
    expect(updates.map((u) => [u.row, u.filters.sort()])).toEqual([
      [{ judgement: JUDGEMENT }, ['plan_check_id=pc1', 'run_id=run-9']],
      [{ judgement: JUDGEMENT }, ['plan_check_id=pc2', 'run_id=run-9']],
    ])
    // The upload's judgement is never touched: nothing writes `plan_checks`.
    expect(writes.every((w) => w.op === 'upsert' || !('claims' in w.row))).toBe(true)
    expect(out.map((r) => [r.judged, Number(r.costUsd.toFixed(2))])).toEqual([[true, 0.09], [true, 0.09]])
  })

  it('stores nothing where the call fails or comes back empty, and never throws', async () => {
    judgePass
      .mockResolvedValueOnce({ judgement: [], costUsd: 0, ok: false })
      .mockResolvedValueOnce({ judgement: [], costUsd: 0.02, ok: true })
    const writes: Write[] = []
    const out = await reevaluatePlanChecks(admin(writes) as never, { ...args, judgeBy: null })
    expect(writes.filter((w) => w.op === 'update')).toEqual([])
    expect(out.map((r) => r.judged)).toEqual([false, false])
    // The readings themselves are written as before.
    expect(writes.filter((w) => w.op === 'upsert')).toHaveLength(2)

    judgePass.mockReset()
    judgePass.mockRejectedValue(new Error('socket hang up'))
    await expect(reevaluatePlanChecks(admin([]) as never, { ...args, judgeBy: null })).resolves.toHaveLength(2)
  })

  it('makes no call where the column to keep it in is not applied', async () => {
    const writes: Write[] = []
    const out = await reevaluatePlanChecks(admin(writes, { judgementColumn: false }) as never, { ...args, judgeBy: null })
    expect(judgePass).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
    expect(writes.filter((w) => w.op === 'upsert')).toHaveLength(2)
  })

  it('makes no call once the step’s clock for it has run out', async () => {
    await reevaluatePlanChecks(admin([]) as never, { ...args, judgeBy: Date.now() - 1 })
    expect(judgePass).not.toHaveBeenCalled()
  })

  it('makes no call where the caller did not ask for one (an operator’s script)', async () => {
    const out = await reevaluatePlanChecks(admin([]) as never, args)
    expect(judgePass).not.toHaveBeenCalled()
    expect(out.map((r) => r.judged)).toEqual([false, false])
  })
})
