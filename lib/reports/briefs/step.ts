import type { SupabaseClient } from '@supabase/supabase-js'

import { RUN_MODEL_BUDGET_USD } from '../../config'
import { sendAlertEmail } from '../../email'
import { longMonth } from '../../format'
import { rowWindow, type WindowColumns } from '../../pipeline/run-bookkeeping'
import { runSpendSoFar } from '../../pipeline/run-costs'
import { freezeQuotes } from '../../renderables/quotes-freeze'
import { isTransient } from '../../written/deadline'
import { closesMonth, endedMonthOf } from '../../written/longrun'
import { BuildBlockedError, runResearch, type ResearchAnswer } from '../documents/research'
import {
  briefResearchFrame, groundBriefResearch, ideasForSet, loadBriefSetInputs, numberPoints, questionsFor, writeBriefSet, writeRoleBrief,
  type BriefSetInputs,
} from './build'
import { briefClock, leftMs, within, type BriefClock } from './clock'
import type { BriefQuestion } from './questions'
import { failedRows, monthBriefsWritten, monthlyBriefsApplied, saveBriefRows, storeBriefSet, type MonthlyBriefRow } from './store'
import type { Allocation, BriefRole, GroundedPoint, MonthlyBriefData } from './types'
import { BRIEF_ROLES } from './types'
import type { BriefOutput, IdeasOutput } from './write'

// THE PIPELINE'S `briefs:*` STEPS (T8 wired, 5 Oct; Heinrich: "a finished run
// reaches the platform by itself; review holds ONLY the email"). On the run
// that CLOSES a month (`closesMonth`, the long-run read's rule: the window
// holds the first day of the month it ends in, one run a month), the month's
// four department briefs are researched, written, composed and stored as
// frozen report snapshots the Studio lists; every other run reads one row and
// spends nothing.
//
// THE STEPS, in order, immediately before `close-run` (each an additive id in
// its own position, AGENTS.md):
//   plan-briefs                    is the month due; the inputs, read once and
//                                  carried; the questions in waves
//   briefs:research-${i}-of-${n}   one wave of research questions (the Ask
//                                  agent), each on the step's own clock
//   briefs:ideas                   the evidence counted, the month's ideas,
//                                  their self-check, where each lives
//   briefs:write-${role}           one department's writer, one per step
//   briefs:compose                 the set composed, judged and checked, then
//                                  stored (four snapshots, four ledger rows)
// One role per writer step because one writer call takes a minute or two and
// four never fit one step's 250 s; the research in waves for the same reason
// (nineteen questions, a minute or so each).
//
// FAIL-SOFT, the week read's contract (lib/written/step.ts). A TRANSIENT
// failure (`isTransient`: a call that timed out or was aborted, a 408, 429 or
// 5xx, a dropped connection) on any attempt but the step's last THROWS, so
// Inngest retries the step, with nothing stored and nobody told. On the last
// attempt, and on any other failure at once, a body NEVER throws: the set is
// stored `failed` (four ledger rows) and the operator is alerted ONCE, inside
// the step that gave up, with the script to run, because no later run writes
// an ended month; every later step sees the failure and returns at once. A
// research wave never fails the set on its own: its unanswered questions are
// recorded as failed answers and the set is written from the rest (a brief
// with most of its research beats none), unless nothing at all came back.
//
// NO COMMENT'S WORDS IN A STEP'S OUTPUT. Inngest memoises every output and
// resends it on every later step: the inputs and the research are frozen
// (`freezeQuotes`, text ''), the points are the research's paraphrases, and
// the evidence that carries words is read again in the steps that need it
// (`groundBriefResearch`), never returned.
//
// SPEND. The set costs about $2 to $2.50 a tenant (September's dry builds:
// $2.35 Sealand, $1.35 + research Össur), the research most of it. It may
// spend at most `BRIEF_SET_BUDGET_USD`, and starts only where the run has that
// much left under `RUN_MODEL_BUDGET_USD` (the run's kill switch,
// `assertWithinBudget`, which fails the whole run when it trips): a run near
// its budget skips the briefs, stores them failed and says so, rather than
// risk the run. Every call is logged under the run, so the run's own ledger
// counts it.

