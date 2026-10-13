import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { postIdeasEnabled } from '../config'
import { AFTER_GATHER_STEPS } from '../reading/week-line'
import { WeekReadTimeoutError } from '../written/deadline'
import type { ParseClient } from '../written/write-model'
import type { PostIdeaInsert } from './compose'
import { choosePlay, withHandles } from './select'
import { buildPostIdeas, finishPostIdeas, ownedFrom, runPostIdeasStep, type BuiltPostIdeas, type PostIdeaInputs, type PostIdeasStepDeps } from './step'
import { buildPostIdeaPrompts, generatePostIdeas, POST_IDEAS_MODEL, POST_IDEAS_PROMPT_VERSION, PostIdeasWriteError, type PostIdeasOutput } from './write'

// The `write-post-ideas` step (T13): silent where it should be, fail-soft in
// the week read's way, one alert inside the step and never in its `.catch`,
// and an additive id in its own position.

const admin = {} as SupabaseClient
const CLIENT = '00000000-0000-4000-8000-0000000000c0'
const RUN = '00000000-0000-4000-8000-0000000000a1'

const CANDIDATES = withHandles([
  { themeId: 'th-1', label: 'Questions about liner lifespan', description: 'How long a liner lasts.', weekVideos: 9, lenientVideos: 8, touch: 'none', play: choosePlay([], '2026-10-01'),
    comments: [{ commentId: 'cm-1', videoId: 'v1', text: 'How long should my liner last?' }, { commentId: 'cm-2', videoId: 'v2', text: 'When do I replace the liner?' }] },
])

const INPUTS: PostIdeaInputs = {
  clientId: CLIENT, runId: RUN, company: 'Össur', sells: null, window: { from: '2026-10-05T00:00:00Z', to: '2026-10-12T00:00:00Z' }, month: '2026-10-01',
  candidates: CANDIDATES, considered: [], covered: [], ownPosts: 7, allow: [],
}

const OUTPUT: PostIdeasOutput = {
  ideas: [{ question: 'Q1', title: 'How long does a liner last?', cover: 'How long liners usually last and the signs it is time to replace one', subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2'] }] }],
}

const READY: BuiltPostIdeas = finishPostIdeas(INPUTS, OUTPUT, 0.06)
const THIN: BuiltPostIdeas = { status: 'thin', ideas: [], held: [], rows: [], called: false, costUsd: 0, scrub: null, raw: null, inputs: { ...INPUTS, candidates: [] } }
const HELD: BuiltPostIdeas = finishPostIdeas(INPUTS, { ideas: [{ ...OUTPUT.ideas[0], cover: 'A new liner prevents skin irritation.' }] }, 0.05)

function deps(over: Partial<PostIdeasStepDeps> = {}) {
  const saved: PostIdeaInsert[][] = []
  const alerts: string[] = []
  const d: PostIdeasStepDeps = {
    enabled: vi.fn(() => true),
    company: vi.fn(async () => 'Össur'),
    existing: vi.fn(async () => 0),
    build: vi.fn(async () => READY) as unknown as PostIdeasStepDeps['build'],
    save: vi.fn(async (_a, rows) => { saved.push([...rows]) }),
    alert: vi.fn(async (subject: string) => { alerts.push(subject); return { sent: true } }),
    ...over,
  }
  return { d, saved, alerts }
}

describe('runPostIdeasStep: silent where it should be', () => {
  it('a TEST run reads nothing, writes nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps()
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: true }, d)).toMatchObject({ status: 'test_run', costUsd: 0 })
    expect(d.existing).not.toHaveBeenCalled()
    expect(d.build).not.toHaveBeenCalled()
    expect([saved, alerts]).toEqual([[], []])
  })

  it('a tenant switched off reads nothing, writes nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps({ enabled: vi.fn(() => false) })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'disabled', costUsd: 0 })
    expect(d.enabled).toHaveBeenCalledWith(CLIENT)
    expect(d.existing).not.toHaveBeenCalled()
    expect(d.build).not.toHaveBeenCalled()
    expect([saved, alerts]).toEqual([[], []])
  })

  it('no post_ideas table is a no-op that spends nothing, logged and never alerted', async () => {
    const { d, saved, alerts } = deps({ existing: vi.fn(async () => null) })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'missing_migration' })
    expect(d.build).not.toHaveBeenCalled()
    expect([saved, alerts]).toEqual([[], []])
  })

  it('a run that already has its ideas (a retry after the write) spends nothing again', async () => {
    const { d, saved } = deps({ existing: vi.fn(async () => 3) })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'exists', ideas: 3 })
    expect(d.build).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('a thin week stores nothing and tells nobody', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => THIN) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'thin' })
    expect([saved, alerts]).toEqual([[], []])
  })
})

