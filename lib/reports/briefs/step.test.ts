import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { BuildBlockedError, type ResearchAnswer } from '../documents/research'
import { alsoOnlyPrinted, numberPoints, type BriefSetInputs } from './build'
import { briefClock } from './clock'
import { RUN_MODEL_BUDGET_USD } from '../../config'
import {
  BRIEF_AFTER_RESEARCH_USD, BRIEF_HEADROOM_USD, BRIEF_RESEARCH_WAVE, BRIEF_RUN_MARGIN_USD, BRIEF_SET_BUDGET_USD, BRIEF_STEP_MAX_USD, BRIEFS_FALLBACK,
  briefComposeStep, briefHeadroom, briefIdeasStep, briefResearchStep, briefRoom, briefWriteStep, planBriefsStep, researchAllowance, researchWaves,
  stepSafeInputs, stillToCome, type BriefIdeas, type BriefPlan, type BriefStepDeps, type BriefWave, type BriefWritten,
} from './step'
import { briefPrints, failedRows, monthlyBriefsApplied, setWritten, type MonthlyBriefRow } from './store'
import { point } from './test-fixtures'
import type { Allocation, MonthlyBriefData } from './types'
import { BRIEF_ROLES } from './types'

// The pipeline's `briefs:*` steps: when a month is due, how the research is
// cut into waves and numbered, and every step's fail-soft contract (a
// transient failure before the last attempt throws; otherwise the body never
// throws, stores the set failed and alerts ONCE with the script). No database
// and no model: every read and call is a stand-in.

const admin = {} as SupabaseClient
const SEP = '2026-09-01'
// The week of 28 Sep to 4 Oct: it holds 1 Oct, so it closes September.
const CLOSING = { from: '2026-09-28T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' }
const MID_MONTH = { from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }
const OPTS = { clientId: 'client-1', runId: 'run-oct', window: CLOSING, testRun: false }

const INPUTS = {
  clientId: 'client-1', company: 'Acme', month: SEP, noun: 'packs', industryKeywords: ['hiking pack'], tracked: ['Rival'], rivals: ['Rival'],
  audiences: null, market: { videos: 900, comments: 20000 }, context: null, standing: [], playbook: null,
  sayVsHear: [{ you_say: 'Built to last.', your_quote: 'We build every pack to last a lifetime, said the founder.', they_say: '', gap: '', audience: 'echoes', supporting_theme_ids: [] }],
  themedRunId: 'run-oct', runId: 'run-oct', brands: ['Acme', 'Rival'], rivalAudiences: ['competitor:Rival'], giveaway: null,
} as unknown as BriefSetInputs

function answer(id: string, n: number, outcome: ResearchAnswer['outcome'] = 'answered'): ResearchAnswer {
  return {
    question: { id, text: `${id}?`, purpose: 'anchor' }, answer: 'a', outcome,
    grounded: Array.from({ length: n }, (_, k) => ({ id: `G${k + 1}`, text: `${id} point ${k + 1}`, insightIds: [`i-${id}-${k}`], themeLabels: [], conversationCount: 3, quotes: [{ ref: `c:${id}-${k}`, text: 'a commenter wrote this', commentId: `${id}-${k}`, videoId: null }], questionId: id })),
    judgement: [], silent: false, conversationCount: 3 * n, costUsd: 0.08, ms: 1000,
  }
}

function hookDeps(over: Partial<BriefStepDeps> = {}) {
  const alerts: { subject: string; text: string }[] = []
  const saved: MonthlyBriefRow[][] = []
  const spentOn: string[] = []
  const deps: Partial<BriefStepDeps> = {
    applied: async () => true,
    written: async () => false,
    company: async () => 'Acme',
    spent: async () => 12,
    inputs: async () => INPUTS,
    frame: async () => ({ frame: {} as never, window: { from: '2026-07-03', to: '2026-10-01' } }),
    research: async (_a, args) => { spentOn.push(args.questions[0].id); return { answers: [answer(args.questions[0].id, 2)], costUsd: 0.08, stoppedForBudget: false } },
    ground: async (_a, _i, answers) => ({ points: numberPoints(answers, answers.map((a) => a.question)).flatMap((a) => a.grounded.map((p) => point(p.id, 'sales', 4, { text: p.text }))), counted: new Map(), whoVideos: new Map(), brandsOf: new Map() }),
    ideas: async () => ({ raw: { ideas: [] }, costUsd: 0.05, prompts: { system: '', user: '' }, check: { contradicted: new Map(), ran: true, costUsd: 0.01 }, allocation: { ideas: [], byRole: { sales: [], marketing: [], content: [], leadership: [] }, held: [] } }),
    write: async () => ({ raw: { findings: [] } as never, prompts: { system: '', user: '' }, costUsd: 0.07 }),
    saveRows: async (_a, rows) => { saved.push([...rows]) },
    alert: async (subject, text) => { alerts.push({ subject, text }); return { sent: true } },
    ...over,
  }
  return { deps, alerts, saved, spentOn }
}

