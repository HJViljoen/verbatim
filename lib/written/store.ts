import type { SupabaseClient } from '@supabase/supabase-js'

import type { LongRunReadData, WeekReadData } from './types'

// The stored read (plan T4): one `week_reads` row per run and kind
// (supabase/migrations/20261104090000_week_reads.sql). The service role
// writes and reads it; a tenant's session reads nothing (review L2).

export const WEEK_READS_TABLE = 'week_reads'

export type WeekReadStatus = 'ready' | 'thin' | 'failed'
export type WeekReadKind = 'week' | 'month'

export interface WeekReadRow {
  client_id: string
  run_id: string
  kind: WeekReadKind
  /** The reading month, `YYYY-MM-01`; null only on a failure before the pool
   *  was read. */
  month: string | null
  window_start: string | null
  window_end: string | null
  /** The read (quotes as refs, `text: ''`); null on a failure. A 'month'
   *  row holds the long-run read (`LongRunReadData`). */
  data: WeekReadData | LongRunReadData | null
  status: WeekReadStatus
  cost_usd: number
}

/** The table is not in this database yet (the migration has not been
 *  applied): Postgres' undefined_table, or PostgREST's schema-cache miss. */
export function isMissingWeekReads(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message ?? ''
  return /week_reads/.test(message) && /does not exist|schema cache/.test(message)
}

/** Is the table there? One head read, no rows. */
export async function weekReadsApplied(admin: SupabaseClient): Promise<boolean> {
  const res = await admin.from(WEEK_READS_TABLE).select('id', { count: 'exact', head: true }).limit(0)
  if (!res.error) return true
  if (isMissingWeekReads(res.error)) return false
  throw new Error(`week_reads: ${res.error.message}`)
}

/** Write one run's read, replacing the run's earlier row of the same kind
 *  (a retried step, or the Monday fallback over a failed Sunday). */
export async function saveWeekRead(admin: SupabaseClient, row: WeekReadRow): Promise<void> {
  const res = await admin.from(WEEK_READS_TABLE).upsert(row, { onConflict: 'run_id,kind' })
  if (res.error) throw new Error(`week_reads write: ${res.error.message}`)
}

/** The run's stored read of a kind, or null. */
export async function loadWeekReadRow(
  admin: SupabaseClient,
  runId: string,
  kind: WeekReadKind = 'week',
): Promise<{ status: WeekReadStatus; created_at: string } | null> {
  const res = await admin.from(WEEK_READS_TABLE).select('status, created_at').eq('run_id', runId).eq('kind', kind).maybeSingle()
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads read: ${res.error.message}`)
  }
  return (res.data as { status: WeekReadStatus; created_at: string } | null) ?? null
}

/** A stored read as the send path reads it: the whole row of one run and kind. */
export interface StoredWeekRead {
  status: WeekReadStatus
  data: WeekReadData | null
  created_at: string
}

/**
 * The run's stored read of a kind, data included, or null where there is none
 * (no row, or the table is not in this database yet: both mean "nothing to
 * send"). Scoped to the client as well as the run, so a schedule can never
 * pick up another tenant's read by a run id.
 */
export async function loadWeekRead(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; kind?: WeekReadKind },
): Promise<StoredWeekRead | null> {
  const res = await admin.from(WEEK_READS_TABLE)
    .select('status, data, created_at')
    .eq('client_id', a.clientId).eq('run_id', a.runId).eq('kind', a.kind ?? 'week')
    .maybeSingle()
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads read: ${res.error.message}`)
  }
  return (res.data as StoredWeekRead | null) ?? null
}

/**
 * Last week's headlines, for continuity: the newest READY week read of this
 * client from another run whose window ended by the time this one's began.
 * Null where there is none, or where the table is not there yet.
 */
export async function loadPreviousHeadlines(
  admin: SupabaseClient,
  clientId: string,
  runId: string,
  windowFrom: string,
): Promise<{ headlines: string[] } | null> {
  const res = await admin.from(WEEK_READS_TABLE)
    .select('data, window_end')
    .eq('client_id', clientId).eq('kind', 'week').eq('status', 'ready').neq('run_id', runId)
    .lte('window_end', windowFrom)
    .order('window_end', { ascending: false }).limit(1)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads previous: ${res.error.message}`)
  }
  const data = ((res.data ?? [])[0] as { data: WeekReadData | null } | undefined)?.data
  const headlines = (data?.findings ?? []).map((f) => f.headline).filter(Boolean)
  return headlines.length > 0 ? { headlines } : null
}

// ---- The long-run read (kind 'month') ----------------------------------------------

/** A month's long-run read as the pages read it. */
export interface StoredLongRun {
  month: string
  data: LongRunReadData
  created_at: string
}

/** Is this stored `data` a long-run read? (A 'month' row written by anything
 *  else, or a failed one, is not.) */
export function isLongRunData(data: unknown): data is LongRunReadData {
  const d = data as Partial<LongRunReadData> | null
  return !!d && d.kind === 'longrun' && Array.isArray(d.ideas) && Array.isArray(d.months)
}

// A page reads the long-run read through `loadPublishedLongRun`
// (lib/written/published.ts), which holds it back under review like the week
// read (fresh review B1): never straight off this table.

/** Does this stored row stand as its month's long-run read? Ready or thin (a
 *  month that had nothing durable to say is not written again), and not a
 *  read written before the month closed (`partialThrough`, the backfill): the
 *  run that closes the month writes the full one over it. Pure. */
export function standsAsMonthRead(row: { status: string; partial_through?: string | null }): boolean {
  return (row.status === 'ready' || row.status === 'thin') && !row.partial_through
}

/** Has this month's long-run read been written (`standsAsMonthRead`)? */
export async function longRunWritten(admin: SupabaseClient, clientId: string, month: string): Promise<boolean> {
  const res = await admin.from(WEEK_READS_TABLE)
    .select('status, partial_through:data->>partialThrough')
    .eq('client_id', clientId).eq('kind', 'month').eq('month', month).in('status', ['ready', 'thin'])
  if (res.error) throw new Error(`week_reads long run written: ${res.error.message}`)
  return ((res.data ?? []) as { status: string; partial_through: string | null }[]).some(standsAsMonthRead)
}
