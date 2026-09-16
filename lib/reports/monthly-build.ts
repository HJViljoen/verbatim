import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { mergeFigures } from '../blocks/types'
import type { FigureTable, Verdict } from '../reading/verdicts'
import type { MonthlyData } from '../pages/monthly'
import { loadMonthly } from '../pages/monthly'
import { readingHandle } from '../reading/read'
import { MONTHLY_BLOCK_KEYS, monthlyPeriod, type MonthlyBlockKey } from './monthly'
import { stampSnapshotReading } from './reading-stamp'
import { FIGURE_AUDIENCE, sentFigureRows, writeSentFigures, type SentFigureRow } from './sent-figures'

/**
 * Freezing the monthly report (Phase 1 WP18).
 *
 * THE SAME SPINE AS THE WEEKLY ONE, AND DELIBERATELY. A monthly artefact is an
 * ordinary `report_snapshots` row of kind `'report'` with `kind: 'monthly'`
 * inside `data`: the render route prints it, the share link points at it,
 * erasure stales it, and `freezeQuotes` empties every quote's words on the way
 * in so a stored artefact holds ids and numbers and never a third party's
 * sentence. `report_snapshots.kind` is a stored contract with a CHECK behind it
 * and four readers that branch on it; the document report of 2026-08-31 and the
 * weekly report of WP17 both answered this the same way.
 *
 * WHAT IS NEW HERE IS THE RECORD. Two writes follow the snapshot, both of them
 * non-fatal and both of them the reason M9 exists:
 *   · the snapshot is STAMPED with what it is a reading of — the instant, the
 *     month, whether that month was still filling, and the basis;
 *   · what it PRINTED is written to `sent_figures`, object-keyed, at SEND time
 *     only, so "the report of {date} read X" and next month's confirming line
 *     have something to read.
 * Neither may fail a send that has already happened. An artefact that went out
 * and whose record did not get written is a gap in the record; an artefact that
 * failed to go out because its record could not be written is a gap in the
 * product.
 */

export interface MonthlySnapshotData {
  version: 1
  /** What tells a monthly artefact from a weekly one, an arranged report or a
   *  document. */
  kind: 'monthly'
  company: string
  title: string
  /** "September · reading as at 1 Oct 2026 · still filling until 31 Oct 2026". */
  period: string
  /** The instant the reading was taken. M9's `report_snapshots.reading_at` is
   *  stamped from here, and its backfill reads exactly this field. */
  readingAt: string
  month: string
  monthStatus: 'filling' | 'frozen'
  /** The arrangement, by block key. A key this build no longer knows is dropped
   *  at render, exactly as a report section's key is. */
  keys: MonthlyBlockKey[]
  /** The tile-ready reading. Quotes inside are refs with `text: ''`. */
  reading: MonthlyData
  /** Every figure the eight blocks print, by token, frozen. */
  figures: FigureTable
  /** The subject line, frozen with the reading it describes. */
  subject: string
}

export function isMonthlyData(data: unknown): data is MonthlySnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'monthly'
}

export class MonthlyEmptyError extends Error {}

/** What the caller hands back off the blocks, per key. Computed by the caller
 *  so this module stays free of React — and over THE KEYS THIS SNAPSHOT
 *  RENDERS, never over all eight regardless of the stored arrangement. */
export interface BlockAnswersOf {
  (data: MonthlyData, keys: MonthlyBlockKey[]): { figures: FigureTable; verdicts: Verdict[] }[]
}

/** Load, compose, freeze. No rendering: Chromium and the email body run in a
 *  route handler, never here and never in an Inngest step. */
