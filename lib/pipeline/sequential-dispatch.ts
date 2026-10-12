// Sequential dispatch (12 Oct 2026): the pure half of the daily dispatcher's
// queue (inngest/functions/scheduler.ts).
//
// The dispatcher used to send every due client's `pipeline/run.requested` in
// one batch, so on Sunday 11 Oct Össur's and Sealand's runs ran side by side
// on shared Vercel Fluid instances; eleven instances ran out of memory and
// Össur's synthesize died. Now it dispatches one client, waits for that run to
// settle, then dispatches the next. What is decided here: the order, whether a
// run has settled, and when the wait gives up. The scheduler does the I/O.

import { IN_PROGRESS_STATUSES } from '../ops/health'
import { DISPATCH_WAIT_CAP_MS } from './schedule-due'

/** One client the dispatcher owes a run, as `find-due-clients` returns it. */
export interface DueClient {
  clientId: string
  /** The slot the run serves (`pipeline_runs.scheduled_for`). */
  scheduledFor: string | null
  /** `clients.approved_at`, the dispatch order's key. Null when the client has
   *  none, and on a result memoised before 12 Oct 2026, which did not carry it. */
  approvedAt: string | null
}

/** Every shape `find-due-clients` has ever memoised: a bare client id (before
 *  15 Sep 2026), `{ clientId, scheduledFor }` (before 12 Oct 2026), and the
 *  current shape. A dispatcher suspended across a deploy replays its old
 *  output, so all three must keep reading. */
export type MemoisedDueClient = string | { clientId: string; scheduledFor?: string | null; approvedAt?: string | null }

export function normaliseDue(raw: readonly MemoisedDueClient[]): DueClient[] {
  return raw.map((d) => typeof d === 'string'
    ? { clientId: d, scheduledFor: null, approvedAt: null }
    : { clientId: d.clientId, scheduledFor: d.scheduledFor ?? null, approvedAt: d.approvedAt ?? null })
}

/**
 * The order clients are dispatched in: oldest client first (`approved_at`
 * ascending), a client with no readable `approved_at` last, then by id so the
 * order never depends on how Postgres happened to return the rows. In
 * production this puts Össur (approved 24 Mar 2026, the paying client with
 * real users) before Sealand (23 Apr 2026). Pure; does not mutate its input.
 */
export function dispatchOrder(due: readonly DueClient[]): DueClient[] {
  const key = (d: DueClient): number => {
    const t = d.approvedAt ? Date.parse(d.approvedAt) : NaN
    return Number.isNaN(t) ? Infinity : t
  }
  return [...due].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka !== kb) return ka < kb ? -1 : 1
    return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0
  })
}

/** How long the dispatcher sleeps between two looks at the run it waits on. */
export const DISPATCH_POLL_MS = 10 * 60_000

/** How many looks fit in the cap: look k happens (k + 1) polls after the
 *  dispatch, so the last one (k = 29) lands five hours after it. */
export const DISPATCH_MAX_CHECKS = Math.ceil(DISPATCH_WAIT_CAP_MS / DISPATCH_POLL_MS)

/** What one look read: the run row's status, null when there is no row, or
 *  the read's error when the row could not be read. */
export interface RunCheck {
  status: string | null
  error?: string
}

export type WaitVerdict =
  /** The run closed (any status that is not in progress): dispatch the next. */
  | { state: 'settled'; status: string }
  /** No row: open-run skipped the run (single-flight guard) or it never
   *  opened. Nothing to wait for: dispatch the next. */
  | { state: 'absent' }
  /** Still running, or the row could not be read: look again. */
  | { state: 'waiting'; status: string | null }
  /** Still running, or unreadable, at the last look: dispatch the next anyway. */
  | { state: 'capped'; status: string | null; error?: string }

/**
 * Has the run the dispatcher is waiting on settled, at look `check` (0-based)?
 *
 * Settled means the row exists and its status is not in progress
 * (`IN_PROGRESS_STATUSES`, lib/ops/health.ts, the one list of "still going").
 * A row that could not be read is NOT absent: reading a failed query as "no
 * row" would start the next client beside a live run, which is the failure
 * this queue exists to stop. It waits like a running row, and the cap bounds
 * it. Pure.
 */
export function waitVerdict(read: RunCheck, check: number): WaitVerdict {
  if (read.error === undefined) {
    if (read.status === null) return { state: 'absent' }
    if (!IN_PROGRESS_STATUSES.has(read.status)) return { state: 'settled', status: read.status }
  }
  if (check + 1 < DISPATCH_MAX_CHECKS) return { state: 'waiting', status: read.status }
  return { state: 'capped', status: read.status, ...(read.error !== undefined ? { error: read.error } : {}) }
}
