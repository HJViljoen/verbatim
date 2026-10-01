import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { checkWeekRead } from './check'
import { asTimeout, callBudget, isTimeout, WEEK_READ_CALLS, WEEK_READ_STEP_BUDGET_MS, WeekReadTimeoutError } from './deadline'
import { fitQuotes } from './fit'
import { runWeekReadStep } from './step'
import type { WeekReadRow } from './store'
import { candidate, fact, option, pool, ref, written } from './test-fixtures'
import { writerFigures } from './write'
import { generateWeekRead, type ParseClient } from './write-model'

// The week read's model calls, held to time (review M4): a cap per call, no
// silent SDK retry, one budget for the step, and a timeout stored as a failed
// read with the operator told.

/** A clock the test moves. */
function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms }, start }
}

describe('the budget: caps, no retry, one clock for the step', () => {
  it('fits the step well inside the 300 s route: the calls are done by 250 s', () => {
    expect(WEEK_READ_STEP_BUDGET_MS).toBe(250_000)
    const sum = WEEK_READ_CALLS.writer.capMs + WEEK_READ_CALLS.check.capMs + WEEK_READ_CALLS.embed.capMs
    expect(sum).toBeLessThanOrEqual(WEEK_READ_STEP_BUDGET_MS)
    expect(WEEK_READ_STEP_BUDGET_MS).toBeLessThan(300_000)
  })
  it('gives each call its cap and no SDK retry while there is time', () => {
    const c = clock()
    const b = callBudget({ startedAt: c.start, now: c.now })
    expect(b.optionsFor('writer')).toEqual({ timeout: 150_000, maxRetries: 0 })
    expect(b.optionsFor('check')).toEqual({ timeout: 45_000, maxRetries: 0 })
    expect(b.optionsFor('embed')).toEqual({ timeout: 20_000, maxRetries: 0 })
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
})

describe('the self-check and the quote fit', () => {
  it('the check with no time left fails the read rather than passing it unchecked', async () => {
    const c0 = clock()
    const budget = callBudget({ startedAt: c0.start - 245_000, now: c0.now })
    await expect(checkWeekRead(logOnly, { clientId: 'c', runId: 'r', companyName: 'Sealand', headlines: ['A claim'], persist: false, budget }))
      .rejects.toThrow(WeekReadTimeoutError)
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

describe('the step: a timeout is a failed read, stored, with the operator told', () => {
  it('stores a failed row and sends one alert that names the timeout; the step does not throw', async () => {
    const saved: WeekReadRow[] = []
    const alerts: { subject: string; text: string }[] = []
    const r = await runWeekReadStep({} as SupabaseClient, { clientId: 'client-1', runId: 'run-27', company: 'Sealand' }, {
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
