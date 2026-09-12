import { EXPORT_DAILY_LIMIT } from '../config'
import type { PrintVariant } from '../renderables/types'

// Export-in-place, the menu's own logic (WP4, 2026-09-11). What a control
// offers, and what the reader is told when a request comes back unhappy —
// kept out of the component so it can be read and tested on its own.
//
// The wire shape is POST /api/export's, unchanged since 2026-08-29:
//   { kind, page, tileKey?, params, variant, format }
// The page comes from the scope, so a job only carries the rest.

export type ExportFormat = 'pdf' | 'png'

export interface ExportJob {
  kind: 'page' | 'tile'
  tileKey?: string
  format: ExportFormat
  variant?: PrintVariant
  /** What the item says. */
  label: string
  /** The quiet right-hand badge, where the label doesn't already say it. */
  hint?: string
}

/** A labelled run of items in the menu — the label is a heading, not an item. */
export interface ExportSection {
  label?: string
  jobs: ExportJob[]
}

/** The thing that downloads, in the reader's words. */
export const FORMAT_NOUN: Record<ExportFormat, string> = { pdf: 'PDF', png: 'image' }

/** A stable React key for a job. */
export function jobKey(j: ExportJob): string {
  return `${j.kind}:${j.tileKey ?? ''}:${j.variant ?? ''}:${j.format}`
}

/**
 * The page-level menu: the page as the reader has it, the same page with every
 * item under it, then each tile on the page as an image. A page always leaves
 * as a PDF (the route refuses PNG for a page); a tile as a PNG.
 */
export function pageSections(tiles: { key: string; title: string }[]): ExportSection[] {
  const sections: ExportSection[] = [{
    jobs: [
      { kind: 'page', format: 'pdf', variant: 'default', label: 'This page', hint: 'PDF' },
      { kind: 'page', format: 'pdf', variant: 'full', label: 'This page, everything', hint: 'PDF' },
    ],
  }]
  if (tiles.length > 0) {
    sections.push({
      label: 'A tile as an image',
      jobs: tiles.map((t) => ({ kind: 'tile' as const, tileKey: t.key, format: 'png' as const, label: t.title })),
    })
  }
  return sections
}

/** The tile-level control: this one tile, either way. */
export function tileSections(tileKey: string): ExportSection[] {
  return [{
    jobs: [
      { kind: 'tile', tileKey, format: 'png', label: 'Image' },
      { kind: 'tile', tileKey, format: 'pdf', label: 'One-page PDF' },
    ],
  }]
}

/**
 * One line, in the reader's register. The daily cap is the one case worth its
 * own words — it is not a failure and trying again won't help today.
 */
export function exportErrorLine(status: number, serverError?: string | null): string {
  if (status === 429) return `Today's export limit is reached (${EXPORT_DAILY_LIMIT}). Tomorrow it resets.`
  const said = typeof serverError === 'string' ? serverError.trim() : ''
  return said || 'Couldn’t make that file — try again.'
}