/** Research questions asked in one step, all at once. */
export const BRIEF_RESEARCH_WAVE = 4
/** The most the month's set may spend. */
export const BRIEF_SET_BUDGET_USD = 4
/** Of that, the research's share; the rest is the ideas, the four writers and
 *  the set's checks (about $0.50 measured). */
export const BRIEF_RESEARCH_BUDGET_USD = 3
/** What the run must have left under its budget for the set to start: the
 *  set's own cap, and a margin for the steps after it. */
export const BRIEF_HEADROOM_USD = BRIEF_SET_BUDGET_USD + 1

export type BriefPlanStatus = 'due' | 'not_due' | 'skipped' | 'failed'

export interface BriefPlan {
  status: BriefPlanStatus
  clientId: string
  runId: string
  company: string
  /** `YYYY-MM-01`, the month that ended; null where none is due. */
  month: string | null
  /** The instant the set reads at, frozen here: every later step's clock
   *  for the reading, so a retried step reads the same month. */
  asOf: string
  /** Read once, carried: frozen, no comment's words. Null unless due. */
  inputs: BriefSetInputs | null
  questions: BriefQuestion[]
  /** Question ids, one array per research step. */
  waves: string[][]
  error?: string
}

export interface BriefWave {
  status: 'ok' | 'blocked' | 'skipped'
  /** Frozen: quotes as refs. */
  answers: ResearchAnswer[]
  window: { from: string; to: string } | null
  costUsd: number
  /** Question ids that came back with nothing (failed or out of time). */
  failed: string[]
  error?: string
}

export interface BriefIdeas {
  status: 'ok' | 'failed'
  points: GroundedPoint[]
  window: { from: string; to: string } | null
  raw: IdeasOutput | null
  contradicted: [string, string | null][]
  allocation: Allocation | null
  /** The research's spend and the ideas step's own. */
  researchUsd: number
  costUsd: number
  error?: string
}

export interface BriefWritten {
  status: 'ok' | 'failed'
  role: BriefRole
  raw: BriefOutput | null
  costUsd: number
  error?: string
}

export interface BriefComposed {
  status: 'ready' | 'thin' | 'failed'
  rows: { role: BriefRole; status: MonthlyBriefRow['status'] }[]
  costUsd: number
  error?: string
}

// ---- Pure helpers ------------------------------------------------------------------------------

/** The questions in waves of `size`, in order. Pure. */
export function researchWaves(questions: readonly Pick<BriefQuestion, 'id'>[], size = BRIEF_RESEARCH_WAVE): string[][] {
  const out: string[][] = []
  for (let i = 0; i < questions.length; i += size) out.push(questions.slice(i, i + size).map((q) => q.id))
  return out
}

/** May the set start, with the run having spent `spent` of `budget`? Pure. */
export const briefHeadroom = (spent: number, budget = RUN_MODEL_BUDGET_USD): boolean => budget - spent >= BRIEF_HEADROOM_USD

/** The inputs as a step may return them: quotes frozen, and the company's own
 *  quoted words (say vs hear's `your_quote`, which no brief reads) left out.
 *  Pure. */
export function stepSafeInputs(i: BriefSetInputs): BriefSetInputs {
  const frozen = freezeQuotes(i).data
  return { ...frozen, sayVsHear: frozen.sayVsHear.map((e) => ({ ...e, your_quote: '' })) }
}

/** Every wave's answers, in question order and numbered once. Pure. */
export function setAnswers(plan: Pick<BriefPlan, 'questions'>, waves: readonly (BriefWave | null)[]): ResearchAnswer[] {
  return numberPoints(waves.flatMap((w) => w?.answers ?? []), plan.questions)
}

/** An answer that brought something back. */
const answered = (a: ResearchAnswer): boolean => a.outcome !== 'failed' && a.outcome !== 'unasked' && a.grounded.length > 0

