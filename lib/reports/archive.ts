import { fullDate } from '../format'
import { isOpaqueFigureKey, type Figure, type FigureTable } from './types'

/**
 * The archive's own rules (Phase 1 WP19, design RP4).
 *
 * Three things the archive did not have and the design asks for: a date
 * filter, counts that are not the length of a capped query, and the figures a
 * sent report went out with printed beside the date it read.
 *
 * WHY THE FIGURES ARE READ OFF THE SNAPSHOT AND NOT A TABLE. `sent_figures`
 * lands with M9, which is another package's migration and is not applied.
 * Every artefact this product has ever built already freezes its figure table
 * into `report_snapshots.data.figures` — "exports and reports freeze numbers,
 * never words" — so the archive reads what is there and says how it is keyed.
 * When M9 lands, a numeric object-keyed row is the better source for a
 * comparison; this is the better source for "what did the report of 1 Oct
 * actually print", which is the question RP4 asks.
 */

/** A date filter, as the URL carries it. Both bounds inclusive days, or empty
 *  for "no bound" — a half-open filter is an arithmetic convenience and a
 *  reader types the last day they mean. */
export interface DateFilter {
  from: string | null
  to: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseDateFilter(from: string | undefined, to: string | undefined): DateFilter {
  const clean = (v: string | undefined) => (v && DAY.test(v) ? v : null)
  const a = clean(from)
  const b = clean(to)
  // A reversed range is a typo, not an empty archive: swap rather than return
  // nothing and leave the reader to work out why.
  return a && b && a > b ? { from: b, to: a } : { from: a, to: b }
}

export const hasDateFilter = (f: DateFilter): boolean => f.from != null || f.to != null

/** Is this instant inside the filter? Compared on the DAY, in the same string
 *  space the input produces, so no timezone arithmetic stands between what a
 *  reader typed and what they get. */
export function withinDates(iso: string | null | undefined, filter: DateFilter): boolean {
  if (!iso) return !hasDateFilter(filter)
  const day = iso.slice(0, 10)
  if (filter.from && day < filter.from) return false
  if (filter.to && day > filter.to) return false
  return true
}

/** The line under the filter, in the reader's words. */
export function dateFilterLine(filter: DateFilter, shown: number, total: number): string | null {
  if (!hasDateFilter(filter)) return null
  const span = filter.from && filter.to
    ? `${fullDate(`${filter.from}T00:00:00.000Z`)} to ${fullDate(`${filter.to}T00:00:00.000Z`)}`
    : filter.from
      ? `from ${fullDate(`${filter.from}T00:00:00.000Z`)}`
      : `up to ${fullDate(`${filter.to}T00:00:00.000Z`)}`
  return `${shown} of ${total} ${total === 1 ? 'item' : 'items'} ${span}.`
}

/**
 * When a stored artefact says it read.
 *
 * FOUR CARRIERS, AND THE ORDER MATTERS. Each is read whether the query
 * selected the whole `data` column or aliased the key flat, which is what
 * every caller on the Reports page does. `report_snapshots.reading_at` is M9's
 * column and is preferred the moment it exists. Until then a brief carries
 * `data.reading.readingAt` (WP19) and the weekly report carries
 * `data.readingAt` (WP17) — both are the instant the artefact read, written by
 * the builder. `created_at` is LAST and is labelled differently, because it is
 * when the file was made and not when the conversation was read; printing it
 * under the same words would be the archive asserting a reading date it does
 * not have.
 */
export interface ReadingStamp {
  /** ISO instant. */
  at: string
  /** True where this is the build instant standing in for a reading date. */
  inferred: boolean
  /** "September 2026", where the artefact named a month. */
  month: string | null
  monthStatus: string | null
}

/** A row as PostgREST hands it back. `data->reading` selected under an alias
 *  arrives as a TOP-LEVEL `reading` key, not as `data.reading` — every caller
 *  on the Reports page selects it that way, and reading only the nested shape
 *  made every WP19 brief print "no reading date recorded" beside a snapshot
 *  that carries one. Both shapes are read, and the flat one first because it
 *  is what the queries ask for. */
export interface ReadingStampRow {
  created_at: string
  reading_at?: string | null
  month?: string | null
  month_status?: string | null
  /** `reading:data->reading`, aliased flat by the select. */
  reading?: unknown
  /** `readingAt:data->>readingAt`, aliased flat by the select. */
  readingAt?: string | null
  /** The whole `data` column, where a caller selected it whole. */
  data?: unknown
}

export function readingStampOf(snapshot: ReadingStampRow): ReadingStamp {
  type Reading = { readingAt?: unknown; monthLabel?: unknown; monthStatus?: unknown }
  const d = (snapshot.data ?? {}) as { readingAt?: unknown; reading?: Reading }
  const reading = (snapshot.reading ?? d.reading ?? null) as Reading | null
  const flatAt = typeof snapshot.readingAt === 'string' ? snapshot.readingAt : null
  const fromData = typeof reading?.readingAt === 'string' ? reading.readingAt
    : flatAt ?? (typeof d.readingAt === 'string' ? d.readingAt : null)
  const at = snapshot.reading_at ?? fromData
  return {
    at: at ?? snapshot.created_at,
    inferred: at == null,
    month: snapshot.month ?? (typeof reading?.monthLabel === 'string' ? reading.monthLabel : null),
    monthStatus: snapshot.month_status ?? (typeof reading?.monthStatus === 'string' ? reading.monthStatus : null),
  }
}

/** The one line the archive prints about when an artefact read. */
export function readingLine(stamp: ReadingStamp): string {
  const when = fullDate(stamp.at)
  const head = stamp.inferred ? `built ${when} · no reading date recorded` : `read as at ${when}`
  if (!stamp.month) return head
  return `${stamp.month}${stamp.monthStatus === 'filling' ? ' (still filling)' : ''} · ${head}`
}

/**
 * The figures an artefact went out with, as rows beside its reading date.
 *
 * KEYED BY COVER SLOT, NOT BY OBJECT, and the archive says so rather than
 * pretending otherwise: `client_share_pct` is "what the cover may cite", not
 * "what this report said about subject X in audience Y in month M". A reader
 * comparing two months needs the second; a reader asking what a colleague was
 * looking at needs the first, and this is that reader.
 */
export interface SentFigure {
  key: string
  label: string
  value: string
}

/**
 * The figures a reader recognises a report by, in the order they are asked
 * for. Kind-then-alphabetical was written for the ~19 curated cover keys; a
 * WP19 brief's table holds 7 to 20 more block keys beside them
 * (`standing_competitor_ottobock_content`, `kind_…_share`), so the six a
 * reader got were the alphabetically first six of those. These come first,
 * whatever they sort as, and everything else keeps the old order behind them.
 */
export const HEADLINE_FIGURE_KEYS: readonly string[] = [
  'reading_month', 'conversations', 'videos', 'client_videos', 'positive_pct', 'client_share_pct',
]

export function sentFigures(figures: FigureTable | null | undefined, max = 6): SentFigure[] {
  if (!figures) return []
  const headline = (key: string) => {
    const i = HEADLINE_FIGURE_KEYS.indexOf(key)
    return i === -1 ? HEADLINE_FIGURE_KEYS.length : i
  }
  const rank = (f: Figure) => (f.kind === 'pct' ? 0 : f.kind === 'count' ? 1 : 2)
  return Object.entries(figures)
    .filter(([, f]) => f && typeof f.value === 'string' && f.value.length > 0)
    // A per-finding count is evidence for one sentence, not a headline; the
    // slots a cover may cite are what a reader recognises a report by.
    .filter(([key]) => !/_conversations$/.test(key) && !isOpaqueFigureKey(key))
    .sort((a, b) => headline(a[0]) - headline(b[0]) || rank(a[1]) - rank(b[1]) || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([key, f]) => ({ key, label: f.label, value: f.value }))
}

/** The caveat printed under them, once. */
export const SENT_FIGURES_NOTE =
  'These are the numbers this report was sent with, frozen when it was built. The quoted voices are read live, so a withdrawn comment never shows.'
