import type { ReactNode } from 'react'
import Link from 'next/link'
import { FileText, Image as ImageIcon, Mail } from 'lucide-react'

import { Tile, TileBlock } from '@/components/shell/tile'
import { cn } from '@/lib/utils'
import type { ArchivePreset } from '@/lib/reports/page-context'

/**
 * The archive, as the artboard draws it (Block D wave 2, package E-reports;
 * `reports.archive.header` · `.filter` · `.sent` · `.built` · `.exported` ·
 * `.sharelink`).
 *
 * THE STRUCTURAL CHANGE. The built page was a `h-dvh` three-pane master-detail
 * — rail, one list, detail — so a reader saw ONE archive group at a time and
 * the page below the cards was a different shape from every other surface in
 * the product. The artboard shows the three lists stacked side by side and all
 * visible at once, inside one tile, on the same 12-column grid the rest of the
 * page is on. That is what this is.
 *
 * THE DETAIL PANE IS NOT DELETED. It re-renders "the email as sent" live from
 * the snapshot, which is the one thing on this page that cannot be got any
 * other way (mock-gap §7). It moved: selecting a row opens it as a full-width
 * tile UNDER the archive rather than as a third pane beside it, so the three
 * lists keep their columns and nothing is lost. The URL is unchanged
 * (`?group=…&item=…`), so every link already in circulation still opens the
 * same thing.
 *
 * EACH COLUMN SAYS WHAT IT IS SHOWING. Six rows fit a column at 1440; a group
 * holding more says so and points at the date filter, which is the control
 * that narrows it. A silent truncation is the defect `listCap` exists to stop,
 * one level up.
 */

export type ArchiveIcon = 'mail' | 'file' | 'image'

export interface ArchiveItem {
  id: string
  title: string
  /** The mono line under the title. */
  meta?: string | null
  /** The mono stamp at the right-hand end of the row. */
  stamp?: string | null
  href: string
  active?: boolean
  /** A send that did not reach anyone. */
  failed?: boolean
  icon: ArchiveIcon
  /** Text a reader might search this row by — kept for parity with the list
   *  the master-detail had. */
  search?: string
}

export interface ArchiveColumn {
  key: string
  label: string
  /** The mono note beside the column heading — "to your inbox". */
  meta: string
  items: ArchiveItem[]
  /** How many rows this column HOLDS under the reader's current filter — what
   *  "showing 6 of N" is out of.
   *
   *  NOT THE GROUP'S ALL-TIME HEAD COUNT, which is what it was: with the
   *  September chip on, a column drawing 4 of the 4 rows in September said
   *  "showing 4 of 23 · narrow the dates to see the rest" — the reader has
   *  already narrowed, and narrowing further can only remove rows. Worse where
   *  a cap is what hides things: the rows past `LIST_CAP` were never loaded
   *  and no date range will reveal them. That is `cappedAt`'s to say. */
  held: number
  /** `listCap` for this group: how many rows the list was drawn from, where
   *  the table holds more. Null where everything was searched. */
  cappedAt?: number | null
  /** The honest sentence where the column is empty. */
  empty: string
}

/** How many rows a column shows before it says what it is holding back. */
export const COLUMN_ROWS = 6

const ICONS: Record<ArchiveIcon, typeof Mail> = { mail: Mail, file: FileText, image: ImageIcon }