/** The command that writes a month's set by hand. */
export const BRIEFS_FALLBACK = (clientId: string, month: string | null, runId: string) =>
  `To write them by hand: node --env-file=.env.local --import tsx scripts/monthly-briefs.ts --client ${clientId} --month ${month ? month.slice(0, 7) : '<YYYY-MM, the month that ended>'} --run ${runId} (dry, nothing stored), then again with --write.`

// ---- The I/O, injectable ----------------------------------------------------------------------------

export interface BriefStepDeps {
  applied: (admin: SupabaseClient) => Promise<boolean>
  written: (admin: SupabaseClient, clientId: string, month: string) => Promise<boolean>
  window: (admin: SupabaseClient, clientId: string, runId: string) => Promise<{ from: string; to: string } | null>
  spent: (clientId: string, runId: string) => Promise<number>
  inputs: typeof loadBriefSetInputs
  frame: typeof briefResearchFrame
  research: typeof runResearch
  ground: typeof groundBriefResearch
  ideas: typeof ideasForSet
  write: typeof writeRoleBrief
  compose: typeof writeBriefSet
  store: typeof storeBriefSet
  saveRows: typeof saveBriefRows
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
  now?: () => number
}

async function runWindow(admin: SupabaseClient, clientId: string, runId: string): Promise<{ from: string; to: string } | null> {
  const res = await admin.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', runId).maybeSingle()
  if (res.error) throw new Error(`briefs window: ${res.error.message}`)
  const w = res.data ? rowWindow(res.data as WindowColumns) : null
  return w?.start && w.end ? { from: w.start, to: w.end } : null
}

const DEFAULT_DEPS: BriefStepDeps = {
  applied: monthlyBriefsApplied,
  written: monthBriefsWritten,
  window: runWindow,
  spent: runSpendSoFar,
  inputs: loadBriefSetInputs,
  frame: briefResearchFrame,
  research: runResearch,
  ground: groundBriefResearch,
  ideas: ideasForSet,
  write: writeRoleBrief,
  compose: writeBriefSet,
  store: storeBriefSet,
  saveRows: saveBriefRows,
  alert: sendAlertEmail,
}

const deps = (d: Partial<BriefStepDeps>): BriefStepDeps => ({ ...DEFAULT_DEPS, ...d })
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Before the step's last attempt a transient failure is thrown for Inngest
 *  to retry the step on a fresh clock; nothing is stored and nobody is told. */
function retryIfTransient(e: unknown, lastAttempt: boolean | undefined, step: string): void {
  if ((lastAttempt ?? true) || !isTransient(e)) return
  console.warn(`[${step}] transient failure, the step is retried: ${message(e)}`)
  throw e
}

/**
 * The set failed: four failed ledger rows (where the month is known) and ONE
 * alert, with the script. Never throws.
 */
async function failSet(
  admin: SupabaseClient,
  d: BriefStepDeps,
  a: { clientId: string; runId: string; company: string; month: string | null; step: string; error: string },
): Promise<void> {
  console.error(`[${a.step}] the month's briefs failed: ${a.error}`)
  let stored = false
  if (a.month) {
    try {
      await d.saveRows(admin, failedRows(a.clientId, a.month, a.runId, a.error))
      stored = true
    } catch (e) {
      console.error(`[${a.step}] the failed rows could not be stored: ${message(e)}`)
    }
  }
  const month = a.month ? `${longMonth(a.month)} ${a.month.slice(0, 4)}` : 'the month that ended'
  await d.alert(
    `Verbatim monthly briefs not written: ${a.company}`,
    `The ${month} briefs (Sales, Marketing, Content and Leadership, shown in the Studio) could not be written on run ${a.runId}, the run that closes the month (step ${a.step}). The run, its week's read and its pages are unaffected. Later runs do not write a month that has ended.\n\nError: ${a.error}\n${stored ? 'A failed row is stored for each brief in monthly_briefs.' : 'No failed row could be stored.'}\n\n${BRIEFS_FALLBACK(a.clientId, a.month, a.runId)}`,
  ).catch(() => ({ sent: false }))
}

// ---- plan-briefs --------------------------------------------------------------------------------

