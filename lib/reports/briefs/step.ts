import type { SupabaseClient } from '@supabase/supabase-js'

import { RUN_MODEL_BUDGET_USD } from '../../config'
import { sendAlertEmail } from '../../email'
import { longMonth } from '../../format'
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
// frozen report snapshots the Studio lists; every other run, told so by its
// own window, reads nothing and spends nothing, and a test run writes nothing.
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
// SPEND, A HARD CAP. The set costs about $2 to $2.50 a tenant (September's
// dry builds), the research most of it. `assertWithinBudget` re-reads the
// run's spend on EVERY replay and fails the whole run past
// `RUN_MODEL_BUDGET_USD`, so the set must stop before it could push the run
// there. Every call of every attempt, retried or not, is logged under the
// run, so the set's spend is the run's spend since `plan-briefs` read it
// (`spentAtPlan`), and EVERY `briefs:*` step reads the run's spend again
// before it calls anything: it goes on only where what is left under both
// caps (`briefRoom`: the set's own `BRIEF_SET_BUDGET_USD`, and the run's
// budget less `BRIEF_RUN_MARGIN_USD`) covers the worst case of everything
// still to come (`BRIEF_STEP_MAX_USD`, each several times what September
// measured). A research wave asks only as many questions as the room left
// after the later steps' worst case allows, each given its share of it, never
// the whole. A set that runs out of room stops, stored failed with one alert,
// before it spends; it never trips the run.

/** Research questions asked in one step, all at once. */
export const BRIEF_RESEARCH_WAVE = 4
/** The most the month's set may spend. */
export const BRIEF_SET_BUDGET_USD = 5
/** What one research question, the ideas step, one writer step and the
 *  compose step are budgeted at, retries in: worst cases, about three times
 *  what September measured (a question $0.10 on average and $0.15 at most, the
 *  ideas and its check $0.15, a writer $0.08, the compose $0.10). A step is
 *  started only where the room covers its worst case and every later step's. */
export const BRIEF_STEP_MAX_USD = { question: 0.3, ideas: 0.4, writer: 0.3, compose: 0.4 } as const
/** What the steps after the research may cost at most. */
export const BRIEF_AFTER_RESEARCH_USD = BRIEF_STEP_MAX_USD.ideas + 4 * BRIEF_STEP_MAX_USD.writer + BRIEF_STEP_MAX_USD.compose
/** What stays unspent under `RUN_MODEL_BUDGET_USD` after the set. */
export const BRIEF_RUN_MARGIN_USD = 0.5
/** What the run must have left under its budget for the set to start. */
export const BRIEF_HEADROOM_USD = BRIEF_SET_BUDGET_USD + BRIEF_RUN_MARGIN_USD

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
  /** The run's model spend when the set began: the set's spend is the run's
   *  since. */
  spentAtPlan: number
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

/** What the set may still spend: its own cap less its spend, and the run's
 *  budget less the run's spend and the margin, whichever is less. Pure. */
export const briefRoom = (a: { runSpent: number; spentAtPlan: number; budget?: number }): number =>
  Math.min(BRIEF_SET_BUDGET_USD - (a.runSpent - a.spentAtPlan), (a.budget ?? RUN_MODEL_BUDGET_USD) - BRIEF_RUN_MARGIN_USD - a.runSpent)

/** The worst case of every step from this one on. Pure. */
export function stillToCome(stage: 'ideas' | BriefRole | 'compose'): number {
  if (stage === 'ideas') return BRIEF_AFTER_RESEARCH_USD
  if (stage === 'compose') return BRIEF_STEP_MAX_USD.compose
  return (BRIEF_ROLES.length - BRIEF_ROLES.indexOf(stage)) * BRIEF_STEP_MAX_USD.writer + BRIEF_STEP_MAX_USD.compose
}

/** How many of a wave's questions may be asked, and each one's share of the
 *  room the later steps leave: never the whole room each. Pure. */
