import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { mergeFigures } from '../blocks/types'
import type { FigureTable } from '../reading/verdicts'
import type { QuarterlyData } from '../pages/quarterly'
import { loadQuarterly } from '../pages/quarterly'
import { readingHandle } from '../reading/read'
import {
  QUARTERLY_BLOCK_KEYS,
  isQuarterlyBlockKey,
  quarterlySubject,
  quarterlyTitle,
  type Quarter,
  type QuarterlyBlockKey,
} from './quarterly'

/**
 * Freezing the quarterly review (Phase 1 WP20).
 *
 * THE SAME SPINE AS EVERY OTHER ARTEFACT. An ordinary `report_snapshots` row of
 * kind `'report'` whose `data.kind` is `'quarterly'` — the `isDocumentData`
 * precedent of 2026-08-31 and the `isWeeklyData` one of WP17. `report_snapshots
 * .kind` has a CHECK constraint and four readers behind it, so a third artefact
 * needs no migration and breaks nothing that already exists.
 *
 * `reading_at` LIVES IN `data` UNTIL M9, exactly as the weekly report's does,
 * and M9's migration backfills the column from this field. Written here so that
 * the backfill has one shape to look for and not two.
 *
 * NO `run_id`. The weekly report names the update it was built over because it
 * IS that update. A quarter is dated by the comment across three months and
 * belongs to no single run; naming the last one that happened to land would put
 * a run's bookkeeping on a period key, which is the thing AGENTS.md forbids
 * outside `run_summary`.
 *
 * NO RENDERING HERE. Chromium and the email body are produced in route
 * handlers; this loads, composes and freezes, and is safe to call from a
 * schedule runner an Inngest function fetches.
 */

export interface QuarterlySnapshotData {
  version: 1
  /** What tells a quarterly artefact from a weekly one, a document or an
   *  arranged report. */
  kind: 'quarterly'
  company: string
  title: string
  /** "Q3 2026 (Jul–Sep) against Q2 2026 (Apr–Jun) · September still filling". */
  period: string
  /** The instant the reading was taken — M9's `report_snapshots.reading_at`
   *  backfills from here. */
  readingAt: string
  /** The quarter this is of, and the one it is measured against. */
  quarter: Quarter
  prior: Quarter
  /** The monthly readings behind the tenant's own side, frozen with the
   *  reading: a reader of this artefact in six months must be able to see that
   *  it was built on three and not on nine. */
  readings: number
  /** The page order. A key this build no longer knows is dropped at render. */
  keys: QuarterlyBlockKey[]
  /** The tile-ready reading. Quotes inside are refs with `text: ''`. */
  reading: QuarterlyData
  /** Every figure the eight pages print, by token, frozen. */
  figures: FigureTable
  /** The subject line, frozen with the reading it describes. */
  subject: string
}

export function isQuarterlyData(data: unknown): data is QuarterlySnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'quarterly'
}

export class QuarterlyEmptyError extends Error {}

export async function snapshotQuarterly(args: {
  admin: SupabaseClient
  /** The reading client — the session's on the app path, the admin client on
   *  the send path, where the tenant is pinned by the schedule. */
  supabase: unknown
  clientId: string
  userId?: string | null
  company: string
  /** Which quarter. Defaults to the one that has CLOSED, never the one the
   *  reading date falls in — `quarterToReview` (lib/reports/quarterly.ts). */
  quarter?: Quarter
  /** Overridable so a rebuild reads as at its own date. */
  now?: string
  /** Which pages, in which order. The stored arrangement, or all eight. */
  keys?: readonly string[]
  /** The pages' figure tables, computed by the caller over THE KEYS THIS
   *  SNAPSHOT RENDERS, so this module stays free of React. */
  figuresOf: (data: QuarterlyData, keys: QuarterlyBlockKey[]) => FigureTable[]
}): Promise<{ snapshotId: string; data: QuarterlySnapshotData; evidenceIds: string[] }> {
  const reading = await loadQuarterly(
    {
      supabase: args.supabase,
      reading: readingHandle(args.clientId),
      clientId: args.clientId,
      params: {},
    },
    { quarter: args.quarter, now: args.now },
  )
  if (!reading) {
    throw new QuarterlyEmptyError('Nothing to review yet — your first update has not landed.')
  }

  const known = (args.keys ?? QUARTERLY_BLOCK_KEYS).filter(isQuarterlyBlockKey)
  const keys: QuarterlyBlockKey[] = known.length > 0 ? known : [...QUARTERLY_BLOCK_KEYS]
  const company = args.company || reading.brand
  const data: QuarterlySnapshotData = {
    version: 1,
    kind: 'quarterly',
    company,
    title: quarterlyTitle(company, reading.quarter),
    period: reading.period,
    readingAt: reading.readingAt,
    quarter: reading.quarter,
    prior: reading.prior,
    readings: reading.readings,
    keys,
    reading,
    figures: mergeFigures(args.figuresOf(reading, keys)),
    subject: quarterlySubject(company, reading.quarter, reading.readings),
  }

  const snap = await createSnapshot(args.admin, {
    clientId: args.clientId,
    userId: args.userId ?? null,
    kind: 'report',
    ref: { params: {} },
    title: data.title,
    runId: null,
    data,
  })
  return { snapshotId: snap.id, data, evidenceIds: snap.evidenceIds }
}
