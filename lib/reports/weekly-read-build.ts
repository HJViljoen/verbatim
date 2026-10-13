import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { loadWeekRead } from '../written/store'
import type { WeekReadData } from '../written/types'
import { STALE_ARTEFACT_LINE } from './stale'
import { WEEKLY_READ_TITLE, weekReadDates, weekReadSendState, weeklyReadSubject, type WeekReadHeldReason } from './weekly-read'
import type { WeeklyReadLine } from './weekly-read-lines'

/**
 * Freezing the weekly read (artefact `weekly_read`): the run's stored
 * `week_reads` row, as one `report_snapshots` row of kind 'report' with
 * `data.kind = 'weekly_read'` (the `isDocumentData` / `isWeeklyData`
 * precedent: no new snapshot kind, no migration, the render, share, erasure
 * and archive paths all work on it as they do on every report).
 *
 * NO SECOND MODEL CALL AND NO RE-READ OF A LIVE FIGURE. The read was written
 * and composed by the pipeline's `write-week-read` step (the update's anomaly
 * flag frozen into it there); this copies it whole. The one thing read here
 * is each page's line for the level-1 email (depth v2, T11b), because post
 * ideas are written after the read: read once, frozen with it, never again.
 * Its quotes are refs with `text: ''` (lib/written/types.ts QuoteRef), which
 * `freezeQuotes` recognises and collects into `evidence_ids`, so erasure finds
 * a sent read like any other artefact and the words resolve at render.
 *
 * `sent_figures`: none, as for a document. The read's figures are printed
 * strings frozen with it, not readings of an object a later artefact compares
 * against.
 */

/**
 * The stored shape's version, which is also WHICH EMAIL IT IS (depth v2,
 * T11b). 1: the report (Weekly-v3, the shape every snapshot stored before 13
 * Oct carries), which keeps rendering exactly as it was sent, byte for byte.
 * 2: level 1 (board E7): the week in one line, the flag the update raised,
 * what else came up, one line per page, the way in; it carries its page
 * lines (`lines`). New snapshots are 2. `staleWeeklyReadSnapshot` turns any
 * other into a sentence rather than a stack trace.
 */
export const WEEKLY_READ_SNAPSHOT_VERSION = 2
/** The report: every snapshot stored before level 1. */
export const WEEKLY_READ_REPORT_VERSION = 1
/** Level 1 (T11b). */
export const WEEKLY_READ_LEVEL_ONE_VERSION = 2

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
  /** Level 1 only (version 2): one line per page, frozen when the snapshot
   *  was built (lib/reports/weekly-read-lines.ts). Absent on a report. */
  lines?: WeeklyReadLine[]
}

export function isWeeklyReadData(data: unknown): data is WeeklyReadSnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'weekly_read'
}

/** The line to print instead of a weekly read this build cannot draw, or null. */
export function staleWeeklyReadSnapshot(data: WeeklyReadSnapshotData): string | null {
  const known = data.version === WEEKLY_READ_REPORT_VERSION || data.version === WEEKLY_READ_LEVEL_ONE_VERSION
  return known && data.read && Array.isArray(data.read.findings) ? null : STALE_ARTEFACT_LINE
}

/** Is this snapshot the level-1 email (version 2), not the report? */
export function isLevelOne(data: Pick<WeeklyReadSnapshotData, 'version'>): boolean {
  return data.version === WEEKLY_READ_LEVEL_ONE_VERSION
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
export function weeklyReadSnapshotData(a: { company: string; runId: string; read: WeekReadData; writtenAt: string; lines?: readonly WeeklyReadLine[] }): WeeklyReadSnapshotData {
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
    lines: [...(a.lines ?? [])],
  }
}

/** Every page's line for the snapshot (lib/reports/weekly-read-lines-load.ts),
 *  loaded on first use so the renderers and the offline preview, which import
 *  this file for the shape, never load the pages' readers. Never throws. */
async function loadLines(admin: SupabaseClient, a: { clientId: string; runId: string; read: WeekReadData }): Promise<WeeklyReadLine[]> {
  try {
    const { loadWeeklyReadLines } = await import('./weekly-read-lines-load')
    return await loadWeeklyReadLines(admin, a)
  } catch (e) {
    console.error(`[weekly-read lines] ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

/** Load the run's read, refuse one that may not go out, read every page's
 *  line as it stands now, freeze them together. No rendering here: Chromium
 *  and the email body run in a route handler. */
export async function snapshotWeeklyRead(args: {
  admin: SupabaseClient
  clientId: string
  runId: string
  company: string
  userId?: string | null
  /** The page lines' reader, for a test. */
  lines?: (admin: SupabaseClient, a: { clientId: string; runId: string; read: WeekReadData }) => Promise<WeeklyReadLine[]>
}): Promise<{ snapshotId: string; data: WeeklyReadSnapshotData; evidenceIds: string[] }> {
  const row = await loadWeekRead(args.admin, { clientId: args.clientId, runId: args.runId, kind: 'week' })
  const state = weekReadSendState(row)
  if (!state.ok) throw new WeeklyReadNotReadyError(state.reason, state.message)
  const read = row!.data!
  const lines = await (args.lines ?? loadLines)(args.admin, { clientId: args.clientId, runId: args.runId, read }).catch(() => [] as WeeklyReadLine[])
  const data = weeklyReadSnapshotData({ company: args.company, runId: args.runId, read, writtenAt: row!.created_at, lines })
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
