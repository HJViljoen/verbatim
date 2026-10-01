import type { SupabaseClient } from '@supabase/supabase-js'

import { sendAlertEmail } from '../email'
import { checkWeekRead, type WeekCheck } from './check'
import { loadCompanyContext, type CompanyContext } from './company'
import { composeWeekRead } from './compose'
import { callBudget, type CallBudget } from './deadline'
import { loadTrackedBrands } from './evidence'
import { fitQuotes, type FitParagraph, type QuoteFit } from './fit'
import { maybeWriteLongRun, type LongRunStepResult } from './longrun'
import { loadWeekPool } from './pool'
import { scrubWeekRead, weekAllowTokens, type WeekScrubCounts } from './scrub'
import { loadStanding } from './standing'
import { loadPreviousHeadlines, saveWeekRead, weekReadsApplied, type WeekReadRow, type WeekReadStatus } from './store'
import type { StandingFact, WeekPool, WeekReadDataV2 } from './types'
import { writerFigures, writerSubjects, type WeekReadOutput } from './write'
import { generateWeekRead, WEEK_READ_MODEL, type ParseClient } from './write-model'

// The week's written read, built and stored (plan T4). Two entry points:
//
//  · `buildWeekRead`: pool (T1), standing (T2), the writer (T3, v3: the
//    report and the findings in one call), scrub, the self-check (the finding
//    headlines and the week's one line), the quotes' fit (T3b; the story's
//    quotes too), compose. Writes nothing but the
//    `ai_call_log` rows of its model calls (the writer, the self-check, the
//    fit's one embeddings request), and not those where `log` is false (the
//    script's dry run).
//    A THIN pool makes no model call at all: it composes the read with no
//    findings and says `thin`;
//  · `runWeekReadStep`: the Inngest step's body (`write-week-read`,
//    inngest/functions/pipeline.ts). Builds, stores the row, and NEVER throws:
//    a failure stores a `failed` row where it can and alerts the operator.
//
// WHY THE ALERT IS SENT IN HERE AND NOT IN THE STEP'S `.catch`. A step that
// runs out of retries is memoised as failed, and every later step replays the
// function from the top, so a `.catch` beside `step.run` runs again on each of
// the steps after it (close-run, settle-apify-usage, write-run-costs, prune,
// the report event, the partial alert): an email there is five emails. Inside
// the body it is sent once, inside a step that then succeeds.

export interface BuiltWeekRead {
  status: Exclude<WeekReadStatus, 'failed'>
  data: WeekReadDataV2
  pool: WeekPool
  standing: StandingFact[]
  /** Whether the writer was called (false on a thin pool). */
  called: boolean
  /** The writer's output before scrub, for the script's workings. */
  raw: WeekReadOutput | null
  scrub: WeekScrubCounts | null
  check: WeekCheck | null
  /** How the quotes were fitted to the findings (null on a thin week). */
  fit: QuoteFit | null
}

/** The company's name, as the writer is told it. */
async function companyOf(admin: SupabaseClient, clientId: string): Promise<string> {
  const res = await admin.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(`week read client: ${res.error.message}`)
  return ((res.data as { company_name: string | null } | null)?.company_name ?? '').trim() || 'the company'
}

/** Everything the writer is handed, read from the database: what a dry run
 *  may save and a later run reuse, so a prompt can be read before it is paid
 *  for without reading production twice. */
export interface WeekReadInputs {
  company: string
  pool: WeekPool
  standing: StandingFact[]
  previous: { headlines: string[] } | null
  /** What the company sells, says about itself and whether it posted (v3).
   *  Absent in inputs saved before it existed: the script reads it then. */
  context?: CompanyContext | null
}

