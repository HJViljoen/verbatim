import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext, figureCount } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { WeekData } from '@/lib/pages/week'
import { weekUnusual } from './unusual'
import { weekSubjects } from './subjects'
import { weekRising } from './rising'
import { weekCameIn } from './came-in'
import { weekSales } from './sales'
import { weekWorked } from './worked'
import { weekCoverage } from './coverage'

// This week — the page (Phase 1 WP15, decision P; the mock's ThisWeek.dc.html).
//
// SEVEN BLOCKS IN THE WEEKLY REPORT'S ORDER, for the reason Overview's seven
// are in the monthly report's: the page and the artefact are the same reading,
// so a reader who has seen one has seen the other, and WP17 arranges these same
// keys rather than writing its own sections.
//
// NO HORIZON, NO SOUNDNESS BAND. `Surface.bar` is `'week'` (lib/nav.ts), which
// is what gates both controls. A horizon on a page dated by the update would
// offer windows the page does not read; a "how sound is this" band counting
// months would be a fact about a period this page is not about. The bar carries
// the two updates it compares and the videos the newer one covered, exactly as
// the mock draws it.

export const WEEK_BLOCKS: readonly Block<WeekData>[] = [
  weekUnusual,
  weekSubjects,
  weekRising,
  weekCameIn,
  weekSales,
  weekWorked,
  weekCoverage,
]

/**
 * What the reader meets before scrolling: the page bar and §1.
 *
 * The mock's first 900px of 2,364 is exactly this, and the budget below is
 * asserted over it — not over the page, which is a different promise. §1 is
 * also the block that declares the bar's own figure, because the bar's "205
 * videos this update" and §1's n are one number.
 */
export const FIRST_SCREEN: readonly Block<WeekData>[] = [weekUnusual]

/** How tall each block's tile is, in the grid's 116px row units. */
const ROWS: Record<string, number> = {
  'week.unusual': 4,
  'week.subjects': 3,
  'week.rising': 3,
  'week.came-in': 4,
  'week.sales': 4,
  'week.worked': 3,
  'week.coverage': 1,
}

/** The app's context: RELATIVE links, so `next/link` navigates on the client
 *  rather than reloading the application to reach its own next page. */
export function weekContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/** The distinct numbers a set of blocks puts in front of a reader. Exported so
 *  the budget test counts what the page counts. */
export function weekFigureCount(data: WeekData, blocks: readonly Block<WeekData>[] = FIRST_SCREEN): number {
  return figureCount(blocks.map((b) => b.figures?.(data) ?? {}))
}

export function WeekPage({
  data,
  params = {},
}: {
  data: WeekData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="week" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              No update has been delivered for this workspace yet. This week reads the last one, so it has nothing to read.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = weekContext(params)
  return (
    <PageFrame>
      <SurfacePageBar
        nav="week"
        params={params}
        updates={{ update: data.update.date, previous: data.update.previous }}
      >
        {/* The brand and the update's own size, where the mock puts them — in
            the bar's own line rather than on a block, because they are what the
            page is a reading OF and not part of any one answer. */}
        <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {data.brand}
          {data.windowVideos != null ? ` · ${fmtInt(data.windowVideos)} videos this update` : ''}
        </span>
      </SurfacePageBar>
      <PageGrid>
        {WEEK_BLOCKS.map((block) => (
          <Tile key={block.key} col={12} row={ROWS[block.key] ?? 2}>
            {block.render(data, 'app', ctx)}
          </Tile>
        ))}
      </PageGrid>
    </PageFrame>
  )
}
