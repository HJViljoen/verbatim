import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'

import { mapWithLimit } from '../chunk'
import { estimateCost, RUN_MODEL_BUDGET_USD, SUBJECT_READS_BUDGET_USD, SUBJECT_READS_RUN_MARGIN_USD, subjectReadsEnabled } from '../config'
import { sendAlertEmail } from '../email'
import { openai } from '../openai'
import { loadSubjectPlacement, placementMembers } from '../pages/subject-place'
import { printsMedicalLine } from '../post-ideas/medical'
import { pickThemedRunId, type ThemedRunRow } from '../pages/themed-run'
import { logAiCall } from '../pipeline/ai-log'
import { runSpendSoFar } from '../pipeline/run-costs'
import { marketAudiences } from '../reading/market'
import { loadMarketRivalAudiences } from '../reading/reading-view'
import { selectAll } from '../supabase-admin'
import { loadCompanyContext, type CompanyContext } from './company'
import { asTimeout, callBudget, isTimeout, isTransient, UNTIMED_STEP, type CallBudget } from './deadline'
import { loadDatedEvidence, loadTrackedBrands } from './evidence'
import { readingMonthOf } from './month'
import { isMissingWeekReads, WEEK_READS_TABLE } from './store'
import {
  buildSubjectReadPrompts, finishSubjectRead, SpendGate, subjectReadAllow, subjectReadAttemptMaxUsd, subjectReadMaterial, subjectReadSchema, subjectReadsCapLeft,
  subjectReadsData, subjectReadsHeadroom, subjectReadsRoom, thinSubjectRead,
  SUBJECT_READ_CONCURRENCY, SUBJECT_READ_EFFORT, SUBJECT_READ_MAX_OUTPUT_TOKENS, SUBJECT_READ_MODEL, SUBJECT_READ_PASS, SUBJECT_READ_PROMPT_VERSION,
  type SubjectReadMaterial, type SubjectReadOutput, type SubjectReadScrub, type SubjectReadTheme,
} from './subject-reads'
import type { SubjectRead, SubjectReadsData, WeekReadData } from './types'
import type { ParseClient } from './write-model'

// THE SUBJECTS' OWN READS, BUILT AND STORED (14 Oct; the pure half is
// ./subject-reads.ts). Two entry points, the week read's shape:
//
//  · `buildSubjectReads`: the material (`loadSubjectReadInputs`), then for
//    each READY subject a read: a call where it has enough to say, the thin
//    line where it does not, the scrub. Writes nothing but the calls'
//    `ai_call_log` rows (pass `subject_read`), and not those where `log` is
//    false (the script's dry run);
//  · `runSubjectReadsStep`: the Inngest step's body (`write-subject-reads`,
//    inngest/functions/pipeline.ts, after `write-week-read` and before
//    `write-post-ideas`). It adds the reads to the run's `week_reads` row of
//    kind 'week' (`data.subjectReads`): NO MIGRATION, and a page reaches them
//    only through the published read (`subjectReadOf`,
//    lib/written/published.ts), exactly when the week read itself prints.
//
// SILENT WHERE IT SHOULD BE. A TEST run (`isTestRun`) reads and writes
// nothing. A tenant switched off (`subjectReadsEnabled`, lib/config.ts: OPT-IN,
// on for Össur alone since 14 Oct; `SUBJECT_READS=0` and `SUBJECT_READS_OFF`
// are emergency off-switches) is the same. No `week_reads` table, no READY week read for the run (thin,
// failed or missing: the week read's own step told the operator, and a page
// prints no read that is not ready), or no ready subject is a no-op that
// spends nothing, logged and never alerted. A run whose reads are all
// written already (a retry after the save) reads one row and spends nothing.
//
// FAIL-SOFT, THE WEEK READ'S CONTRACT, ONE SUBJECT AT A TIME. Each subject's
// call is capped on the step's own clock (`WEEK_READ_CALLS.subject`, 100 s;
// the step's 250 s, `WEEK_READ_STEP_BUDGET_MS`) with no SDK retry, up to
// `SUBJECT_READ_CONCURRENCY` in flight. Whatever was written is SAVED before
// anything is thrown, so a retry writes only what is missing. A TRANSIENT
// failure (`isTransient`) of any subject on any attempt but the last is then
// thrown, so Inngest retries the step; on the last attempt, and for any other
// failure at once, the subject is stored `failed`, the rest stand, and the
// operator is alerted ONCE, inside the step (an alert in a `.catch` beside
// `step.run` is sent again on every later step's replay).
//
// A DOLLAR CAP AND THE RUN'S HEADROOM (the post ideas' rule). The step starts
// only where the run has `SUBJECT_READS_BUDGET_USD` (less what this run's
// earlier attempts spent on it, `ai_call_log` pass `subject_read`) plus
// `SUBJECT_READS_RUN_MARGIN_USD` left under `RUN_MODEL_BUDGET_USD`
// (`subjectReadsHeadroom`); every attempt then starts only where its worst
// case fits what is left (`SpendGate`). Refused before anything is called:
// no rows, status `over_budget`, one alert; refused for one subject: that
// subject is `failed`, the rest stand.

