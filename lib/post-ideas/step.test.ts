import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST_IDEAS_BUDGET_USD, POST_IDEAS_RUN_MARGIN_USD, postIdeasEnabled, RUN_MODEL_BUDGET_USD } from '../config'
import { AFTER_GATHER_STEPS } from '../reading/week-line'
import { WeekReadTimeoutError } from '../written/deadline'
import type { ParseClient } from '../written/write-model'
import type { PostIdeaInsert } from './compose'
import { choosePlay, withHandles } from './select'
import { buildPostIdeas, finishPostIdeas, ownedFrom, postIdeasCapLeft, postIdeasHeadroom, postIdeasRoom, postIdeasSpendSoFar, runPostIdeasStep, type BuiltPostIdeas, type PostIdeaInputs, type PostIdeasStepDeps } from './step'
import { fakeDb } from '../test/fake-db'
import { buildPostIdeaPrompts, generatePostIdeas, POST_IDEAS_MODEL, POST_IDEAS_PROMPT_VERSION, postIdeasAttemptMaxUsd, PostIdeasBudgetError, PostIdeasWriteError, type PostIdeasOutput } from './write'

// The `write-post-ideas` step (T13): silent where it should be, fail-soft in
// the week read's way, one alert inside the step and never in its `.catch`,
// and an additive id in its own position.

const admin = {} as SupabaseClient
const CLIENT = '00000000-0000-4000-8000-0000000000c0'
const RUN = '00000000-0000-4000-8000-0000000000a1'

const CANDIDATES = withHandles([
  { themeId: 'th-1', label: 'Questions about liner lifespan', description: 'How long a liner lasts.', weekVideos: 9, lenientVideos: 8, touch: 'none', play: choosePlay([], '2026-10-01'),
    comments: [
      { commentId: 'cm-1', videoId: 'v1', text: 'How long should my liner last?' },
      { commentId: 'cm-2', videoId: 'v2', text: 'When do I replace the liner?' },
      { commentId: 'cm-3', videoId: 'v2', text: 'Is a liner meant to stretch like this?' },
    ] },
])

const INPUTS: PostIdeaInputs = {
  clientId: CLIENT, runId: RUN, company: 'Össur', sells: null, window: { from: '2026-10-05T00:00:00Z', to: '2026-10-12T00:00:00Z' },
  read: { from: '2026-09-14T00:00:00.000Z', to: '2026-10-12T00:00:00Z' }, month: '2026-10-01',
  candidates: CANDIDATES, considered: [], covered: [], ownPosts: 7, allow: [],
}

const OUTPUT: PostIdeasOutput = {
  ideas: [{ question: 'Q1', title: 'How long does a liner last?', cover: 'How long liners usually last and the signs it is time to replace one', subquestions: [{ label: 'How long it should last', comments: ['c1', 'c2', 'c3'] }] }],
}

const READY: BuiltPostIdeas = finishPostIdeas(INPUTS, OUTPUT, 0.06)
const THIN: BuiltPostIdeas = { status: 'thin', ideas: [], held: [], rows: [], called: false, costUsd: 0, scrub: null, raw: null, inputs: { ...INPUTS, candidates: [] } }
const HELD: BuiltPostIdeas = finishPostIdeas(INPUTS, { ideas: [{ ...OUTPUT.ideas[0], cover: 'A new liner prevents skin irritation.' }] }, 0.05)
const ALL_THIN: BuiltPostIdeas = finishPostIdeas(INPUTS, { ideas: [{ ...OUTPUT.ideas[0], subquestions: [{ label: 'How long it should last', comments: ['c1'] }] }] }, 0.04)