export async function loadWeekReadInputs(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; asOf?: Date },
): Promise<WeekReadInputs> {
  const { clientId, runId } = opts
  const company = await companyOf(admin, clientId)
  // Whose people are not the market (lib/written/evidence.ts), read once.
  const brands = await loadTrackedBrands(admin, clientId)
  const pool = await loadWeekPool(admin, { clientId, runId, brands })
  const standing = await loadStanding(admin, { clientId, month: pool.month, window: pool.window, asOf: opts.asOf ?? new Date(), brands })
  const previous = pool.thin ? null : await loadPreviousHeadlines(admin, clientId, runId, pool.window.from)
  const context = pool.thin ? null : await loadCompanyContext(admin, { clientId, window: pool.window })
  return { company, pool, standing, previous, context }
}

export async function buildWeekRead(
  admin: SupabaseClient,
  opts: {
    clientId: string; runId: string; asOf?: Date; log: boolean; client?: ParseClient; inputs?: WeekReadInputs
    /** The embedder, for a test. */
    embed?: (texts: string[]) => Promise<number[][]>
    /** The step's time for its model calls (lib/written/deadline.ts). Absent
     *  (the script), each call keeps its cap and no SDK retry. */
    budget?: CallBudget
  },
): Promise<BuiltWeekRead> {
  const { clientId, runId } = opts
  const { company, pool, standing, previous, context } = opts.inputs ?? (await loadWeekReadInputs(admin, opts))
  const figures = writerFigures(pool)

  if (pool.thin) {
    const data = composeWeekRead({ pool, standing, written: null, subjects: [], writerFigures: figures, model: '', costUsd: 0 })
    return { status: 'thin', data, pool, standing, called: false, raw: null, scrub: null, check: null, fit: null }
  }

  const call = await generateWeekRead(admin, { company, pool, standing, previous, figures, context, clientId, runId, log: opts.log, client: opts.client, budget: opts.budget })
  const scrubbed = scrubWeekRead(call.written, figures, weekAllowTokens(pool.candidates, standing), { company })
  const check = await checkWeekRead(admin, { clientId, runId, companyName: company, headlines: checkableHeadlines(pool, scrubbed.output), persist: opts.log, budget: opts.budget })
  // Which quote fits each finding, and each story paragraph that points to a
  // voice, as it will print (after the scrub).
  const fit = await fitQuotes(admin, {
    clientId,
    runId,
    pool,
    findings: scrubbed.output.findings.map((f, index) => ({ index, headline: f.headline, saw: f.saw, based_on: f.based_on })),
    story: storyFitTargets(scrubbed.output),
    log: opts.log,
    budget: opts.budget,
  }, opts.embed ? { embed: opts.embed } : {})
  return finishWeekRead({ company, pool, standing, raw: call.written, check, fit, costUsd: call.costUsd + check.costUsd + fit.costUsd })
}

/** The story paragraphs whose quote is fitted: each that points to a voice,
 *  measured against that one candidate's options. */
export function storyFitTargets(scrubbed: Pick<WeekReadOutput, 'story'>): FitParagraph[] {
  return (scrubbed.story ?? [])
    .map((p, index) => ({ index, text: p.paragraph, based_on: p.quote_from ? [p.quote_from] : [] }))
    .filter((p) => p.text.trim() && p.based_on.length > 0)
}

/**
 * The claims the self-check reads: each finding headline that could print (it
 * survived the scrub and rests on a candidate that exists), then, where one
 * could, the report's own lines (v3): the week's one line, each story
 * paragraph, each implication and each watch line that survived the scrub and
 * cites a candidate that exists. Each report line is checked on its own, so a
 * contrast the conversation contradicts is held where it is said, and nothing
 * else is held with it.
 */