export class SubjectReadWriteError extends Error {
  /** What the attempts cost before it gave up (an unparsed answer is paid for). */
  spentUsd = 0
}

/** An attempt whose worst case the step's money could not cover. */
export class SubjectReadBudgetError extends Error {
  constructor(message: string, readonly spentUsd = 0) {
    super(message)
    this.name = 'SubjectReadBudgetError'
  }
}

// ---- The inputs ------------------------------------------------------------------------

/** Everything the writer is handed, read from the database: no comment's
 *  words (notes are Pass A's paraphrases), so a dry run may save it and a
 *  later one build from it with no read. */
export interface SubjectReadInputs {
  clientId: string
  runId: string
  company: string
  /** The month read (the week read's), `YYYY-MM-01`. */
  month: string
  /** The week carried past the month's end: the month is read in full. */
  complete: boolean
  /** The days read. */
  read: { from: string; to: string }
  context: CompanyContext | null
  /** One per READY subject, in the subjects' own order. */
  subjects: SubjectReadMaterial[]
  /** Names that carry digits and may be written. */
  allow: string[]
}

/** The days a month's reads read: from its first day to the run's window end,
 *  or the month in full where the week carried past it. Pure. */
export function readDaysOf(month: string, window: { from: string; to: string }): { from: string; to: string; complete: boolean } {
  const reading = readingMonthOf(window)
  const from = `${month.slice(0, 7)}-01T00:00:00.000Z`
  if (reading.month === month.slice(0, 10)) return { from, to: reading.to, complete: reading.complete }
  // A read of another month than the window's (the script on an old run):
  // that month in full.
  const d = new Date(from)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return { from, to: d.toISOString(), complete: true }
}

/** The run's clustering: this run's conversations where it wrote any, else
 *  the newest themed run's (a run that wrote none, read by the script). */
async function loadReadThemes(admin: SupabaseClient, clientId: string, runId: string): Promise<SubjectReadTheme[]> {
  type Obs = { theme_id: string; label: string | null; category: string | null; member_insight_ids: string[] | null }
  const read = (run: string) => selectAll<Obs>(() =>
    admin.from('theme_observations').select('theme_id, label, category, member_insight_ids')
      .eq('client_id', clientId).eq('run_id', run).order('theme_id', { ascending: true }))
  let run = runId
  let obs = await read(run)
  if (obs.length === 0) {
    const res = await admin.from('themes').select('run_id, created_at')
      .eq('client_id', clientId).not('run_id', 'is', null).order('created_at', { ascending: false }).limit(1)
    if (res.error) throw new Error(`subject reads themed run: ${res.error.message}`)
    const themed = pickThemedRunId((res.data ?? []) as ThemedRunRow[])
    if (!themed) return []
    run = themed
    obs = await read(run)
  }
  const desc = await selectAll<{ id: string; registry_id: string | null; description: string | null }>(() =>
    admin.from('themes').select('id, registry_id, description').eq('client_id', clientId).eq('run_id', run).order('id', { ascending: true }))
  const descOf = new Map(desc.filter((d) => d.registry_id && d.description?.trim()).map((d) => [String(d.registry_id), String(d.description).trim()]))
  return obs.map((o) => ({
    themeId: String(o.theme_id),
    label: (o.label ?? '').trim(),
    description: descOf.get(String(o.theme_id)) ?? null,
    kind: o.category ?? null,
    memberIds: (o.member_insight_ids ?? []).map(String),
  }))
}