function deps(over: Partial<PostIdeasStepDeps> = {}) {
  const saved: PostIdeaInsert[][] = []
  const alerts: string[] = []
  const d: PostIdeasStepDeps = {
    enabled: vi.fn(() => true),
    company: vi.fn(async () => 'Össur'),
    existing: vi.fn(async () => 0),
    build: vi.fn(async () => READY) as unknown as PostIdeasStepDeps['build'],
    spent: vi.fn(async () => 2.4),
    ideasSpent: vi.fn(async () => 0),
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

  it('a week whose every idea is under the evidence floor is thin too: nothing stored, nobody told, its spend reported', async () => {
    expect(ALL_THIN.status).toBe('thin')
    expect(ALL_THIN.held).toEqual([{ question: 'Q1', label: 'Questions about liner lifespan', reason: 'thin' }])
    const { d, saved, alerts } = deps({ build: vi.fn(async () => ALL_THIN) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)).toEqual({ status: 'thin', ideas: 0, held: 1, costUsd: 0.04 })
    expect([saved, alerts]).toEqual([[], []])
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

  it('one strict structured call on the synthesis model, a second for an answer that would not parse', async () => {
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

  it('a second also for a failed call that was not a timeout (a 429, a 5xx), never a third', async () => {
    const rateLimited = Object.assign(new Error('429 Rate limit reached'), { status: 429 })
    const parse = vi.fn()
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ choices: [{ message: { parsed: OUTPUT } }], usage: { prompt_tokens: 4_000, completion_tokens: 3_000 } })
    const out = await buildPostIdeas(admin, { clientId: CLIENT, runId: RUN, log: false, inputs: INPUTS, client: { chat: { completions: { parse } } } as unknown as ParseClient })
    expect(parse).toHaveBeenCalledTimes(2)
    expect(out.status).toBe('ready')
    const fivexx = vi.fn().mockRejectedValue(Object.assign(new Error('502 Bad gateway'), { status: 502 }))
    await expect(generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts: { system: 's', user: 'u' }, client: { chat: { completions: { parse: fivexx } } } as unknown as ParseClient }))
      .rejects.toBeInstanceOf(PostIdeasWriteError)
    expect(fivexx).toHaveBeenCalledTimes(2)
  })

  it('a call that timed out is thrown as a timeout (transient), never retried inside', async () => {
    const parse = vi.fn().mockRejectedValue(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))
    await expect(generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts: { system: 's', user: 'u' }, client: { chat: { completions: { parse } } } as unknown as ParseClient }))
      .rejects.toBeInstanceOf(WeekReadTimeoutError)
    expect(parse).toHaveBeenCalledTimes(1)
  })
})

