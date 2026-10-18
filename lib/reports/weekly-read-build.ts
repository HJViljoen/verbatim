import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { flagPrints } from '../reading/week-lead'
import { loadWeekRead } from '../written/store'
import type { WeekReadData } from '../written/types'
import { STALE_ARTEFACT_LINE } from './stale'
import { WEEKLY_READ_TITLE, weekReadDates, weekReadSendState, weeklyReadSubject, type WeekReadHeldReason } from './weekly-read'
import type { WeeklyReadLine } from './weekly-read-lines'
import type { WeeklyMonthClose, WeeklyPages, WeeklySubjectRead } from './weekly-read-v3'

/**
 * Freezing the weekly read (artefact `weekly_read`): the run's stored
 * `week_reads` row, as one `report_snapshots` row of kind 'report' with
 * `data.kind = 'weekly_read'` (the `isDocumentData` / `isWeeklyData`
 * precedent: no new snapshot kind, no migration, the render, share, erasure
 * and archive paths all work on it as they do on every report).
 *
 * NO MODEL CALL AND NO RE-READ OF A LIVE FIGURE AT RENDER. The read was
 * written and composed by the pipeline's `write-week-read` step (the update's
 * anomaly flag frozen into it there); this copies it whole. What is read here
 * is what version 3 prints beside it (18 Oct, the H7 boards): the READY
 * subjects' own stored reads in Market's order, each page's part from the
 * Dashboard's own tops, and the month-closing line, because post ideas and
 * the subjects' reads are written after the week's read: read once, frozen
 * with it, never again (lib/reports/weekly-read-lines-load.ts
 * `loadWeeklyReadParts`). No comment's words are read or sent anywhere.
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
 * lines (`lines`); every snapshot built 13 to 18 Oct, held byte for byte by
 * lib/test/weekly-read-golden/l1-*. 3 (18 Oct, the H7 boards): the email
 * grouped by question (this week, the month so far, what to do next) and
 * the full read as one visual system; it carries the ready subjects' stored
 * reads (`subjects`), each page's part (`pages`) and the month-closing line
 * (`monthClose`), every one optional, and no `lines`. New snapshots are 3.
 * `staleWeeklyReadSnapshot` turns any other into a sentence rather than a
 * stack trace.
 */
export const WEEKLY_READ_SNAPSHOT_VERSION = 3
/** The report: every snapshot stored before level 1. */
export const WEEKLY_READ_REPORT_VERSION = 1
/** Level 1 (T11b). */
export const WEEKLY_READ_LEVEL_ONE_VERSION = 2
/** Version 3 (the H7 boards, 18 Oct). */
export const WEEKLY_READ_V3_VERSION = 3

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
   *  was built (lib/reports/weekly-read-lines.ts). Absent on a report and on
   *  version 3. */
  lines?: WeeklyReadLine[]
  /** Version 3 only: every READY subject's own stored read, in Market's
   *  order (ruling U6: no other subject's words are frozen). Absent or empty,
   *  the issue prints no subjects. */
  subjects?: WeeklySubjectRead[]
  /** Version 3 only: each page's part, frozen when the snapshot was built.
   *  A part that is absent prints nothing. */
  pages?: WeeklyPages
  /** Version 3 only: the month-closing line, on the run that closes a month
   *  whose long-run read is published; else absent or null. */
  monthClose?: WeeklyMonthClose | null
}

export function isWeeklyReadData(data: unknown): data is WeeklyReadSnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'weekly_read'
}

/** The line to print instead of a weekly read this build cannot draw, or
 *  null. Versions 1 and 2 need the read's findings (both print them on the
 *  page); version 3 prints none, so it needs only the read. */
export function staleWeeklyReadSnapshot(data: WeeklyReadSnapshotData): string | null {
  if (data.version === WEEKLY_READ_V3_VERSION) return data.read && typeof data.read === 'object' ? null : STALE_ARTEFACT_LINE
  const known = data.version === WEEKLY_READ_REPORT_VERSION || data.version === WEEKLY_READ_LEVEL_ONE_VERSION
  return known && data.read && Array.isArray(data.read.findings) ? null : STALE_ARTEFACT_LINE
}

/** Is this snapshot the level-1 email (version 2), not the report? */
export function isLevelOne(data: Pick<WeeklyReadSnapshotData, 'version'>): boolean {
  return data.version === WEEKLY_READ_LEVEL_ONE_VERSION
}

/** Is this snapshot version 3 (the H7 boards)? */
export function isWeeklyV3(data: Pick<WeeklyReadSnapshotData, 'version'>): boolean {
  return data.version === WEEKLY_READ_V3_VERSION
}

/** The run's read is not one that may go out: the send is skipped, nothing is
 *  emailed, and the caller tells the operator. */
export class WeeklyReadNotReadyError extends Error {
  constructor(public readonly reason: WeekReadHeldReason, message: string) {
    super(message)
    this.name = 'WeeklyReadNotReadyError'
  }
}

/** The snapshot's data for a stored read (version 3). Pure: the builder
 *  below and the preview script both go through it. The read's own
 *  `subjectReads` (written onto the run's row for Market's subject panel, 14
 *  Oct) are left out of the read: every subject's, a subject whose check has
 *  not passed included. What the issue prints of them is `parts.subjects`,
 *  the READY subjects' alone (`subjectsPart`, ruling U6). */