async function companyOf(admin: SupabaseClient, clientId: string): Promise<string> {
  const res = await admin.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(`subject reads client: ${res.error.message}`)
  return ((res.data as { company_name: string | null } | null)?.company_name ?? '').trim() || 'the company'
}

/**
 * Everything the reads are written from, for one run and month. READ-ONLY. A
 * read that fails throws; the step decides what that costs. No ready subject
 * is no subjects (and nothing more is read).
 */
export async function loadSubjectReadInputs(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; month: string; window: { from: string; to: string } },
): Promise<SubjectReadInputs> {
  const { clientId, runId } = opts
  const month = opts.month.slice(0, 10)
  const days = readDaysOf(month, opts.window)
  const read = { from: days.from, to: days.to }
  const [company, placement] = await Promise.all([companyOf(admin, clientId), loadSubjectPlacement(admin, clientId)])
  const empty: SubjectReadInputs = { clientId, runId, company, month, complete: days.complete, read, context: null, subjects: [], allow: [] }
  // Ruling U6: a read rests on membership, so the READY subjects alone.
  const ready = placement.all.filter((x) => x.calibration === 'ready').map((x) => x.subject)
  if (ready.length === 0 || !placement.placed) return empty
  // The ready subjects' members, off the placement's own membership read.
  const all = placementMembers(placement.placed)
  const members = new Map(ready.map((s) => [s.id, all.get(s.id) ?? new Set<string>()]))
  const [brands, rivals, themes, context] = await Promise.all([
    loadTrackedBrands(admin, clientId),
    loadMarketRivalAudiences(admin, clientId).then((r) => r ?? []),
    loadReadThemes(admin, clientId, runId),
    loadCompanyContext(admin, { clientId, window: opts.window }),
  ])
  const evidence = await loadDatedEvidence(admin, clientId, [...new Set([...members.values()].flatMap((s) => [...s]))], read, { brands })
  const market = new Set(marketAudiences(rivals))
  const subjects = ready.map((s) => subjectReadMaterial({
    clientId, subject: s, members: members.get(s.id) ?? new Set(), evidence, market, themes, placed: placement.placed,
  }))
  return { ...empty, context, subjects, allow: subjectReadAllow(subjects) }
}

// ---- The call --------------------------------------------------------------------------

export interface SubjectReadCall {
  output: SubjectReadOutput
  costUsd: number
  attempts: number
}

/**
 * One subject's call: a second attempt only for an answer that would not
 * parse or a failed call that was not a timeout, never a third; a timeout is
 * thrown as one (transient, `isTransient`), never retried here. Every attempt
 * is held to the step's clock (`budget`) and to its money (`spend`): an
 * attempt whose worst case does not fit throws `SubjectReadBudgetError`
 * before it is made.
 */