describe('the post ideas\' dollar cap and the run\'s headroom (Phase 4 fix round)', () => {
  // A week with a few hundred asking comments: about eleven thousand prompt
  // tokens at the dense count.
  const base = buildPostIdeaPrompts({ company: 'Össur', candidates: CANDIDATES })
  const prompts = { system: base.system, user: `${base.user}\n${'c9: How long should a liner last before it wears through?\n'.repeat(400)}` }
  const unparsed = (completion: number) => ({ choices: [{ message: { parsed: null } }], usage: { prompt_tokens: 1_000, completion_tokens: completion } })

  it('an attempt\'s worst case is its prompt, counted densely, and the whole output ceiling', () => {
    const worst = postIdeasAttemptMaxUsd(prompts)
    const chars = prompts.system.length + prompts.user.length
    expect(worst).toBeCloseTo((Math.ceil(chars / 2) * 2.5 + 16_000 * 15) / 1e6, 6)
    // One attempt fits the cap; on a prompt this size, two worst cases do not.
    expect(worst).toBeLessThan(POST_IDEAS_BUDGET_USD)
    expect(2 * worst).toBeGreaterThan(POST_IDEAS_BUDGET_USD)
    // An empty prompt is the output ceiling alone: $0.24 on gpt-5.4.
    expect(postIdeasAttemptMaxUsd({ system: '', user: '' })).toBeCloseTo(0.24, 6)
  })

  it('makes no call whose worst case the room cannot cover', async () => {
    const parse = vi.fn()
    await expect(generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts, maxUsd: 0.1, client: { chat: { completions: { parse } } } as unknown as ParseClient }))
      .rejects.toBeInstanceOf(PostIdeasBudgetError)
    expect(parse).not.toHaveBeenCalled()
  })

  it('makes the second attempt only where the first\'s spend and the second\'s worst case still fit', async () => {
    const worst = postIdeasAttemptMaxUsd(prompts)
    // A first attempt that used its whole output and would not parse: the
    // second cannot fit, and is not made.
    const big = vi.fn().mockResolvedValueOnce(unparsed(16_000))
    const refused = await generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse: big } } } as unknown as ParseClient }).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(PostIdeasBudgetError)
    expect((refused as Error).message).toMatch(/attempt 2 may cost up to/)
    // The paid first attempt is carried, so the step reports what it spent.
    expect((refused as PostIdeasBudgetError).spentUsd).toBeCloseTo((1_000 * 2.5 + 16_000 * 15) / 1e6, 6)
    expect(big).toHaveBeenCalledTimes(1)
    // A cheap first attempt leaves room for the second.
    const small = vi.fn().mockResolvedValueOnce(unparsed(100)).mockResolvedValueOnce({ choices: [{ message: { parsed: OUTPUT } }], usage: { prompt_tokens: 1_000, completion_tokens: 100 } })
    expect((await generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts, client: { chat: { completions: { parse: small } } } as unknown as ParseClient })).attempts).toBe(2)
    // Never more than the cap, whatever a caller hands in.
    const parse = vi.fn()
    await expect(generatePostIdeas(null, { clientId: CLIENT, runId: RUN, prompts: { system: 'x'.repeat(300_000), user: 'y' }, maxUsd: 99, client: { chat: { completions: { parse } } } as unknown as ParseClient }))
      .rejects.toBeInstanceOf(PostIdeasBudgetError)
    expect(parse).not.toHaveBeenCalled()
    expect(worst).toBeGreaterThan(0)
  })

  it('starts only with the cap and the margin left under the run\'s budget, and holds the call to what is left', () => {
    const need = POST_IDEAS_BUDGET_USD + POST_IDEAS_RUN_MARGIN_USD
    expect(postIdeasHeadroom(RUN_MODEL_BUDGET_USD - need)).toBe(true)
    expect(postIdeasHeadroom(RUN_MODEL_BUDGET_USD - need + 0.01)).toBe(false)
    expect(postIdeasRoom(0)).toBe(POST_IDEAS_BUDGET_USD)
    expect(postIdeasRoom(RUN_MODEL_BUDGET_USD - need)).toBeCloseTo(POST_IDEAS_BUDGET_USD, 6)
    expect(postIdeasRoom(RUN_MODEL_BUDGET_USD - 0.7)).toBeCloseTo(0.2, 6)
    expect(postIdeasRoom(RUN_MODEL_BUDGET_USD + 5)).toBe(0)
  })

  it('a run without the headroom: nothing built, nothing stored, one alert, never a throw', async () => {
    const { d, saved, alerts } = deps({ spent: vi.fn(async () => RUN_MODEL_BUDGET_USD - 0.9) })
    const out = await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, d)
    expect(out).toMatchObject({ status: 'over_budget', ideas: 0, costUsd: 0 })
    expect(out.error).toMatch(/model budget/)
    expect(d.build).not.toHaveBeenCalled()
    expect(saved).toEqual([])
    expect(alerts).toEqual(['Verbatim post ideas not written: Össur'])
  })

  it('reads the run\'s spend after the cheap checks, and hands the build what the run can afford', async () => {
    const { d } = deps({ spent: vi.fn(async () => 2.4) })
    await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, d)
    expect(d.spent).toHaveBeenCalledWith(CLIENT, RUN)
    const call = (d.build as unknown as { mock: { calls: [SupabaseClient, { maxUsd?: number }][] } }).mock.calls[0][1]
    expect(call.maxUsd).toBe(POST_IDEAS_BUDGET_USD)
    const off = deps({ enabled: vi.fn(() => false) })
    await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, off.d)
    expect(off.d.spent).not.toHaveBeenCalled()
  })

  it('THE CAP IS PER RUN: a retry after a paid attempt gets only what is left of it, and none once it is spent', async () => {
    expect(postIdeasCapLeft(0.3)).toBeCloseTo(0.2, 6)
    expect(postIdeasRoom(2.4, RUN_MODEL_BUDGET_USD, 0.3)).toBeCloseTo(0.2, 6)
    expect(postIdeasHeadroom(2.4, RUN_MODEL_BUDGET_USD, 0.3)).toBe(true)
    expect(postIdeasHeadroom(2.4, RUN_MODEL_BUDGET_USD, 0.5)).toBe(false)
    const retry = deps({ ideasSpent: vi.fn(async () => 0.3) })
    await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, retry.d)
    expect(retry.d.ideasSpent).toHaveBeenCalledWith(admin, CLIENT, RUN)
    const call = (retry.d.build as unknown as { mock: { calls: [SupabaseClient, { maxUsd?: number }][] } }).mock.calls[0][1]
    expect(call.maxUsd).toBeCloseTo(0.2, 6)
    const spentOut = deps({ ideasSpent: vi.fn(async () => POST_IDEAS_BUDGET_USD) })
    const out = await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, spentOut.d)
    expect(out).toMatchObject({ status: 'over_budget', costUsd: 0 })
    expect(out.error).toMatch(/earlier attempts already spent \$0\.50/)
    expect(spentOut.d.build).not.toHaveBeenCalled()
    expect(spentOut.alerts).toEqual(['Verbatim post ideas not written: Össur'])
  })

  it('reads this run\'s post-ideas spend from the ledger, its own pass only', async () => {
    const db = fakeDb({ ai_call_log: [
      { id: 1, client_id: CLIENT, run_id: RUN, pass: 'post_ideas', cost_usd: 0.21 },
      { id: 2, client_id: CLIENT, run_id: RUN, pass: 'post_ideas', cost_usd: 0.04 },
      { id: 3, client_id: CLIENT, run_id: RUN, pass: 'pass_a', cost_usd: 3 },
      { id: 4, client_id: CLIENT, run_id: 'other-run', pass: 'post_ideas', cost_usd: 1 },
    ] })
    expect(await postIdeasSpendSoFar(db.client as never, CLIENT, RUN)).toBe(0.25)
  })

  it('a refusal or a failure after a paid attempt reports what it spent, never 0', async () => {
    const refused = deps({ build: vi.fn(async () => { throw new PostIdeasBudgetError('the post ideas\' call was not made', 0.2712) }) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, refused.d)).toMatchObject({ status: 'over_budget', costUsd: 0.2712 })
    const unparsed = new PostIdeasWriteError('could not be written twice over: no parsed output')
    unparsed.spentUsd = 0.31
    const failed = deps({ build: vi.fn(async () => { throw unparsed }) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false }, failed.d)).toMatchObject({ status: 'failed', costUsd: 0.31 })
  })

  it('a call the cap refuses mid-build stops the same way, even before the step\'s last attempt', async () => {
    const { d, saved, alerts } = deps({ build: vi.fn(async () => { throw new PostIdeasBudgetError('the post ideas\' call was not made') }) as unknown as PostIdeasStepDeps['build'] })
    expect(await runPostIdeasStep(admin, { clientId: CLIENT, runId: RUN, testRun: false, lastAttempt: false }, d)).toMatchObject({ status: 'over_budget' })
    expect(saved).toEqual([])
    expect(alerts).toEqual(['Verbatim post ideas not written: Össur'])
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
    expect(system).toMatch(/names the thing asked about in plain words .*never a bare this, that or it/)
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

  it('as one additive id in its own position: after write-week-read and the subjects\' reads, immediately before write-longrun-read (75 in all, with the product readings\' two and write-subject-reads)', () => {
    expect(ids).toHaveLength(75)
    expect(ids.filter((id) => id === 'write-post-ideas')).toHaveLength(1)
    const at = ids.indexOf('write-post-ideas')
    // lib/written/subject-reads.test.ts pins write-subject-reads (14 Oct).
    expect(ids[at - 1]).toBe('write-subject-reads')
    expect(ids[at - 2]).toBe('write-week-read')
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

describe('postIdeasEnabled: OPT-IN per tenant (PRODUCT_READINGS_ENABLED\'s shape), the env switches off-only', () => {
  const saved = { on: process.env.POST_IDEAS, off: process.env.POST_IDEAS_OFF }
  afterEach(() => {
    if (saved.on === undefined) delete process.env.POST_IDEAS
    else process.env.POST_IDEAS = saved.on
    if (saved.off === undefined) delete process.env.POST_IDEAS_OFF
    else process.env.POST_IDEAS_OFF = saved.off
  })
  const OTHER = '00000000-0000-4000-8000-0000000000c9'
  const ON = { [CLIENT]: true, [OTHER]: true }

  it('is off for every tenant the map does not turn on, whatever the environment says', () => {
    delete process.env.POST_IDEAS
    delete process.env.POST_IDEAS_OFF
    expect(postIdeasEnabled(CLIENT)).toBe(false)
    process.env.POST_IDEAS = '1'
    expect(postIdeasEnabled(CLIENT)).toBe(false)
    expect(postIdeasEnabled(CLIENT, { [CLIENT]: false })).toBe(false)
  })

  it('is on for a tenant the map turns on', () => {
    delete process.env.POST_IDEAS
    delete process.env.POST_IDEAS_OFF
    expect(postIdeasEnabled(CLIENT, ON)).toBe(true)
    expect(postIdeasEnabled('not-in-the-map', ON)).toBe(false)
  })

  it('POST_IDEAS_OFF turns one tenant off, leaving the others on', () => {
    delete process.env.POST_IDEAS
    process.env.POST_IDEAS_OFF = ` ${CLIENT.toUpperCase()} , someone-else`
    expect(postIdeasEnabled(CLIENT, ON)).toBe(false)
    expect(postIdeasEnabled(OTHER, ON)).toBe(true)
  })

  it('POST_IDEAS=0 or false turns it off everywhere: the emergency off-switch', () => {
    for (const v of ['0', 'false']) {
      process.env.POST_IDEAS = v
      expect(postIdeasEnabled(CLIENT, ON)).toBe(false)
      expect(postIdeasEnabled(OTHER, ON)).toBe(false)
    }
  })
})