export function checkableHeadlines(pool: Pick<WeekPool, 'candidates'>, scrubbed: Pick<WeekReadOutput, 'findings' | 'week_in_one_line'> & Partial<Pick<WeekReadOutput, 'story' | 'implications' | 'watch'>>): string[] {
  const known = new Set(pool.candidates.map((c) => c.id.toUpperCase()))
  const cites = (ids: readonly string[] | null | undefined) => (ids ?? []).some((id) => known.has(String(id).trim().toUpperCase()))
  const headlines = scrubbed.findings.filter((f) => f.headline && cites(f.based_on)).map((f) => f.headline)
  if (headlines.length === 0) return []
  const line = (scrubbed.week_in_one_line ?? '').trim()
  const report = [
    ...(scrubbed.story ?? []).filter((p) => cites(p.based_on)).map((p) => p.paragraph),
    ...(scrubbed.implications ?? []).filter((x) => cites(x.based_on)).map((x) => x.implication),
    ...(scrubbed.watch ?? []).filter((x) => cites(x.based_on)).map((x) => x.question),
  ].map((t) => t.trim()).filter(Boolean)
  return [...new Set([...headlines, ...(line ? [line] : []), ...report])]
}

/**
 * Everything after the calls, from the writer's own output and the check's
 * verdicts: scrub and compose. Pure, and deterministic, so a saved dry run
 * can be composed again after a change to compose without paying for another
 * call (scripts/week-read.ts --recompose).
 */
export function finishWeekRead(a: {
  /** The company, for the scrub's advice rule (`toldWhatToDo`). */
  company?: string
  pool: WeekPool
  standing: StandingFact[]
  raw: WeekReadOutput
  check: WeekCheck
  /** The quotes' fit; absent, substance then the writer's order decides. */
  fit?: QuoteFit | null
  costUsd: number
}): BuiltWeekRead {
  const figures = writerFigures(a.pool)
  const scrubbed = scrubWeekRead(a.raw, figures, weekAllowTokens(a.pool.candidates, a.standing), { company: a.company })
  const data = composeWeekRead({
    pool: a.pool,
    standing: a.standing,
    written: scrubbed.output,
    subjects: writerSubjects(a.standing),
    writerFigures: figures,
    contradicted: a.check.contradicted,
    fit: a.fit?.scores,
    storyFit: a.fit?.story,
    model: WEEK_READ_MODEL,
    costUsd: Math.round(a.costUsd * 10_000) / 10_000,
  })
  return { status: data.findings.length > 0 ? 'ready' : 'thin', data, pool: a.pool, standing: a.standing, called: true, raw: a.raw, scrub: scrubbed.counts, check: a.check, fit: a.fit ?? null }
}

/** The row a built read is stored as. */
export function rowOf(clientId: string, runId: string, built: Pick<BuiltWeekRead, 'status' | 'data'>): WeekReadRow {
  return {
    client_id: clientId,
    run_id: runId,
    kind: 'week',
    month: built.data.month,
    window_start: built.data.window.from,
    window_end: built.data.window.to,
    data: built.data,
    status: built.status,
    cost_usd: built.data.costUsd,
  }
}

export interface WeekReadStepResult {
  status: WeekReadStatus | 'missing_migration'
  findings: number
  held: number
  costUsd: number
  error?: string
  /** ADDITIVE (pages build): the month's long-run read, where the hook ran. */
  longRun?: LongRunStepResult
}

/** What the step needs from the world, so a test can stand them in. */
export interface WeekReadStepDeps {
  applied: (admin: SupabaseClient) => Promise<boolean>
  build: typeof buildWeekRead
  save: (admin: SupabaseClient, row: WeekReadRow) => Promise<void>
  alert: (subject: string, text: string) => Promise<{ sent: boolean }>
  /** The long-run read's hook (lib/written/longrun.ts `maybeWriteLongRun`),
   *  run after the week's read is stored. Never throws. */
  longRun: (admin: SupabaseClient, opts: { clientId: string; runId: string; company: string; startedAt: number }, deps: Pick<WeekReadStepDeps, 'save' | 'alert'>) => Promise<LongRunStepResult>
}

const DEFAULT_DEPS: WeekReadStepDeps = { applied: weekReadsApplied, build: buildWeekRead, save: saveWeekRead, alert: sendAlertEmail, longRun: maybeWriteLongRun }

const FALLBACK = (clientId: string, runId: string) =>
  `Fallback, once the cause is fixed: node --env-file=.env.local --import tsx scripts/week-read.ts --client ${clientId} --run ${runId} (dry), then again with --write.`