export async function generateSubjectRead(
  admin: SupabaseClient | null,
  args: {
    clientId: string
    runId: string
    prompts: { system: string; user: string }
    log?: boolean
    client?: ParseClient
    budget?: CallBudget
    spend: SpendGate
  },
): Promise<SubjectReadCall> {
  const client = args.client ?? openai
  if (!args.client && !process.env.OPENAI_API_KEY) throw new SubjectReadWriteError('OPENAI_API_KEY is not set')
  const { system, user } = args.prompts
  const log = args.log !== false && admin != null
  const budget = args.budget ?? UNTIMED_STEP
  const worst = subjectReadAttemptMaxUsd(args.prompts)
  let costUsd = 0
  let lastError = ''
  let lastCause: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!args.spend.reserve(worst)) {
      throw new SubjectReadBudgetError(
        `the subject read's call was not made: attempt ${attempt} may cost up to $${worst.toFixed(2)}, and $${Math.max(0, args.spend.room - args.spend.spent).toFixed(2)} of the $${args.spend.room.toFixed(2)} the step may spend is not already spent or held`
        + (lastError ? `; the attempt before it failed: ${lastError}` : ''),
        costUsd,
      )
    }
    let options: { timeout: number; maxRetries: 0 }
    try {
      options = budget.optionsFor('subject')
    } catch (e) {
      args.spend.settle(worst, 0)
      throw e
    }
    const startedAt = Date.now()
    let paid = 0
    try {
      const completion = await client.chat.completions.parse({
        model: SUBJECT_READ_MODEL,
        reasoning_effort: SUBJECT_READ_EFFORT,
        max_completion_tokens: SUBJECT_READ_MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: zodResponseFormat(subjectReadSchema(), 'subject_read'),
      }, options)
      const usage = completion.usage
        ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 }
      const parsed = (completion.choices[0]?.message?.parsed ?? null) as SubjectReadOutput | null
      paid = estimateCost(SUBJECT_READ_MODEL, usage.prompt_tokens, usage.completion_tokens)
      costUsd += paid
      if (log && admin) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: SUBJECT_READ_PASS, callIndex: attempt, model: SUBJECT_READ_MODEL,
          promptVersion: SUBJECT_READ_PROMPT_VERSION, systemPrompt: system, userPrompt: user,
          // The writer's own words over paraphrases: no comment's words.
          response: parsed, error: parsed ? null : 'no parsed output', usage, durationMs: Date.now() - startedAt,
          validationStatus: parsed ? 'ok' : 'parse_error',
        }).catch((e) => console.warn('[subject_read] log failed:', e))
      }
      args.spend.settle(worst, paid)
      if (!parsed) { lastError = 'no parsed output'; lastCause = undefined; continue }
      return { output: parsed, costUsd, attempts: attempt }
    } catch (e) {
      if (paid === 0) args.spend.settle(worst, 0)
      lastError = e instanceof Error ? e.message : String(e)
      lastCause = e
      console.warn(`[subject_read] attempt ${attempt} failed:`, lastError)
      if (log && admin) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: SUBJECT_READ_PASS, callIndex: attempt, model: SUBJECT_READ_MODEL,
          promptVersion: SUBJECT_READ_PROMPT_VERSION, systemPrompt: system, userPrompt: user, response: null,
          error: lastError, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: Date.now() - startedAt, validationStatus: 'parse_error',
        }).catch(() => {})
      }
      if (isTimeout(e)) throw asTimeout(e, 'subject', options.timeout)
    }
  }
  const failed = new SubjectReadWriteError(`The subject's read could not be written twice over: ${lastError}`, { cause: lastCause })
  failed.spentUsd = costUsd
  throw failed
}

// ---- The build -------------------------------------------------------------------------

export interface BuiltSubjectReads {
  data: SubjectReadsData
  inputs: SubjectReadInputs
  /** Subjects whose call failed in a way a retry may clear (`isTransient`). */
  transient: string[]
  /** Calls made (subjects written by a model this time). */
  called: number
  /** The writer's answers before the scrub, by subject, for the script. */
  raw: Record<string, SubjectReadOutput>
  scrub: Record<string, SubjectReadScrub>
}

/** Keep an earlier attempt's read of this month (written, thin or held): a
 *  failed one is written again. Pure. */