export function weeklyReadSnapshotData(a: {
  company: string
  runId: string
  read: WeekReadData
  writtenAt: string
  parts?: { subjects?: readonly WeeklySubjectRead[]; pages?: WeeklyPages; monthClose?: WeeklyMonthClose | null }
}): WeeklyReadSnapshotData {
  const company = a.company.trim()
  const period = weekReadDates(a.read.window)
  const read: WeekReadData = a.read.version === 2 && a.read.subjectReads
    ? (({ subjectReads: _left, ...rest }) => rest)(a.read)
    : a.read
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
    read,
    subjects: [...(a.parts?.subjects ?? [])],
    pages: a.parts?.pages ?? {},
    monthClose: a.parts?.monthClose ?? null,
  }
}

/**
 * RULING U6 IN THE ISSUE (14 Oct). The read froze the update's anomaly flags
 * as the check raised them (`write-week-read`, lib/written/unusual.ts), and
 * the check flags every active subject whatever its check. A flag on a
 * subject that is not READY prints no figure on Market (`printableFlags`),
 * so the issue drops it when the snapshot is built, by the same predicate
 * (`flagPrints`, lib/reading/week-lead.ts): the lead is then the next flag,
 * or the new or biggest conversation, exactly as Market's, and Also this week
 * never lists it. The stored `week_reads` row is untouched (the pipeline and
 * its grouping stay as they are), and a snapshot already stored stays as it
 * was sent. Only a version-2 read carries flags. Pure.
 */
export function printableWeekRead(read: WeekReadData, readySubjects: ReadonlySet<string>): WeekReadData {
  if (read.version !== 2 || !read.unusual) return read
  const flags = read.unusual.flags.filter((f) => flagPrints(f, readySubjects))
  return flags.length === read.unusual.flags.length ? read : { ...read, unusual: { ...read.unusual, flags } }
}

/** The tenant's ready subjects for `printableWeekRead`, read only where the
 *  read froze a subject flag. FAILS CLOSED: a read that fails leaves no
 *  subject ready, so no subject flag leads the issue. Loaded on first use, as
 *  the lines are, so the renderers never load the subjects' reader. */
async function readySubjectsFor(admin: SupabaseClient, clientId: string): Promise<ReadonlySet<string>> {
  try {
    const { loadReadySubjectIds } = await import('../pages/subject-place')
    return await loadReadySubjectIds(admin, clientId)
  } catch (e) {
    console.error(`[weekly-read subjects] ${e instanceof Error ? e.message : String(e)}; no subject flag leads`)
    return new Set()
  }
}

/** The parts a version-3 snapshot freezes beside the read. */
export type WeeklyReadPartsOf = { subjects: WeeklySubjectRead[]; pages: WeeklyPages; monthClose: WeeklyMonthClose | null }

/** Every version-3 part for the snapshot (lib/reports/weekly-read-lines-load.ts),
 *  loaded on first use so the renderers and the offline preview, which import
 *  this file for the shape, never load the pages' readers. Never throws: a
 *  part that fails is left out. */
async function loadParts(admin: SupabaseClient, a: { clientId: string; runId: string; read: WeekReadData }): Promise<WeeklyReadPartsOf> {
  try {
    const { loadWeeklyReadParts } = await import('./weekly-read-lines-load')
    return await loadWeeklyReadParts(admin, a)
  } catch (e) {
    console.error(`[weekly-read parts] ${e instanceof Error ? e.message : String(e)}`)
    return { subjects: [], pages: {}, monthClose: null }
  }
}

/** Load the run's read, refuse one that may not go out, read the ready
 *  subjects' own reads, every page's part and the month-closing line as they
 *  stand now, freeze them together. No rendering here: Chromium and the
 *  email body run in a route handler. */
export async function snapshotWeeklyRead(args: {
  admin: SupabaseClient
  clientId: string
  runId: string
  company: string
  userId?: string | null
  /** The parts' reader, for a test. Handed the STORED read (with its
   *  `subjectReads`), the flags already made printable. */
  parts?: (admin: SupabaseClient, a: { clientId: string; runId: string; read: WeekReadData }) => Promise<WeeklyReadPartsOf>
  /** The ready subjects' reader, for a test. */
  readySubjects?: (admin: SupabaseClient, clientId: string) => Promise<ReadonlySet<string>>
}): Promise<{ snapshotId: string; data: WeeklyReadSnapshotData; evidenceIds: string[] }> {
  const row = await loadWeekRead(args.admin, { clientId: args.clientId, runId: args.runId, kind: 'week' })
  const state = weekReadSendState(row)
  if (!state.ok) throw new WeeklyReadNotReadyError(state.reason, state.message)
  const stored = row!.data!
  // Ruling U6: the issue never leads with, or lists, a flag on a subject
  // whose check has not passed (`printableWeekRead`).
  const subjectFlagged = stored.version === 2 && (stored.unusual?.flags ?? []).some((f) => f.objectKind === 'subject')
  const read = subjectFlagged
    ? printableWeekRead(stored, await (args.readySubjects ?? readySubjectsFor)(args.admin, args.clientId).catch(() => new Set<string>()))
    : stored
  const parts = await (args.parts ?? loadParts)(args.admin, { clientId: args.clientId, runId: args.runId, read })
    .catch((): WeeklyReadPartsOf => ({ subjects: [], pages: {}, monthClose: null }))
  const data = weeklyReadSnapshotData({ company: args.company, runId: args.runId, read, writtenAt: row!.created_at, parts })
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
