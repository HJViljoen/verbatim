import type { SupabaseClient } from '@supabase/supabase-js'

import { UUID_IN_CHUNK } from '../chunk'
import { sendsWeeklyRead } from '../schedules/artefact'
import { isMissingPublishColumns } from '../schedules/platform-state'
import { isLongRunData, isMissingWeekReads, WEEK_READS_TABLE, type StoredLongRun } from './store'
import type { WeekReadData } from './types'

/**
 * THE PUBLISHED READ (pages build integration, 1 Oct; lead's ruling 3).
 *
 * Which weekly read a PAGE may print. Where the tenant has an ACTIVE
 * `weekly_read` schedule with REVIEW ON, a read reaches its pages only once
 * that schedule's send for the read's run is ON THE PLATFORM: it went out
 * (`report_sends.status = 'sent'`), or the operator put it there without its
 * email (`published_at`, the backfill of 1 Oct; lib/schedules/publish.ts):
 * the newest such read. Everywhere else (no such schedule, or
 * review off), the newest READY read, as before.
 *
 * Why: a review schedule holds a build until Heinrich has read it (B1,
 * lib/reports/held.ts). Its pages printing the same read before he pressed
 * Send would show the client exactly what review exists to hold back. So
 * This week, the Dashboard's numbers and tiles, the Subjects pane's lines and
 * Your market's subject sentences all ask this, and nothing else reads
 * `week_reads` for a page.
 *
 * FAILS CLOSED. Where the schedules or the sends cannot be read, nothing is
 * published (null), the held-build rule's own answer. A table that is not in
 * the database is not a failure: no `report_schedules` means no schedule, so
 * nothing gates; no `report_sends` under a gating schedule means nothing has
 * gone out.
 *
 * Service role, scoped by the caller to the SESSION's client (`week_reads` has
 * no tenant policy, review L2).
 *
 * THE LONG-RUN READ PASSES THE SAME GATE (fresh review B1, lead's ruling, 1 Oct
 * evening). Your market's "What holds across {months}" is a `kind = 'month'`
 * row written by the run that closes a month, beside that run's week read.
 * Under the gate it shows only once the weekly_read send of the SAME run went
 * out: Heinrich read it in that run's review email (`readyForReview`,
 * lib/schedules/deliver.ts) before he pressed Send. Ungated, the newest ready
 * one. `loadPublishedLongRun`, through the one `loadPublishGate` below.
 */

export interface PublishedWeekRead {
  runId: string
  /** The row's reading month, `YYYY-MM-01` (the read's own `data.month` is the
   *  same value). */
  month: string | null
  windowEnd: string | null
  data: WeekReadData
}

/** The schedule fields the rule needs. */
export interface PublishSchedule {
  id: string
  starter_key: string | null
  artefact?: string | null
  review: boolean | null
  active: boolean | null
}

/** Whether a tenant's pages wait for a sent read, and on which schedules. */
export type PublishRule = { gated: false } | { gated: true; scheduleIds: string[] }

/** Pure: the rule this tenant's schedules set. Gated by any ACTIVE weekly-read
 *  schedule with review ON. */
export function publishRule(schedules: readonly PublishSchedule[]): PublishRule {
  const ids = schedules
    .filter((s) => s.active === true && s.review === true && sendsWeeklyRead(s))
    .map((s) => String(s.id))
  return ids.length > 0 ? { gated: true, scheduleIds: ids } : { gated: false }
}

/** A stored row as the selector reads it. */
export interface PublishCandidate {
  run_id: string
  status: string
  window_end: string | null
  data: unknown
}

/**
 * Pure: the published row among a tenant's stored week reads. Ready rows with
 * data only, newest window first (a row with no window last); under a gated
 * rule, only a row whose run's send went out.
 */
export function pickPublished<R extends PublishCandidate>(
  rows: readonly R[],
  rule: PublishRule,
  sentRunIds: ReadonlySet<string>,
): R | null {
  const ready = rows.filter((r) => r.status === 'ready' && r.data != null && (!rule.gated || sentRunIds.has(String(r.run_id))))
  ready.sort((a, b) => {
    const x = a.window_end ?? ''
    const y = b.window_end ?? ''
    return x < y ? 1 : x > y ? -1 : 0
  })
  return ready[0] ?? null
}

const isMissingTable = (error: { code?: string | null; message?: string | null } | null | undefined, table: string): boolean => {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message ?? ''
  return message.includes(table) && /does not exist|schema cache/.test(message)
}

/** The tenant's publish rule, or null where its schedules cannot be read. */
async function loadPublishRule(admin: SupabaseClient, clientId: string): Promise<PublishRule | null> {
  const res = await admin.from('report_schedules').select('id, starter_key, artefact, review, active').eq('client_id', clientId)
  if (res.error) {
    if (isMissingTable(res.error, 'report_schedules')) return { gated: false }
    console.error(`[published] the schedules of ${clientId} could not be read; no read is published: ${res.error.message}`)
    return null
  }
  return publishRule((res.data ?? []) as PublishSchedule[])
}