export const keepsRead = (r: SubjectRead | undefined): r is SubjectRead => r != null && r.status !== 'failed'

export async function buildSubjectReads(
  admin: SupabaseClient,
  opts: {
    clientId: string
    runId: string
    month: string
    window: { from: string; to: string }
    log: boolean
    client?: ParseClient
    inputs?: SubjectReadInputs
    /** The step's clock. Absent (the script): each call keeps its cap. */
    budget?: CallBudget
    /** What the calls may spend between them (`subjectReadsRoom`). Absent:
     *  `SUBJECT_READS_BUDGET_USD`. */
    maxUsd?: number
    /** This month's reads an earlier attempt stored: kept, not written again. */
    existing?: SubjectReadsData | null
  },
): Promise<BuiltSubjectReads> {
  const inputs = opts.inputs ?? (await loadSubjectReadInputs(admin, opts))
  const spend = new SpendGate(Math.min(opts.maxUsd ?? SUBJECT_READS_BUDGET_USD, SUBJECT_READS_BUDGET_USD))
  const kept = new Map((opts.existing?.month === inputs.month ? opts.existing.subjects : []).filter(keepsRead).map((r) => [r.subjectId, r]))
  const transient: string[] = []
  const raw: Record<string, SubjectReadOutput> = {}
  const scrub: Record<string, SubjectReadScrub> = {}
  let called = 0
  let paid = 0
  const subjects = await mapWithLimit(inputs.subjects, SUBJECT_READ_CONCURRENCY, async (m): Promise<SubjectRead> => {
    const held = kept.get(m.subjectId)
    if (held) return held
    if (!m.enough) return thinSubjectRead(m, { month: inputs.month, complete: inputs.complete, allow: inputs.allow })
    const prompts = buildSubjectReadPrompts({ company: inputs.company, clientId: inputs.clientId, month: inputs.month, complete: inputs.complete, material: m, context: inputs.context })
    try {
      called++
      const call = await generateSubjectRead(admin, { clientId: opts.clientId, runId: opts.runId, prompts, log: opts.log, client: opts.client, budget: opts.budget, spend })
      paid += call.costUsd
      raw[m.subjectId] = call.output
      const done = finishSubjectRead(m, call.output, { company: inputs.company, allow: inputs.allow, medical: printsMedicalLine(inputs.clientId) })
      scrub[m.subjectId] = done.scrub
      return done.read
    } catch (e) {
      const spent = e instanceof SubjectReadWriteError || e instanceof SubjectReadBudgetError ? e.spentUsd : 0
      paid += spent
      const message = e instanceof Error ? e.message : String(e)
      if (!(e instanceof SubjectReadBudgetError) && isTransient(e)) transient.push(m.subjectId)
      console.warn(`[write-subject-reads] ${m.name}: ${message}`)
      return { subjectId: m.subjectId, name: m.name, status: 'failed', saying: [], means: '', basedOn: [], reason: message }
    }
  })
  // What this attempt spent, and what an earlier one did on the reads it kept.
  const earlier = opts.existing?.month === inputs.month ? opts.existing.costUsd : 0
  return {
    data: subjectReadsData({ month: inputs.month, read: inputs.read, subjects, costUsd: earlier + paid }),
    inputs, transient, called, raw, scrub,
  }
}

// ---- The store -------------------------------------------------------------------------

/** The run's week read as this step reads it. */
export interface WeekRowForReads {
  status: string
  month: string | null
  window: { from: string; to: string } | null
  data: WeekReadData | null
}

/** The run's `week_reads` row of kind 'week', 'missing' where the table is
 *  not in this database, null where the run has none. */
