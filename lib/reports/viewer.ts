import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateSnapshot, SNAPSHOT_COLS, type SnapshotRow } from '../snapshots'
import { applyEdits, loadEdits } from './documents/edits'
import { isDocumentData, type DocumentSnapshotData } from './documents/types'
import { isWeeklyData, type WeeklySnapshotData } from './weekly-build'
import { isMonthlyData, type MonthlySnapshotData } from './monthly-build'
import { isQuarterlyData, type QuarterlySnapshotData } from './quarterly-build'
import { WEEKLY_BLOCK_KEYS } from './weekly'
import { MONTHLY_BLOCK_KEYS } from './monthly'
import { QUARTERLY_BLOCK_KEYS } from './quarterly'
import { deckSlides } from './compose'
import { documentSlides } from './documents/compose'
import type { ReportSnapshotData } from './types'

// The in-app viewer's data (2026-09-09). Opening a build is a URL — `?view=`
// on Reports and on the Studio — so the panel is server-rendered, shareable
// and works without hydration. This module is the one door to it: it reads a
// snapshot scoped to the reader's own workspace and hands back exactly what
// the panel draws. Nothing here touches /render or the artifact bytes.

/** What the panel needs: the frozen pages, plus the line above them. */
export interface ViewerSnapshot {
  id: string
  /** Which deck draws it. Three kinds share `report_snapshots.kind = 'report'`
   *  and are told apart inside `data` — the `isDocumentData` precedent. */
  kind: 'document' | 'report' | 'weekly' | 'monthly' | 'quarterly'
  /** Hydrated (quote texts resolved live) and, for a document, with the
   *  operator's edits applied — the same pages the PDF prints. */
  data: DocumentSnapshotData | ReportSnapshotData | WeeklySnapshotData | MonthlySnapshotData | QuarterlySnapshotData
  title: string
  builtAt: string
  pageCount: number
  /** The stored PDF, when there is one; the header hides Download otherwise. */
  artifactId: string | null
  /** The reports row this build came from; null for a build made on the
   *  command line, which has no report to open in the Studio. */
  reportId: string | null
}

interface ArtifactLite { id: string; format: string; version: number }

/**
 * One build, ready to draw, or null when the id names nothing this workspace
 * built. The tenant check is in the query, not after it: a snapshot belonging
 * to another client never loads, so a guessed id reads as "no such build".
 */
export async function loadViewerSnapshot(admin: SupabaseClient, clientId: string, snapshotId: string): Promise<ViewerSnapshot | null> {
  const { data, error } = await admin
    .from('report_snapshots')
    .select(`${SNAPSHOT_COLS}, report_id, artifacts(id, format, version)`)
    .eq('id', snapshotId)
    .eq('client_id', clientId)
    .eq('kind', 'report')
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as SnapshotRow & { report_id: string | null; artifacts: ArtifactLite[] }

  const pdf = (row.artifacts ?? [])
    .filter((a) => a.format === 'pdf')
    .sort((a, b) => b.version - a.version)[0] ?? null
  const common = {
    id: row.id,
    title: row.title,
    builtAt: row.created_at,
    artifactId: pdf?.id ?? null,
    reportId: row.report_id,
  }

  const raw = await hydrateSnapshot(admin, row)

  // A written report: the frozen pages with the edits made in the Studio
  // lying over them, exactly as app/render does before it prints.
  if (isDocumentData(raw)) {
    const edits = await loadEdits(admin, row.id)
    const withEdits = applyEdits(raw, edits)
    return { ...common, kind: 'document', data: withEdits, pageCount: documentViewerPages(withEdits) }
  }

  // A WEEKLY REPORT (Phase 1 WP17): six blocks over one reading, and NO
  // `sections`. Without this branch the cast below handed `deckSlides` a
  // snapshot with no sections and `d.sections.forEach` threw inside a server
  // component — and the row is reachable: /dashboard/reports lists every
  // kind='report' snapshot that no report_sends row carries under "Builds",
  // which is exactly what a weekly send that stored its PDF and then failed at
  // the email leaves behind. One sheet per block, as WeeklyDeck paginates.
  if (isWeeklyData(raw)) {
    return { ...common, kind: 'weekly', data: raw, pageCount: weeklyViewerPages(raw.keys) }
  }

  // A MONTHLY REPORT (Phase 1 WP18), for the same reason and by the same route:
  // /dashboard/reports lists every kind='report' snapshot that no report_sends
  // row carries under "Builds", which is what a monthly send that stored its
  // PDF and then failed at the email leaves behind. Without this branch the
  // cast below hands `deckSlides` a snapshot with no sections and
  // `d.sections.forEach` throws inside a server component.
  if (isMonthlyData(raw)) {
    return { ...common, kind: 'monthly', data: raw, pageCount: monthlyViewerPages(raw.keys) }
  }

  // A QUARTERLY REVIEW (Phase 1 WP20), for the same reason and by the same
  // route: /dashboard/reports lists every kind='report' snapshot that no
  // report_sends row carries under "Builds", which is what a quarterly send
  // that stored its PDF and then failed at the email leaves behind. Without
  // this branch the cast below hands `deckSlides` a snapshot with no sections
  // and `d.sections.forEach` throws inside a server component.
  if (isQuarterlyData(raw)) {
    return { ...common, kind: 'quarterly', data: raw, pageCount: quarterlyViewerPages(raw.keys) }
  }

  // An arranged report: the cover plus every section's slides. The page
  // modules are loaded here rather than at the top of the file so this
  // module stays cheap for callers that only want the href helper.
  const report = raw as ReportSnapshotData
  const { pageModule } = await import('@/components/pages/registry')
  return { ...common, kind: 'report', data: report, pageCount: deckSlides(report, pageModule).length }
}

