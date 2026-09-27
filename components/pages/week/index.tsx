import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext, figureCount } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { GlossaryKey } from '@/lib/calibration'
import type { WeekData } from '@/lib/pages/week'
import { weekUnusual } from './unusual'
import { weekReply } from './reply'
import { weekSubjects } from './subjects'
import { weekRising } from './rising'
import { WEEK_ANCHORS, weekCameIn } from './came-in'
import { weekHeard } from './heard'
import { weekWeeks } from './weeks'
import { weekRivalPosts } from './rival-posts'
import { weekFlagged } from './flagged'
import { weekSales } from './sales'
import { weekWorked } from './worked'
import { weekCoverage } from './coverage'
import { weekChecks } from './checks'

// This week — the page (market-first WP3.7; the approved preview's This week,
// `ThisWeek.dc.html`).
//
// NINE TILES IN THE PREVIEW'S ORDER: what this update brought into the market
// ("With this update"), week by week, the themes heard for the first time,
// your market's subjects beside what stood between buyers and a yes, the
// replies worth making, what worked, what the brands you track posted, and the
// three checks on the update. Every block's header is its title alone and its
// footer links alone, and nothing sits under a block or under the page (25 Sep
// rulings: the coverage line and the reading layer's caveats are How to read's
// and Settings › What we changed's).
//
// NO HORIZON, NO SOUNDNESS BAND. `Surface.bar` is `'week'` (lib/nav.ts): the
// page is dated by the update, and its bar names the update and the comment
// window in its one line.

export const WEEK_BLOCKS: readonly Block<WeekData>[] = [
  weekCameIn,
  weekWeeks,
  weekHeard,
  weekSubjects,
  weekSales,
  weekReply,
  weekWorked,
  weekRivalPosts,
  weekChecks,
]

/**
 * The page's earlier tiles, retired by WP3.7 and kept only so an export stored
 * before it still resolves its keys (`module.ts`): "Unusual this week",
 * "Moving now" and "Flagged for awareness" are columns of "Checks on this
 * update" now, and the coverage footnote is gone (25 Sep rulings).
 */
export const WEEK_RETIRED_BLOCKS: readonly Block<WeekData>[] = [weekUnusual, weekRising, weekFlagged, weekCoverage]

/**
 * What the reader meets before scrolling: the page bar and "With this update"
 * (the preview's first screen). The budget is asserted over it.
 */
export const FIRST_SCREEN: readonly Block<WeekData>[] = [weekCameIn]

/** The words this page's legend explains — the update, the week, the month it
 *  is stated against, and the three that make a figure readable. Every one is
 *  a GLOSSARY entry (lib/calibration.ts), never copy written here. */
export const WEEK_LEGEND: GlossaryKey[] = ['update', 'week', 'month', 'video', 'audience', 'level', 'change', 'direction']

/** How wide each block's tile is, on the grid's twelve columns: the preview's
 *  one pair, your market's subjects beside For sales, half and half; every
 *  other tile full width. */
const COLS: Record<string, 6 | 12> = {
  'week.subjects': 6,
  'week.sales': 6,
}

/** The tiles the first block's anchors jump to. */
const ANCHOR: Record<string, string> = {
  'week.weeks': WEEK_ANCHORS.weeks,
  'week.heard': WEEK_ANCHORS.heard,
  'week.reply': WEEK_ANCHORS.reply,
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
              No update has been delivered for this workspace yet.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = weekContext(params)
  return (
    // THE EXPORT SCOPE NAMES THE TILES, so the per-tile control and the page
    // export address exactly the keys the block list above declares.
    <ExportScope page="week" params={params} tiles={WEEK_BLOCKS.map((b) => ({ key: b.key, title: b.title }))}>
      <PageFrame className="gap-6">
        <SurfacePageBar
          nav="week"
          params={params}
          brand={data.brand}
          // THE ONE LINE, THIS WEEK'S FORM (25 Sep rulings, item 2): the slot
          // names the update, and the line names the comment window in place of
          // "as at" — "The 20 Sep update · comments written 10 to 20 Sep · next
          // update Sun 27 Sep". The brand leads it; the update's own size was a
          // second line at the bar's right-hand end and is not the ruled bar.
          updates={{
            update: data.update.date,
            window: data.window ? { from: data.window.from, to: data.window.to } : null,
            nextUpdate: data.nextUpdate ?? null,
            paused: data.paused ?? false,
          }}
        >
          {/* EXPORT ALONE AT THE RIGHT-HAND END, the preview's 40px button, as
              on Your market (deploy 5): no "How to read this page" pill; Week
              by week's footer and Settings › How to read keep the words. */}
          <ExportMenu variant="button" />
        </SurfacePageBar>
        {/* THE PREVIEW'S RHYTHM: 24px between tiles, each block drawing its
            own 32px inset (`flush` here, `roomy` on the block's frame). A
            paired tile is as tall as what it draws (`self-start`), its footer
            under its content, the pair sharing its top edge, as the front
            page's pairs do. */}
        <PageGrid className="gap-6 xl:auto-rows-auto">
          {WEEK_BLOCKS.map((block) => {
            const col = COLS[block.key] ?? 12
            return (
              <Tile
                key={block.key}
                col={col}
                row={1}
                flush
                exportKey={block.key}
                className={col < 12 ? 'xl:row-span-1 xl:self-start' : 'xl:row-span-1'}
                bodyClassName="[&>section]:min-h-0 [&>section]:flex-1"
                distribute="between"
              >
                {ANCHOR[block.key] ? <span id={ANCHOR[block.key]} aria-hidden className="block scroll-mt-6" /> : null}
                {block.render(data, 'app', ctx)}
              </Tile>
            )
          })}
        </PageGrid>
      </PageFrame>
    </ExportScope>
  )
}
