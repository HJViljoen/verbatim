/**
 * Run WARNINGS (9 Nov 2026): a step out of retries that the run does not
 * count.
 *
 * Most of the pipeline's side steps were "logged, NOT noteError'd" (the
 * keyword-discovery precedent): a record kept alongside the report must not
 * make a clean run read `partial`. That judgement stands. What it cost was the
 * record of the failure, which lived only in a console line the host drops
 * within the hour: Össur's October product figures were refused on 28 Oct,
 * 1 Nov and 8 Nov and went stale for twelve days with nothing anywhere to say
 * so, and the lens and brand steps beside them could do exactly the same.
 *
 * A WARNING IS RECORDED AND COUNTS FOR NOTHING. It is written to its own
 * column, `pipeline_runs.warnings` (migration 20261114090000_run_warnings.sql),
 * never to `errors`, `error_message` or `status`, so no rule that judges a run
 * can see it: not the status (`runCloseStatus` takes the counted errors
 * alone), not `updateStatus`, `thinWeek`, the gathers' run health, the chart's
 * `gatherCompleted` (which reads `errors` and would fail closed on a label it
 * does not know), the weekly email, the briefs or the ops check's dead-man's
 * switch. A stale-data warning reaches the operator through the run's one
 * alert (`alertDue`, the `alert-partial` step); a housekeeping warning only
 * through the run's row and the ops readiness page.
 *
 * Each warning names the step, the month or week it affects where there is
 * one, the error's code or message (`warningCause`: never comment text) and
 * what is now stale for the client. PURE apart from the column test.
 */

import { appDay } from '../format'
import { isMissingColumnError } from '../supabase-admin'

/** Hard cap on stored warnings, `RUN_ERROR_CAP`'s 50 (restated: run-errors
 *  imports this module, never the other way round). */
export const RUN_WARNING_CAP = 50

/** 'stale-data': a client-visible number or page is now stale, and the run's
 *  alert says so. 'housekeeping': something minor or retried next run; the
 *  run's row and the ops page only. */
export type WarningKind = 'stale-data' | 'housekeeping'

/** One entry of `pipeline_runs.warnings`. */
export interface RunWarning {
  /** The step's label: its id without the `:i-of-n` of a fan-out. */
  step: string
  kind: WarningKind
  /** The month it affects, 'YYYY-MM', where there is one. */
  month?: string
  /** The week it affects, its first day 'YYYY-MM-DD', where there is one. */
  week?: string
  /** The subject it affects, by its name, where there is one. */
  subject?: string
  /** The error's code and message, scrubbed of quoted text (`warningCause`). */
  cause: string
  /** What is now stale for the client, as a sentence. */
  stale: string
}

/** Where a failure lands, as the step's `.catch` knows it. Months are ISO
 *  month starts or 'YYYY-MM'; the week is an instant or a date. */
export interface WarningAt {
  month?: string | null
  prevMonth?: string | null
  week?: string | null
  subject?: string | null
}