/** The runs whose send on a gating schedule is ON THE PLATFORM, newest
 *  first, or null where the sends cannot be read: sent (emailed), or put on
 *  the platform without its email (`published_at`, the operator's Publish,
 *  lib/schedules/publish.ts). A database without the publish columns is read
 *  the old way, sent only, which is every row it can hold. */
async function loadSentRuns(admin: SupabaseClient, clientId: string, scheduleIds: readonly string[]): Promise<Set<string> | null> {
  const read = (published: boolean) => {
    const q = admin.from('report_sends').select('run_id')
      .eq('client_id', clientId).in('schedule_id', [...scheduleIds]).not('run_id', 'is', null)
    return (published ? q.or('status.eq.sent,published_at.not.is.null') : q.eq('status', 'sent'))
      .order('claimed_at', { ascending: false })
      // The newest sends are the only ones the newest read can be among; one
      // chunk keeps the `in` below inside PostgREST's URL.
      .limit(UUID_IN_CHUNK)
  }
  let res = await read(true)
  if (res.error && isMissingPublishColumns(res.error)) res = await read(false)
  if (res.error) {
    if (isMissingTable(res.error, 'report_sends')) return new Set()
    console.error(`[published] the sends of ${clientId} could not be read; no read is published: ${res.error.message}`)
    return null
  }
  return new Set(((res.data ?? []) as { run_id: string | null }[]).map((r) => String(r.run_id)).filter(Boolean))
}

/** The gate a page's stored read passes: the tenant's rule and, under a gated
 *  rule, the runs whose send went out. Null where nothing may be published:
 *  the schedules or the sends could not be read (fails closed), or, gated,
 *  nothing has gone out yet. The week read and the long-run read both ask it. */
async function loadPublishGate(admin: SupabaseClient, clientId: string): Promise<{ rule: PublishRule; sent: ReadonlySet<string> } | null> {
  const rule = await loadPublishRule(admin, clientId)
  if (!rule) return null
  if (!rule.gated) return { rule, sent: new Set() }
  const runs = await loadSentRuns(admin, clientId, rule.scheduleIds)
  if (!runs || runs.size === 0) return null
  return { rule, sent: runs }
}

/**
 * The published week read of this tenant, or null (none yet, none sent under
 * review, the table not in this database, or a read that failed closed).
 * `month` narrows it to reads of that reading month (`YYYY-MM-01`).
 */
export async function loadPublishedWeekRead(
  admin: SupabaseClient,
  clientId: string,
  opts: { month?: string } = {},
): Promise<PublishedWeekRead | null> {
  const gate = await loadPublishGate(admin, clientId)
  if (!gate) return null
  const { rule, sent } = gate

  let q = admin.from(WEEK_READS_TABLE)
    .select('run_id, month, window_end, status, data')
    .eq('client_id', clientId).eq('kind', 'week').eq('status', 'ready')
    .not('data', 'is', null)
  if (opts.month) q = q.eq('month', opts.month)
  if (rule.gated) q = q.in('run_id', [...sent])
  const res = await q.order('window_end', { ascending: false, nullsFirst: false }).limit(rule.gated ? UUID_IN_CHUNK : 1)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads published: ${res.error.message}`)
  }
  const rows = (res.data ?? []) as (PublishCandidate & { month: string | null })[]
  const row = pickPublished(rows, rule, sent)
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
 * across {months}"), or null: none written yet, none whose run's send went
 * out under review, the table not in this database, or a read that failed
 * closed. The newest month first (its window ends latest); a row that is not
 * a long-run read is passed over.
 */
export async function loadPublishedLongRun(admin: SupabaseClient, clientId: string): Promise<StoredLongRun | null> {
  const gate = await loadPublishGate(admin, clientId)
  if (!gate) return null
  const { rule, sent } = gate

  let q = admin.from(WEEK_READS_TABLE)
    .select('run_id, month, window_end, status, data, created_at')
    .eq('client_id', clientId).eq('kind', 'month').eq('status', 'ready')
    .not('data', 'is', null)
  if (rule.gated) q = q.in('run_id', [...sent])
  // One row a month: a chunk is every month there is, so a row that is not a
  // long-run read is passed over for the one before it, gated or not.
  const res = await q.order('month', { ascending: false }).order('created_at', { ascending: false }).limit(UUID_IN_CHUNK)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads published long run: ${res.error.message}`)
  }
  const rows = ((res.data ?? []) as (PublishCandidate & { month: string; created_at: string })[]).filter((r) => isLongRunData(r.data))
  const row = pickPublished(rows, rule, sent)
  if (!row || !isLongRunData(row.data)) return null
  return { month: String(row.month).slice(0, 10), data: row.data, created_at: row.created_at }
}
