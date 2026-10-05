// The week read's model calls, held to time (writing back, review M4).
//
// WHY. The `write-week-read` step runs inside the Inngest route, whose
// `maxDuration` is 300 s (app/api/inngest/route.ts). The OpenAI SDK's defaults
// are a ten-minute timeout and two silent retries per call, and the writer
// itself tried twice, so one slow answer could run the step past 300 s:
// Vercel then kills the invocation before the body's own catch runs (no
// failed row, no alert naming the cause), and Inngest retries the step, paying
// for the writer and the self-check again, up to three times.
//
// THE RULE. Every model call in the step has a hard cap and no SDK retry, and
// the step's calls share one budget counted from the step's start. A call
// starts only if its floor fits in what is left after the time reserved for
// the calls still to come; one that would not, or that times out, throws
// `WeekReadTimeoutError`. That is TRANSIENT (`isTransient`): before the step's
// last attempt the body throws it and Inngest retries the step; on the last,
// it stores a `failed` row and alerts the operator (the lead's ruling: a
// timeout is a failed read, never a silent one). Worst case, the step's calls
// end by `WEEK_READ_STEP_BUDGET_MS` (250 s), leaving the save and the alert
// well inside 300 s.
//
// THE CAPS, FROM PRODUCTION (ai_call_log, 45 days to 1 Oct, gpt-5.4): the
// document writer, the nearest call to this one (a medium-effort structured
// write of about six thousand tokens), ran p50 54 s, p90 69 s, max 99 s; the
// Ask verdict pass, which is the self-check, p90 29 s, max 30 s. So the writer
// gets 150 s (a 90 s cap would have cut real ones) and the quote fit's one
// embeddings request 20 s.
//
// THE SELF-CHECK TAKES WHAT THE WRITER LEFT (5 Oct). Össur's run 555af400
// lost its week read to "the check call timed out (cap 45 s)": the check was
// held to 45 s whatever the writer had left, and a writer near its p50 (54 s)
// leaves well over 100 s. Now the writer still leaves it 45 s
// (`WEEK_READ_RESERVE`, so the writer's own 150 s is not cut), and the check
// may run up to 120 s of whatever the writer left, less the fit's 20 s. It
// never gets less than before, and the step still ends by 250 s: the check's
// time holds the WHOLE verdict pass, both its model calls (a race in
// lib/written/check.ts), where it used to hold each call alone.

export const WEEK_READ_STEP_BUDGET_MS = 250_000

export type WeekReadCall = 'writer' | 'check' | 'embed'

/** Each call's hard cap, and the least time worth starting it with. */
export const WEEK_READ_CALLS: Record<WeekReadCall, { capMs: number; floorMs: number }> = {
  writer: { capMs: 150_000, floorMs: 60_000 },
  check: { capMs: 120_000, floorMs: 10_000 },
  embed: { capMs: 20_000, floorMs: 5_000 },
}

/** The time a call before each of these must leave it: the check's 45 s, its
 *  old cap (p90 29 s), and the fit's whole cap. The check runs past its
 *  reserve only on time the writer did not use. */
export const WEEK_READ_RESERVE: Record<Exclude<WeekReadCall, 'writer'>, number> = {
  check: 45_000,
  embed: WEEK_READ_CALLS.embed.capMs,
}

/** What must stay free after each call: the reserves of the calls still to
 *  come. */
const AFTER: Record<WeekReadCall, number> = {
  writer: WEEK_READ_RESERVE.check + WEEK_READ_RESERVE.embed,
  check: WEEK_READ_RESERVE.embed,
  embed: 0,
}

/** A model call in the step ran out of time, or had none left to start. */
export class WeekReadTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeekReadTimeoutError'
  }
}

/** The SDK's options for one call: its timeout, and no silent retry. */
export interface CallOptions { timeout: number; maxRetries: 0 }

export interface CallBudget {
  /** The options for the next call of this kind, or a `WeekReadTimeoutError`
   *  where its floor does not fit in what the step has left. */
  optionsFor(call: WeekReadCall): CallOptions
}

