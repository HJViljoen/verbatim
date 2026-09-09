import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateSnapshot, SNAPSHOT_COLS, type SnapshotRow } from '../snapshots'
import { applyEdits, loadEdits } from './documents/edits'
import { isDocumentData, type DocumentSnapshotData } from './documents/types'
import { deckSlides } from './compose'
import type { ReportSnapshotData } from './types'

// The in-app viewer's data (2026-09-09). Opening a build is a URL — `?view=`
// on Reports and on the Studio — so the panel is server-rendered, shareable
// and works without hydration. This module is the one door to it: it reads a
// snapshot scoped to the reader's own workspace and hands back exactly what
// the panel draws. Nothing here touches /render or the artifact bytes.

/** What the panel needs: the frozen pages, plus the line above them. */
export interface ViewerSnapshot {
  id: string
  kind: 'document' | 'report'
  /** Hydrated (quote texts resolved live) and, for a document, with the
   *  operator's edits applied — the same pages the PDF prints. */
  data: DocumentSnapshotData | ReportSnapshotData
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
    return { ...common, kind: 'document', data: withEdits, pageCount: withEdits.pages.length + 1 }
  }

  // An arranged report: the cover plus every section's slides. The page
  // modules are loaded here rather than at the top of the file so this
  // module stays cheap for callers that only want the href helper.
  const report = raw as ReportSnapshotData
  const { pageModule } = await import('@/components/pages/registry')
  return { ...common, kind: 'report', data: report, pageCount: deckSlides(report, pageModule).length }
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
