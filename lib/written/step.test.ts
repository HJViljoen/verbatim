import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { composeWeekRead } from './compose'
import { checkableHeadlines, rowOf, runWeekReadStep, storyFitTargets, type BuiltWeekRead, type WeekReadStepDeps } from './step'
import type { WeekReadRow } from './store'
import { candidate, pool, written } from './test-fixtures'
import { writerFigures } from './write'

// The `write-week-read` step (plan T4): its body never throws, a failure
// stores a failed row and alerts once, and the pipeline carries it as one
// additive id in its own position. The build, the table and the mail are
// stand-ins; the pipeline is read as text (importing it would drag Inngest in).

const admin = {} as SupabaseClient
const OPTS = { clientId: 'client-1', runId: 'run-27', company: 'Sealand' }
const NOT_DUE = { status: 'not_due' as const, month: '2026-08-01', ideas: 0, costUsd: 0 }

function built(findings: number, called = true): BuiltWeekRead {
  const cs = [candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })]
  const p = pool(cs)
  const data = composeWeekRead({
    pool: p,
    standing: [],
    written: called
      ? written({
          findings: cs.slice(0, findings).map((c) => ({ headline: `On ${c.label}`, saw: 'Buyers describe it.', means: 'It matters.', based_on: [c.id], quote_from: null })),
          story: [{ paragraph: 'The week.', based_on: ['C1'], quote_from: 'C1' }],
          week_in_one_line: 'The week.',
        })
      : null,
    subjects: [],
    writerFigures: writerFigures(p),
    model: called ? 'gpt-5.4' : '',
    costUsd: called ? 0.21 : 0,
  })
  return { status: data.findings.length > 0 ? 'ready' : 'thin', data, pool: p, standing: [], called, raw: null, scrub: null, check: null, fit: null }
}

function deps(over: Partial<WeekReadStepDeps> = {}) {
  const saved: WeekReadRow[] = []
  const alerts: { subject: string; text: string }[] = []
  const d: Partial<WeekReadStepDeps> = {
    applied: async () => true,
    build: async () => built(2),
    save: async (_a, row) => { saved.push(row) },
    alert: async (subject, text) => { alerts.push({ subject, text }); return { sent: true } },
    longRun: async () => NOT_DUE,
    ...over,
  }
  return { d, saved, alerts }
}

describe('runWeekReadStep', () => {
  it('stores a ready read and says nothing to the operator', async () => {
    const { d, saved, alerts } = deps()
    const r = await runWeekReadStep(admin, OPTS, d)
    expect(r).toEqual({ status: 'ready', findings: 2, held: 0, costUsd: 0.21, longRun: NOT_DUE })
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ client_id: 'client-1', run_id: 'run-27', kind: 'week', month: '2026-09-01', status: 'ready', cost_usd: 0.21 })
    expect(saved[0].window_start).toBe('2026-09-20T04:18:00+00:00')
    expect(alerts).toEqual([])
  })

  it('a thin week stores thin with no call and no alert', async () => {
    const { d, saved, alerts } = deps({ build: async () => built(0, false) })
    expect((await runWeekReadStep(admin, OPTS, d)).status).toBe('thin')
    expect(saved[0]).toMatchObject({ status: 'thin', cost_usd: 0 })
    expect(saved[0].data && 'findings' in saved[0].data ? saved[0].data.findings : null).toEqual([])
    expect(alerts).toEqual([])
  })

  it('a written week whose every finding was held is stored thin, and the operator hears once', async () => {
    const b = built(1)
    b.data = { ...b.data, findings: [], held: [{ reason: 'the conversation contradicts it', headline: 'Wrong' }] }
    b.status = 'thin'
    const { d, alerts } = deps({ build: async () => b })
    expect((await runWeekReadStep(admin, OPTS, d)).status).toBe('thin')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('Wrong: the conversation contradicts it')
  })

  it('a thrown writer leaves a failed row and one alert, and the step does not throw', async () => {
    const { d, saved, alerts } = deps({ build: async () => { throw new Error("The week's read could not be written twice over: 500") } })
    const r = await runWeekReadStep(admin, OPTS, d)
    expect(r).toMatchObject({ status: 'failed', findings: 0, costUsd: 0 })
    expect(r.error).toContain('500')
    expect(saved).toEqual([{ client_id: 'client-1', run_id: 'run-27', kind: 'week', month: null, window_start: null, window_end: null, data: null, status: 'failed', cost_usd: 0 }])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].subject).toBe('Verbatim week read failed: Sealand')
    expect(alerts[0].text).toContain('scripts/week-read.ts --client client-1 --run run-27')
  })

  it('a store that fails too still alerts once and never throws', async () => {
    const { d, alerts } = deps({ save: async () => { throw new Error('week_reads write: boom') } })
    const r = await runWeekReadStep(admin, OPTS, d)
    expect(r.status).toBe('failed')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('No row could be stored')
  })

  it('no table yet: nothing built, nothing spent, one alert', async () => {
    let builds = 0
    const { d, saved, alerts } = deps({ applied: async () => false, build: async () => { builds++; return built(2) } })
    expect(await runWeekReadStep(admin, OPTS, d)).toEqual({ status: 'missing_migration', findings: 0, held: 0, costUsd: 0 })
    expect(builds).toBe(0)
    expect(saved).toEqual([])
    expect(alerts).toHaveLength(1)
  })

  it('runs the long-run hook after the week is stored, with the step clock and its own save and alert', async () => {
    const calls: { opts: unknown; saved: number }[] = []
    const { d, saved } = deps({ longRun: async (_a, opts) => { calls.push({ opts, saved: saved.length }); return NOT_DUE } })
    const r = await runWeekReadStep(admin, OPTS, d)
    expect(calls).toHaveLength(1)
    expect(calls[0].saved).toBe(1)
    expect(calls[0].opts).toMatchObject({ clientId: 'client-1', runId: 'run-27', company: 'Sealand' })
    expect(r.longRun).toEqual(NOT_DUE)
  })

  it('a long-run hook that throws never fails the week', async () => {
    const { d, alerts } = deps({ longRun: async () => { throw new Error('boom') } })
    const r = await runWeekReadStep(admin, OPTS, d)
    expect(r.status).toBe('ready')
    expect(r.longRun).toMatchObject({ status: 'skipped', error: 'boom' })
    expect(alerts).toEqual([])
  })

  it('a failed week runs no long-run hook', async () => {
    let ran = 0
    const { d } = deps({ build: async () => { throw new Error('x') }, longRun: async () => { ran++; return NOT_DUE } })
    await runWeekReadStep(admin, OPTS, d)
    expect(ran).toBe(0)
  })

  it('rowOf keeps quotes as refs, the story\'s too, and stores the v3 shape', () => {
    const row = rowOf('client-1', 'run-27', built(2))
    expect(row.data).toMatchObject({ version: 2, promptVersion: 'week_read_v3', headline: 'The week.' })
    expect(row.data?.version === 2 && row.data.story[0].quote?.ref).toMatch(/^e:/)
    expect(JSON.stringify(row.data)).not.toMatch(/"text":"[^"]/)
  })
})

