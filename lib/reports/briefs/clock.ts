import { WeekReadTimeoutError, type CallBudget, type CallOptions, type WeekReadCall } from '../../written/deadline'

// The monthly briefs' model calls, held to time (the pipeline's `briefs:*`
// steps; lib/written/deadline.ts is the week read's version of the same rule).
//
// WHY. Every `briefs:*` step runs inside the Inngest route, whose maxDuration
// is 300 s. The OpenAI SDK's defaults are a ten-minute timeout and two silent
// retries per call, so one slow answer could run a step past 300 s: Vercel
// then kills the invocation before the body's own catch runs (no failed row,
// no alert naming the cause). So inside a step every call has a hard cap and
// no SDK retry, and the step's calls share one clock counted from the step's
// start. A call that would not fit, or that times out, throws
// `WeekReadTimeoutError`, which `isTransient` reads as transient: before the
// step's last attempt the body throws it and Inngest retries the step on a
// fresh clock; on the last it stores a failed set and alerts once.
//
// THE CAPS. The document writer, the nearest call to the brief writer, ran
// p50 54 s, p90 69 s, max 99 s on gpt-5.4 (lib/written/deadline.ts, 45 days of
// ai_call_log); the brief writer's prompt is larger (a department's research
// plus its ideas), so it gets 200 s, and the ideas call (every department's
// points, a short answer) 170 s. The repeat judge reads printed prose only and
// gets 120 s; the self-check the week read's 120 s; one embeddings request the
// week read's 20 s. Outside a step (the backfill script) there is no shared
// clock and each call keeps a generous cap, no SDK retry.

/** A step's calls end by this many ms from the step's start, leaving the
 *  store and the alert well inside the route's 300 s. */
export const BRIEF_STEP_BUDGET_MS = 250_000

export type BriefCall = 'ideas' | 'writer' | 'judge' | 'check' | 'embed'

/** Each call's hard cap, and the least time worth starting it with. */
export const BRIEF_CALLS: Readonly<Record<BriefCall, { capMs: number; floorMs: number }>> = {
  ideas: { capMs: 170_000, floorMs: 45_000 },
  writer: { capMs: 200_000, floorMs: 60_000 },
  judge: { capMs: 120_000, floorMs: 30_000 },
  check: { capMs: 120_000, floorMs: 10_000 },
  embed: { capMs: 20_000, floorMs: 5_000 },
}

/** A call outside any step (the script): this cap, no SDK retry. */
export const UNTIMED_CAP_MS = 480_000

export interface BriefClock {
  startedAt: number
  budgetMs: number
  now: () => number
}

/** A step's clock, from its start. */
export function briefClock(opts: { startedAt?: number; budgetMs?: number; now?: () => number } = {}): BriefClock {
  const now = opts.now ?? Date.now
  return { startedAt: opts.startedAt ?? now(), budgetMs: opts.budgetMs ?? BRIEF_STEP_BUDGET_MS, now }
}

/** What is left of the step's time. */
export const leftMs = (clock: BriefClock): number => clock.startedAt + clock.budgetMs - clock.now()

/**
 * The SDK's options for the next call of this kind: its cap, or what the step
 * has left after `reserveMs` (the calls still to come), whichever is less,
 * and no SDK retry. A `WeekReadTimeoutError` where its floor does not fit.
 * No clock (the script): a generous cap, no retry.
 */
export function callOptions(clock: BriefClock | undefined, call: BriefCall, reserveMs = 0): CallOptions {
  if (!clock) return { timeout: call === 'embed' ? BRIEF_CALLS.embed.capMs : UNTIMED_CAP_MS, maxRetries: 0 }
  const { capMs, floorMs } = BRIEF_CALLS[call]
  const left = leftMs(clock) - reserveMs
  const timeout = Math.min(capMs, left)
  if (timeout < floorMs) {
    throw new WeekReadTimeoutError(`no time left for the brief ${call} call: ${Math.max(0, Math.round(left / 1000))} s free of the step's ${Math.round(clock.budgetMs / 1000)} s`)
  }
  return { timeout, maxRetries: 0 }
}

/**
 * The week read's `CallBudget` over this clock, for `checkWeekRead` (the
 * self-check): its 'check' is the brief's, and nothing is reserved after it
 * beyond `reserveMs`. Without a clock, the week read's untimed caps.
 */
export function checkBudget(clock: BriefClock | undefined, reserveMs = 0): CallBudget | undefined {
  if (!clock) return undefined
  return {
    optionsFor(call: WeekReadCall) {
      return callOptions(clock, call === 'check' ? 'check' : call === 'embed' ? 'embed' : 'writer', reserveMs)
    },
  }
}

/**
 * Hold a promise to `ms`: it resolves as the promise does, or rejects with a
 * `WeekReadTimeoutError` (transient) once the time is up. The promise that
 * lost is left to settle on its own, its outcome ignored. For work the step
 * cannot cap call by call (the Ask agent's research).
 */
export async function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const overrun = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WeekReadTimeoutError(`${what} ran past the step's time (${Math.max(0, Math.round(ms / 1000))} s)`)), Math.max(0, ms))
  })
  work.catch(() => {})
  try {
    return await Promise.race([work, overrun])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
