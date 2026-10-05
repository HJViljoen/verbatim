import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

// The verdict pass, stood in where a test hands one in; the real one otherwise.
const engine = vi.hoisted(() => ({ verdictPass: null as null | ((...args: unknown[]) => Promise<unknown>) }))
vi.mock('../ask/engine', async (orig) => {
  const real = await orig<typeof import('../ask/engine')>()
  return { ...real, verdictPass: (...args: Parameters<typeof real.verdictPass>) => (engine.verdictPass ? engine.verdictPass(...args) : real.verdictPass(...args)) }
})

import { checkWeekRead } from './check'
import { asTimeout, callBudget, isTimeout, isTransient, WEEK_READ_CALLS, WEEK_READ_RESERVE, WEEK_READ_STEP_BUDGET_MS, WeekReadTimeoutError } from './deadline'
import { fitQuotes } from './fit'
import { runWeekReadStep } from './step'
import type { WeekReadRow } from './store'
import { candidate, fact, option, pool, ref, written } from './test-fixtures'
import { writerFigures } from './write'
import { generateWeekRead, WeekReadWriteError, type ParseClient } from './write-model'

// The week read's model calls, held to time (review M4): a cap per call, no
// silent SDK retry, one budget for the step, and a timeout retried as a step,
// then, on the step's last attempt, stored as a failed read with the operator
// told (5 Oct).

/** A clock the test moves. */
function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms }, start }
}

