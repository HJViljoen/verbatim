import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext, figureCount } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { HowToRead } from '@/components/how-to-read'
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
import { weekCameIn } from './came-in'
import { weekRivalPosts } from './rival-posts'
import { weekFlagged } from './flagged'
import { weekSales } from './sales'
import { weekWorked } from './worked'
import { weekCoverage } from './coverage'

// This week — the page (Phase 1 WP15, decision P; the mock's ThisWeek.dc.html).
//
// TEN BLOCKS IN THE ARTBOARD'S ORDER (Block D wave 2, E-week). Until this port
// they were seven in the weekly report's order, on the reasoning that the page
// and the artefact are the same reading. Two things changed: the artboard's own
// nine tiles are what the page must become ("the mock is the spec"), and two of
// its nine — the reply inbox and the awareness flag — MOVED here from the
// Content page, which is where `LATER_LINE` always said they would go. The
// weekly report arranges its own keys (components/blocks/weekly) and is
// unaffected by this order; nothing outside this file reads it.
//
// NO HORIZON, NO SOUNDNESS BAND. `Surface.bar` is `'week'` (lib/nav.ts), which
// is what gates both controls. A horizon on a page dated by the update would
// offer windows the page does not read; a "how sound is this" band counting
// months would be a fact about a period this page is not about. The bar carries
// the two updates it compares and the videos the newer one covered, exactly as
// the mock draws it.

export const WEEK_BLOCKS: readonly Block<WeekData>[] = [
  weekUnusual,
  weekReply,
  weekSubjects,
  weekCameIn,
  weekRivalPosts,
  weekWorked,
  weekSales,
  weekFlagged,
  weekRising,
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

/** The words this page's legend explains — the update, the week, the month it
 *  is stated against, and the three that make a figure readable. Every one is
 *  a GLOSSARY entry (lib/calibration.ts), never copy written here. */
export const WEEK_LEGEND: GlossaryKey[] = ['update', 'week', 'month', 'video', 'audience', 'level', 'change', 'direction']

/** How wide each block's tile is, on the grid's twelve columns — the mock's
 *  own spans: everything full-width except the span-5 / span-7 pair. */
const COLS: Record<string, number> = {
  'week.worked': 5,
  'week.sales': 7,
}

/** How tall each block's tile is, in the grid's 116px row units — the height a
 *  FULL one needs.
 *
 *  GENEROUS BY DESIGN. A tile is `overflow-hidden` and its span is fixed, so a
 *  block whose content outgrows its span is CLIPPED — and the degraded arms are
 *  not the short ones: Sealand carries three rival rows where Össur carries
 *  one, and a refusal sentence is longer than the figure it replaces. Every
 *  span below was set against the TALLEST of the three fixtures at 1440. */
const ROWS: Record<string, number> = {
  'week.unusual': 4,
  'week.reply': 4,
  'week.subjects': 3,
  'week.came-in': 5,
  'week.rival-posts': 3,
  'week.worked': 4,
  'week.sales': 4,
  'week.flagged': 2,
  'week.rising': 3,
  'week.coverage': 1,
}

/** What a tile is worth when its block has nothing to draw. */
const EMPTY_ROWS: Record<string, number> = {
  'week.reply': 2,
  'week.subjects': 2,
  'week.rival-posts': 2,
  'week.worked': 3,
  'week.sales': 3,
  'week.flagged': 1,
  'week.rising': 2,
}

/**
 * The height this tile needs for THIS reading.
 *
 * A TILE KEEPS ITS SIZE AND THE GRID NEVER COLLAPSES — that is the shell's own
 * rule and it stays: a block with nothing to say prints a sentence at the size
 * it would have been, so the page does not reshuffle between updates. What it
 * does not have to keep is the height of the rows it DOES NOT HAVE: on Sealand
 * today five of these ten blocks print one sentence each, and at the full span
 * that is 1,400px of white the artboard does not have. So a block that is
 * standing on its empty state takes the shorter span, and one with rows takes
 * the height its rows need.
 *
 * `emptyState` IS THE TEST, not a count of rows, because it is the block's own
 * answer to "have I anything to draw" and it is computed without rendering
 * (lib/blocks/types.ts). A block that returns a sentence AND draws rows — §1
 * with a refusal and its series, §4 with no videos and its new themes — is not
 * empty, and the two that do that are excluded here rather than guessed at.
 */
function tileRows(key: string, data: WeekData): number {
  const full = ROWS[key] ?? 2
  const short = EMPTY_ROWS[key]
  if (short == null) return full
  const block = WEEK_BLOCKS.find((b) => b.key === key)
  const empty = block?.emptyState(data) ?? null
  if (empty == null) return full
  // §5 draws its table under its own empty sentence when a rival is tracked
  // and silent, so it is short only when there is no rival at all.
  if (key === 'week.rival-posts' && data.cameIn.rivals.length > 0) return full
  return short
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

/**
 * The right-hand end of the page bar: who this is a reading of, and how big
 * the update was.
 *
 * THE VIDEO COUNT IS NULL UNTIL M3 AND SAYS SO. `windowVideos` comes off
 * `loadWindowReading`, which is installed on neither tenant today, and the
 * mock's "312 videos this week" then has nothing behind it. A line that simply
 * stopped after the brand would read as a smaller update rather than as an
 * absent reading.
 */
function BarContext({ data }: { data: WeekData }) {
  return (
    <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground">
      {data.brand}
      {data.windowVideos != null
        ? ` · ${fmtInt(data.windowVideos)} videos this update`
        : ' · this update’s videos are not counted here yet'}
    </span>
  )
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
    // THE EXPORT SCOPE NAMES THE TILES, so the per-tile control and the page
    // export address exactly the keys the block list above declares.
    <ExportScope page="week" params={params} tiles={WEEK_BLOCKS.map((b) => ({ key: b.key, title: b.title }))}>
      <PageFrame>
        <SurfacePageBar
          nav="week"
          params={params}
          updates={{ update: data.update.date, previous: data.update.previous }}
        >
          {/* The brand and the update's own size, where the mock puts them — in
              the bar's own line rather than on a block, because they are what
              the page is a reading OF and not part of any one answer. */}
          <BarContext data={data} />
          <HowToRead items={WEEK_LEGEND} basePath="/dashboard/week" anchor="week" />
          <ExportMenu />
        </SurfacePageBar>
        <PageGrid>
          {WEEK_BLOCKS.map((block) => (
            <Tile key={block.key} col={COLS[block.key] ?? 12} row={tileRows(block.key, data)}>
              {block.render(data, 'app', ctx)}
            </Tile>
          ))}
        </PageGrid>
        {data.notes.length > 0 ? (
          <p className="m-0 text-[11px] text-muted-foreground">
            {/* THE READING LAYER'S OWN CAVEATS, ONCE FOR THE PAGE. §1 pools three
                months into a baseline and §3 pools three into a comparison, and
                neither is like-for-like across a stretch whose grouping was never
                recorded. `mergeSeriesNotes` collapses a run of months into ONE
                sentence rather than one per bar (the Block A convention), and
                Overview prints its own the same way. */}
            {data.notes.map((n) => n.text).join(' ')}
          </p>
        ) : null}
      </PageFrame>
    </ExportScope>
  )
}