/**
 * `plan-briefs`: is a month due on this run, and if so the inputs (read once,
 * frozen, carried) and the questions in waves. Every run that closes no month
 * returns `not_due` having read one row; a database without the ledger,
 * `skipped`, quietly, spending nothing.
 */
export async function planBriefsStep(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; company: string; lastAttempt?: boolean },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefPlan> {
  const d = deps(depsIn)
  const asOf = new Date((d.now ?? Date.now)()).toISOString()
  const base = { clientId: opts.clientId, runId: opts.runId, company: opts.company, asOf, inputs: null, questions: [], waves: [] }
  let month: string | null = null
  try {
    if (!(await d.applied(admin))) {
      console.warn('[plan-briefs] monthly_briefs is not in this database yet; no brief was written or paid for')
      return { ...base, status: 'skipped', month: null, error: 'monthly_briefs is not in this database yet' }
    }
    const window = await d.window(admin, opts.clientId, opts.runId)
    if (!window || !closesMonth(window)) return { ...base, status: 'not_due', month: null }
    month = endedMonthOf(window)
    if (await d.written(admin, opts.clientId, month)) return { ...base, status: 'not_due', month }
    // The run's own kill switch fails the whole run when it trips; the set
    // starts only where the run can afford all of it.
    const spent = await d.spent(opts.clientId, opts.runId)
    if (!briefHeadroom(spent)) {
      await failSet(admin, d, { ...opts, month, step: 'plan-briefs', error: `the run has spent $${spent.toFixed(2)} of its $${RUN_MODEL_BUDGET_USD} model budget, and the briefs may cost up to $${BRIEF_SET_BUDGET_USD}; they were not started, so the run could not trip its budget` })
      return { ...base, status: 'failed', month, error: 'run budget' }
    }
    const inputs = stepSafeInputs(await d.inputs(admin, { clientId: opts.clientId, month, now: new Date(asOf), runId: opts.runId }))
    const questions = questionsFor(inputs)
    return { ...base, status: 'due', company: inputs.company, month, inputs, questions, waves: researchWaves(questions) }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, 'plan-briefs')
    await failSet(admin, d, { ...opts, month, step: 'plan-briefs', error: message(e) })
    return { ...base, status: 'failed', month, error: message(e) }
  }
}

// ---- briefs:research-i-of-n --------------------------------------------------------------------------

/**
 * One wave of research: its questions asked at once, each held to the step's
 * clock. A question that times out or drops is a transient failure: thrown
 * before the last attempt (the wave is asked again), recorded as a failed
 * answer on the last. A workspace with no searchable index blocks the set
 * (`blocked`; the ideas step says so, once). Never alerts.
 */