describe('what the step hands the self-check and the fit (v3)', () => {
  const p = pool([candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })])

  it("the self-check reads every finding headline that could print, then the week's line and each report line on its own", () => {
    const w = written({
      findings: [
        { headline: 'Straps decide comfort', saw: 's', means: 'm', based_on: ['C1'], quote_from: null },
        { headline: 'Invented', saw: 's', means: 'm', based_on: ['C9'], quote_from: null },
        { headline: '', saw: 's', means: 'm', based_on: ['C2'], quote_from: null },
      ],
      story: [
        { paragraph: 'The week was about carrying weight.', based_on: ['C1'], quote_from: null },
        { paragraph: 'On nothing.', based_on: ['C9'], quote_from: null },
        { paragraph: '', based_on: ['C1'], quote_from: null },
      ],
      implications: [{ implication: 'The bag is judged loaded.', based_on: ['C2'] }],
      watch: [{ question: 'Whether buyers keep asking about hip belts', based_on: ['C1'] }],
      week_in_one_line: 'Buyers judged bags by how they carry.',
    })
    expect(checkableHeadlines(p, w)).toEqual([
      'Straps decide comfort',
      'Buyers judged bags by how they carry.',
      'The week was about carrying weight.',
      'The bag is judged loaded.',
      'Whether buyers keep asking about hip belts',
    ])
    // No finding could print: nothing has anything to stand on, and nothing is checked.
    expect(checkableHeadlines(p, { ...w, findings: [] })).toEqual([])
  })

  it('the fit measures each story paragraph that points to a voice, against that one candidate', () => {
    const targets = storyFitTargets(written({
      story: [
        { paragraph: 'One.', based_on: ['C1', 'C2'], quote_from: 'C2' },
        { paragraph: 'Two.', based_on: ['C1'], quote_from: null },
        { paragraph: '', based_on: ['C1'], quote_from: 'C1' },
      ],
    }))
    expect(targets).toEqual([{ index: 0, text: 'One.', based_on: ['C2'] }])
  })
})

// ---- The pipeline ---------------------------------------------------------------------------

/** Every step id in source order: the first argument of each step.run /
 *  step.sendEvent, as written (scripts/pipeline-step-ids.sh, ported). */
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

describe('the pipeline carries write-week-read', () => {
  const src = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const ids = stepIds(src)

  it('as one additive id: 64 in all, immediately after ask-reevaluate and before close-run', () => {
    expect(ids).toHaveLength(64)
    expect(ids.filter((id) => id === 'write-week-read')).toHaveLength(1)
    const at = ids.indexOf('write-week-read')
    expect(ids[at - 1]).toBe('ask-reevaluate')
    expect(ids[at + 1]).toBe('close-run')
  })

  it('outside the consumer-profile flag, fail-soft: its .catch logs and returns null, and sends nothing', () => {
    const body = src.slice(src.indexOf(".run('write-week-read'"), src.indexOf('// 7. Close the run.'))
    expect(body).toContain('runWeekReadStep(admin, { clientId, runId')
    const handler = body.slice(body.indexOf('.catch('))
    expect(handler).toMatch(/console\.error\(`\[write-week-read\] out of retries/)
    expect(handler).toMatch(/return null/)
    expect(handler).not.toMatch(/sendAlertEmail|noteError/)
    // Not inside `if (flags.consumerProfile)`: the block before it closes first.
    const before = src.slice(src.indexOf(".run('ask-reevaluate'"), src.indexOf(".run('write-week-read'"))
    expect(before).toMatch(/\n {4}\}\n/)
  })
})
