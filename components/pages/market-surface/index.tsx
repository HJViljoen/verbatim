import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { barContext } from '@/lib/shell/bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { GlossaryKey } from '@/lib/calibration'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import { marketConclusions } from './conclusions'
import { marketAdvice } from './advice'
import { marketCard } from './card'
import { marketMoves } from './moves'
import { marketSayHear } from './sayhear'
import { marketPlans } from './plans'
import { marketWays } from './ways'
import { marketQuestions } from './questions'
import { marketLine } from './line'
import { DateMove } from './date-move'
import { canDate } from '@/lib/pages/date-move'

// Market — the page (Phase 1 WP14, design §3 MK1–MK7; ported to the artboard,
// Block D wave 2).
//
// THE ORDER IS THE ARGUMENT, and the design says so: "a reader coming to decide
// something meets the conclusions first, the standing advice second, and the
// scoreboard of their own past decisions third". Version 2 had the conclusions
// on one page and the decisions on another and the only thing connecting them
// was the reader's memory.
//
// TWO GRIDS, WHICH IS THE ARTBOARD'S OWN STRUCTURE: the two full-width
// readings, then the moves grid — the card beside the first move's chart, and
// under them the three narrow cards. The page was five stacked full-width
// tiles, one block each, at about half the artboard's density.
//
// THE ARTBOARD'S BARE "YOUR MOVES" HEADING ROW IS NOT DRAWN, because the block
// beneath it wears the same words and the same meta: the page printed "Your
// moves · 1 declared · 1 card waiting" twice, eight pixels apart. The heading
// is `market.moves`'s own, where a reader can also see which tile it names.
//
// THE MASTHEAD IS ONE CODE-WRITTEN LINE, printed once under the page bar and
// never inside a block: it is the sentence that keeps every line under it from
// reading as a causal claim, and a sentence repeated eight times is a sentence
// nobody reads. The artboard sets it as the page's hero lead — serif 17/500,
// -0.005em, the second clause quiet, capped at 86ch — where the build printed
// it at 12px, wholly muted, in the sans. It is a bare paragraph rather than a
// `Tile variant="hero"` because the artboard draws no card around it: it sits
// between the page bar and the first section, on the page's own ground.
//
// THERE IS NO EXPORT CONTROL ON THIS SURFACE, AND THAT IS THE HONEST STATE.
// The port mounted `ExportScope page="market"` with every new block key on it,
// and the page KEY `market` resolves to the LEGACY module
// (`components/pages/registry.ts` → `components/pages/market/index.tsx`, parked
// at /dashboard/market-intel), whose renderables are `market.shortRead ·
// market.news · market.rail · market.list · market.detail`. So "Export this
// tile" answered 400 "Unknown tile." on all eight of this page's tiles, and
// "Export this page" quietly rendered a PDF of Market Intelligence — a
// different page's content, under its own title. A silent wrong artefact is
// worse than the error beside it.
//
// The control comes back the day a block surface has an export path of its own:
// a `PageModule` over `MARKET_BLOCKS` under its own `PageKey`, which is
// `lib/renderables/types.ts` + `components/pages/registry.ts` — the record
// package's files, and a stored contract (`report_snapshots.ref.page`) that no
// port may spend on its own. Every other Phase 1 block surface (Overview,
// Subjects, Voice, Competitive, This week) mounts none either, so this is the
// surfaces agreeing rather than Market alone. `index.test.tsx` holds the
// tripwire: the day those keys resolve, the test fails and says to re-mount it.
//
// THE METHOD FOOTNOTE IS THE PAGE'S LAST LINE (`MarketSurfaceData.method`,
// `methodLines`), in mono at the system's smallest step (10.5px) rather than
// the artboard's 9.5. MASTER's density tokens stop at 10.5 (eyebrow) / 11
// (meta) / 13 (body), and six lines of the page's most load-bearing
// qualifications — the translation coverage, the Reddit cap, the privacy line
// — were set below the floor the rest of the product keeps. The artboard's
// 9.5px is the one place its type ramp goes under the system's, and a
// qualification nobody can read qualifies nothing. It states what the reading
// stands on — who it was prepared for, what was read, on which basis, the
// Reddit cap and the privacy line. It does NOT carry a refusal count: the
// artboard's "comparisons refused: 2" is the record's figure, printed in the
// record drawer at the top of the page where it is computed, and a second
// rendering of it down here would be a number with no shown derivation.

// WP3.6 (market-first, plan §2.6): THE PAGE IS REBUILT IN THE PREVIEW'S ORDER.
// Questions to answer first (Y1, new), then the advice with the current
// recommendation leading (Y2), what you say and what your market says back
// (Y3), your moves beside the month's card (Y4), what we concluded (Y5), the
// plans (Y6) and, last and unchanged, how a move is made. Every header is its
// title alone and every footer a link alone (25 Sep rulings), which
// `index.test.tsx` sweeps on this page's own blocks.
//
// WP3.6 WAVE 2: "In one line" (the preview's hero) leads the page, over the
// questions whose three largest it names.
export const MARKET_BLOCKS: readonly Block<MarketSurfaceData>[] = [
  marketLine,
  marketQuestions,
  marketAdvice,
  marketSayHear,
  marketMoves,
  marketCard,
  marketConclusions,
  marketPlans,
  marketWays,
]

