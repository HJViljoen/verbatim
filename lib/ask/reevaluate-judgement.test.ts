import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const { reevaluatePlanChecks, PLAN_JUDGE_CALL_CAP_MS, PLAN_JUDGE_MIN_START_MS } = await import('./reevaluate')
const { planJudgeDeadline, statementsBudget, STATEMENTS_STEP_BUDGET_MS } = await import('../statements/measure')

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

  it('makes one call a check on the reading it stored, and keeps it on that reading’s row', async () => {
    judgePass.mockResolvedValue({ judgement: JUDGEMENT, costUsd: 0.03, ok: true })
    const writes: Write[] = []
    const out = await reevaluatePlanChecks(admin(writes) as never, { ...args, judgeBy: null })
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

// Review, 9 Nov: at the cap of three plans, judgements started only after every
// verdict pass would get the scraps of the clock. Each starts as soon as its
// plan's reading is stored, beside the next verdict pass, and the step awaits
// them after its statements pass, so that pass starts when it always did.
describe('the judgement rewrites, on the step’s clock', () => {
  const T0 = Date.UTC(2026, 10, 15, 5, 0, 0)
  const threeChecks = (writes: Write[]) => {
    const a = admin(writes)
    const from = a.from.bind(a)
    return {
      from(table: string) {
        const b = from(table) as Record<string, unknown>
        if (table !== 'plan_checks') return b
        const rows = ['pc1', 'pc2', 'pc3'].map((id) => ({ id, title: id, claims: [claim('C1', 'echoes', 9)] }))
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain
        chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r)
        return chain
      },
    }
  }
  const after = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))

  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
    verdictPass.mockReset()
    judgePass.mockReset()
    // Össur's 8 Nov verdict passes took 34 and 36 s; the upload's judgement 14 and 22 s.
    verdictPass.mockImplementation((_a: unknown, x: { claims: { ref: string }[] }) =>
      after(35_000, { claims: x.claims.map((c) => claim(c.ref, 'echoes', 9)), costUsd: 0.06 }))
  })
  afterEach(() => { vi.useRealTimers() })

  it('writes all three at the cap, each beside the next verdict pass, and leaves the statements pass its whole budget', async () => {
    const started: { at: number; timeout: number }[] = []
    const ended: number[] = []
    judgePass.mockImplementation((_a: unknown, x: { request: { timeout: number } }) => {
      started.push({ at: Date.now() - T0, timeout: x.request.timeout })
      return after(20_000, { judgement: JUDGEMENT, costUsd: 0.03, ok: true }).then((v) => { ended.push(Date.now() - T0); return v })
    })
    const judging: Promise<void>[] = []
    let returnedAt = -1
    const run = reevaluatePlanChecks(threeChecks([]) as never, { ...args, judgeBy: planJudgeDeadline(T0), onJudging: (p) => { judging.push(p) } })
      .then((out) => { returnedAt = Date.now() - T0; return out })
    await vi.advanceTimersByTimeAsync(105_000)
    const out = await run
    // The readings are stored when they always were, and the statements pass
    // after them starts with every millisecond it had before.
    expect(returnedAt).toBe(105_000)
    expect(statementsBudget(T0, T0 + returnedAt)).toBe(STATEMENTS_STEP_BUDGET_MS)
    await vi.advanceTimersByTimeAsync(20_000)
    await Promise.all(judging)
    expect(started.map((s) => s.at)).toEqual([35_000, 70_000, 105_000])
    expect(started.every((s) => s.timeout === PLAN_JUDGE_CALL_CAP_MS)).toBe(true)
    expect(ended).toEqual([55_000, 90_000, 125_000])
    expect(Math.max(...ended)).toBeLessThanOrEqual(planJudgeDeadline(T0) - T0)
    expect(out.map((r) => r.judged)).toEqual([true, true, true])
  })

  it('starts none with less than 25 s of its clock left, and that plan keeps its last judgement', async () => {
    judgePass.mockImplementation(() => after(20_000, { judgement: JUDGEMENT, costUsd: 0.03, ok: true }))
    const writes: Write[] = []
    // A clock that ends 20 s after the third reading is stored.
    const run = reevaluatePlanChecks(threeChecks(writes) as never, { ...args, judgeBy: T0 + 125_000 })
    await vi.advanceTimersByTimeAsync(130_000)
    const out = await run
    expect(PLAN_JUDGE_MIN_START_MS).toBe(25_000)
    expect(judgePass).toHaveBeenCalledTimes(2)
    expect(out.map((r) => r.judged)).toEqual([true, true, false])
    expect(writes.filter((w) => w.op === 'update').map((w) => w.filters.find((f) => f.startsWith('plan_check_id')))).toEqual(['plan_check_id=pc1', 'plan_check_id=pc2'])
  })
})