interface WarningRule {
  kind: WarningKind
  /** The step in words, for a sentence ("lens readings"). */
  name: string
  /** What is now stale for the client. */
  stale: (at: WarningAt) => string
  /** What the ops page says happened, where it is not that the step "did not
   *  finish" (the step budget: nothing failed). */
  said?: string
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM' from an ISO month start, a date or 'YYYY-MM'; null otherwise. */
const monthKey = (m: string | null | undefined): string | null => {
  const hit = /^(\d{4})-(\d{2})/.exec(m ?? '')
  return hit && Number(hit[2]) >= 1 && Number(hit[2]) <= 12 ? `${hit[1]}-${hit[2]}` : null
}

/** "October 2026". */
export function monthWords(m: string | null | undefined): string | null {
  const key = monthKey(m)
  return key ? `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : null
}

const inMonth = (at: WarningAt, fallback: string): string => {
  const words = monthWords(at.month)
  return words ? `for ${words}` : fallback
}

/**
 * THE CLASSIFICATION, ONE LINE A STEP. To move a step between the classes,
 * change its `kind` here; nothing else reads the class but `alertDue` and the
 * ops page's words. Why each one is where it is, with the readers of what it
 * writes: ~/.claude/plans/verbatim-pipeline-warnings.md.
 */
export const WARNING_STEPS = {
  // The gather's own-accounts plan: with it gone no own-posts or rival-posts
  // step runs at all, so nothing else records it.
  'plan-owned': {
    kind: 'stale-data', name: 'the plan of the client’s and the rivals’ own accounts',
    stale: () => 'No own post and no rival post was read this update, so the client’s posts, the rivals’ posts and their account events keep the previous update’s.',
  },
  'plan-translate-quotes': {
    kind: 'housekeeping', name: 'the quote translation plan',
    stale: () => 'Quotes not yet translated show in their own language until the next update translates them.',
  },
  'translate-quotes': {
    kind: 'housekeeping', name: 'a quote translation batch',
    stale: () => 'The batch’s quotes show in their own language until the next update translates them.',
  },
  'embed-insights': {
    kind: 'housekeeping', name: 'the insight embeddings',
    stale: () => 'The Agent cannot search this update’s new insights until the next update embeds them.',
  },
  'plan-subject-membership': {
    kind: 'stale-data', name: 'the subject membership plan',
    stale: () => 'No subject took this update’s insights, and no subject month is written this update, so the subject figures keep the previous update’s.',
  },
  'subject-membership': {
    kind: 'stale-data', name: 'a subject’s membership',
    stale: (at) => `${at.subject ? `“${at.subject}” did not take this update’s insights` : 'A subject did not take this update’s insights'}, and no subject month is written this update, so the subject figures keep the previous update’s.`,
  },
  'trim-stale-memberships': {
    kind: 'stale-data', name: 'the stale membership trim',
    stale: () => 'No subject month is written this update, so the subject figures keep the previous update’s.',
  },
  'plan-segment-videos': {
    kind: 'stale-data', name: 'the segment plan',
    stale: () => 'This update’s new videos have no segment, so the lens figures count them as buyers until the next update segments them, and a month that froze this update keeps that.',
  },
  'segment-videos': {
    kind: 'stale-data', name: 'a segment batch',
    stale: () => 'The batch’s videos have no segment, so the lens figures count them as buyers until the next update segments them, and a month that froze this update keeps that.',
  },
  'plan-comparability': {
    kind: 'stale-data', name: 'the comparability plan',
    stale: () => 'Whether this update’s months compare with the months before keeps the previous update’s answer, and the same-age line keeps no new week.',
  },
  'comparability': {
    kind: 'stale-data', name: 'a comparability task',
    stale: (at) => {
      const prev = monthWords(at.prevMonth)
      const month = monthWords(at.month)
      return prev && month
        ? `Whether ${prev} and ${month} compare keeps the previous update’s answer.`
        : 'The same-age line keeps no new week from this update.'
    },
  },
  'plan-lens-readings': {
    kind: 'stale-data', name: 'the lens readings plan',
    stale: () => 'The lens figures of every month this update refreshes keep the previous update’s numbers.',
  },
  'lens-readings': {
    kind: 'stale-data', name: 'lens readings',
    stale: (at) => `The lens figures ${inMonth(at, 'of the month')} keep the previous update’s numbers.`,
  },
  'plan-brand-readings': {
    kind: 'stale-data', name: 'the brand readings plan',
    stale: () => 'The brand figures of every month this update refreshes keep the previous update’s numbers.',
  },
  'brand-readings': {
    kind: 'stale-data', name: 'brand readings',
    stale: (at) => `The brand figures ${inMonth(at, 'of the month')} keep the previous update’s numbers.`,
  },
  'freeze-months': {
    kind: 'stale-data', name: 'the monthly reading',
    stale: () => 'The monthly figures (themes, subjects, kinds and audience stats) keep the previous update’s numbers, and no month froze this update.',
  },
  // Not a throw: the freeze returns the failure (`evidenceRefs.failed`). The
  // months froze and their evidence ids did not, and nothing revisits them.
  'freeze-months:evidence-ids': {
    kind: 'stale-data', name: 'the evidence ids of the months that froze',
    stale: () => 'The months that froze this update cannot say which videos and comments they were read on until scripts/monthly-reading.ts is run again over them.',
  },
  'anomaly-check': {
    kind: 'housekeeping', name: 'the anomaly check',
    stale: (at) => `${at.week ? `The week of ${appDay(at.week)}` : 'This update’s week'} shows no anomaly flag, on its pages or in its email, and readiness records no check for it.`,
  },
  'keyword-discovery': {
    kind: 'housekeeping', name: 'keyword discovery',
    stale: () => 'This update suggests no new keywords; the next update suggests again.',
  },
  // Not a step's failure (9 Nov, lib/pipeline/step-budget.ts): the update
  // finished, on more of Inngest's 1,000 steps a run than STEP_BUDGET_WARN_AT
  // leaves room for. Noted before close-run, which writes it.
  'step-budget': {
    kind: 'housekeeping', name: 'the update’s steps', said: 'came near Inngest’s limit of steps a run',
    stale: () => 'Nothing is stale: this update finished, but a bigger one can be stopped before its themes, its read and its email.',
  },
} as const satisfies Record<string, WarningRule>

export type WarningStep = keyof typeof WARNING_STEPS

const SQLSTATE = /^[0-9A-Z]{5}$/
const POSTGREST = /^PGRST\d{3}$/

/** The error's own code, its cause's, or the one a wrapped message carries
 *  ("… (code 23505)"), the `productStepFailure` rule. */
function codeOf(e: unknown, message: string): string | null {
  const own = (x: unknown): string | null => {
    const code = x && typeof x === 'object' ? (x as { code?: unknown }).code : null
    return typeof code === 'string' && (SQLSTATE.test(code) || POSTGREST.test(code)) ? code : null
  }
  return own(e) ?? own((e as { cause?: unknown } | null)?.cause) ?? /\(code ([0-9A-Z]{5}|PGRST\d{3})\)/.exec(message)?.[1] ?? null
}

/** An HTTP status the error carries (an OpenAI or Apify client error). */
function statusOf(e: unknown): number | null {
  const s = e && typeof e === 'object' ? (e as { status?: unknown }).status : null
  return typeof s === 'number' && s >= 100 && s < 600 ? s : null
}

/** A quoted part that is an identifier (a table, a constraint, a column) is
 *  kept; anything else in quotes might be a value, so it goes. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$.]{0,62}$/

/**
 * The error as a warning names it: its code (Postgres, PostgREST or HTTP)
 * and the first line of its message, with every quoted part that is not an
 * identifier elided, the row and key details Postgres appends cut, and the
 * whole held to 200 characters. NEVER COMMENT TEXT: a value the database or a
 * parser quotes back (a JSON parse error quotes the model's output, an input
 * syntax error the value) is exactly where a comment would surface. PURE.
 */
export function warningCause(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : e == null ? '' : String(e)
  const code = codeOf(e, raw)
  const status = statusOf(e)
  let message = (raw.split('\n')[0] ?? '')
    .replace(/\s*\(code ([0-9A-Z]{5}|PGRST\d{3})\)/, '')
    .replace(/\s*(?:Failing row contains|Key \(|DETAIL:).*$/, '')
    .replace(/"([^"]*)"/g, (m, inner: string) => (IDENTIFIER.test(inner) ? m : '"…"'))
    .replace(/'([^']*)'/g, (m, inner: string) => (IDENTIFIER.test(inner) || inner.length <= 1 ? m : '\'…\''))
    .replace(/“[^”]*”/g, '“…”')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  if (message.length > 200) message = `${message.slice(0, 199)}…`
  const label = code ? (POSTGREST.test(code) ? `PostgREST ${code}` : `Postgres ${code}`) : status ? `HTTP ${status}` : null
  if (label && message) return `${label}: ${message}`
  return label ?? (message || 'no message')
}

/** The warning a step's failure records. PURE. */
export function runWarning(step: WarningStep, e: unknown, at: WarningAt = {}): RunWarning {
  const rule: WarningRule = WARNING_STEPS[step]
  const month = monthKey(at.month)
  const week = at.week ? /^\d{4}-\d{2}-\d{2}/.exec(at.week)?.[0] ?? null : null
  return {
    step,
    kind: rule.kind,
    ...(month ? { month } : {}),
    ...(week ? { week } : {}),
    ...(at.subject ? { subject: at.subject } : {}),
    cause: warningCause(e),
    stale: rule.stale(at),
  }
}

/** The run's warnings, as the pipeline gathers them. Rebuilt on every replay
 *  of the function body the way `runErrors` is: a step that ran out of
 *  retries rejects again from memo and its `.catch` notes it again. */
export interface WarningLog {
  note(step: WarningStep, e: unknown, at?: WarningAt): void
  /** What close-run writes, capped at RUN_WARNING_CAP. */
  readonly recorded: RunWarning[]
  /** Every warning noted, past the cap too. */
  readonly total: number
  /** The stale-data ones, past the cap too: what `alertDue` reads. */
  readonly staleData: number
}

export function createWarningLog(cap: number = RUN_WARNING_CAP): WarningLog {
  const recorded: RunWarning[] = []
  let total = 0
  let staleData = 0
  return {
    note(step, e, at) {
      total++
      if (WARNING_STEPS[step].kind === 'stale-data') staleData++
      if (recorded.length < cap) recorded.push(runWarning(step, e, at))
    },
    get recorded() { return recorded },
    get total() { return total },
    get staleData() { return staleData },
  }
}

/**
 * Does the run send its one alert? On any counted error, as always, and now
 * on a stale-data warning too. A housekeeping warning alone never does. ONE
 * ALERT A RUN however many steps failed: the pipeline calls this once, for
 * its one `alert-partial` step, which Inngest memoises by id. PURE.
 */
export function alertDue(totalErrors: number, warnings: Pick<WarningLog, 'staleData'>): boolean {
  return totalErrors > 0 || warnings.staleData > 0
}

/** Is this the error close-run gets for `warnings` before its migration? */
export function isMissingWarningsColumn(error: unknown): boolean {
  return isMissingColumnError(error, 'warnings')
}

/**
 * close-run's write, with the column probe. The update is issued with the
 * run's `warnings`; where the column is not there yet (42703, or PGRST204
 * from a schema cache that has not seen it) it is issued again without it,
 * exactly the row every run wrote before. A missing bookkeeping column
 * (`stalled`) keeps its own older answer, the bare write. Any other error is
 * returned for close-run to log, as it always has been, never retried.
 */
export async function closeRunWrite(
  close: (extra: Record<string, unknown>) => PromiseLike<{ error: unknown }>,
  extra: { stalled: boolean; warnings: readonly RunWarning[] },
  isMissingBookkeeping: (error: unknown) => boolean,
): Promise<{ error: unknown; wrote: 'all' | 'without-warnings' | 'bare' }> {
  let { error } = await close({ stalled: extra.stalled, warnings: extra.warnings })
  if (!error) return { error: null, wrote: 'all' }
  if (isMissingWarningsColumn(error)) {
    console.warn('[close-run] `warnings` is not in the database yet (20261114090000_run_warnings.sql); closing without it')
    ;({ error } = await close({ stalled: extra.stalled }))
    if (!error) return { error: null, wrote: 'without-warnings' }
  }
  if (isMissingBookkeeping(error)) {
    console.warn('[close-run] `stalled` is not in the database yet; closing without it')
    ;({ error } = await close({}))
    return { error: error ?? null, wrote: 'bare' }
  }
  return { error, wrote: 'all' }
}

/** A stored `warnings` value read back: the entries that have the shape,
 *  any other value as none. PURE. */
export function parseRunWarnings(raw: unknown): RunWarning[] {
  if (!Array.isArray(raw)) return []
  const out: RunWarning[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue
    const r = w as Record<string, unknown>
    if (typeof r.step !== 'string' || typeof r.cause !== 'string' || typeof r.stale !== 'string') continue
    if (r.kind !== 'stale-data' && r.kind !== 'housekeeping') continue
    out.push({
      step: r.step, kind: r.kind, cause: r.cause, stale: r.stale,
      ...(typeof r.month === 'string' ? { month: r.month } : {}),
      ...(typeof r.week === 'string' ? { week: r.week } : {}),
      ...(typeof r.subject === 'string' ? { subject: r.subject } : {}),
    })
  }
  return out
}

/** The step in words, for a stored warning whose label this code knows. */
const stepName = (step: string): string => (WARNING_STEPS as Record<string, WarningRule>)[step]?.name ?? step

/**
 * A warning as the ops page says it: a plain sentence in sentence case, the
 * kind first, then what did not finish and why, then what is stale. PURE.
 */
export function warningSentence(w: RunWarning): string {
  const kind = w.kind === 'stale-data' ? 'Stale data' : 'Housekeeping'
  const month = monthWords(w.month)
  const where = month ? ` for ${month}` : w.week ? ` for the week of ${appDay(w.week)}` : ''
  const said = (WARNING_STEPS as Record<string, WarningRule>)[w.step]?.said ?? 'did not finish'
  return `${kind}: ${stepName(w.step)}${where} ${said} (${w.cause}). ${w.stale}`
}

/** "3 warnings: lens-readings ×2, brand-readings", the shape of
 *  `summariseRunErrors`, on the step labels. `total` counts past the cap. PURE. */
export function warningSummary(total: number, recorded: readonly RunWarning[]): string {
  const counts = new Map<string, number>()
  for (const w of recorded) counts.set(w.step, (counts.get(w.step) ?? 0) + 1)
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, n]) => (n > 1 ? `${label} ×${n}` : label))
  const noun = total === 1 ? 'warning' : 'warnings'
  const truncated = total > recorded.length ? ` (first ${recorded.length} recorded)` : ''
  return parts.length ? `${total} ${noun}${truncated}: ${parts.join(', ')}` : `${total} ${noun}`
}

/** A warning as the alert lists it: the label, its month or week, the cause,
 *  and what is stale. PURE. */
export function warningLine(w: RunWarning): string {
  const where = w.month ?? w.week ?? null
  return `- ${w.step}${where ? ` (${where})` : ''}${w.subject ? ` [${w.subject}]` : ''}: ${w.cause}. Stale: ${w.stale}`
}