const duePlan = async (over: Partial<BriefStepDeps> = {}): Promise<BriefPlan> => planBriefsStep(admin, OPTS, hookDeps(over).deps)
/** Every I/O a plan may make, counted: the read-free paths make none. */
function counting(over: Partial<BriefStepDeps> = {}) {
  const calls: string[] = []
  const h = hookDeps(over)
  const wrapped = Object.fromEntries(Object.entries(h.deps).map(([k, f]) => [k, typeof f === 'function' && k !== 'alert' && k !== 'saveRows'
    ? (...args: unknown[]) => { calls.push(k); return (f as (...a: unknown[]) => unknown)(...args) }
    : f])) as Partial<BriefStepDeps>
  return { ...h, deps: wrapped, calls }
}
const timedOut = () => new Error('the writer call timed out (cap 200 s): Request timed out.')

describe('researchWaves and numberPoints', () => {
  it('cuts the questions into waves of four, in order', () => {
    const qs = Array.from({ length: 19 }, (_, i) => ({ id: `q${i + 1}` }))
    const waves = researchWaves(qs)
    expect(BRIEF_RESEARCH_WAVE).toBe(4)
    expect(waves.map((w) => w.length)).toEqual([4, 4, 4, 4, 3])
    expect(waves.flat()).toEqual(qs.map((q) => q.id))
  })

  it('numbers every wave\'s points once, in question order, as one research run does', () => {
    const a = answer('sales.who', 2)
    const b = answer('sales.stops', 3)
    const numbered = numberPoints([b, a], [{ id: 'sales.who' }, { id: 'sales.stops' }])
    expect(numbered.map((x) => x.question.id)).toEqual(['sales.who', 'sales.stops'])
    expect(numbered.flatMap((x) => x.grounded.map((p) => p.id))).toEqual(['G1', 'G2', 'G3', 'G4', 'G5'])
  })
})

describe('briefHeadroom and the inputs a step may return', () => {
  it('starts the set only where the run can afford all of it under its budget', () => {
    expect(briefHeadroom(10, 60)).toBe(true)
    expect(briefHeadroom(60 - BRIEF_HEADROOM_USD, 60)).toBe(true)
    expect(briefHeadroom(60 - BRIEF_HEADROOM_USD + 0.01, 60)).toBe(false)
  })

  it('leaves the company\'s own quoted words and every quote\'s text out of a step\'s output', () => {
    const safe = stepSafeInputs({ ...INPUTS, standing: [{ quoteRef: { ref: 'e:abc', text: 'a comment' } }] as never })
    expect(safe.sayVsHear[0].your_quote).toBe('')
    expect(safe.sayVsHear[0].you_say).toBe('Built to last.')
    expect(JSON.stringify(safe)).not.toContain('a comment')
  })
})

describe('the ledger\'s rules', () => {
  it('a month is written once every role is ready or thin; a failed set is not', () => {
    expect(setWritten(BRIEF_ROLES.map((role) => ({ role, status: 'ready' })))).toBe(true)
    expect(setWritten([...BRIEF_ROLES.slice(1).map((role) => ({ role, status: 'ready' })), { role: 'sales', status: 'thin' }])).toBe(true)
    expect(setWritten(BRIEF_ROLES.map((role) => ({ role, status: 'failed' })))).toBe(false)
    expect(setWritten(BRIEF_ROLES.slice(1).map((role) => ({ role, status: 'ready' })))).toBe(false)
  })

  it('a failed set is four failed rows, one per role, under the run', () => {
    const rows = failedRows('client-1', SEP, 'run-oct', 'writer 500')
    expect(rows.map((r) => r.role)).toEqual([...BRIEF_ROLES])
    expect(rows.every((r) => r.status === 'failed' && r.snapshot_id === null && r.run_id === 'run-oct' && r.error === 'writer 500')).toBe(true)
  })

  it('asks whether the ledger is there with a read PostgREST answers in words (a HEAD on a missing table reads as no error)', async () => {
    const db = (res: { error: unknown; status: number }) => ({ from: () => ({ select: () => ({ limit: async () => res }) }) }) as unknown as SupabaseClient
    expect(await monthlyBriefsApplied(db({ error: null, status: 200 }))).toBe(true)
    expect(await monthlyBriefsApplied(db({ error: { code: 'PGRST205', message: "Could not find the table 'public.monthly_briefs' in the schema cache" }, status: 404 }))).toBe(false)
    expect(await monthlyBriefsApplied(db({ error: null, status: 404 }))).toBe(false)
    await expect(monthlyBriefsApplied(db({ error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 }))).rejects.toThrow(/statement timeout/)
  })

  it('a brief with no finding and no section is thin and never shown', () => {
    expect(briefPrints({ findings: [], sections: [] })).toBe(false)
    expect(briefPrints({ findings: [], sections: [{} as never] })).toBe(true)
  })
})

