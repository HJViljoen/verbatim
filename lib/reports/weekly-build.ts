import type { SupabaseClient } from '@supabase/supabase-js'
import { createSnapshot } from '../snapshots'
import { mergeFigures } from '../blocks/types'
import type { FigureTable } from '../reading/verdicts'
import type { WeeklyData } from '../pages/weekly'
import { loadWeekly } from '../pages/weekly'
import { readingHandle } from '../reading/read'
import { WEEKLY_BLOCK_KEYS, WEEKLY_TITLE, weeklyPeriod, weeklySubject, type WeeklyBlockKey } from './weekly'
import { STALE_ARTEFACT_LINE } from './stale'

/**
 * Freezing the weekly report (Phase 1 WP17).
 *
 * ONE SNAPSHOT, THE SAME SPINE. A weekly artefact is an ordinary
 * `report_snapshots` row of kind `'report'`: the render route prints it, the
 * share link points at it, erasure stales it, and `freezeQuotes` empties every
 * quote's words on the way in so a stored artefact holds ids and numbers and
 * never a third party's sentence.
 *
 * WHAT MAKES IT A WEEKLY ONE IS `kind: 'weekly'` INSIDE `data`, not a new
 * snapshot kind. `report_snapshots.kind` is a stored contract with a CHECK
 * constraint behind it and three readers that branch on it; the document report
 * of 2026-08-31 solved the same problem the same way (`isDocumentData`), and
 * following that precedent means this needs no migration and breaks no
 * artefact that already exists.
 *
 * `reading_at` LIVES IN `data` UNTIL M9. The design wants every artefact
 * stamped with the date it was read, and `report_snapshots` gains a column for
 * it at R2 (WP18's M9). Until then it is `data.readingAt` — written here, read
 * by the masthead — and M9's migration backfills the column from exactly this
 * field.
 */

/**
 * The stored shape's version.
 *
 * THREE (market-first WP3.7). "Your market this week" reads the reading month
 * and holds the front page's reading (`overview`) and This week's parts
 * (`cameIn`, `heard`, `sales`, `replies`) where version 2 held Phase 1's six
 * sections (the unusual-week check, "What came in", the coverage line). Every
 * reader of a stored snapshot dereferences the new fields, so a version 2 row
 * prints `STALE_ARTEFACT_LINE` at the top of the render instead of a
 * TypeError three components in (`staleWeeklySnapshot`). Production has none:
 * the weekly is not sent in the trial (decision J).
 *
 * `isWeeklyData` deliberately still matches on `kind` alone: telling a weekly
 * artefact from a report is one question and telling a readable one from a
 * stale one is another.
 *
 * Version 2 (Block D wave 2) is kept in the history: `update` became required
 * and `sales` a `ForSalesData`.
 */
export const WEEKLY_SNAPSHOT_VERSION = 3

export interface WeeklySnapshotData {
  /** `number`, not the literal: the callers that narrow with `isWeeklyData`
   *  hold a `ReportSnapshotData` (whose `version` is the literal 1), and a
   *  second literal here collapses that intersection to `never` at every one
   *  of them. `staleWeeklySnapshot` is what actually checks the value. */
  version: number
  /** What tells a weekly artefact from an arranged report or a document. */
  kind: 'weekly'
  company: string
  title: string
  /** The update's own window dates, or the month so far. */
  period: string
  /** The instant the reading was taken — M9's `report_snapshots.reading_at`
   *  backfills from here. */
  readingAt: string
  month: string
  /** The arrangement, by block key. A key this build no longer knows is
   *  dropped at render, exactly as a report section's key is. */
  keys: WeeklyBlockKey[]
  /** The tile-ready reading. Quotes inside are refs with `text: ''`. */
  reading: WeeklyData
  /** Every figure the six blocks print, by token, frozen. */
  figures: FigureTable
  /** The subject line, frozen with the reading it describes. */
  subject: string
}

export function isWeeklyData(data: unknown): data is WeeklySnapshotData {
  return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === 'weekly'
}

/**
 * The one line to print instead of a weekly artefact this build cannot draw,
 * or null when it can.
 *
 * WHAT IT IS FOR is above, on `WEEKLY_SNAPSHOT_VERSION`. The three renderers
 * of a stored weekly reading — the email, the share page and the deck — ask
 * this first, so an older row is a sentence a reader can act on rather than a
 * TypeError inside a server component.
 */
export function staleWeeklySnapshot(data: WeeklySnapshotData): string | null {
  return data.version === WEEKLY_SNAPSHOT_VERSION
    ? null
    : STALE_ARTEFACT_LINE
}

export class WeeklyEmptyError extends Error {}

/** Load, compose, freeze. No rendering: Chromium and the email body run in a
 *  route handler, never here and never in an Inngest step. */
export async function snapshotWeekly(args: {
  admin: SupabaseClient
  /** The reading client — the session's on the app path, the admin client on
   *  the send path, where the tenant is pinned by the schedule. */
  supabase: unknown
  clientId: string
  userId?: string | null
  company: string
  /** Which blocks, in which order. The stored arrangement, or all six. */
  keys?: readonly string[]
  /**
   * The blocks' figure tables, computed by the caller so this module stays free
   * of React — over THE KEYS THIS SNAPSHOT RENDERS, which is why they are
   * handed back. Computing them over all six regardless of the stored
   * arrangement froze figures for sections the artefact does not draw.
   */
  figuresOf: (data: WeeklyData, keys: WeeklyBlockKey[]) => FigureTable[]
}): Promise<{ snapshotId: string; data: WeeklySnapshotData; evidenceIds: string[] }> {
  const reading = await loadWeekly({
    supabase: args.supabase,
    reading: readingHandle(args.clientId),
    clientId: args.clientId,
    params: {},
  })
  if (!reading) {
    throw new WeeklyEmptyError('Nothing to report yet: your first update has not landed.')
  }

  const known = (args.keys ?? WEEKLY_BLOCK_KEYS).filter((k): k is WeeklyBlockKey =>
    (WEEKLY_BLOCK_KEYS as readonly string[]).includes(k),
  )
  const keys: WeeklyBlockKey[] = known.length > 0 ? known : [...WEEKLY_BLOCK_KEYS]
  const company = args.company || reading.brand
  const data: WeeklySnapshotData = {
    version: WEEKLY_SNAPSHOT_VERSION,
    kind: 'weekly',
    company,
    title: WEEKLY_TITLE,
    period: weeklyPeriod(reading.window, reading.month),
    readingAt: reading.readingAt,
    month: reading.month,
    keys,
    reading,
    figures: mergeFigures(args.figuresOf(reading, keys)),
    subject: weeklySubject(company, reading.cameIn),
  }

  const snap = await createSnapshot(args.admin, {
    clientId: args.clientId,
    userId: args.userId ?? null,
    kind: 'report',
    ref: { params: {} },
    title: `${company} · ${data.title} · ${data.period}`,
    runId: reading.runId,
    data,
  })
  return { snapshotId: snap.id, data, evidenceIds: snap.evidenceIds }
}