/** The full-width readings at the top of the page. */
const READINGS: readonly Block<MarketSurfaceData>[] = [marketLine, marketQuestions, marketAdvice, marketSayHear]
/** The pair under them: your moves beside the month's card. */
const MOVES: readonly Block<MarketSurfaceData>[] = [marketMoves, marketCard]
/** The full-width tail. */
const TAIL: readonly Block<MarketSurfaceData>[] = [marketConclusions, marketPlans, marketWays]

/** Each block's span on the 12-column grid — the preview's widths. */
const COLS: Record<string, number> = {
  'market.line': 12,
  'market.questions': 12,
  'market.advice': 12,
  'market.sayhear': 12,
  'market.moves': 6,
  'market.card': 6,
  'market.conclusions': 12,
  'market.plans': 12,
  'market.ways': 12,
}

// ── where each tile starts, and why none of them is given a height ──────────
//
// A TILE IS AS TALL AS WHAT IT DRAWS (2026-09-24). This page used to estimate
// every block's height in px from its data — rows, claims, readings — and turn
// the estimate into a row span, because `PageGrid`'s rows were a fixed 116px
// and a span was both the tile's ceiling and its floor. The estimate could only
// be wrong in two directions and production found both: the conclusions tile
// ran past its box and its last row ("1 below the bar this update") sat under
// the next section's heading, and the ledger — twelve rows estimated, a handful
// drawn — ended 600px above the bottom of its own white card. `PageGrid`'s rows
// are now `minmax(116px, auto)`, so a tile claims ONE row unit as its floor and
// the row grows to its content; there is nothing left to estimate.
//
// EACH LINE IS ONE GRID ROW, WITH ITS START PINNED. Tiles named on one line
// share that row, so they begin level; the row is as tall as the tallest of
// them and the next line starts under it, so nothing can run into anything.
// They do NOT end level: the moves grid is `xl:items-start`, because this page
// already chose a ragged bottom edge over white inside a card (Sealand at 1440:
// stretched to Plans re-checked, "Not on this page yet" would be 658px around
// 190px of ink). The start stays explicit so a line whose spans do not fill
// twelve columns can never have a later tile flowed up into it.

/** The grids as their lines of tile keys: the four full-width readings, one
 *  row each, then the tail's three. The moves pair is `MOVES_STACKS`. */
const GRIDS: readonly (readonly (readonly string[])[])[] = [
  [['market.line'], ['market.questions'], ['market.advice'], ['market.sayhear']],
  [['market.conclusions'], ['market.plans'], ['market.ways']],
]

/**
 * THE MOVES PAIR IS TWO STACKS, NOT ONE ROW (layout sweep, 2026-09-24): your
 * moves and the month's card side by side from xl, each as tall as it draws
 * (`xl:items-start`), stacked in reading order below xl.
 */
export const MOVES_STACKS: readonly { col: number; keys: readonly string[] }[] = [
  { col: 6, keys: ['market.moves'] },
  { col: 6, keys: ['market.card'] },
]
/** Where each stacked tile sits in the single-column reading order below xl. */
const MOBILE_ORDER: Record<string, string> = { 'market.moves': 'order-1', 'market.card': 'order-2' }
const STACK_SPAN: Record<number, string> = { 5: 'xl:col-span-5', 6: 'xl:col-span-6', 7: 'xl:col-span-7' }

/**
 * AN ABSENCE IS A LINE, NEVER A CARD (layout sweep 3). With no plan uploaded,
 * "Plans re-checked" was a card whose whole body said nothing had been
 * uploaded; with no claim read, "Say vs hear" was the same. The "Upload a plan"
 * and "Register a claim you make" buttons in "How a move is made" already
 * carry that state and the act that ends it, so the page draws no card.
 */
export function drawnOnMarket(key: string, data: MarketSurfaceData): boolean {
  // A copy stored before Y1 has no questions, so no line to draw from them.
  if (key === 'market.line') return data.questions != null
  if (key === 'market.plans') return data.plans.length > 0
  if (key === 'market.sayhear') return data.ways.claims.length > 0
  return true
}

/** The grid lines of the moves grid, kept exported-shaped for the test that
 *  reads which tiles sit beside which. */
export const GRID_ROWS: readonly (readonly string[])[] = GRIDS.flat()

/** Where a tile sits and how big it is: the artboard's column, the column it
 *  starts in, the rows it claims as a FLOOR (always one — the grid sizes it to
 *  its content), and the row its line sits on. Exported so the rule is
 *  testable without a browser. */
export interface TilePlacement { col: number; colStart: number; row: number; rowStart: number }