describe('alsoOnlyPrinted', () => {
  const brief = (role: MonthlyBriefData['role'], ideaIds: string[], also: { headline: string; brief: MonthlyBriefData['role'] }[]) =>
    ({ role, findings: ideaIds.map((ideaId) => ({ ideaId })), inShort: { summary: '', figures: [], also }, held: [] }) as unknown as MonthlyBriefData
  const allocation = { ideas: [{ id: 'I1', headline: 'Printed in sales', home: 'sales' }, { id: 'I2', headline: 'Held in content', home: 'content' }] } as unknown as Allocation

  it('names only an idea some brief printed as a finding, and records the rest', () => {
    const out = alsoOnlyPrinted([brief('sales', ['I1'], []), brief('leadership', [], [{ headline: 'Printed in sales', brief: 'sales' }, { headline: 'Held in content', brief: 'content' }])], allocation)
    expect(out[1].inShort.also).toEqual([{ headline: 'Printed in sales', brief: 'sales' }])
    expect(out[1].held[0].reason).toMatch(/no brief printed it/)
  })
})

describe('plan-briefs', () => {
  it('on the run that closes a month, reads the inputs once, frozen, and plans the waves', async () => {
    const plan = await duePlan()
    expect(plan).toMatchObject({ status: 'due', month: SEP, runId: 'run-oct', company: 'Acme' })
    expect(plan.questions.length).toBeGreaterThan(10)
    expect(plan.waves.flat()).toEqual(plan.questions.map((q) => q.id))
    expect(plan.inputs?.sayVsHear[0].your_quote).toBe('')
  })

  it('passes ITS run to the inputs (the run is not completed yet, and its themes replaced the last one\'s)', async () => {
    let seen: string | undefined
    await duePlan({ inputs: async (_a, o) => { seen = o.runId; return INPUTS } })
    expect(seen).toBe('run-oct')
  })

  it('every other run is a no-op decided from its own window: no read, no alert, nothing spent', async () => {
    for (const window of [MID_MONTH, null]) {
      for (const testRun of [false, true]) {
        const { deps, alerts, saved, calls } = counting({ applied: async () => { throw new Error('PGRST002 Could not query the database for the schema cache') } })
        expect(await planBriefsStep(admin, { ...OPTS, window, testRun }, deps)).toMatchObject({ status: 'not_due', month: null, waves: [] })
        expect(calls).toEqual([])
        expect(alerts).toEqual([])
        expect(saved).toEqual([])
      }
    }
  })

  it('a test run that closes a month publishes nothing: not due, nothing spent, ONE alert naming the month and the script', async () => {
    const { deps, alerts, saved, calls } = counting()
    expect(await planBriefsStep(admin, { ...OPTS, testRun: true }, deps)).toMatchObject({ status: 'not_due', month: SEP, inputs: null, waves: [] })
    expect(calls).not.toContain('inputs')
    expect(calls).not.toContain('spent')
    expect(saved).toEqual([])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('September 2026')
    expect(alerts[0].text).toContain('scripts/monthly-briefs.ts --client client-1 --month 2026-09')
    // Once the month is written (the script ran), a test run says nothing.
    const quiet = counting({ written: async () => true })
    expect((await planBriefsStep(admin, { ...OPTS, testRun: true }, quiet.deps)).status).toBe('not_due')
    expect(quiet.alerts).toEqual([])
  })

  it('every alert names the month it is about, never "the month that ended"', async () => {
    const texts: string[] = []
    for (const over of [{ spent: async () => 57 }, { inputs: async () => { throw new Error('boom') } }] as Partial<BriefStepDeps>[]) {
      const { deps, alerts } = hookDeps(over)
      await planBriefsStep(admin, OPTS, deps)
      texts.push(...alerts.map((a) => a.text))
    }
    expect(texts).toHaveLength(2)
    for (const t of texts) {
      expect(t).toMatch(/^The September 2026 briefs/)
      expect(t).not.toMatch(/the month that ended|The the/)
    }
  })

  it('a due check that cannot be read stores no row (the month may be written: a failure never overwrites a ready brief)', async () => {
    const { deps, alerts, saved } = hookDeps({ written: async () => { throw new Error('monthly_briefs written: permission denied') } })
    expect((await planBriefsStep(admin, { ...OPTS, lastAttempt: true }, deps)).status).toBe('failed')
    expect(saved).toEqual([])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toMatch(/^The September 2026 briefs/)
    // A test run whose check failed is still a test run: nothing stored, the test run's alert.
    const test = hookDeps({ written: async () => { throw new Error('monthly_briefs written: permission denied') } })
    expect((await planBriefsStep(admin, { ...OPTS, testRun: true, lastAttempt: true }, test.deps)).status).toBe('not_due')
    expect(test.saved).toEqual([])
    expect(test.alerts.map((a) => a.subject)).toEqual(['Verbatim monthly briefs not written (a test run): Acme'])
  })

  it('the company\'s name is for the alert alone: a read of it that fails fails nothing', async () => {
    const plan = await duePlan({ company: async () => { throw new Error('clients: fetch failed') } })
    expect(plan.status).toBe('due')
  })

  it('a schema cache that cannot be loaded (PGRST002) is transient: thrown before the last attempt', async () => {
    const down = Object.assign(new Error('monthly_briefs written: Could not query the database for the schema cache. Retrying.'), { code: 'PGRST002' })
    const early = hookDeps({ written: async () => { throw down } })
    await expect(planBriefsStep(admin, { ...OPTS, lastAttempt: false }, early.deps)).rejects.toThrow(/schema cache/)
    expect(early.alerts).toEqual([])
    const last = hookDeps({ written: async () => { throw down } })
    expect((await planBriefsStep(admin, { ...OPTS, lastAttempt: true }, last.deps)).status).toBe('failed')
    expect(last.alerts).toHaveLength(1)
  })

  it('is not due once the month is written (the script may have written it)', async () => {
    expect((await duePlan({ written: async () => true })).status).toBe('not_due')
  })

  it('no monthly_briefs table: a quiet no-op that spends nothing', async () => {
    const { deps, alerts } = hookDeps({ applied: async () => false })
    expect((await planBriefsStep(admin, OPTS, deps)).status).toBe('skipped')
    expect(alerts).toEqual([])
  })

  it('a run near its model budget does not start the set: stored failed, alerted once with the script', async () => {
    const { deps, alerts, saved } = hookDeps({ spent: async () => 57 })
    expect((await planBriefsStep(admin, OPTS, deps)).status).toBe('failed')
    expect(saved[0].map((r) => r.status)).toEqual(['failed', 'failed', 'failed', 'failed'])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('scripts/monthly-briefs.ts --client client-1 --month 2026-09 --run run-oct')
  })

  it('a transient failure before the last attempt is thrown; on the last, stored failed and alerted once', async () => {
    const early = hookDeps({ inputs: async () => { throw new Error('TypeError: fetch failed') } })
    await expect(planBriefsStep(admin, { ...OPTS, lastAttempt: false }, early.deps)).rejects.toThrow(/fetch failed/)
    expect(early.alerts).toEqual([])
    expect(early.saved).toEqual([])
    const last = hookDeps({ inputs: async () => { throw new Error('TypeError: fetch failed') } })
    expect((await planBriefsStep(admin, { ...OPTS, lastAttempt: true }, last.deps)).status).toBe('failed')
    expect(last.alerts).toHaveLength(1)
    expect(last.saved).toHaveLength(1)
  })

  it('an alert that fails is swallowed: the step still returns', async () => {
    const { deps } = hookDeps({ spent: async () => 59, alert: async () => { throw new Error('smtp') } })
    expect((await planBriefsStep(admin, OPTS, deps)).status).toBe('failed')
  })
})