describe('the budget: caps, no retry, one clock for the step', () => {
  it('fits the step well inside the 300 s route: the calls are done by 250 s', () => {
    expect(WEEK_READ_STEP_BUDGET_MS).toBe(250_000)
    // The writer's cap and what it must leave the calls after it fit the step.
    const sum = WEEK_READ_CALLS.writer.capMs + WEEK_READ_RESERVE.check + WEEK_READ_RESERVE.embed
    expect(sum).toBeLessThanOrEqual(WEEK_READ_STEP_BUDGET_MS)
    expect(WEEK_READ_STEP_BUDGET_MS).toBeLessThan(300_000)
    // Whenever the writer ends, the check and the fit end by 250 s.
    for (const writerEndsAt of [0, 30_000, 60_000, 100_000, 150_000, 185_000]) {
      const c = clock()
      const b = callBudget({ startedAt: c.start, now: c.now })
      c.advance(writerEndsAt)
      const check = b.optionsFor('check').timeout
      c.advance(check)
      const embed = b.optionsFor('embed').timeout
      expect(writerEndsAt + check + embed).toBeLessThanOrEqual(WEEK_READ_STEP_BUDGET_MS)
    }
  })
  it('gives each call its cap and no SDK retry while there is time', () => {
    const c = clock()
    const b = callBudget({ startedAt: c.start, now: c.now })
    expect(b.optionsFor('writer')).toEqual({ timeout: 150_000, maxRetries: 0 })
    expect(b.optionsFor('check')).toEqual({ timeout: 120_000, maxRetries: 0 })
    expect(b.optionsFor('embed')).toEqual({ timeout: 20_000, maxRetries: 0 })
  })
  it('the self-check takes what the writer left, up to 120 s, never less than its old 45 s (Össur, 555af400)', () => {
    const at = (writerEndsAt: number) => {
      const c = clock()
      const b = callBudget({ startedAt: c.start, now: c.now })
      c.advance(writerEndsAt)
      return b.optionsFor('check').timeout
    }
    expect(at(70_000)).toBe(120_000)       // a writer near its p50: the whole cap
    expect(at(150_000)).toBe(80_000)       // 250 - 150 - the fit's 20
    expect(at(185_000)).toBe(45_000)       // the writer's latest end: its reserve, as before
    // The writer is not cut for it: it still has its 150 s from the start.
    expect(callBudget().optionsFor('writer').timeout).toBe(150_000)
  })
  it('cuts a call to what is left after the calls still to come, and refuses one under its floor', () => {
    const c = clock()
    const b = callBudget({ startedAt: c.start, now: c.now })
    c.advance(120_000)   // slow reads: 250 - 120 - (45 + 20) = 65 s for the writer
    expect(b.optionsFor('writer').timeout).toBe(65_000)
    c.advance(10_000)    // 55 s: under the writer's 60 s floor
    expect(() => b.optionsFor('writer')).toThrow(WeekReadTimeoutError)
    c.advance(70_000)    // at 200 s: 250 - 200 - 20 = 30 s for the check
    expect(b.optionsFor('check').timeout).toBe(30_000)
    c.advance(40_000)    // at 240 s: 10 s for the fit
    expect(b.optionsFor('embed').timeout).toBe(10_000)
    c.advance(10_000)
    expect(() => b.optionsFor('embed')).toThrow(/no time left for the embed call/)
  })
  it('outside the step (the script) each call keeps its cap, with no shared clock', () => {
    const c = clock()
    const b = callBudget({ budgetMs: null, now: c.now })
    c.advance(10_000_000)
    expect(b.optionsFor('writer')).toEqual({ timeout: 150_000, maxRetries: 0 })
  })
  it('knows a timeout when it sees one: the SDK\'s, an abort, the Ask wrapper\'s message, ours', () => {
    expect(isTimeout(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))).toBe(true)
    expect(isTimeout(new Error('Ask verdict call failed: Request timed out.'))).toBe(true)
    expect(isTimeout(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true)
    expect(isTimeout(new WeekReadTimeoutError('x'))).toBe(true)
    expect(isTimeout(new Error('no parsed output'))).toBe(false)
    expect(asTimeout(new Error('Request timed out.'), 'writer').message).toMatch(/^the writer call timed out \(cap 150 s\)/)
    // The time the call was given, where the budget gave less than the cap.
    expect(asTimeout(new Error('Request timed out.'), 'check', 80_000).message).toMatch(/^the check call timed out \(cap 80 s\)/)
  })
  it('knows a transient failure: a timeout or abort, a 408, 429 or 5xx, a dropped connection, through a cause', () => {
    const status = (s: number, message = `${s} status code (no body)`) => Object.assign(new Error(message), { status: s })
    // The one that cost Össur its read, and our own budget's.
    expect(isTransient(asTimeout(new Error('Ask verdict call failed: Request timed out.'), 'check'))).toBe(true)
    expect(isTransient(new Error('Ask verdict call failed: Request timed out.'))).toBe(true)
    expect(isTransient(Object.assign(new Error('429 You exceeded your current quota'), { status: 429, code: 'insufficient_quota' }))).toBe(false)
    expect(isTransient(new Error('writer failed', { cause: Object.assign(new Error('quota'), { status: 429, code: 'insufficient_quota' }) }))).toBe(false)
    expect(isTransient(new WeekReadTimeoutError('no time left for the check call: 4 s free of the step\'s 250 s'))).toBe(true)
    expect(isTransient(new Error('Request was aborted.'))).toBe(true)
    // The OpenAI SDK's statuses (it names no class; `status` is set).
    for (const s of [408, 429, 500, 502, 503, 504]) expect(isTransient(status(s))).toBe(true)
    expect(isTransient(new Error('Connection error.'))).toBe(true)
    // A Supabase read that lost its connection.
    expect(isTransient(new Error('week read client: TypeError: fetch failed'))).toBe(true)
    expect(isTransient(new Error('read ECONNRESET'))).toBe(true)
    // PostgREST that could not load its schema cache (PGRST002, the 16 Sep
    // outage's shape) passes on its own; a missing table (PGRST205) does not.
    expect(isTransient({ code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' })).toBe(true)
    expect(isTransient(new Error('monthly_briefs written: Could not query the database for the schema cache. Retrying.'))).toBe(true)
    expect(isTransient({ code: 'PGRST205', message: "Could not find the table 'public.monthly_briefs' in the schema cache" })).toBe(false)
    expect(isTransient(new Error("monthly_briefs written: Could not find the table 'public.monthly_briefs' in the schema cache"))).toBe(false)
    // Through the writer's cause ("could not be written twice over").
    expect(isTransient(new WeekReadWriteError("The week's read could not be written twice over: 503 Service Unavailable", { cause: status(503, '503 Service Unavailable') }))).toBe(true)
    // Not transient: trying again fails the same way, at a model call's price.
    expect(isTransient(new WeekReadWriteError("The week's read could not be written twice over: no parsed output"))).toBe(false)
    for (const s of [400, 401, 403, 404, 422]) expect(isTransient(status(s))).toBe(false)
    expect(isTransient(new Error('relation "public.week_reads" does not exist'))).toBe(false)
    expect(isTransient(new Error('long run: no run has produced themes'))).toBe(false)
    expect(isTransient(new TypeError("Cannot read properties of undefined (reading 'findings')"))).toBe(false)
    expect(isTransient(null)).toBe(false)
    expect(isTransient('timed out')).toBe(false)
  })
})

// ---- The calls ------------------------------------------------------------------------

const logOnly = { from: () => ({ insert: async () => ({ error: null }) }) } as unknown as SupabaseClient
const P = pool([candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })])
const BASE = { company: 'Sealand', pool: P, standing: [fact({ subjectId: 's1', name: 'Comfort' })], previous: null, figures: writerFigures(P), clientId: 'client-1', runId: 'run-27' }

function client(answers: unknown[]) {
  const calls: { body: unknown; options: unknown }[] = []
  const c = {
    chat: {
      completions: {
        parse: async (body: unknown, options?: unknown) => {
          calls.push({ body, options })
          const next = answers.shift()
          if (next instanceof Error) throw next
          return { usage: { prompt_tokens: 10, completion_tokens: 10 }, choices: [{ message: { parsed: next ?? null } }] }
        },
      },
    },
  }
  return { client: c as unknown as ParseClient, calls }
}

const timedOut = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' })

describe('the writer', () => {
  it('asks with its cap and no SDK retry', async () => {
    const { client: c, calls } = client([written()])
    await generateWeekRead(logOnly, { ...BASE, client: c, budget: callBudget() })
    expect(calls[0].options).toEqual({ timeout: 150_000, maxRetries: 0 })
  })
  it('a timeout is thrown as one at once: never a second paid attempt', async () => {
    const { client: c, calls } = client([timedOut(), written()])
    await expect(generateWeekRead(logOnly, { ...BASE, client: c, budget: callBudget() })).rejects.toThrow(WeekReadTimeoutError)
    expect(calls).toHaveLength(1)
  })
  it('with no time left it spends nothing', async () => {
    const c0 = clock()
    const { client: c, calls } = client([written()])
    const budget = callBudget({ startedAt: c0.start - 200_000, now: c0.now })
    await expect(generateWeekRead(logOnly, { ...BASE, client: c, budget })).rejects.toThrow(/no time left for the writer call/)
    expect(calls).toHaveLength(0)
  })
  it('an answer that would not parse is retried once, with time left', async () => {
    const { client: c, calls } = client([null, written()])
    const out = await generateWeekRead(logOnly, { ...BASE, client: c, budget: callBudget() })
    expect(out.attempts).toBe(2)
    expect(calls).toHaveLength(2)
  })
  it('two failed attempts keep the last one\'s error as the cause: a 5xx is transient, an unparsed answer is not', async () => {
    const down = () => Object.assign(new Error('500 The server had an error while processing your request.'), { status: 500 })
    const serverDown = client([down(), down()])
    const thrown = await generateWeekRead(logOnly, { ...BASE, client: serverDown.client, budget: callBudget() }).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(WeekReadWriteError)
    expect(isTransient(thrown)).toBe(true)
    // A 5xx, then an answer that would not parse: the last attempt decides.
    const badAnswer = client([down(), null])
    const unparsed = await generateWeekRead(logOnly, { ...BASE, client: badAnswer.client, budget: callBudget() }).catch((e: unknown) => e)
    expect((unparsed as Error).message).toMatch(/no parsed output/)
    expect(isTransient(unparsed)).toBe(false)
  })
})

describe('the self-check and the quote fit', () => {
  it('the check with no time left fails the read rather than passing it unchecked', async () => {
    const c0 = clock()
    const budget = callBudget({ startedAt: c0.start - 245_000, now: c0.now })
    await expect(checkWeekRead(logOnly, { clientId: 'c', runId: 'r', companyName: 'Sealand', headlines: ['A claim'], persist: false, budget }))
      .rejects.toThrow(WeekReadTimeoutError)
  })
  it('the whole pass is held to the check\'s time, not each of its two calls: a pass that runs past it is a timeout', async () => {
    vi.useFakeTimers()
    const requests: unknown[] = []
    // Embeddings, then the verdict: each within its own timeout, together past it.
    engine.verdictPass = (_admin, a) => {
      requests.push((a as { request: unknown }).request)
      return new Promise(() => {})
    }
    try {
      const c0 = clock()
      const budget = callBudget({ startedAt: c0.start - 150_000, now: c0.now })   // 250 - 150 - 20 = 80 s
      const out = checkWeekRead(logOnly, { clientId: 'c', runId: 'r', companyName: 'Sealand', headlines: ['A claim'], persist: false, budget })
      let settled = false
      const caught = out.catch((e: unknown) => e).finally(() => { settled = true })
      await vi.advanceTimersByTimeAsync(79_999)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const e = await caught
      expect(e).toBeInstanceOf(WeekReadTimeoutError)
      expect((e as Error).message).toBe('the check call timed out (cap 80 s): the self-check ran past its time')
      expect(isTransient(e)).toBe(true)
      expect(requests).toEqual([{ timeout: 80_000, maxRetries: 0 }])
    } finally {
      engine.verdictPass = null
      vi.useRealTimers()
    }
  })
  it('a pass that answers in time is read, and a failure that is not a timeout keeps the findings unchecked', async () => {
    engine.verdictPass = async () => ({ claims: [{ ref: 'C1', verdict: 'contradicts', theySay: 'They say the opposite.' }], costUsd: 0.01 })
    try {
      const check = await checkWeekRead(logOnly, { clientId: 'c', runId: 'r', companyName: 'Sealand', headlines: ['A claim'], persist: false, budget: callBudget() })
      expect(check).toMatchObject({ ran: true, costUsd: 0.01 })
      expect([...check.contradicted]).toEqual([['A claim', 'They say the opposite.']])
      engine.verdictPass = async () => { throw new Error('Ask verdict call failed: 400 bad request') }
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await checkWeekRead(logOnly, { clientId: 'c', runId: 'r', companyName: 'Sealand', headlines: ['A claim'], persist: false, budget: callBudget() })).toMatchObject({ ran: false })
      err.mockRestore()
    } finally {
      engine.verdictPass = null
    }
  })
  it('the fit: a timed-out embeddings request fails the read; any other failure is no fit', async () => {
    const admin = { from: () => { const q = { select: () => q, eq: () => q, in: async () => ({ data: [], error: null }) }; return q } } as unknown as SupabaseClient
    const C1 = candidate({ id: 'C1', quoteRefs: [ref('a1', 't1')], quoteOptions: [option(ref('a1', 't1'), 'ins-a1')] })
    const p = pool([C1, candidate({ id: 'C2' }), candidate({ id: 'C3' })])
    const findings = [{ index: 0, headline: 'Straps decide comfort', saw: 'Owners describe the straps.', based_on: ['C1'] }]
    await expect(fitQuotes(admin, { clientId: 'c', runId: 'r', pool: p, findings, log: false }, { embed: async () => { throw timedOut() } }))
      .rejects.toThrow(/the embed call timed out/)
    const fit = await fitQuotes(admin, { clientId: 'c', runId: 'r', pool: p, findings, log: false }, { embed: async () => { throw new Error('boom') } })
    expect(fit.ran).toBe(false)
  })
})