export async function loadWeekRowForReads(admin: SupabaseClient, clientId: string, runId: string): Promise<WeekRowForReads | 'missing' | null> {
  const res = await admin.from(WEEK_READS_TABLE).select('status, month, window_start, window_end, data')
    .eq('client_id', clientId).eq('run_id', runId).eq('kind', 'week').maybeSingle()
  if (res.error) {
    if (isMissingWeekReads(res.error)) return 'missing'
    throw new Error(`week_reads (subject reads): ${res.error.message}`)
  }
  const r = res.data as { status: string; month: string | null; window_start: string | null; window_end: string | null; data: WeekReadData | null } | null
  if (!r) return null
  return {
    status: r.status,
    month: r.month ? String(r.month).slice(0, 10) : null,
    window: r.window_start && r.window_end ? { from: r.window_start, to: r.window_end } : null,
    data: r.data,
  }
}

/** Put the reads on the run's week row (`data.subjectReads`), the rest of the
 *  row as it is now: read again just before the write, so nothing written
 *  since the step began is lost. */
export async function saveSubjectReads(admin: SupabaseClient, a: { clientId: string; runId: string; reads: SubjectReadsData }): Promise<void> {
  const res = await admin.from(WEEK_READS_TABLE).select('data')
    .eq('client_id', a.clientId).eq('run_id', a.runId).eq('kind', 'week').maybeSingle()
  if (res.error) throw new Error(`week_reads (subject reads) read: ${res.error.message}`)
  const data = (res.data as { data: WeekReadData | null } | null)?.data
  if (!data) throw new Error(`week_reads (subject reads): run ${a.runId} has no week read to add them to`)
  const upd = await admin.from(WEEK_READS_TABLE).update({ data: { ...data, subjectReads: a.reads } })
    .eq('client_id', a.clientId).eq('run_id', a.runId).eq('kind', 'week')
  if (upd.error) throw new Error(`week_reads (subject reads) write: ${upd.error.message}`)
}

/** This run's subject-read spend so far, from the ledger (pass `subject_read`). */
export async function subjectReadsSpendSoFar(admin: SupabaseClient, clientId: string, runId: string): Promise<number> {
  const rows = await selectAll<{ id: string; cost_usd: number | null }>(() => admin.from('ai_call_log').select('id, cost_usd')
    .eq('client_id', clientId).eq('run_id', runId).eq('pass', SUBJECT_READ_PASS).order('id'))
  return Math.round(rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) * 10_000) / 10_000
}

// ---- The step --------------------------------------------------------------------------

export interface SubjectReadsStepResult {
  status: 'ready' | 'failed' | 'test_run' | 'disabled' | 'missing_migration' | 'no_week_read' | 'no_subjects' | 'exists' | 'over_budget'
  /** Subjects with a written read, a thin one, and a failed or held one. */
  written: number
  thin: number
  failed: number
  costUsd: number
  error?: string
}

/** What the step needs from the world, so a test can stand them in. */
export interface SubjectReadsStepDeps {
  /** The per-tenant switch (`subjectReadsEnabled`, lib/config.ts). */
  enabled: (clientId: string) => boolean
  company: (admin: SupabaseClient, clientId: string) => Promise<string>
  row: typeof loadWeekRowForReads
  build: typeof buildSubjectReads
  spent: (clientId: string, runId: string) => Promise<number>
  readsSpent: (admin: SupabaseClient, clientId: string, runId: string) => Promise<number>
  save: typeof saveSubjectReads
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
}

const DEFAULT_DEPS: SubjectReadsStepDeps = {
  enabled: (clientId) => subjectReadsEnabled(clientId), company: companyOf, row: loadWeekRowForReads, build: buildSubjectReads, spent: runSpendSoFar, readsSpent: subjectReadsSpendSoFar, save: saveSubjectReads, alert: sendAlertEmail,
}

const FALLBACK = (clientId: string, runId: string) =>
  `Fallback, once the cause is fixed: node --env-file=.env.local --import tsx scripts/subject-reads.ts --client ${clientId} --run ${runId} (dry), then again with --write.`

