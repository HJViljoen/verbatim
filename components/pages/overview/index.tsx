import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { OverviewData } from '@/lib/pages/overview'
import { sentLineForToken } from '@/lib/pages/overview'
import { overviewBar } from './bar'
import { overviewSentence } from './sentence'
import { overviewSubjects } from './subjects'
import { overviewCategory } from './category'
import { overviewRivals } from './rivals'
import { overviewMoves } from './moves'
import { overviewRecord } from './record'

// Overview — the page (Phase 1 WP11, design §3 OV0–OV6).
//
// SEVEN BLOCKS IN THE MONTHLY REPORT'S ORDER, and that order is the point: the
// page and the artefact are the same reading, so a reader who has seen one has
// seen the other. Each block links onward to the page that carries it in full.

export const OVERVIEW_BLOCKS: readonly Block<OverviewData>[] = [
  overviewBar,
  overviewSentence,
  overviewSubjects,
  overviewCategory,
  overviewRivals,
  overviewMoves,
  overviewRecord,
]

/** How tall each block's tile is, in the grid's 116px row units. A block that
 *  grows past its box scrolls with the page — the one-screen rule retired in
 *  2026-08 (MASTER rule 7). */
const ROWS: Record<string, number> = {
  'overview.bar': 1,
  'overview.sentence': 4,
  'overview.subjects': 3,
  'overview.category': 5,
  'overview.rivals': 3,
  'overview.moves': 2,
  'overview.record': 2,
}

/**
 * The app's context: RELATIVE links.
 *
 * `ctx.appUrl` is an absolute origin everywhere a link leaves the app — a PDF,
 * an email — and the empty string in the app itself, so `next/link` gets
 * `/dashboard/market` and navigates on the client instead of reloading the
 * whole application to reach its own next page.
 */
export function overviewContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

export function OverviewPage({
  data,
  params = {},
}: {
  data: OverviewData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="overview" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. The first monthly reading lands with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = overviewContext(params)
  return (
    <PageFrame>
      <SurfacePageBar
        nav="overview"
        params={params}
        context={{
          brand: data.brand,
          month: data.month,
          status: data.monthStatus,
          readingAt: data.readingAt,
          // WHAT THE LAST REPORT READ (WP18, item 13). The month's own size is
          // the figure the bar is about, so it is the one the bar quotes; null
          // — and printed as nothing — where nothing was sent, where it has not
          // moved, or where the month had already closed when it went out.
          sent: sentLineForToken(data.sent, 'month_videos', data.bar.videos),
        }}
        record={{ line: data.record.line, lines: data.record.lines }}
      />
      <PageGrid>
        {OVERVIEW_BLOCKS.map((block) => (
          <Tile key={block.key} col={12} row={ROWS[block.key] ?? 2}>
            {block.render(data, 'app', ctx)}
          </Tile>
        ))}
      </PageGrid>
      {data.notes.length > 0 ? (
        <p className="m-0 text-[11px] text-muted-foreground">
          {/* ONE CAVEAT FOR A RUN OF MONTHS, never one per bar: the reading
              layer merges the series' notes by the union of their months and
              re-words the sentence from it (lib/reading/series.ts
              mergeSeriesNotes). */}
          {data.notes.map((n) => n.text).join(' ')}
        </p>
      ) : null}
    </PageFrame>
  )
}