export function ArchiveTile({
  columns, meta, presets, activePresetKey, presetHref, presetNote, filter, footer, col = 12, row = 4,
}: {
  columns: readonly ArchiveColumn[]
  /** The delivery record — "23 updates since 6 Apr 2026 · longest gap 9 days
   *  · last on 27 Sep 2026". */
  meta?: string | null
  presets: readonly ArchivePreset[]
  activePresetKey: string | null
  presetHref: (p: ArchivePreset) => string
  /** "4 updates in September · 6, 13, 20, 27 Sep" — what the chosen chip
   *  covers, counted in UPDATES rather than in archive rows. */
  presetNote?: string | null
  /** The from/to form and its own line, which counts archive ITEMS. */
  filter?: ReactNode
  /** The hairline footer: the share-link door and the anonymity sentence. */
  footer?: ReactNode
  col?: number
  row?: number
}) {
  return (
    <Tile col={col} row={row} eyebrow="The archive" meta={meta ?? undefined} footer={footer} footerNote={undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={presetHref(p)}
            aria-current={p.key === activePresetKey ? 'true' : undefined}
            className={cn(
              'inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors',
              p.key === activePresetKey
                ? 'bg-inner text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-inner hover:text-foreground',
            )}
          >
            {p.label}
          </Link>
        ))}
        {presetNote && <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">{presetNote}</span>}
      </div>

      {filter}

      <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[1.25fr_1fr_0.75fr]">
        {columns.map((c) => (
          <div key={c.key} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{c.label}</h3>
              <span className="flex-none font-mono text-[11px] text-muted-foreground">{c.meta}</span>
            </div>
            {c.items.length > 0 ? (
              <div className="flex min-w-0 flex-col">
                {c.items.slice(0, COLUMN_ROWS).map((it, i, shown) => (
                  <ArchiveRow key={it.id} item={it} last={i === shown.length - 1} />
                ))}
                {columnLine(c) && (
                  <p className="m-0 pt-2 font-mono text-[10.5px] text-muted-foreground">{columnLine(c)}</p>
                )}
              </div>
            ) : (
              // THE EMPTY BLOCK TAKES THE COLUMN'S HEIGHT. A 52px stub at the
              // top of a 380px column reads as a thing that failed to load;
              // beside two columns of rows, a block the same height as they
              // are reads as the answer it is.
              <TileBlock className="flex min-h-[52px] flex-1 flex-col justify-center">
                <p className="m-0 text-[12px] text-muted-foreground">{c.empty}</p>
              </TileBlock>
            )}
          </div>
        ))}
      </div>
    </Tile>
  )
}

/**
 * "showing 6 of 14 · the 200 most recent are searched", and neither half is
 * drawn where it would say nothing.
 *
 * The count is what the column HOLDS under the filter the reader has set; the
 * cap is what the list was drawn from, which is the only one of the two that a
 * date range cannot change. The advice clause that used to end this line
 * ("narrow the dates to see the rest") is gone: it was addressed to a reader
 * who had just narrowed, and where a cap was hiding the rows it was advice
 * that could not work.
 */
export function columnLine(c: Pick<ArchiveColumn, 'items' | 'held' | 'cappedAt'>): string | null {
  const shown = Math.min(c.items.length, COLUMN_ROWS)
  const parts: string[] = []
  if (c.held > shown) parts.push(`showing ${shown} of ${c.held}`)
  if (c.cappedAt != null) parts.push(`the ${c.cappedAt} most recent are searched`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function ArchiveRow({ item, last }: { item: ArchiveItem; last: boolean }) {
  const Icon = ICONS[item.icon]
  return (
    <Link
      href={item.href}
      scroll={false}
      data-search={item.search?.toLowerCase()}
      aria-current={item.active ? 'true' : undefined}
      className={cn(
        'group/row -mx-1.5 flex min-h-[48px] items-center gap-2.5 rounded-[4px] px-1.5 transition-colors hover:bg-inner',
        !last && 'border-b border-border/70',
        item.active && 'bg-inner',
      )}
    >
      <Icon className="size-3.5 flex-none text-cat" strokeWidth={1.8} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[12.5px] font-medium text-foreground">{item.title}</span>
        {/* THE META WRAPS RATHER THAN CLIPPING. A built row's meta is the whole
            `readingLine` — "September 2026 (still filling) · read as at 12 Sep
            2026 · PDF" — and `truncate` cut it at "read as at…", which is the
            only place the READING date appears on that row. Two lines, then
            clipped: the stamp beside it is one date and this is the other.

            AND TWO LINES IS NOT ENOUGH BELOW ~1100. The Built column is the
            narrowest of the three (`0.75fr` of a 12-column tile) — about 320px
            at a 1024 viewport — where that same string needs three lines, so
            the clamp cut at "September 2026 (still filling) · read as at…" and
            took the reading date with it. The `28 Sep` stamp beside it is the
            BUILD date, a different fact, so the reading date was unrecoverable
            from the row: the exact loss the clamp was added to prevent, one
            breakpoint down from where it was measured. Three lines holds it at
            every width the archive is drawn at, and a row is 48px high with
            room for them. */}
        {item.meta && (
          <span className={cn('line-clamp-3 font-mono text-[11px]', item.failed ? 'text-negative' : 'text-muted-foreground')}>
            {item.meta}
          </span>
        )}
      </span>
      {item.stamp && (
        <span className="flex-none font-mono text-[11px] tabular-nums text-muted-foreground">{item.stamp}</span>
      )}
    </Link>
  )
}
