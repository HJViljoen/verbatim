// Reports › Exported (WP4, 2026-09-11): the page and tile files a reader made
// from the export controls, shaped for the list. Report builds are the other
// two groups on that page and never appear here.
//
// A snapshot whose file never stored is not an export anyone can open, so it
// is dropped rather than listed as a row that does nothing.

export interface ExportArtifact {
  id: string
  format: string
  bytes: number
  stale: boolean
}

export interface ExportSnapshot {
  id: string
  title: string
  kind: string
  created_at: string
  artifacts: ExportArtifact[] | null
}

export interface ExportedRow {
  id: string
  title: string
  /** What was exported, in the reader's words. */
  what: string
  createdAt: string
  files: ExportArtifact[]
  /** The stored file was swept; downloading builds it again. */
  stale: boolean
}

const WHAT: Record<string, string> = {
  page: 'a whole page',
  tile: 'one tile',
  agent_thread: 'a question',
}

/** The exported files, newest first — the order the read already returns. */
export function exportedRows(snapshots: ExportSnapshot[]): ExportedRow[] {
  const rows: ExportedRow[] = []
  for (const s of snapshots) {
    const files = s.artifacts ?? []
    if (files.length === 0) continue
    rows.push({
      id: s.id,
      title: s.title,
      what: WHAT[s.kind] ?? 'a file',
      createdAt: s.created_at,
      files,
      stale: files.some((f) => f.stale),
    })
  }
  return rows
}

/** The quiet line under an exported row's title. */
export function exportedLine(row: ExportedRow, when: string): string {
  const formats = [...new Set(row.files.map((f) => f.format.toUpperCase()))].join(', ')
  return `${row.what} · ${formats} · ${when}${row.stale ? ' · rebuilt on download' : ''}`
}