export async function briefResearchStep(
  admin: SupabaseClient,
  plan: BriefPlan,
  wave: number,
  opts: { spentUsd: number; lastAttempt?: boolean; clock?: BriefClock },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefWave> {
  const d = deps(depsIn)
  const clock = opts.clock ?? briefClock({ now: d.now })
  const ids = new Set(plan.waves[wave] ?? [])
  const questions = plan.questions.filter((q) => ids.has(q.id))
  const empty = (status: BriefWave['status'], error?: string): BriefWave => ({ status, answers: [], window: null, costUsd: 0, failed: questions.map((q) => q.id), ...(error ? { error } : {}) })
  if (plan.status !== 'due' || !plan.inputs || questions.length === 0) return empty('skipped')
  const budgetUsd = BRIEF_RESEARCH_BUDGET_USD - opts.spentUsd
  if (budgetUsd <= 0) return empty('skipped', 'the research budget is spent')
  const inputs = plan.inputs
  const now = new Date(plan.asOf)
  try {
    const { frame, window } = await d.frame(admin, inputs, now)
    const results = await Promise.all(questions.map(async (q) => {
      try {
        // Held to the step's clock: the Ask agent's calls cannot be capped
        // one by one from here, so the question is.
        const r = await withinClock(d.research(admin, {
          clientId: plan.clientId, companyName: inputs.company, runId: plan.runId, questions: [q], budgetUsd, frame, now, parallel: 1, persist: true,
        }), clock, `the research question ${q.id}`)
        return { q, answer: r.answers[0] ?? null, costUsd: r.costUsd, error: null as unknown }
      } catch (e) {
        return { q, answer: null, costUsd: 0, error: e }
      }
    }))
    const blocked = results.find((r) => r.error instanceof BuildBlockedError)
    if (blocked) return { ...empty('blocked', message(blocked.error)), window }
    // A transient failure, the question's own or the agent's (it returns a
    // failed answer rather than throwing), asks the wave again.
    const transient = results.find((r) => (r.error != null && isTransient(r.error)) || (r.answer?.outcome === 'failed' && r.answer.error && isTransient(new Error(r.answer.error))))
    if (transient) retryIfTransient(transient.error ?? new Error(transient.answer?.error ?? 'failed'), opts.lastAttempt, `briefs:research-${wave + 1}`)
    const answers: ResearchAnswer[] = results.map((r) => r.answer ?? {
      question: r.q, answer: '', outcome: 'failed', grounded: [], judgement: [], silent: false, conversationCount: 0, costUsd: 0, ms: 0, error: message(r.error),
    })
    return {
      status: 'ok',
      answers: freezeQuotes(answers).data,
      window,
      costUsd: results.reduce((n, r) => n + r.costUsd, 0),
      failed: answers.filter((a) => !answered(a)).map((a) => a.question.id),
    }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, `briefs:research-${wave + 1}`)
    console.error(`[briefs:research-${wave + 1}] the wave could not be asked: ${message(e)}`)
    return empty('ok', message(e))
  }
}

/** The work, or a timeout when the step's clock has five seconds left. */
const withinClock = <T>(work: Promise<T>, clock: BriefClock, what: string): Promise<T> => within(work, leftMs(clock) - 5_000, what)

// ---- briefs:ideas ------------------------------------------------------------------------------------

/**
 * The research counted and the month's ideas: one ideas call, its self-check,
 * the allocation. Fails the set (stored, alerted once) where nothing came
 * back from the research or the workspace cannot be researched.
 */
export async function briefIdeasStep(
  admin: SupabaseClient,
  plan: BriefPlan,
  waves: readonly (BriefWave | null)[],
  opts: { lastAttempt?: boolean; clock?: BriefClock },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefIdeas> {
  const d = deps(depsIn)
  const clock = opts.clock ?? briefClock({ now: d.now })
  const researchUsd = waves.reduce((n, w) => n + (w?.costUsd ?? 0), 0)
  const failed = (error: string): BriefIdeas => ({ status: 'failed', points: [], window: null, raw: null, contradicted: [], allocation: null, researchUsd, costUsd: 0, error })
  if (plan.status !== 'due' || !plan.inputs || !plan.month) return failed('not due')
  const blocked = waves.find((w) => w?.status === 'blocked')
  const answers = setAnswers(plan, waves)
  const window = waves.find((w) => w?.window)?.window ?? null
  if (blocked || !window || !answers.some(answered)) {
    const error = blocked?.error ?? (window ? 'the research brought nothing back on any question' : 'the research could not be read')
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month: plan.month, step: 'briefs:ideas', error })
    return failed(error)
  }
  try {
    const grounded = await d.ground(admin, plan.inputs, answers, plan.questions, window)
    const set = await d.ideas(admin, plan.inputs, plan.questions, grounded.points, { log: true, clock })
    return {
      status: 'ok', points: grounded.points, window, raw: set.raw, contradicted: [...set.check.contradicted.entries()], allocation: set.allocation,
      researchUsd, costUsd: set.costUsd + set.check.costUsd,
    }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, 'briefs:ideas')
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month: plan.month, step: 'briefs:ideas', error: message(e) })
    return failed(message(e))
  }
}

// ---- briefs:write-role -----------------------------------------------------------------------------

/** One department's writer. A writer that cannot write fails the set: four
 *  briefs that point at each other are written together or not at all. */
