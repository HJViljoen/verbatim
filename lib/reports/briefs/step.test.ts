import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { BuildBlockedError, type ResearchAnswer } from '../documents/research'
import { alsoOnlyPrinted, numberPoints, type BriefSetInputs } from './build'
import { briefClock } from './clock'
import {
  BRIEF_HEADROOM_USD, BRIEF_RESEARCH_WAVE, BRIEFS_FALLBACK, briefComposeStep, briefHeadroom, briefIdeasStep, briefResearchStep, briefWriteStep, planBriefsStep,
  researchWaves, stepSafeInputs, type BriefIdeas, type BriefPlan, type BriefStepDeps, type BriefWave, type BriefWritten,
} from './step'
import { briefPrints, failedRows, setWritten, type MonthlyBriefRow } from './store'
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
const OPTS = { clientId: 'client-1', runId: 'run-oct', company: 'Acme' }

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
    window: async () => CLOSING,
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

  it('every other run is a no-op: reads the window and spends nothing', async () => {
    let written = 0
    const { deps, alerts, saved } = hookDeps({ window: async () => MID_MONTH, written: async () => { written++; return false }, inputs: async () => { throw new Error('read') } })
    expect(await planBriefsStep(admin, OPTS, deps)).toMatchObject({ status: 'not_due', month: null, waves: [] })
    expect(written).toBe(0)
    expect(alerts).toEqual([])
    expect(saved).toEqual([])
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
    const w = await briefResearchStep(admin, plan, 0, { spentUsd: 0 }, deps)
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
    await expect(briefResearchStep(admin, plan, 1, { spentUsd: 0, lastAttempt: false, clock }, hookDeps(slow).deps)).rejects.toThrow(/ran past the step's time/)
    t = 0
    const last = await briefResearchStep(admin, plan, 1, { spentUsd: 0, lastAttempt: true, clock }, hookDeps(slow).deps)
    expect(last.failed).toEqual(plan.waves[1])
    expect(last.answers.every((a) => a.outcome === 'failed')).toBe(true)
  })

  it('a failed answer the agent returned for a dropped call retries the wave too', async () => {
    const plan = await duePlan()
    const dropped = { research: async (_a: unknown, args: { questions: { id: string }[] }) => ({ answers: [{ ...answer(args.questions[0].id, 0, 'failed'), error: '429 Rate limit reached' }], costUsd: 0, stoppedForBudget: false }) }
    await expect(briefResearchStep(admin, plan, 0, { spentUsd: 0, lastAttempt: false }, hookDeps(dropped as never).deps)).rejects.toThrow(/429/)
  })

  it('a workspace with no searchable index blocks the set without alerting here', async () => {
    const plan = await duePlan()
    const { deps, alerts } = hookDeps({ research: async () => { throw new BuildBlockedError('This workspace has no searchable index yet') } })
    const w = await briefResearchStep(admin, plan, 0, { spentUsd: 0 }, deps)
    expect(w.status).toBe('blocked')
    expect(alerts).toEqual([])
  })

  it('asks nothing once the research budget is spent', async () => {
    const plan = await duePlan()
    const { deps, spentOn } = hookDeps()
    expect((await briefResearchStep(admin, plan, 2, { spentUsd: 3 }, deps)).status).toBe('skipped')
    expect(spentOn).toEqual([])
  })
})

describe('briefs:ideas, briefs:write-role and briefs:compose', () => {
  const wavesOf = async (plan: BriefPlan): Promise<BriefWave[]> => {
    const { deps } = hookDeps()
    const out: BriefWave[] = []
    for (let w = 0; w < plan.waves.length; w++) out.push(await briefResearchStep(admin, plan, w, { spentUsd: 0 }, deps))
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
    // Only a due plan runs the rest; a failed writer stops the writers.
    expect(body).toContain("if (briefPlan?.status === 'due')")
    expect(body).toContain("if (w?.status !== 'ok') break")
  })
})