describe('briefs:research-i-of-n', () => {
  it('asks its wave\'s questions, each once, and returns the answers frozen', async () => {
    const plan = await duePlan()
    const { deps, spentOn, alerts } = hookDeps()
    const w = await briefResearchStep(admin, plan, 0, {}, deps)
    expect(spentOn).toEqual(plan.waves[0])
    expect(w.status).toBe('ok')
    expect(w.answers.flatMap((a) => a.grounded.flatMap((p) => p.quotes.map((q) => q.text)))).toEqual(Array(8).fill(''))
    expect(JSON.stringify(w)).not.toContain('a commenter wrote this')
    expect(alerts).toEqual([])
  })

  it('a question that runs past the step\'s clock is retried before the last attempt and recorded as failed on the last', async () => {
    const plan = await duePlan()
    let t = 0
    const slow = { research: async () => new Promise<never>(() => {}), now: () => t }
    const clock = briefClock({ startedAt: 0, budgetMs: 5_010, now: () => t })
    await expect(briefResearchStep(admin, plan, 1, { lastAttempt: false, clock }, hookDeps(slow).deps)).rejects.toThrow(/ran past the step's time/)
    t = 0
    const last = await briefResearchStep(admin, plan, 1, { lastAttempt: true, clock }, hookDeps(slow).deps)
    expect(last.failed).toEqual(plan.waves[1])
    expect(last.answers.every((a) => a.outcome === 'failed')).toBe(true)
  })

  it('a failed answer the agent returned for a dropped call retries the wave too', async () => {
    const plan = await duePlan()
    const dropped = { research: async (_a: unknown, args: { questions: { id: string }[] }) => ({ answers: [{ ...answer(args.questions[0].id, 0, 'failed'), error: '429 Rate limit reached' }], costUsd: 0, stoppedForBudget: false }) }
    await expect(briefResearchStep(admin, plan, 0, { lastAttempt: false }, hookDeps(dropped as never).deps)).rejects.toThrow(/429/)
  })

  it('a workspace with no searchable index blocks the set without alerting here', async () => {
    const plan = await duePlan()
    const { deps, alerts } = hookDeps({ research: async () => { throw new BuildBlockedError('This workspace has no searchable index yet') } })
    const w = await briefResearchStep(admin, plan, 0, {}, deps)
    expect(w.status).toBe('blocked')
    expect(alerts).toEqual([])
  })

  it('asks nothing once the set\'s room is down to what the later steps need', async () => {
    const plan = await duePlan()
    // The set has spent all but the later steps' worst case and a little.
    const { deps, spentOn } = hookDeps({ spent: async () => plan.spentAtPlan + BRIEF_SET_BUDGET_USD - BRIEF_AFTER_RESEARCH_USD - 0.1 })
    const w = await briefResearchStep(admin, plan, 2, {}, deps)
    expect(w.status).toBe('skipped')
    expect(w.error).toMatch(/no room left/)
    expect(spentOn).toEqual([])
  })

  it('splits the room among the wave\'s questions: never the whole to each, and only as many as fit', async () => {
    const plan = await duePlan()
    // Room for two questions' worst case after the later steps are kept back.
    const room = BRIEF_AFTER_RESEARCH_USD + 2 * BRIEF_STEP_MAX_USD.question + 0.05
    const given: number[] = []
    const { deps, spentOn } = hookDeps({
      spent: async () => plan.spentAtPlan + BRIEF_SET_BUDGET_USD - room,
      research: async (_a, args) => { given.push(args.budgetUsd); spentOn.push(args.questions[0].id); return { answers: [answer(args.questions[0].id, 2)], costUsd: 0.08, stoppedForBudget: false } },
    })
    const w = await briefResearchStep(admin, plan, 0, {}, deps)
    expect(spentOn).toEqual(plan.waves[0].slice(0, 2))
    expect(given.reduce((n, x) => n + x, 0)).toBeLessThanOrEqual(room - BRIEF_AFTER_RESEARCH_USD + 1e-9)
    expect(given.every((x) => x < room - BRIEF_AFTER_RESEARCH_USD)).toBe(true)
    expect(w.answers.map((a) => a.outcome)).toEqual(['answered', 'answered', 'unasked', 'unasked'])
    expect(w.failed).toEqual(plan.waves[0].slice(2))
  })

  it('reads the run\'s spend again on a retried attempt, so the calls of the attempt that failed are counted', async () => {
    const plan = await duePlan()
    let runSpent = plan.spentAtPlan
    let first = true
    const deps = hookDeps({
      spent: async () => runSpent,
      // The first attempt's calls are logged under the run, then the call drops.
      research: async (_a, args) => {
        runSpent += BRIEF_STEP_MAX_USD.question
        if (first) throw new Error('TypeError: fetch failed')
        return { answers: [answer(args.questions[0].id, 2)], costUsd: BRIEF_STEP_MAX_USD.question, stoppedForBudget: false }
      },
    }).deps
    await expect(briefResearchStep(admin, plan, 0, { lastAttempt: false }, deps)).rejects.toThrow(/fetch failed/)
    first = false
    const before = runSpent
    const asked: string[] = []
    const room = briefRoom({ runSpent: before, spentAtPlan: plan.spentAtPlan })
    await briefResearchStep(admin, plan, 0, { lastAttempt: true }, { ...deps, research: async (a, args) => { asked.push(args.questions[0].id); return deps.research!(a, args) } })
    expect(asked).toHaveLength(researchAllowance(room, 4).ask)
    expect(room).toBeCloseTo(BRIEF_SET_BUDGET_USD - 4 * BRIEF_STEP_MAX_USD.question)
  })
})

describe('the hard spend cap', () => {
  it('the room is the less of the set\'s cap and the run\'s budget less a margin', () => {
    expect(briefRoom({ runSpent: 10, spentAtPlan: 10, budget: 60 })).toBe(BRIEF_SET_BUDGET_USD)
    expect(briefRoom({ runSpent: 12, spentAtPlan: 10, budget: 60 })).toBe(BRIEF_SET_BUDGET_USD - 2)
    expect(briefRoom({ runSpent: 57, spentAtPlan: 56.5, budget: 60 })).toBeCloseTo(60 - BRIEF_RUN_MARGIN_USD - 57)
  })

  it('keeps every later step\'s worst case back', () => {
    expect(stillToCome('ideas')).toBeCloseTo(BRIEF_STEP_MAX_USD.ideas + 4 * BRIEF_STEP_MAX_USD.writer + BRIEF_STEP_MAX_USD.compose)
    expect(stillToCome('sales')).toBeCloseTo(4 * BRIEF_STEP_MAX_USD.writer + BRIEF_STEP_MAX_USD.compose)
    expect(stillToCome('leadership')).toBeCloseTo(BRIEF_STEP_MAX_USD.writer + BRIEF_STEP_MAX_USD.compose)
    expect(stillToCome('compose')).toBe(BRIEF_STEP_MAX_USD.compose)
    expect(BRIEF_AFTER_RESEARCH_USD).toBeCloseTo(stillToCome('ideas'))
  })

  it('a wave asks only what its share of the room covers', () => {
    expect(researchAllowance(BRIEF_AFTER_RESEARCH_USD - 0.01, 4)).toEqual({ ask: 0, eachUsd: 0 })
    expect(researchAllowance(BRIEF_AFTER_RESEARCH_USD + 1.5 * BRIEF_STEP_MAX_USD.question, 4).ask).toBe(1)
    const full = researchAllowance(BRIEF_SET_BUDGET_USD, 4)
    expect(full.ask).toBe(4)
    expect(full.ask * full.eachUsd).toBeLessThanOrEqual(BRIEF_SET_BUDGET_USD - BRIEF_AFTER_RESEARCH_USD + 1e-9)
  })

  it('at September\'s measured costs every question is still asked', async () => {
    let runSpent = 20
    const plan = await planBriefsStep(admin, OPTS, hookDeps({ spent: async () => runSpent }).deps)
    const asked: string[] = []
    const deps = hookDeps({
      spent: async () => runSpent,
      research: async (_a, args) => { asked.push(args.questions[0].id); runSpent += 0.12; return { answers: [answer(args.questions[0].id, 2)], costUsd: 0.12, stoppedForBudget: false } },
    }).deps
    for (let w = 0; w < plan.waves.length; w++) await briefResearchStep(admin, plan, w, {}, deps)
    expect(asked).toEqual(plan.questions.map((q) => q.id))
  })

  it('never lets the set push the run past its budget, whatever each call costs up to its worst case', async () => {
    for (const start of [10, RUN_MODEL_BUDGET_USD - BRIEF_HEADROOM_USD, RUN_MODEL_BUDGET_USD - BRIEF_HEADROOM_USD - 0.3]) {
      for (const scale of [0.3, 1]) {
        let runSpent = start
        const spend = (usd: number) => { runSpent += usd * scale; return usd * scale }
        const { deps, alerts } = hookDeps({
          spent: async () => runSpent,
          research: async (_a, args) => ({ answers: [answer(args.questions[0].id, 2)], costUsd: spend(BRIEF_STEP_MAX_USD.question), stoppedForBudget: false }),
          ideas: async () => ({ raw: { ideas: [] }, costUsd: spend(BRIEF_STEP_MAX_USD.ideas), prompts: { system: '', user: '' }, check: { contradicted: new Map(), ran: true, costUsd: 0 }, allocation: { ideas: [], byRole: { sales: [], marketing: [], content: [], leadership: [] }, held: [] } }),
          write: async () => ({ raw: { findings: [] } as never, prompts: { system: '', user: '' }, costUsd: spend(BRIEF_STEP_MAX_USD.writer) }),
          compose: (async () => { spend(BRIEF_STEP_MAX_USD.compose); return { briefs: {}, costUsd: 0 } }) as never,
          store: (async () => []) as never,
        })
        const plan = await planBriefsStep(admin, OPTS, deps)
        expect(plan.status).toBe('due')
        const waves: BriefWave[] = []
        for (let w = 0; w < plan.waves.length; w++) waves.push(await briefResearchStep(admin, plan, w, {}, deps))
        const ideas = await briefIdeasStep(admin, plan, waves, {}, deps)
        expect(ideas.status).toBe('ok')
        const written: BriefWritten[] = []
        for (const role of BRIEF_ROLES) written.push(await briefWriteStep(admin, plan, ideas, role, {}, deps))
        expect(written.every((w) => w.status === 'ok')).toBe(true)
        await briefComposeStep(admin, plan, waves, ideas, written, {}, deps)
        expect(runSpent - start).toBeLessThanOrEqual(BRIEF_SET_BUDGET_USD + 1e-9)
        expect(runSpent).toBeLessThanOrEqual(RUN_MODEL_BUDGET_USD - BRIEF_RUN_MARGIN_USD + 1e-9)
        expect(alerts).toEqual([])
      }
    }
  })

  it('a later step the room no longer covers stops the set before it calls anything: stored failed, alerted once', async () => {
    const plan = await duePlan()
    const waves = [{ status: 'ok', answers: [answer('sales.who', 2)], window: { from: '2026-07-03', to: '2026-10-01' }, costUsd: 0.1, failed: [] } as BriefWave]
    let called = 0
    const broke = hookDeps({ spent: async () => plan.spentAtPlan + BRIEF_SET_BUDGET_USD - stillToCome('ideas') + 0.01, ideas: async () => { called++; throw new Error('no') } })
    const ideas = await briefIdeasStep(admin, plan, waves, {}, broke.deps)
    expect(ideas.status).toBe('failed')
    expect(ideas.error).toMatch(/budget is spent/)
    expect(called).toBe(0)
    expect(broke.alerts).toHaveLength(1)
    expect(broke.alerts[0].text).toContain('The September 2026 briefs')
    expect(broke.saved[0].map((r) => r.status)).toEqual(['failed', 'failed', 'failed', 'failed'])
    const okIdeas = await briefIdeasStep(admin, plan, waves, {}, hookDeps().deps)
    let wrote = 0
    const late = hookDeps({ spent: async () => plan.spentAtPlan + BRIEF_SET_BUDGET_USD - stillToCome('content') + 0.01, write: async () => { wrote++; throw new Error('no') } })
    expect((await briefWriteStep(admin, plan, okIdeas, 'content', {}, late.deps)).error).toMatch(/budget is spent/)
    expect(wrote).toBe(0)
    expect(late.alerts).toHaveLength(1)
  })

  it('a spend read that fails is retried before the last attempt and fails the set on it: the cap is never guessed', async () => {
    const plan = await duePlan()
    const okIdeas = await briefIdeasStep(admin, plan, [{ status: 'ok', answers: [answer('sales.who', 2)], window: { from: '2026-07-03', to: '2026-10-01' }, costUsd: 0.1, failed: [] }], {}, hookDeps().deps)
    const down = async () => { throw new Error('ai_call_log: TypeError: fetch failed') }
    await expect(briefWriteStep(admin, plan, okIdeas, 'sales', { lastAttempt: false }, hookDeps({ spent: down }).deps)).rejects.toThrow(/fetch failed/)
    const last = hookDeps({ spent: down })
    expect((await briefWriteStep(admin, plan, okIdeas, 'sales', { lastAttempt: true }, last.deps)).status).toBe('failed')
    expect(last.alerts).toHaveLength(1)
  })
})

describe('briefs:ideas, briefs:write-role and briefs:compose', () => {
  const wavesOf = async (plan: BriefPlan): Promise<BriefWave[]> => {
    const { deps } = hookDeps()
    const out: BriefWave[] = []
    for (let w = 0; w < plan.waves.length; w++) out.push(await briefResearchStep(admin, plan, w, {}, deps))
    return out
  }

  it('counts the research, drafts the ideas and returns no comment\'s words', async () => {
    const plan = await duePlan()
    const ideas = await briefIdeasStep(admin, plan, await wavesOf(plan), {}, hookDeps().deps)
    expect(ideas.status).toBe('ok')
    expect(ideas.points.length).toBe(plan.questions.length * 2)
    expect(ideas.researchUsd).toBeCloseTo(plan.questions.length * 0.08)
  })

  it('fails the set once, with the script, where the research brought nothing back', async () => {
    const plan = await duePlan()
    const nothing = plan.waves.map((): BriefWave => ({ status: 'ok', answers: [], window: { from: '2026-07-03', to: '2026-10-01' }, costUsd: 0, failed: [] }))
    const { deps, alerts, saved } = hookDeps()
    expect((await briefIdeasStep(admin, plan, nothing, {}, deps)).status).toBe('failed')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain(BRIEFS_FALLBACK('client-1', SEP, 'run-oct'))
    expect(saved[0]).toHaveLength(4)
  })

  it('a writer that cannot write fails the set on its last attempt, and retries before it', async () => {
    const plan = await duePlan()
    const ideas = await briefIdeasStep(admin, plan, await wavesOf(plan), {}, hookDeps().deps)
    const early = hookDeps({ write: async () => { throw timedOut() } })
    await expect(briefWriteStep(admin, plan, ideas, 'sales', { lastAttempt: false }, early.deps)).rejects.toThrow(/timed out/)
    expect(early.alerts).toEqual([])
    const last = hookDeps({ write: async () => { throw timedOut() } })
    expect((await briefWriteStep(admin, plan, ideas, 'sales', { lastAttempt: true }, last.deps)).status).toBe('failed')
    expect(last.alerts).toHaveLength(1)
    // A bad answer is not transient: it fails at once.
    const bad = hookDeps({ write: async () => { throw new Error('monthly_brief_sales failed twice: no parsed output') } })
    expect((await briefWriteStep(admin, plan, ideas, 'sales', { lastAttempt: false }, bad.deps)).status).toBe('failed')
    expect(bad.alerts).toHaveLength(1)
  })

  it('after a failed step, every later step does nothing and says nothing', async () => {
    const plan = await duePlan()
    const failedIdeas: BriefIdeas = { status: 'failed', points: [], window: null, raw: null, contradicted: [], allocation: null, researchUsd: 0, costUsd: 0 }
    const { deps, alerts, saved } = hookDeps()
    expect((await briefWriteStep(admin, plan, failedIdeas, 'sales', {}, deps)).status).toBe('failed')
    expect((await briefComposeStep(admin, plan, [], failedIdeas, [], {}, deps)).status).toBe('failed')
    expect(alerts).toEqual([])
    expect(saved).toEqual([])
  })

  it('composes the four writers\' output against the ideas step\'s allocation and stores the set', async () => {
    const plan = await duePlan()
    const waves = await wavesOf(plan)
    const ideas = await briefIdeasStep(admin, plan, waves, {}, hookDeps().deps)
    const written: BriefWritten[] = BRIEF_ROLES.map((role) => ({ status: 'ok', role, raw: { findings: [] } as never, costUsd: 0.07 }))
    let given: Record<string, unknown> = {}
    const stored: unknown[] = []
    const brief = (role: MonthlyBriefData['role']) => ({ role, findings: [], sections: [{}], inShort: { summary: '', figures: [], also: [] }, held: [] }) as unknown as MonthlyBriefData
    const { deps, alerts } = hookDeps({
      compose: (async (_a: unknown, _i: unknown, _q: unknown, _g: unknown, o: Record<string, unknown>) => { given = o; return { briefs: Object.fromEntries(BRIEF_ROLES.map((r) => [r, { data: brief(r) }])), costUsd: 0.1 } }) as never,
      store: (async (_a: unknown, a: { briefs: MonthlyBriefData[] }) => { stored.push(a); return a.briefs.map((b) => ({ role: b.role, status: 'ready' })) }) as never,
    })
    const out = await briefComposeStep(admin, plan, waves, ideas, written, {}, deps)
    expect(out.status).toBe('ready')
    expect(given.allocation).toBe(ideas.allocation)
    expect(given.log).toBe(true)
    expect(Object.keys(given.written as object)).toEqual([...BRIEF_ROLES])
    expect(stored).toHaveLength(1)
    expect(alerts).toEqual([])
  })

  it('a compose that fails on its last attempt stores the set failed and alerts once', async () => {
    const plan = await duePlan()
    const waves = await wavesOf(plan)
    const ideas = await briefIdeasStep(admin, plan, waves, {}, hookDeps().deps)
    const written: BriefWritten[] = BRIEF_ROLES.map((role) => ({ status: 'ok', role, raw: { findings: [] } as never, costUsd: 0.07 }))
    const { deps, alerts, saved } = hookDeps({ compose: (async () => { throw new Error('judge 500') }) as never })
    expect((await briefComposeStep(admin, plan, waves, ideas, written, { lastAttempt: true }, deps)).status).toBe('failed')
    expect(alerts).toHaveLength(1)
    expect(saved[0].every((r) => r.status === 'failed')).toBe(true)
  })
})

// ---- The pipeline --------------------------------------------------------------------------------

/** Every step id in source order (scripts/pipeline-step-ids.sh, ported, as
 *  lib/written/step.test.ts does). */
function stepIds(src: string): string[] {
  const re = /\bstep\s*\.\s*(run|sendEvent)\s*\(/g
  const out: string[] = []
  while (re.exec(src)) {
    let i = re.lastIndex
    let depth = 0
    let q: string | null = null
    let arg = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (q) {
        arg += c
        if (c === '\\') { arg += src[++i]; continue }
        if (q === '`' && c === '$' && src[i + 1] === '{') { depth++; arg += src[++i]; continue }
        if (c === q && depth === 0) q = null
        else if (q === '`' && c === '}' && depth > 0) depth--
        continue
      }
      if (c === "'" || c === '"' || c === '`') { q = c; arg += c; continue }
      if (c === '(' || c === '{' || c === '[') depth++
      if (c === ')' || c === '}' || c === ']') { if (depth === 0) break; depth-- }
      if (c === ',' && depth === 0) break
      arg += c
    }
    out.push(arg.replace(/\s+/g, ' ').trim().replace(/^['"]|['"]$/g, ''))
  }
  return out
}

describe('the pipeline carries the month\'s briefs', () => {
  const src = readFileSync(new URL('../../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const ids = stepIds(src)

  it('hands both month-closing steps the run\'s own window and whether it is a test, read off nothing', () => {
    expect(src).toContain('const closingWindow = runWindow?.start ? { from: runWindow.start, to: runWindow.end } : null')
    expect(src).toContain('const testRun = isTestRun({ id: runId, options })')
    expect(src).toMatch(/runLongRunStep\(admin, \{ clientId, runId, company, lastAttempt: [^}]*, window: closingWindow, testRun \}\)/)
  })

  it('as five additive ids in their own position: after write-longrun-read, immediately before close-run, in this order (71 in all)', () => {
    expect(ids).toHaveLength(71)
    const at = ids.indexOf('plan-briefs')
    expect(ids[at - 1]).toBe('write-longrun-read')
    expect(ids.slice(at, at + 6)).toEqual([
      'plan-briefs',
      '`briefs:research-${w + 1}-of-${briefPlan.waves.length}`',
      'briefs:ideas',
      '`briefs:write-${role}`',
      'briefs:compose',
      'close-run',
    ])
    for (const id of ['plan-briefs', 'briefs:ideas', 'briefs:compose']) expect(ids.filter((x) => x === id)).toHaveLength(1)
  })

  it('fail-soft: every step is retried until its last attempt, and its .catch only logs', () => {
    const body = src.slice(src.indexOf("// The month's four department briefs"), src.indexOf('// 7. Close the run.'))
    expect(body).toContain('const briefsLast = () => attempt >= (maxAttempts ?? 3) - 1')
    expect(body.match(/lastAttempt: briefsLast\(\)/g)).toHaveLength(5)
    for (const handler of body.split('.catch(').slice(1)) {
      const h = handler.slice(0, handler.indexOf('})'))
      expect(h).toMatch(/console\.error\(`\[(plan-briefs|briefs:[a-z${}+ 1-]+)\] out of retries/)
      expect(h).toMatch(/return null/)
      expect(h).not.toMatch(/sendAlertEmail|noteError/)
    }
    // Due from the run's own window, and a test run named, with no read.
    expect(body).toContain('planBriefsStep(createAdminClient(), { clientId, runId, window: closingWindow, testRun, lastAttempt: briefsLast() })')
    // Only a due plan runs the rest; a failed writer stops the writers.
    expect(body).toContain("if (briefPlan?.status === 'due')")
    expect(body).toContain("if (w?.status !== 'ok') break")
  })
})
