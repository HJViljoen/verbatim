import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { loadWeekRead } from '../written/store'
import type { WeekReadData } from '../written/types'
import { STALE_ARTEFACT_LINE } from './stale'
import { WEEKLY_READ_TITLE, weekReadDates, weekReadSendState, weeklyReadSubject, type WeekReadHeldReason } from './weekly-read'

/**
 * Freezing the weekly read (artefact `weekly_read`): the run's stored
 * `week_reads` row, as one `report_snapshots` row of kind 'report' with
 * `data.kind = 'weekly_read'` (the `isDocumentData` / `isWeeklyData`
 * precedent: no new snapshot kind, no migration, the render, share, erasure
 * and archive paths all work on it as they do on every report).
 *
 * NO SECOND MODEL CALL AND NO RE-READ OF A LIVE FIGURE. The read was written
 * and composed by the pipeline's `write-week-read` step; this copies it whole.
 * Its quotes are refs with `text: ''` (lib/written/types.ts QuoteRef), which
 * `freezeQuotes` recognises and collects into `evidence_ids`, so erasure finds
 * a sent read like any other artefact and the words resolve at render.
 *
 * `sent_figures`: none, as for a document. The read's figures are printed
 * strings frozen with it, not readings of an object a later artefact compares
 * against.
 */

/** The stored shape's version. One so far: `staleWeeklyReadSnapshot` turns
 *  any other into a sentence rather than a stack trace. */
export const WEEKLY_READ_SNAPSHOT_VERSION = 1

export interface WeeklyReadSnapshotData {
  /** `number`, not the literal, for the reason WeeklySnapshotData gives:
   *  the callers that narrow with `isWeeklyReadData` hold a ReportSnapshotData. */
  version: number
  /** What tells this artefact from the others on the same spine. */
  kind: 'weekly_read'
  company: string
  /** "Sealand · This week in your market". */
  title: string
  /** "21 to 27 September": the days the read covers. */
  period: string
  /** When the read was written (`week_reads.created_at`): the archive's
   *  reading stamp. */
  readingAt: string
  /** The reading month, `YYYY-MM-01`. */
  month: string
  runId: string
  /** The inbox line, frozen with the read it describes. */
  subject: string
  /** The stored read, whole, quotes as refs. */
  read: WeekReadData
}

export function isWeeklyReadData(data: unknown): data is WeeklyReadSnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'weekly_read'
}

/** The line to print instead of a weekly read this build cannot draw, or null. */
export function staleWeeklyReadSnapshot(data: WeeklyReadSnapshotData): string | null {
  return data.version === WEEKLY_READ_SNAPSHOT_VERSION && data.read && Array.isArray(data.read.findings) ? null : STALE_ARTEFACT_LINE
}

/** The run's read is not one that may go out: the send is skipped, nothing is
 *  emailed, and the caller tells the operator. */
export class WeeklyReadNotReadyError extends Error {
  constructor(public readonly reason: WeekReadHeldReason, message: string) {
    super(message)
    this.name = 'WeeklyReadNotReadyError'
  }
}

/** The snapshot's data for a stored read. Pure: the builder below and the
 *  preview script both go through it. */
export function weeklyReadSnapshotData(a: { company: string; runId: string; read: WeekReadData; writtenAt: string }): WeeklyReadSnapshotData {
  const company = a.company.trim()
  const period = weekReadDates(a.read.window)
  return {
    version: WEEKLY_READ_SNAPSHOT_VERSION,
    kind: 'weekly_read',
    company,
    title: company ? `${company} · ${WEEKLY_READ_TITLE}` : WEEKLY_READ_TITLE,
    period,
    readingAt: a.writtenAt,
    month: a.read.month,
    runId: a.runId,
    subject: weeklyReadSubject(company, a.read, period),
    read: a.read,
  }
}

/** Load the run's read, refuse one that may not go out, freeze it. No
 *  rendering here: Chromium and the email body run in a route handler. */
export async function snapshotWeeklyRead(args: {
  admin: SupabaseClient
  clientId: string
  runId: string
  company: string
  userId?: string | null
}): Promise<{ snapshotId: string; data: WeeklyReadSnapshotData; evidenceIds: string[] }> {
  const row = await loadWeekRead(args.admin, { clientId: args.clientId, runId: args.runId, kind: 'week' })
  const state = weekReadSendState(row)
  if (!state.ok) throw new WeeklyReadNotReadyError(state.reason, state.message)
  const data = weeklyReadSnapshotData({ company: args.company, runId: args.runId, read: row!.data!, writtenAt: row!.created_at })
  const snap = await createSnapshot(args.admin, {
    clientId: args.clientId,
    userId: args.userId ?? null,
    kind: 'report',
    ref: { params: {} },
    title: data.period ? `${data.title} · ${data.period}` : data.title,
    runId: args.runId,
    data,
  })
  return { snapshotId: snap.id, data, evidenceIds: snap.evidenceIds }
}