export function tileGrid(): Record<string, TilePlacement> {
  const out: Record<string, TilePlacement> = {}
  for (const grid of GRIDS) {
    grid.forEach((line, i) => {
      let colStart = 1
      for (const key of line) {
        const col = COLS[key] ?? 12
        // One row unit: the floor. The row grows to whatever the tile draws.
        out[key] = { col, colStart, row: 1, rowStart: i + 1 }
        colStart += col
      }
    })
  }
  return out
}

// THE START CLASSES ARE WRITTEN OUT IN FULL, never interpolated, so Tailwind
// v4's scanner sees them — the rule `components/shell/tile.tsx` follows for its
// own span maps. A row start is the LINE's index, so three are all a grid of
// this page's lines uses.
const COL_START: Record<number, string> = {
  1: 'xl:col-start-1', 2: 'xl:col-start-2', 3: 'xl:col-start-3', 4: 'xl:col-start-4',
  5: 'xl:col-start-5', 6: 'xl:col-start-6', 7: 'xl:col-start-7', 8: 'xl:col-start-8',
  9: 'xl:col-start-9', 10: 'xl:col-start-10', 11: 'xl:col-start-11', 12: 'xl:col-start-12',
}
const ROW_START: Record<number, string> = {
  1: 'xl:row-start-1', 2: 'xl:row-start-2', 3: 'xl:row-start-3', 4: 'xl:row-start-4',
  5: 'xl:row-start-5', 6: 'xl:row-start-6', 7: 'xl:row-start-7', 8: 'xl:row-start-8',
  9: 'xl:row-start-9', 10: 'xl:row-start-10', 11: 'xl:row-start-11', 12: 'xl:row-start-12',
}

/** The two start classes for one tile — nothing below xl, where the page is a
 *  single stacked column and a pinned column would make one. */
export function startClasses(place: TilePlacement): string {
  return `${COL_START[place.colStart] ?? 'xl:col-start-1'} ${ROW_START[place.rowStart] ?? 'xl:row-start-auto'}`
}

/** The words this page is measured against, for "How to read this page". Every
 *  one of them is printed somewhere on it. */
const LEGEND: GlossaryKey[] = ['update', 'month', 'video', 'audience', 'subject', 'theme', 'move', 'level', 'change']

/** The app's context: RELATIVE links, so `next/link` navigates on the client
 *  instead of reloading the application to reach its own next page. */
export function marketContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

export function MarketSurfacePage({
  data,
  params = {},
}: {
  data: MarketSurfaceData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="market" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. Conclusions and advice land with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = marketContext(params)
  const grid = tileGrid()
  const tile = (block: Block<MarketSurfaceData>) => {
    const place = grid[block.key] ?? { col: COLS[block.key] ?? 12, colStart: 1, row: 1, rowStart: 1 }
    return (
      <Tile
        key={block.key}
        col={place.col}
        row={place.row}
        // EVERY LINE IS ONE FULL-WIDTH TILE since WP3.6, so nothing is
        // pinned: a pinned row start over a line that is not drawn (no plan,
        // no claim) would open an empty 116px row.
        className={place.col < 12 ? startClasses(place) : undefined}
        distribute="between"
      >
        {block.render(data, 'app', ctx)}
      </Tile>
    )
  }

  return (
    <PageFrame>
      <SurfacePageBar
        nav="market"
        params={params}
        context={barContext(data)}
      >
        <HowToRead items={LEGEND} basePath="/dashboard/market" anchor="market" />
        {/* The preview's green "Date a move" in the bar (WP3.6 wave 2), the
            same sheet as the one under Your moves; from sm up, where the bar
            has the room beside the title. */}
        {canDate(data.moves.dating) ? <DateMove dating={data.moves.dating} place="bar" /> : null}
      </SurfacePageBar>

      {/* NO MASTHEAD. "We never claim you caused it" is said once per
          forwarded document, in its method sheet, and in Settings › How to
          read; it is cut from the in-app pages (copy de-clutter L6). */}

      <PageGrid>{READINGS.filter((b) => drawnOnMarket(b.key, data)).map(tile)}</PageGrid>

      <PageGrid className="xl:items-start">
        {MOVES_STACKS.map((stack) => (
          <div key={stack.keys.join()} className={`contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4 ${STACK_SPAN[stack.col]}`}>
            {stack.keys.map((key) => {
              const block = MOVES.find((b) => b.key === key)
              if (!block || !drawnOnMarket(key, data)) return null
              return (
                <Tile key={block.key} col={12} row={1} className={`${MOBILE_ORDER[key] ?? ''} xl:order-none`} distribute="between">
                  {block.render(data, 'app', ctx)}
                </Tile>
              )
            })}
          </div>
        ))}
      </PageGrid>

      <PageGrid>{TAIL.filter((b) => drawnOnMarket(b.key, data)).map(tile)}</PageGrid>

      {/* No method footnote (copy de-clutter ruling B; the 25 Sep rulings put
          no explanatory footnote under a block). The record is Settings'; the
          "How sound is this" pill that once opened it left every page with the
          25 Sep rulings. The privacy line is legal, not method, and stays. */}
      {data.method ? (
        <p className="m-0 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{data.method.privacy}</p>
      ) : null}
    </PageFrame>
  )
}