/**
 * How many sheets a stored brief prints — one per WRITTEN page, one per
 * BORROWED page block, plus the cover.
 *
 * A BORROWED BLOCK IS A SHEET TOO (WP19). `DocumentDeck` paginates off
 * `documentSlides`, which walks `layout` — the written pages and the borrowed
 * sections in one order — while both headers still counted `pages.length + 1`.
 * Every brief this product builds is affected: MARKETING_MAP is 3 written pages
 * and 5 blocks, SALES_MAP 4 and 4, CONTENT_MAP 4 and 3, LEADERSHIP_MAP 3 and 4,
 * so the viewer header and the Studio bar undercounted by roughly half. The
 * same deck already fixed the twin bug on its own cover and stopped one line
 * short of the page count.
 *
 * This is the seam WP17 added `weeklyViewerPages` for, and WP18 and WP20 both
 * took the lesson; the brief is the one kind that did not.
 */
export function documentViewerPages(data: DocumentSnapshotData): number {
  return documentSlides(data).length + 1
}

/**
 * How many sheets a stored weekly report prints — one per block key this build
 * still knows, and never zero: `WeeklyDeck` draws a sheet saying so when it
 * knows none of them, so the header must not say "0 pages" over it.
 */
export function weeklyViewerPages(keys: readonly string[]): number {
  return Math.max(1, keys.filter((k) => (WEEKLY_BLOCK_KEYS as readonly string[]).includes(k)).length)
}

/** The same count for a monthly report — one sheet per block key this build
 *  still knows, and never zero. */
export function monthlyViewerPages(keys: readonly string[]): number {
  return Math.max(1, keys.filter((k) => (MONTHLY_BLOCK_KEYS as readonly string[]).includes(k)).length)
}

/** The same count for a quarterly review — one sheet per block key this build
 *  still knows, and never zero: `QuarterlyDeck` draws a sheet saying it knows
 *  none of them, so the header must not say "0 pages" over it. */
export function quarterlyViewerPages(keys: readonly string[]): number {
  return Math.max(1, keys.filter((k) => (QUARTERLY_BLOCK_KEYS as readonly string[]).includes(k)).length)
}

/**
 * The URL that opens (or closes) the viewer over a page, keeping every other
 * parameter the reader arrived with. `null` closes: `view` is dropped and the
 * rest of the query survives, so the list stays where it was.
 */
export function viewerHref(base: string, params: Record<string, string | undefined>, snapshotId: string | null): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'view' && value) q.set(key, value)
  }
  if (snapshotId) q.set('view', snapshotId)
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
}
