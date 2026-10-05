import type { SupabaseClient } from '@supabase/supabase-js'

import { UUID_IN_CHUNK } from '../chunk'
import { isLongRunData, isMissingWeekReads, WEEK_READS_TABLE, type StoredLongRun } from './store'
import type { WeekReadData } from './types'

/**
 * THE PUBLISHED READ: the ONLY way a page reads `week_reads`.
 *
 * A page prints the newest READY read, as soon as the run writes it (Heinrich,
 * 5 Oct: "This should be happening by itself when everything runs"). Nothing
 * here asks a schedule or a send: REVIEW HOLDS THE EMAIL ONLY. A review
 * schedule's build still waits for Send (the review email to the operator,
 * `reviewAudience`; the Studio's Send; the held snapshot, `heldOf` and
 * `report_snapshots`' RLS policy, lib/reports/held.ts), and the client's
 * Studio lists an issue only once it is on the platform (`onPlatform`). The
 * pages do not wait for any of that.
 *
 * Until 5 Oct the pages waited too: under an active `weekly_read` schedule
 * with review on, a page printed only a read whose send was on the platform.
 * So Sealand's 4 Oct run (both reads ready, its send held) never reached This
 * week, the Dashboard, Your market or the Subjects pane, which kept printing
 * the 27 Sep run; Össur, under a review schedule with no recipients, printed
 * nothing at all.
 *
 * This week, the Dashboard's numbers and tiles, the Subjects pane's lines and
 * Your market's subject sentences read the week read here
 * (`loadPublishedWeekRead`); Your market's "What holds across {months}" reads
 * the month's long-run read here (`loadPublishedLongRun`).
 *
 * FAILS CLOSED. A read that fails throws, and each page loses only that block
 * (logged); it never prints a read it could not check was ready. The table not
 * in this database is not a failure: nothing to print (null).
 *
 * Service role, scoped by the caller to the SESSION's client (`week_reads` has
 * no tenant policy, review L2).
 */

export interface PublishedWeekRead {
  runId: string
  /** The row's reading month, `YYYY-MM-01` (the read's own `data.month` is the
   *  same value). */
  month: string | null
  windowEnd: string | null
  data: WeekReadData
}

/** A stored row as the selector reads it. */
export interface PublishCandidate {
  run_id: string
  status: string
  window_end: string | null
  data: unknown
}

/**
 * Pure: the published row among a tenant's stored reads. Ready rows with data
 * only, newest window first (a row with no window last).
 */
export function pickPublished<R extends PublishCandidate>(rows: readonly R[]): R | null {
  const ready = rows.filter((r) => r.status === 'ready' && r.data != null)
  ready.sort((a, b) => {
    const x = a.window_end ?? ''
    const y = b.window_end ?? ''
    return x < y ? 1 : x > y ? -1 : 0
  })
  return ready[0] ?? null
}

/**
 * The published week read of this tenant: its newest ready one, or null (none
 * yet, or the table not in this database). `month` narrows it to reads of
 * that reading month (`YYYY-MM-01`). Throws where `week_reads` cannot be read.
 */
export async function loadPublishedWeekRead(
  admin: SupabaseClient,
  clientId: string,
  opts: { month?: string } = {},
): Promise<PublishedWeekRead | null> {
  let q = admin.from(WEEK_READS_TABLE)
    .select('run_id, month, window_end, status, data')
    .eq('client_id', clientId).eq('kind', 'week').eq('status', 'ready')
    .not('data', 'is', null)
  if (opts.month) q = q.eq('month', opts.month)
  const res = await q.order('window_end', { ascending: false, nullsFirst: false }).limit(1)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads published: ${res.error.message}`)
  }
  const rows = (res.data ?? []) as (PublishCandidate & { month: string | null })[]
  const row = pickPublished(rows)
  if (!row) return null
  return {
    runId: String(row.run_id),
    month: row.month ? String(row.month).slice(0, 10) : null,
    windowEnd: row.window_end,
    data: row.data as WeekReadData,
  }
}

/**
 * The published long-run read of this tenant (Your market's "What holds
 * across {months}"): the newest ready one, or null (none written yet, or the
 * table not in this database). The newest month first, and within a month the
 * newest row (a read written before its month closed, `partialThrough`, is
 * followed by the full one the month-closing run writes; `standsAsMonthRead`,
 * lib/written/store.ts); a row that is not a long-run read is passed over.
 * Throws where `week_reads` cannot be read.
 */
export async function loadPublishedLongRun(admin: SupabaseClient, clientId: string): Promise<StoredLongRun | null> {
  // One row a month: a chunk is every month there is, so a row that is not a
  // long-run read is passed over for the one before it.
  const res = await admin.from(WEEK_READS_TABLE)
    .select('run_id, month, window_end, status, data, created_at')
    .eq('client_id', clientId).eq('kind', 'month').eq('status', 'ready')
    .not('data', 'is', null)
    .order('month', { ascending: false }).order('created_at', { ascending: false }).limit(UUID_IN_CHUNK)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads published long run: ${res.error.message}`)
  }
  const rows = ((res.data ?? []) as (PublishCandidate & { month: string; created_at: string })[]).filter((r) => isLongRunData(r.data))
  const row = pickPublished(rows)
  if (!row || !isLongRunData(row.data)) return null
  return { month: String(row.month).slice(0, 10), data: row.data, created_at: row.created_at }
}