/**
 * The step's budget, from its start. `budgetMs: null` is a call outside the
 * step (the script): each call keeps its cap and no SDK retry, with no shared
 * clock.
 */
export function callBudget(opts: { startedAt?: number; budgetMs?: number | null; now?: () => number } = {}): CallBudget {
  const now = opts.now ?? Date.now
  const startedAt = opts.startedAt ?? now()
  const budgetMs = opts.budgetMs === undefined ? WEEK_READ_STEP_BUDGET_MS : opts.budgetMs
  return {
    optionsFor(call) {
      const { capMs, floorMs } = WEEK_READ_CALLS[call]
      if (budgetMs == null) return { timeout: capMs, maxRetries: 0 }
      const left = startedAt + budgetMs - now() - AFTER[call]
      const timeout = Math.min(capMs, left)
      if (timeout < floorMs) {
        throw new WeekReadTimeoutError(`no time left for the ${call} call: ${Math.max(0, Math.round(left / 1000))} s free of the step's ${Math.round(budgetMs / 1000)} s`)
      }
      return { timeout, maxRetries: 0 }
    },
  }
}

/** The calls outside the step (the script): caps, no retry, no shared clock. */
export const UNTIMED_STEP: CallBudget = callBudget({ budgetMs: null })

/** Is this error a call that ran out of time? The SDK's timeout, an abort, or
 *  ours; and the Ask engine's wrapper, which keeps the SDK's message. */
export function isTimeout(e: unknown): boolean {
  if (e instanceof WeekReadTimeoutError) return true
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: unknown; message?: unknown }
  const name = typeof err.name === 'string' ? err.name : ''
  const message = typeof err.message === 'string' ? err.message : ''
  return name === 'APIConnectionTimeoutError' || name === 'AbortError' || /\btimed out\b/i.test(message)
}

/** The timeout as the step reports it: the time the call was given where the
 *  caller knows it (the budget may give less than the cap), else the cap. */
export function asTimeout(e: unknown, call: WeekReadCall, timeoutMs?: number): WeekReadTimeoutError {
  if (e instanceof WeekReadTimeoutError) return e
  const cap = Math.round((timeoutMs ?? WEEK_READ_CALLS[call].capMs) / 1000)
  return new WeekReadTimeoutError(`the ${call} call timed out (cap ${cap} s): ${e instanceof Error ? e.message : String(e)}`)
}

/** HTTP statuses a second try may clear: a request timeout, the rate limit,
 *  and the server's own failures. */
const transientStatus = (s: number): boolean => s === 408 || s === 429 || (s >= 500 && s < 600)

/** What a dropped connection, an abort or a refused rate leaves in a message,
 *  where a wrapper kept only the message (the OpenAI SDK names no class, the
 *  Ask engine re-throws the message, a Supabase read reports `fetch failed`). */
const TRANSIENT_WORDS = /\b(?:connection error|fetch failed|socket hang up|request was aborted|rate limit|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|UND_ERR_[A-Z_]+)\b/i

/**
 * Might the same step, tried again, succeed? A call that ran out of time or
 * was aborted (`isTimeout`, our own budget's included), a 408, 429 or 5xx, or
 * a connection that dropped; through `cause` too, which is how the writers
 * keep the error behind "could not be written twice over". Anything else
 * (an answer that would not parse, a missing table, a logic error) is not:
 * trying again costs a model call and fails the same way.
 */
export function isTransient(e: unknown): boolean {
  let x: unknown = e
  for (let depth = 0; depth < 5 && x != null; depth++) {
    if (isTimeout(x)) return true
    if (typeof x !== 'object') return false
    const err = x as { status?: unknown; message?: unknown; cause?: unknown; code?: unknown }
    // Out of credits is a 429 that no retry fixes: alert on the first attempt.
    if (err.code === 'insufficient_quota' || (typeof err.message === 'string' && /insufficient_quota|exceeded your current quota/i.test(err.message))) return false
    if (typeof err.status === 'number' && transientStatus(err.status)) return true
    if (typeof err.message === 'string' && TRANSIENT_WORDS.test(err.message)) return true
    x = err.cause
  }
  return false
}