describe('the step: a timeout is retried as a step, then a failed read, stored, with the operator told', () => {
  it('before the last attempt the timeout is thrown for Inngest to retry: no row, no alert', async () => {
    const saved: WeekReadRow[] = []
    const alerts: string[] = []
    await expect(runWeekReadStep({} as SupabaseClient, { clientId: 'client-1', runId: 'run-27', company: 'Sealand', lastAttempt: false }, {
      applied: async () => true,
      build: async () => { throw asTimeout(new Error('Ask verdict call failed: Request timed out.'), 'check') },
      save: async (_a, row) => { saved.push(row) },
      alert: async (subject) => { alerts.push(subject); return { sent: true } },
    })).rejects.toThrow(/the check call timed out/)
    expect(saved).toEqual([])
    expect(alerts).toEqual([])
  })

  it('on the last attempt it stores a failed row and sends one alert that names the timeout; the step does not throw', async () => {
    const saved: WeekReadRow[] = []
    const alerts: { subject: string; text: string }[] = []
    const r = await runWeekReadStep({} as SupabaseClient, { clientId: 'client-1', runId: 'run-27', company: 'Sealand', lastAttempt: true }, {
      applied: async () => true,
      build: async (_admin, opts) => {
        // The step hands the build its clock.
        expect(opts.budget?.optionsFor('writer')).toEqual({ timeout: 150_000, maxRetries: 0 })
        throw asTimeout(timedOut(), 'writer')
      },
      save: async (_a, row) => { saved.push(row) },
      alert: async (subject, text) => { alerts.push({ subject, text }); return { sent: true } },
    })
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/the writer call timed out/)
    expect(saved).toEqual([expect.objectContaining({ run_id: 'run-27', kind: 'week', status: 'failed', data: null })])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].subject).toBe('Verbatim week read failed: Sealand')
    expect(alerts[0].text).toContain('the writer call timed out (cap 150 s)')
  })
})