/**
 * The `write-week-read` step's body. Never throws: every outcome is a result,
 * and the ones the operator must hear about (a failure, a missing table, a
 * week whose written findings were all held) are sent as one alert.
 */
export async function runWeekReadStep(
  admin: SupabaseClient,
  opts: { clientId: string; runId: string; company?: string },
  deps: Partial<WeekReadStepDeps> = {},
): Promise<WeekReadStepResult> {
  const d = { ...DEFAULT_DEPS, ...deps }
  const who = opts.company ?? opts.clientId
  const startedAt = Date.now()
  try {
    // No table, nothing spent: the step no-ops until its migration is applied
    // (the rule every additive step follows, AGENTS.md).
    if (!(await d.applied(admin))) {
      console.warn('[write-week-read] week_reads is not in this database yet; nothing was written or spent')
      await d.alert(
        `Verbatim week read not written: ${who}`,
        `The week_reads table is not in the database yet, so run ${opts.runId} wrote no read and spent nothing.\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
      )
      return { status: 'missing_migration', findings: 0, held: 0, costUsd: 0 }
    }
    // THE STEP'S CLOCK STARTS HERE (review M4): every model call below is
    // capped, never retried by the SDK, and done by WEEK_READ_STEP_BUDGET_MS
    // (250 s), well inside the route's 300 s; one that runs out is thrown as a
    // timeout and stored as a failed read below, with the alert naming it.
    const built = await d.build(admin, { clientId: opts.clientId, runId: opts.runId, log: true, budget: callBudget({ startedAt }) })
    await d.save(admin, rowOf(opts.clientId, opts.runId, built))
    const result: WeekReadStepResult = { status: built.status, findings: built.data.findings.length, held: built.data.held.length, costUsd: built.data.costUsd }
    console.log(`[write-week-read] ${built.status}: ${result.findings} finding(s), ${result.held} held, $${result.costUsd}`)
    if (built.called && built.data.findings.length === 0) {
      await d.alert(
        `Verbatim week read empty: ${who}`,
        `The writer ran on run ${opts.runId} and every finding it wrote was held, so the read is stored as thin and nothing will be sent from it.\n\nHeld:\n${built.data.held.map((h) => `- ${h.headline || '(no headline)'}: ${h.reason}`).join('\n') || '- nothing written'}\n\nClient: ${who} (${opts.clientId})`,
      )
    }
    // THE MONTH'S LONG-RUN READ, ONCE THE WEEK'S IS STORED (pages build: no
    // new step id). Its own failures are its own: it never throws and never
    // touches the week's result.
    result.longRun = await d.longRun(admin, { clientId: opts.clientId, runId: opts.runId, company: who, startedAt }, { save: d.save, alert: d.alert })
      .catch((e: unknown): LongRunStepResult => ({ status: 'skipped', month: null, ideas: 0, costUsd: 0, error: e instanceof Error ? e.message : String(e) }))
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[write-week-read] failed: ${message}`)
    let stored = true
    try {
      await d.save(admin, { client_id: opts.clientId, run_id: opts.runId, kind: 'week', month: null, window_start: null, window_end: null, data: null, status: 'failed', cost_usd: 0 })
    } catch (saveError) {
      stored = false
      console.error(`[write-week-read] the failure could not be recorded either: ${saveError instanceof Error ? saveError.message : String(saveError)}`)
    }
    await d.alert(
      `Verbatim week read failed: ${who}`,
      `The week's read for run ${opts.runId} could not be written. The run itself is unaffected.\n\nError: ${message}\n${stored ? 'A failed row is stored in week_reads.' : 'No row could be stored in week_reads.'}\n\nClient: ${who} (${opts.clientId})\n\n${FALLBACK(opts.clientId, opts.runId)}`,
    ).catch(() => ({ sent: false }))
    return { status: 'failed', findings: 0, held: 0, costUsd: 0, error: message }
  }
}