describe('runPostIdeasStep: stores the run\'s ideas', () => {
  it('upserts the rows on the step\'s clock and returns what it stored', async () => {
    const { d, saved, alerts } = deps()
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toEqual({ status: 'ready', ideas: 1, held: 0, costUsd: 0.06 })
    expect(saved).toHaveLength(1)
    expect(saved[0][0]).toMatchObject({ client_id: CLIENT, run_id: RUN, rank: 1, registry_id: 'th-1', model: POST_IDEAS_MODEL, prompt_version: POST_IDEAS_PROMPT_VERSION })
    expect(alerts).toEqual([])
    const call = (d.build as unknown as { mock: { calls: [SupabaseClient, { log: boolean; budget?: unknown }][] } }).mock.calls[0][1]
    expect(call.log).toBe(true)
    expect(call.budget).toBeDefined()
  })

  it('a week whose every idea the scrub held stores nothing and alerts once, naming why', async () => {
    expect(HELD.status).toBe('held')
    const { d, saved, alerts } = deps({ build: vi.fn(async () => HELD) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toMatchObject({ status: 'held', ideas: 0, held: 1 })
    expect(saved).toEqual([[]])
    expect(alerts).toEqual(['Verbatim post ideas empty: Össur'])
    expect((d.alert as unknown as { mock: { calls: [string, string][] } }).mock.calls[0][1]).toContain('cover held (effect on the body)')
  })
})

describe('runPostIdeasStep: fail-soft, the week read\'s contract', () => {
  const timeout = () => new WeekReadTimeoutError('the writer call timed out (cap 150 s)')

  it('a transient failure before the last attempt throws, with nothing stored and nobody told', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => { throw timeout() }) as unknown as PostIdeasStepDeps['build'] })
    await expect(runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, d)).rejects.toThrow(/timed out/)
    expect([saved, alerts]).toEqual([[], []])
  })

  it('on the last attempt it never throws, and alerts once inside the step', async () => {
    const { d, alerts } = deps({ build: vi.fn(async () => { throw timeout() }) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: true }, d)).toMatchObject({ status: 'failed' })
    // Named as the week read names it: the company, never the uuid.
    expect(alerts).toEqual(['Verbatim post ideas failed: Össur'])
    expect((d.alert as unknown as { mock: { calls: [string, string][] } }).mock.calls[0][1]).toContain(`scripts/post-ideas.ts --client ${CLIENT} --run ${RUN} --dry-run`)
  })

  it('names the client by its id only where its name cannot be read', async () => {
    const { d, alerts } = deps({ company: vi.fn(async () => { throw new Error('fetch failed') }), build: vi.fn(async () => { throw new PostIdeasWriteError('no parsed output') }) as unknown as PostIdeasStepDeps['build'] })
    await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)
    expect(alerts).toEqual([`Verbatim post ideas failed: ${CLIENT}`])
  })

  it('a failure that no retry fixes alerts at once, on any attempt; a failed alert is swallowed', async () => {
    const { d, alerts } = deps({ build: vi.fn(async () => { throw new PostIdeasWriteError('could not be written twice over: no parsed output') }) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, d)).toMatchObject({ status: 'failed' })
    expect(alerts).toHaveLength(1)
    const loud = deps({ save: vi.fn(async () => { throw new Error('post_ideas: permission denied') }), alert: vi.fn(async () => { throw new Error('resend down') }) })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, loud.d)).toMatchObject({ status: 'failed', error: 'post_ideas: permission denied' })
  })
})

describe('buildPostIdeas', () => {
  it('a thin week makes no model call', async () => {
    const parse = vi.fn()
    const out = await buildPostIdeas(admin, { clientId: CLIENT, runId: RUN, log: false, inputs: { ...INPUTS, candidates: [] }, client: { chat: { completions: { parse } } } as unknown as ParseClient })
    expect(out.status).toBe('thin')
    expect(parse).not.toHaveBeenCalled()
  })

  it('one strict structured call on the synthesis model, a second only for an answer that would not parse', async () => {
    const parse = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { parsed: null } }], usage: { prompt_tokens: 100, completion_tokens: 10 } })
      .mockResolvedValueOnce({ choices: [{ message: { parsed: OUTPUT } }], usage: { prompt_tokens: 4_000, completion_tokens: 3_000 } })
    const out = await buildPostIdeas(admin, { clientId: CLIENT, runId: RUN, log: false, inputs: INPUTS, client: { chat: { completions: { parse } } } as unknown as ParseClient })
    expect(parse).toHaveBeenCalledTimes(2)
    const [body, options] = parse.mock.calls[0]
    expect(body).toMatchObject({ model: 'gpt-5.4', reasoning_effort: 'medium', max_completion_tokens: 16_000 })
    expect(options).toEqual({ timeout: 150_000, maxRetries: 0 })
    expect(out.status).toBe('ready')
    expect(out.rows).toHaveLength(1)
    // gpt-5.4 at $2.50 and $15 a million: the two attempts.
    expect(out.costUsd).toBeCloseTo((4_100 * 2.5 + 3_010 * 15) / 1e6, 4)
  })

  it('a call that timed out is thrown as a timeout (transient), never retried inside', async () => {
    const parse = vi.fn().mockRejectedValue(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))
    await expect(generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts: { system: 's', user: 'u' }, client: { chat: { completions: { parse } } } as unknown as ParseClient }))
      .rejects.toBeInstanceOf(WeekReadTimeoutError)
    expect(parse).toHaveBeenCalledTimes(1)
  })
})