/** A transient failure of some subjects, after the rest were saved. */
export class SubjectReadsTransientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SubjectReadsTransientError'
  }
}

const zero = { written: 0, thin: 0, failed: 0, costUsd: 0 }

/**
 * The `write-subject-reads` step's body (the header). Every outcome is a
 * result; a failure and a refusal for money are each told to the operator
 * once. A transient failure before the step's last attempt (`lastAttempt:
 * false`) is thrown instead, after whatever was written is saved.
 * `lastAttempt` absent is the last attempt: never throws.
 */
export async function runSubjectReadsStep(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; company?: string; testRun: boolean; lastAttempt?: boolean },
  deps: Partial<SubjectReadsStepDeps> = {},
): Promise<SubjectReadsStepResult> {
  const d = { ...DEFAULT_DEPS, ...deps }
  const lastAttempt = opts.lastAttempt ?? true
  if (opts.testRun) {
    console.log('[write-subject-reads] a test run: no subject read is written')
    return { status: 'test_run', ...zero }
  }
  // The per-tenant switch: off, nothing is read, spent or written, and nobody
  // is told, as for a test run.
  if (!d.enabled(opts.clientId)) {
    console.log('[write-subject-reads] subject reads are switched off for this tenant (SUBJECT_READS_ENABLED, or SUBJECT_READS / SUBJECT_READS_OFF)')
    return { status: 'disabled', ...zero }
  }
  // THE STEP'S CLOCK STARTS HERE: every call is capped and done by 250 s.
  const startedAt = Date.now()
  const who = opts.company ?? (await d.company(admin, opts.clientId).catch(() => opts.clientId))
  const overBudget = async (why: string): Promise<SubjectReadsStepResult> => {
    console.warn(`[write-subject-reads] over budget: ${why}`)
    await d.alert(
      `Verbatim subject reads not written: ${who}`,
      `The subjects' reads for run ${opts.runId} were not written: ${why}. The run itself is unaffected; each subject's panel shows the week read's sentence on it instead.\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'over_budget', ...zero, error: why }
  }
  // Where a failure is stored: the run's ready week read, once it is known,
  // and only where no earlier attempt stored reads (they stand).
  let target: { month: string; read: { from: string; to: string } } | null = null
  try {
    const row = await d.row(admin, opts.clientId, opts.runId)
    if (row === 'missing') {
      console.warn('[write-subject-reads] week_reads is not in this database yet; nothing was written or spent')
      return { status: 'missing_migration', ...zero }
    }
    if (!row || row.status !== 'ready' || !row.data || row.data.version !== 2 || !row.month || !row.window) {
      console.log(`[write-subject-reads] run ${opts.runId} has no ready week read (${row ? row.status : 'none'}), so its subject reads would print nowhere; nothing was written or spent`)
      return { status: 'no_week_read', ...zero }
    }
    const existing = row.data.subjectReads?.month === row.month ? row.data.subjectReads : null
    if (!existing?.subjects.some(keepsRead)) {
      const days = readDaysOf(row.month, row.window)
      target = { month: row.month, read: { from: days.from, to: days.to } }
    }
    if (existing && existing.subjects.length > 0 && existing.subjects.every(keepsRead)) {
      console.log(`[write-subject-reads] run ${opts.runId} already has its subjects' reads; nothing was written or spent`)
      return { status: 'exists', ...counts(existing), costUsd: 0 }
    }
    // THE RUN'S HEADROOM, read before anything is called; and this run's
    // earlier attempts' spend on the reads: the cap is the run's.
    const [spent, readsSpent] = await Promise.all([d.spent(opts.clientId, opts.runId), d.readsSpent(admin, opts.clientId, opts.runId)])
    if (subjectReadsCapLeft(readsSpent) <= 0) {
      return await overBudget(`this run's earlier attempts already spent $${readsSpent.toFixed(2)} of the subject reads' $${SUBJECT_READS_BUDGET_USD.toFixed(2)} cap`)
    }
    if (!subjectReadsHeadroom(spent, RUN_MODEL_BUDGET_USD, readsSpent)) {
      return await overBudget(`the run has spent $${spent.toFixed(2)} of its $${RUN_MODEL_BUDGET_USD} model budget, and the subject reads may cost up to $${subjectReadsCapLeft(readsSpent).toFixed(2)} more with $${SUBJECT_READS_RUN_MARGIN_USD.toFixed(2)} kept spare; they were not started, so the run could not trip its budget`)
    }
    const built = await d.build(admin, {
      clientId: opts.clientId, runId: opts.runId, month: row.month, window: row.window, log: true,
      budget: callBudget({ startedAt }), maxUsd: subjectReadsRoom(spent, RUN_MODEL_BUDGET_USD, readsSpent), existing,
    })
    if (built.data.subjects.length === 0) {
      console.log('[write-subject-reads] no ready subject: nothing was written or spent')
      return { status: 'no_subjects', ...zero }
    }
    // SAVED BEFORE ANYTHING IS THROWN: a retry writes only what is missing.
    await d.save(admin, { clientId: opts.clientId, runId: opts.runId, reads: built.data })
    const result: SubjectReadsStepResult = { status: built.data.status, ...counts(built.data), costUsd: built.data.costUsd }
    if (built.transient.length > 0 && !lastAttempt) {
      throw new SubjectReadsTransientError(`${built.transient.length} subject read(s) failed in a way a retry may clear; the ${result.written + result.thin} written are kept`)
    }
    console.log(`[write-subject-reads] ${result.status}: ${result.written} written, ${result.thin} thin, ${result.failed} failed or held, $${result.costUsd}`)
    const bad = built.data.subjects.filter((s) => s.status === 'failed' || s.status === 'held')
    if (bad.length > 0) {
      await d.alert(
        `Verbatim subject reads incomplete: ${who}`,
        `Run ${opts.runId}: ${bad.length} of ${built.data.subjects.length} subjects have no read; their panels show the week read's sentence instead.\n\n${bad.map((s) => `- ${s.name}: ${s.status}${s.reason ? `, ${s.reason}` : ''}`).join('\n')}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
      ).catch(() => ({ sent: false }))
    }
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!lastAttempt && (e instanceof SubjectReadsTransientError || isTransient(e))) {
      console.warn(`[write-subject-reads] transient failure, the step is retried: ${message}`)
      throw e
    }
    console.error(`[write-subject-reads] failed: ${message}`)
    // A FAILURE IS STORED where there is a read to store it on and nothing
    // an earlier attempt wrote would be lost: `status: 'failed'`, no subject.
    let stored = false
    if (target) {
      try {
        await d.save(admin, { clientId: opts.clientId, runId: opts.runId, reads: subjectReadsData({ month: target.month, read: target.read, subjects: [], costUsd: 0, error: message }) })
        stored = true
      } catch (saveError) {
        console.error(`[write-subject-reads] the failure could not be recorded either: ${saveError instanceof Error ? saveError.message : String(saveError)}`)
      }
    }
    await d.alert(
      `Verbatim subject reads failed: ${who}`,
      `The subjects' reads for run ${opts.runId} could not be written. The run itself is unaffected; each subject's panel shows the week read's sentence on it instead.\n\nError: ${message}\n${stored ? 'A failed record is stored on the run\'s week read.' : 'Nothing was stored.'}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'failed', ...zero, error: message }
  }
}

/** The written, thin and failed (or held) counts of a set of reads. Pure. */
function counts(data: SubjectReadsData): Pick<SubjectReadsStepResult, 'written' | 'thin' | 'failed'> {
  return {
    written: data.subjects.filter((s) => s.status === 'ready').length,
    thin: data.subjects.filter((s) => s.status === 'thin').length,
    failed: data.subjects.filter((s) => s.status === 'failed' || s.status === 'held').length,
  }
}