export function researchAllowance(room: number, questions: number): { ask: number; eachUsd: number } {
  const forResearch = room - BRIEF_AFTER_RESEARCH_USD
  const ask = Math.max(0, Math.min(questions, Math.floor(forResearch / BRIEF_STEP_MAX_USD.question)))
  return { ask, eachUsd: ask > 0 ? Math.round((forResearch / ask) * 1000) / 1000 : 0 }
}

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
export const BRIEFS_FALLBACK = (clientId: string, month: string, runId: string) =>
  `To write them by hand: node --env-file=.env.local --import tsx scripts/monthly-briefs.ts --client ${clientId} --month ${month.slice(0, 7)} --run ${runId} (dry, nothing stored), then again with --write.`

// ---- The I/O, injectable ----------------------------------------------------------------------------

export interface BriefStepDeps {
  applied: (admin: SupabaseClient) => Promise<boolean>
  written: (admin: SupabaseClient, clientId: string, month: string) => Promise<boolean>
  company: (admin: SupabaseClient, clientId: string) => Promise<string>
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

async function companyOf(admin: SupabaseClient, clientId: string): Promise<string> {
  const res = await admin.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(`briefs company: ${res.error.message}`)
  return String((res.data as { company_name?: string } | null)?.company_name ?? '').trim() || clientId
}

const DEFAULT_DEPS: BriefStepDeps = {
  applied: monthlyBriefsApplied,
  written: monthBriefsWritten,
  company: companyOf,
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
 * The set failed: four failed ledger rows and ONE alert, with the script.
 * Never throws. No row is stored where the month may be written already
 * (`store: false`: the due check itself failed), so a failure never
 * overwrites a ready brief.
 */
async function failSet(
  admin: SupabaseClient,
  d: BriefStepDeps,
  a: { clientId: string; runId: string; company: string; month: string; step: string; error: string; store?: boolean },
): Promise<void> {
  console.error(`[${a.step}] the month's briefs failed: ${a.error}`)
  let stored = false
  if (a.store !== false) {
    try {
      await d.saveRows(admin, failedRows(a.clientId, a.month, a.runId, a.error))
      stored = true
    } catch (e) {
      console.error(`[${a.step}] the failed rows could not be stored: ${message(e)}`)
    }
  }
  await d.alert(
    `Verbatim monthly briefs not written: ${a.company}`,
    `The ${longMonth(a.month)} ${a.month.slice(0, 4)} briefs (Sales, Marketing, Content and Leadership, shown in the Studio) could not be written on run ${a.runId}, the run that closes the month (step ${a.step}). The run, its week's read and its pages are unaffected. Later runs do not write a month that has ended.\n\nError: ${a.error}\n${stored ? 'A failed row is stored for each brief in monthly_briefs.' : 'No failed row could be stored.'}\n\n${BRIEFS_FALLBACK(a.clientId, a.month, a.runId)}`,
  ).catch(() => ({ sent: false }))
}

// ---- The set's room, read before each step ----------------------------------------------------------

/**
 * Before a step calls anything: the run's spend read again, and whether what
 * is left covers the worst case of everything still to come. A read that
 * fails is thrown: the caller retries a transient one; on any other a
 * research wave asks nothing and a later step fails the set. The cap is never
 * guessed.
 */
async function roomFor(d: BriefStepDeps, plan: Pick<BriefPlan, 'clientId' | 'runId' | 'spentAtPlan'>): Promise<{ runSpent: number; room: number }> {
  const runSpent = await d.spent(plan.clientId, plan.runId)
  return { runSpent, room: briefRoom({ runSpent, spentAtPlan: plan.spentAtPlan }) }
}

const budgetError = (room: number, need: number, runSpent: number, spentAtPlan: number) =>
  `the set's budget is spent: $${Math.max(0, room).toFixed(2)} left of its $${BRIEF_SET_BUDGET_USD} (it has spent $${(runSpent - spentAtPlan).toFixed(2)}; the run $${runSpent.toFixed(2)} of its $${RUN_MODEL_BUDGET_USD}), and the steps still to come may cost $${need.toFixed(2)}; it stopped rather than risk the run's budget`

// ---- plan-briefs --------------------------------------------------------------------------------

/**
 * `plan-briefs`: is a month due on this run, and if so the inputs (read once,
 * frozen, carried) and the questions in waves.
 *
 * DUE FROM THE RUN'S OWN WINDOW, BEFORE ANY READ: the pipeline hands in the
 * window it froze at open-run, and a run that closes no month returns
 * `not_due` having read nothing and told nobody. Then, on the run that closes
 * one: a database without the ledger is `skipped`, quietly, spending
 * nothing; a month already written is `not_due`; a TEST run (`isTestRun`: a
 * rehearsal that gathered nothing, a capped run, `publish: false`; test runs
 * never publish) writes nothing and tells the operator once, with the script,
 * because no later run writes an ended month.
 */
export async function planBriefsStep(
  admin: SupabaseClient,
  opts: {
    clientId: string; runId: string
    /** The run's own window, frozen at open-run; null where it has none. */
    window: { from: string; to: string } | null
    /** `isTestRun` of the run (lib/schedules/due.ts). */
    testRun: boolean
    lastAttempt?: boolean
  },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefPlan> {
  const d = deps(depsIn)
  const asOf = new Date((d.now ?? Date.now)()).toISOString()
  const base = { clientId: opts.clientId, runId: opts.runId, company: '', asOf, inputs: null, questions: [], waves: [], spentAtPlan: 0 }
  if (!opts.window || !closesMonth(opts.window)) return { ...base, status: 'not_due', month: null }
  const month = endedMonthOf(opts.window)
  // The name is for an alert alone (the inputs carry the company): a read
  // that fails is the workspace's id, never a reason to fail or retry.
  const companyOf = () => d.company(admin, opts.clientId).catch(() => opts.clientId)
  // A test run never publishes: it writes no brief, stores no row, and says
  // so once, because no later run writes an ended month.
  const testRunAlert = async (company: string) => {
    console.warn(`[plan-briefs] run ${opts.runId} closes ${longMonth(month)} but is a test run: no brief is written`)
    await d.alert(
      `Verbatim monthly briefs not written (a test run): ${company}`,
      `Run ${opts.runId} closes ${longMonth(month)} ${month.slice(0, 4)}, but it is a test run (a rehearsal that gathered nothing, a capped run, or one told not to publish), and test runs never publish: the ${longMonth(month)} ${month.slice(0, 4)} briefs (Sales, Marketing, Content and Leadership) were not written, and no later run writes a month that has ended.\n\n${BRIEFS_FALLBACK(opts.clientId, month, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { ...base, company, status: 'not_due' as const, month, error: 'a test run' }
  }
  let company = opts.clientId
  // Known not written: only then may a failure store the month's failed rows.
  let unwritten = false
  try {
    if (!(await d.applied(admin))) {
      console.warn('[plan-briefs] monthly_briefs is not in this database yet; no brief was written or paid for')
      return { ...base, status: 'skipped', month, error: 'monthly_briefs is not in this database yet' }
    }
    if (await d.written(admin, opts.clientId, month)) return { ...base, status: 'not_due', month }
    unwritten = true
    company = await companyOf()
    if (opts.testRun) return await testRunAlert(company)
    // The run's own kill switch fails the whole run when it trips; the set
    // starts only where the run can afford all of it.
    const spent = await d.spent(opts.clientId, opts.runId)
    if (!briefHeadroom(spent)) {
      await failSet(admin, d, { clientId: opts.clientId, runId: opts.runId, company, month, step: 'plan-briefs', error: `the run has spent $${spent.toFixed(2)} of its $${RUN_MODEL_BUDGET_USD} model budget, and the briefs may cost up to $${BRIEF_SET_BUDGET_USD}; they were not started, so the run could not trip its budget` })
      return { ...base, company, status: 'failed', month, error: 'run budget' }
    }
    const inputs = stepSafeInputs(await d.inputs(admin, { clientId: opts.clientId, month, now: new Date(asOf), runId: opts.runId }))
    const questions = questionsFor(inputs)
    return { ...base, status: 'due', company: inputs.company, month, inputs, questions, waves: researchWaves(questions), spentAtPlan: spent }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, 'plan-briefs')
    if (opts.testRun) return testRunAlert(company === opts.clientId ? await companyOf() : company)
    await failSet(admin, d, { clientId: opts.clientId, runId: opts.runId, company, month, step: 'plan-briefs', error: message(e), store: unwritten })
    return { ...base, company, status: 'failed', month, error: message(e) }
  }
}

// ---- briefs:research-i-of-n --------------------------------------------------------------------------

/**
 * One wave of research: its questions asked at once, each held to the step's
 * clock. Before it asks, the run's spend is read again: the wave asks only as
 * many questions as the set's room allows once the later steps' worst case is
 * kept back, each given its share (`researchAllowance`), and the rest go
 * unasked. A question that times out or drops is a transient failure: thrown
 * before the last attempt (the wave is asked again, its spend counted), a
 * failed answer on the last. A workspace with no searchable index blocks the
 * set (`blocked`; the ideas step says so, once). Never alerts.
 */
export async function briefResearchStep(
  admin: SupabaseClient,
  plan: BriefPlan,
  wave: number,
  opts: { lastAttempt?: boolean; clock?: BriefClock },
  depsIn: Partial<BriefStepDeps> = {},
): Promise<BriefWave> {
  const d = deps(depsIn)
  const clock = opts.clock ?? briefClock({ now: d.now })
  const ids = new Set(plan.waves[wave] ?? [])
  const questions = plan.questions.filter((q) => ids.has(q.id))
  const unasked = (q: BriefQuestion, why: string): ResearchAnswer => ({ question: q, answer: '', outcome: 'unasked', grounded: [], judgement: [], silent: false, conversationCount: 0, costUsd: 0, ms: 0, error: why })
  const empty = (status: BriefWave['status'], error?: string): BriefWave => ({ status, answers: [], window: null, costUsd: 0, failed: questions.map((q) => q.id), ...(error ? { error } : {}) })
  if (plan.status !== 'due' || !plan.inputs || questions.length === 0) return empty('skipped')
  const inputs = plan.inputs
  const now = new Date(plan.asOf)
  const step = `briefs:research-${wave + 1}`
  try {
    const { room } = await roomFor(d, plan)
    const { ask, eachUsd } = researchAllowance(room, questions.length)
    if (ask === 0) return empty('skipped', `no room left in the set's budget for research ($${Math.max(0, room).toFixed(2)} left, $${BRIEF_AFTER_RESEARCH_USD.toFixed(2)} kept for the steps after it)`)
    const asked = questions.slice(0, ask)
    const { frame, window } = await d.frame(admin, inputs, now)
    const results = await Promise.all(asked.map(async (q) => {
      try {
        // Held to the step's clock: the Ask agent's calls cannot be capped
        // one by one from here, so the question is; and given its share of
        // the room, never the whole of it.
        const r = await withinClock(d.research(admin, {
          clientId: plan.clientId, companyName: inputs.company, runId: plan.runId, questions: [q], budgetUsd: eachUsd, frame, now, parallel: 1, persist: true,
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
    if (transient) retryIfTransient(transient.error ?? new Error(transient.answer?.error ?? 'failed'), opts.lastAttempt, step)
    const answers: ResearchAnswer[] = [
      ...results.map((r) => r.answer ?? { ...unasked(r.q, message(r.error)), outcome: 'failed' as const }),
      ...questions.slice(ask).map((q) => unasked(q, "no room left in the set's budget")),
    ]
    return {
      status: 'ok',
      answers: freezeQuotes(answers).data,
      window,
      costUsd: results.reduce((n, r) => n + r.costUsd, 0),
      failed: answers.filter((a) => !answered(a)).map((a) => a.question.id),
    }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, step)
    console.error(`[${step}] the wave could not be asked: ${message(e)}`)
    return empty('skipped', message(e))
  }
}

/** The work, or a timeout when the step's clock has five seconds left. */
const withinClock = <T>(work: Promise<T>, clock: BriefClock, what: string): Promise<T> => within(work, leftMs(clock) - 5_000, what)

// ---- briefs:ideas ------------------------------------------------------------------------------------

/**
 * The research counted and the month's ideas: one ideas call, its self-check,
 * the allocation. Fails the set (stored, alerted once) where nothing came
 * back from the research, the workspace cannot be researched, or the set's
 * budget no longer covers the steps still to come.
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
  const month = plan.month
  const fail = async (error: string) => {
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month, step: 'briefs:ideas', error })
    return failed(error)
  }
  const blocked = waves.find((w) => w?.status === 'blocked')
  const answers = setAnswers(plan, waves)
  const window = waves.find((w) => w?.window)?.window ?? null
  if (blocked || !window || !answers.some(answered)) {
    return fail(blocked?.error ?? (window ? 'the research brought nothing back on any question' : 'the research could not be read'))
  }
  try {
    const { runSpent, room } = await roomFor(d, plan)
    if (room < stillToCome('ideas')) return fail(budgetError(room, stillToCome('ideas'), runSpent, plan.spentAtPlan))
    const grounded = await d.ground(admin, plan.inputs, answers, plan.questions, window)
    const set = await d.ideas(admin, plan.inputs, plan.questions, grounded.points, { log: true, clock })
    return {
      status: 'ok', points: grounded.points, window, raw: set.raw, contradicted: [...set.check.contradicted.entries()], allocation: set.allocation,
      researchUsd, costUsd: set.costUsd + set.check.costUsd,
    }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, 'briefs:ideas')
    return fail(message(e))
  }
}

// ---- briefs:write-role -----------------------------------------------------------------------------

/** One department's writer. A writer that cannot write fails the set: four
 *  briefs that point at each other are written together or not at all. So
 *  does a set whose budget no longer covers this writer and the steps after
 *  it. */
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
  const step = `briefs:write-${role}`
  const month = plan.month
  const fail = async (error: string): Promise<BriefWritten> => {
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month, step, error })
    return { status: 'failed', role, raw: null, costUsd: 0, error }
  }
  try {
    const { runSpent, room } = await roomFor(d, plan)
    if (room < stillToCome(role)) return fail(budgetError(room, stillToCome(role), runSpent, plan.spentAtPlan))
    const w = await d.write(admin, plan.inputs, plan.questions, ideas.points, ideas.allocation, role, { log: true, clock })
    return { status: 'ok', role, raw: w.raw, costUsd: w.costUsd }
  } catch (e) {
    retryIfTransient(e, opts.lastAttempt, step)
    return fail(message(e))
  }
}

// ---- briefs:compose ----------------------------------------------------------------------------------

/**
 * The set composed from the four writers' output against the ideas step's
 * allocation (the repeat judge, the summaries' self-check, the quotes picked
 * by meaning), then stored: each brief that prints as its snapshot, one per
 * client, month and role (a retry overwrites its own, never adds one), and the
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
  const month = plan.month
  const fail = async (error: string): Promise<BriefComposed> => {
    await failSet(admin, d, { clientId: plan.clientId, runId: plan.runId, company: plan.company, month, step: 'briefs:compose', error })
    return { status: 'failed', rows: [], costUsd: 0, error }
  }
  try {
    const { runSpent, room } = await roomFor(d, plan)
    if (room < stillToCome('compose')) return fail(budgetError(room, stillToCome('compose'), runSpent, plan.spentAtPlan))
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
    return fail(message(e))
  }
}