describe('the writer\'s prompt', () => {
  const { system, user } = buildPostIdeaPrompts({ company: 'Össur', candidates: CANDIDATES })

  it('forbids a medical claim, a number, a movement claim and the first person, and leaves the medical team line to code', () => {
    expect(system).toContain('NEVER A MEDICAL OR CLINICAL CLAIM')
    expect(system).toMatch(/never that something heals, treats, cures, prevents, relieves/)
    expect(system).toMatch(/Never tell the reader to see a doctor or check with a medical team: that line is added by code/)
    expect(system).toMatch(/No numbers at all/)
    expect(system).toMatch(/growing, rising, trending/)
    expect(system).toMatch(/Never use the first person/)
    expect(system).toMatch(/in your own words: never copy a comment/)
    expect(system).toMatch(/only a comment that asks something/)
  })

  it('hands the writer the conversations by handle and their comments by handle, and asks for no figure', () => {
    expect(user).toContain('Q1\nGrouped as: Questions about liner lifespan')
    expect(user).toContain('c1: How long should my liner last?')
    expect(user).toContain('c2: When do I replace the liner?')
    expect(system).not.toMatch(/\bcount\b.*:/)
  })
})

describe('ownedFrom: the client\'s posts the touch test reads', () => {
  it('starts two months before the reading month', () => {
    expect(ownedFrom('2026-10-01')).toBe('2026-08-01')
    expect(ownedFrom('2026-01-01')).toBe('2025-11-01')
  })
})

// ---- The pipeline ----------------------------------------------------------------------

/** Every step id of the pipeline in source order (scripts/pipeline-step-ids.sh's parse). */
function stepIds(src: string): string[] {
  const re = /\bstep\s*\.\s*(run|sendEvent)\s*\(/g
  const out: string[] = []
  while (re.exec(src) !== null) {
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

describe('the pipeline carries write-post-ideas', () => {
  const src = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
  const ids = stepIds(src)

  it('as one additive id in its own position: after write-week-read, immediately before write-longrun-read (72 in all)', () => {
    expect(ids).toHaveLength(72)
    expect(ids.filter((id) => id === 'write-post-ideas')).toHaveLength(1)
    const at = ids.indexOf('write-post-ideas')
    expect(ids[at - 1]).toBe('write-week-read')
    expect(ids[at + 1]).toBe('write-longrun-read')
  })

  it('fail-soft: retried until its last attempt, told whether the run is a test, and its .catch only logs', () => {
    const body = src.slice(src.indexOf(".run('write-post-ideas'"), src.indexOf(".run('write-longrun-read'"))
    expect(body).toContain('runPostIdeasStep(createAdminClient(), { clientId, runId, testRun: isTestRun({ id: runId, options }), lastAttempt: attempt >= (maxAttempts ?? 3) - 1 })')
    const at = body.indexOf('.catch(')
    const handler = body.slice(at, body.indexOf('})', at) + 2)
    expect(handler).toMatch(/console\.error\(`\[write-post-ideas\] out of retries/)
    expect(handler).toMatch(/return null/)
    expect(handler).not.toMatch(/sendAlertEmail|noteError/)
  })

  it('is listed after the gather, so no error of its can ever cut a week from the chart', () => {
    expect(AFTER_GATHER_STEPS).toContain('write-post-ideas')
  })
})

describe('postIdeasEnabled: the per-tenant switch (the own-post audience\'s shape)', () => {
  const saved = { on: process.env.POST_IDEAS, off: process.env.POST_IDEAS_OFF }
  afterEach(() => {
    if (saved.on === undefined) delete process.env.POST_IDEAS
    else process.env.POST_IDEAS = saved.on
    if (saved.off === undefined) delete process.env.POST_IDEAS_OFF
    else process.env.POST_IDEAS_OFF = saved.off
  })

  it('is on by default, for every tenant', () => {
    delete process.env.POST_IDEAS
    delete process.env.POST_IDEAS_OFF
    expect(postIdeasEnabled()).toBe(true)
    expect(postIdeasEnabled(CLIENT)).toBe(true)
  })

  it('turns off for one tenant through POST_IDEAS_OFF, leaving the others on', () => {
    delete process.env.POST_IDEAS
    process.env.POST_IDEAS_OFF = ` ${CLIENT.toUpperCase()} , someone-else`
    expect(postIdeasEnabled(CLIENT)).toBe(false)
    expect(postIdeasEnabled('00000000-0000-4000-8000-0000000000c9')).toBe(true)
  })

  it('turns off everywhere with POST_IDEAS=0 or false', () => {
    for (const v of ['0', 'false']) {
      process.env.POST_IDEAS = v
      expect(postIdeasEnabled(CLIENT)).toBe(false)
      expect(postIdeasEnabled()).toBe(false)
    }
  })
})