export async function briefWriteStep(
  admin: SupabaseClient,
  plan: BriefPlan,
  ideas: BriefIdeas,
  role: BriefRole,
  opts: { lastAttempt?: boolean; clock?: BriefClock },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefWritten> {
  const d = deps(depsIn)
  const clock = opts.clock ?? briefClock({ now: d.now })
  if (plan.status !== 'due' || !plan.inputs || !plan.month || ideas.status !== 'ok' || !ideas.allocation) {
    return { status: 'failed', role, raw: null, costUsd: 0, error: 'not due' }
  }
  try {
    const w = await d.write(admin, plan.inputs, plan.questions, ideas.points, ideas.allocation, role, { log: true, clock })
    return { status: 'ok', role, raw: w.raw, costUsd: w.costUsd }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, `briefs:write-${role}`)
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month: plan.month, step: `briefs:write-${role}`, error: message(e) })
    return { status: 'failed', role, raw: null, costUsd: 0, error: message(e) }
  }
}

// ---- briefs:compose ----------------------------------------------------------------------------------

/**
 * The set composed from the four writers' output against the ideas step's
 * allocation (the repeat judge, the summaries' self-check, the quotes picked
 * by meaning), then stored: each brief that prints as its snapshot, and the
 * ledger's four rows.
 */
export async function briefComposeStep(
  admin: SupabaseClient,
  plan: BriefPlan,
  waves: readonly (BriefWave | null)[],
  ideas: BriefIdeas,
  written: readonly (BriefWritten | null)[],
  opts: { lastAttempt?: boolean; clock?: BriefClock },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefComposed> {
  const d = deps(depsIn)
  const clock = opts.clock ?? briefClock({ now: d.now })
  const byRole = new Map(written.filter((w): w is BriefWritten => w?.status === 'ok' && w.raw != null).map((w) => [w.role, w]))
  if (plan.status !== 'due' || !plan.inputs || !plan.month || ideas.status !== 'ok' || !ideas.allocation || !ideas.raw || !ideas.window || BRIEF_ROLES.some((r) => !byRole.has(r))) {
    return { status: 'failed', rows: [], costUsd: 0, error: 'not due' }
  }
  try {
    const answers = setAnswers(plan, waves)
    const grounded = await d.ground(admin, plan.inputs, answers, plan.questions, ideas.window)
    const set = await d.compose(admin, plan.inputs, plan.questions, grounded, {
      log: true, clock,
      ideas: { raw: ideas.raw, contradicted: ideas.contradicted },
      allocation: ideas.allocation,
      written: Object.fromEntries(BRIEF_ROLES.map((r) => [r, byRole.get(r)!.raw!])) as Record<BriefRole, BriefOutput>,
    })
    // Each brief's cost: its writer, and a quarter of what the set shared
    // (the research, the ideas, the set's checks).
    const shared = ideas.researchUsd + ideas.costUsd + set.costUsd
    const costUsd: Partial<Record<BriefRole, number>> = Object.fromEntries(BRIEF_ROLES.map((r) => [r, (byRole.get(r)?.costUsd ?? 0) + shared / BRIEF_ROLES.length]))
    const briefs: MonthlyBriefData[] = BRIEF_ROLES.map((r) => set.briefs[r]?.data).filter((x): x is MonthlyBriefData => x != null)
    const rows = await d.store(admin, { clientId: plan.clientId, runId: plan.runId, month: plan.month, asOf: plan.asOf, briefs, costUsd })
    const total = Math.round((shared + [...byRole.values()].reduce((n, w) => n + w.costUsd, 0)) * 10_000) / 10_000
    const ready = rows.some((r) => r.status === 'ready')
    console.log(`[briefs:compose] ${plan.month}: ${rows.map((r) => `${r.role} ${r.status}`).join(', ')} · $${total}`)
    return { status: ready ? 'ready' : 'thin', rows: rows.map((r) => ({ role: r.role, status: r.status })), costUsd: total }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, 'briefs:compose')
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month: plan.month, step: 'briefs:compose', error: message(e) })
    return { status: 'failed', rows: [], costUsd: 0, error: message(e) }
  }
}
