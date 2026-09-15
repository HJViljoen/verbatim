import { fullDate } from '../format'
import { longestGapDays } from '../readiness/compute'
import type { UpdateInput } from '../readiness/types'

/**
 * The delivery record (Phase 1 WP16, design ST6's delivery half).
 *
 * "N updates since {date} · longest gap {n} days · last on {date}", and — once
 * `pipeline_runs.scheduled_for` is applied — "N of M scheduled". The counting
 * rule is `lib/readiness/compute.ts`'s, and `longestGapDays` is imported rather
 * than re-implemented: readiness row 9 and this panel are two readings of one
 * table and must never disagree about how many updates a workspace has had.
 *
 * AN UPDATE IS COUNTED WHEN IT SETTLED, NOT WHEN IT STARTED. A run that failed
 * still happened and is still in the record — the honest count is "21 updates,
 * 6 of the last 8 finished", not "18 updates" with three quietly dropped.
 *
 * SLOTS. `slotsRecorded` is false until 20260915090000 is applied, and then
 * "N of M scheduled" is unanswerable: a missed slot cannot be told from a
 * manual update. The panel says that rather than printing a ratio it cannot
 * compute — the isMissing* guard precedent.
 *
 * Pure.
 */

/** "Finished" the way readiness row 9 counts it: `completed` and `partial`
 *  both produced something, `failed` did not. The same set is spelled out in
 *  `lib/readiness/compute.ts`, where it is not exported; it is repeated rather
 *  than widened, because this panel and row 9 print the same ratio and a
 *  wider set here would make them disagree. */
const FINISHED = new Set(['completed', 'partial'])

export interface DeliveryRecord {
  total: number
  /** The first update, `YYYY-MM-DD`. */
  since: string | null
  /** The most recent update that started, `YYYY-MM-DD`. */
  lastOn: string | null
  /** Days between the two furthest-apart consecutive updates, or null with
   *  fewer than two. */
  longestGapDays: number | null
  /** Of the most recent `recent` updates, how many finished — the ratio
   *  readiness row 9 prints, computed the same way. */
  recentSettled: number
  recent: number
  /** Of the updates on record, how many served a scheduled slot and how many
   *  were run by hand. Null until the slot bookkeeping is applied — a split
   *  nobody can compute is not a split of zero. */
  scheduledServed: { scheduled: number; byHand: number } | null
  /** The one-line summary. */
  line: string
  /** What the record cannot say, where it cannot say it. Empty when it can. */
  caveats: string[]
}

export function deliveryRecord(args: {
  updates: readonly UpdateInput[]
  slotsRecorded: boolean
  recent?: number
}): DeliveryRecord {
  const { updates, slotsRecorded, recent = 8 } = args
  // Oldest first for the ends; the loader hands them newest first.
  const byTime = [...updates].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
  const total = byTime.length
  const since = byTime[0]?.startedAt.slice(0, 10) ?? null
  const lastOn = byTime[total - 1]?.startedAt.slice(0, 10) ?? null
  const head = [...updates].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, recent)
  const recentSettled = head.filter((u) => FINISHED.has(u.status)).length

  // What the column can and cannot answer. A run carrying `scheduled_for`
  // served a slot; a run without one was started by hand. A slot that was
  // MISSED produces no run at all, so "N of M scheduled" in the design's sense
  // — M being the slots that should have fired — is still not derivable from
  // this table, and the caveat below says so even once the column lands.
  const scheduledServed = slotsRecorded
    ? {
        scheduled: byTime.filter((u) => u.scheduledFor != null).length,
        byHand: byTime.filter((u) => u.scheduledFor == null).length,
      }
    : null

  const caveats: string[] = []
  if (!slotsRecorded) {
    caveats.push('Which scheduled slot each update served is not recorded yet, so a missed slot cannot be told from an update run by hand.')
  } else {
    caveats.push('A slot nothing ran for leaves no trace here, so this counts the updates that happened and not the ones that should have.')
  }

  const line = total === 0
    ? 'No update has run for this workspace yet.'
    : [
        `${total} update${total === 1 ? '' : 's'}${since ? ` since ${fullDate(since)}` : ''}`,
        args.updates.length >= 2 ? `longest gap ${longestGapDays(byTime.map((u) => ({ status: u.status, startedAt: u.startedAt })))} days` : null,
        lastOn ? `last on ${fullDate(lastOn)}` : null,
      ].filter(Boolean).join(' · ')

  return {
    total,
    since,
    lastOn,
    longestGapDays: total >= 2 ? longestGapDays(byTime.map((u) => ({ status: u.status, startedAt: u.startedAt }))) : null,
    recentSettled,
    recent: head.length,
    scheduledServed,
    line,
    caveats,
  }
}

/** The updates of one calendar month, newest first — the mock's dated chip row
 *  under the delivery stats. */
export function updatesInMonth(updates: readonly UpdateInput[], month: string): UpdateInput[] {
  return [...updates]
    .filter((u) => u.startedAt.slice(0, 7) === month)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}
