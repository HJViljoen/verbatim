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

/**
 * THE SHAPE OF A STORED QUARTERLY READING, AND WHY IT IS 2.
 *
 * `QuarterlyData` changed INCOMPATIBLY in block D. `lib/pages/quarterly.ts`
 * gained REQUIRED fields that every renderer of a stored snapshot now
 * dereferences — `CoverStat.kind`, `ReadPage.meta`/`.flags`,
 * `SubjectQuarterRow.rival`/`.spark`/`.sparkMonths`/`.gap`,
 * `SubjectsPage.rivalLabel`/`.line`/`.quotes`, `CategoryPage.quiet`/
 * `.quietNote`/`.quotes`/`.reddit`, `RivalsPage.ownPosts`/`.saidAbout`/
 * `.headToHead`/`.questionsRival`, `StandingAdvice.grounded` — and four of
 * them THROW rather than render thin: `subjects.quotes`, `category.quotes`,
 * `rivals.ownPosts` and `rivals.saidAbout` are each read with `.filter` or
 * `.map` three components into a server render.
 *
 * `version: 1` asserted a compatibility that no longer holds. Unlike
 * `weekly-build.ts`, THIS FILE EXISTED BEFORE THE BRANCH, so a v1 row can
 * already sit in `report_snapshots` — and every path that reads one (the
 * viewer, `/r/<token>`, the PDF route, the "email as sent" re-render) would
 * hand a paying reader a stack trace. `staleQuarterlySnapshot` is what turns
 * that into a sentence, and the three renderers ask it before anything
 * dereferences `data.reading`.
 *
 * The weekly package closed the identical defect in the same wave (1bff3082);
 * this is that fix, on the artefact where the row can actually exist.
 */
export const QUARTERLY_SNAPSHOT_VERSION = 2

export interface QuarterlySnapshotData {
  /** `number`, not the literal: the callers that narrow with `isQuarterlyData`
   *  hold a `ReportSnapshotData` (whose `version` is the literal 1), and a
   *  second literal here collapses that intersection to `never` at every one
   *  of them. `staleQuarterlySnapshot` is what actually checks the value. */
  version: number
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

/**
 * `isQuarterlyData` deliberately still matches on `kind` ALONE. The branches
 * that ask it (lib/reports/viewer.ts, app/r/[token]) fall through to the
 * arranged-report path, which reads `data.sections` and would throw on a
 * quarterly row of ANY version. Telling a quarterly artefact from a report is
 * one question; telling a readable one from a stale one is another, and it is
 * the one below.
 */
export function isQuarterlyData(data: unknown): data is QuarterlySnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'quarterly'
}

/**
 * The one line to print instead of a quarterly review this build cannot
 * redraw, or null when it can.
 *
 * WHAT IT IS FOR is above, on `QUARTERLY_SNAPSHOT_VERSION`. The three
 * renderers of a stored quarterly reading — the deck, the share page and the
 * email — ask this FIRST, so an older row is a sentence a reader can act on
 * rather than a TypeError inside a server component.
 */
export function staleQuarterlySnapshot(data: QuarterlySnapshotData): string | null {
  return data.version === QUARTERLY_SNAPSHOT_VERSION
    ? null
    : 'This review was built by an older version of Verbatim and cannot be redrawn here. The next scheduled review will be readable.'
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
    version: QUARTERLY_SNAPSHOT_VERSION,
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