export async function snapshotMonthly(args: {
  admin: SupabaseClient
  /** The reading client — the session's on the app path, the admin client on
   *  the send path, where the tenant is pinned by the schedule. */
  supabase: unknown
  clientId: string
  userId?: string | null
  company: string
  /** Which blocks, in which order. The stored arrangement, or all eight. */
  keys?: readonly string[]
  answersOf: BlockAnswersOf
}): Promise<{ snapshotId: string; data: MonthlySnapshotData; evidenceIds: string[]; rows: SentFigureRow[] }> {
  const reading = await loadMonthly({
    supabase: args.supabase,
    reading: readingHandle(args.clientId),
    clientId: args.clientId,
    params: {},
  })
  if (!reading) {
    throw new MonthlyEmptyError('Nothing to report on yet — your first update has not landed.')
  }

  const known = (args.keys ?? MONTHLY_BLOCK_KEYS).filter((k): k is MonthlyBlockKey =>
    (MONTHLY_BLOCK_KEYS as readonly string[]).includes(k),
  )
  const keys: MonthlyBlockKey[] = known.length > 0 ? known : [...MONTHLY_BLOCK_KEYS]
  const company = args.company || reading.brand
  const answers = args.answersOf(reading, keys)
  const figures = mergeFigures(answers.map((a) => a.figures))
  const verdicts = answers.flatMap((a) => a.verdicts)

  const data: MonthlySnapshotData = {
    version: 1,
    kind: 'monthly',
    company,
    title: `${company} · the month`,
    period: monthlyPeriod(reading.month, reading.monthStatus, reading.readingAt),
    readingAt: reading.readingAt,
    month: reading.month,
    monthStatus: reading.monthStatus,
    keys,
    reading,
    figures,
    subject: reading.subject,
  }

  const snap = await createSnapshot(args.admin, {
    clientId: args.clientId,
    userId: args.userId ?? null,
    kind: 'report',
    ref: { params: {} },
    title: `${data.title} · ${data.period}`,
    // NO RUN ID, AND THAT IS THE HONEST ANSWER. `report_snapshots.run_id` is
    // "the run the numbers came from", which a page export has and a month does
    // not: a calendar month is assembled from every update that touched it —
    // three or four of them — and is dated by the comment, never by the run
    // (AGENTS.md). Naming one of the four would be a period key this product
    // does not use.
    runId: null,
    data,
  })

  return {
    snapshotId: snap.id,
    data,
    evidenceIds: snap.evidenceIds,
    rows: sentFigureRows({
      month: reading.month,
      monthStatus: reading.monthStatus,
      artefact: 'monthly',
      verdicts,
      figures,
      figureAudience: FIGURE_AUDIENCE,
    }),
  }
}

/**
 * The record, written once the artefact has actually gone out.
 *
 * BOTH HALVES ARE NON-FATAL AND THE CALLER IS TOLD WHICH LANDED. This runs
 * after the email is away and the share link is minted; a missing M9, a
 * conflict or an outage must not fail a send that has happened, and must not
 * be retried into a second one. The `keyword-discovery` precedent AGENTS.md
 * names for a record kept alongside a report: logged, not `noteError`'d.
 *
 * NOTHING IS WRITTEN FOR A PREVIEW OR A TEST SEND. A preview deletes its own
 * snapshot; a test send leaves no artifact, no export event and no link. The
 * caller decides — this function is only reached on the recording path.
 */
export async function recordSend(
  admin: SupabaseClient,
  args: {
    clientId: string
    snapshotId: string
    readingAt: string
    month: string
    monthStatus: 'filling' | 'frozen'
    rows: readonly SentFigureRow[]
  },
): Promise<{ stamped: boolean; figures: number | null }> {
  let stamped = false
  let figures: number | null = null
  try {
    stamped = await stampSnapshotReading(admin, args.snapshotId, {
      readingAt: args.readingAt,
      month: args.month,
      monthStatus: args.monthStatus,
      windowBasis: 'month',
    })
  } catch (error) {
    console.warn('[send] could not stamp the reading', error)
  }
  try {
    figures = await writeSentFigures(admin, {
      clientId: args.clientId,
      snapshotId: args.snapshotId,
      readingAt: args.readingAt,
      rows: args.rows,
    })
  } catch (error) {
    console.warn('[send] could not record the sent figures', error)
  }
  return { stamped, figures }
}
