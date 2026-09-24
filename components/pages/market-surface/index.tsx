import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
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

export const MARKET_BLOCKS: readonly Block<MarketSurfaceData>[] = [
  marketConclusions,
  marketAdvice,
  marketCard,
  marketMoves,
  marketSayHear,
  marketPlans,
  marketWays,
]

/** The two full-width readings, at the top of the page. */
const READINGS: readonly Block<MarketSurfaceData>[] = [marketConclusions, marketAdvice]
/** The artboard's moves grid, in its rendered order. */
const MOVES: readonly Block<MarketSurfaceData>[] = [
  marketCard, marketMoves, marketSayHear, marketPlans, marketWays,
]

/** Each block's span on the 12-column grid — the artboard's own widths. */
const COLS: Record<string, number> = {
  'market.conclusions': 12,
  'market.advice': 12,
  'market.card': 5,
  'market.moves': 7,
  'market.sayhear': 4,
  'market.plans': 4,
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

/** The readings grid as its lines of tile keys: the two full-width readings,
 *  one row each. The moves grid is `MOVES_STACKS` below, then the button
 *  strip across the full width. */
const GRIDS: readonly (readonly (readonly string[])[])[] = [
  [['market.conclusions'], ['market.advice']],
]

/**
 * THE MOVES GRID IS TWO STACKS, NOT TWO ROWS (layout sweep, 2026-09-24).
 *
 * As rows, each line was as tall as its tallest tile: the card (5) stood
 * ~300px beside a ~110px "Your moves" (7), and say-vs-hear (4) and plans (4)
 * left four columns empty beside them once "Not on this page yet" left the
 * page. On Sealand at 1440 that was two blocks of white each taller than a
 * short card, which the layout rule forbids. Stacked, the left column is the
 * card over say-vs-hear and the right is your moves over plans, and the two
 * columns end within a few lines of each other. Below xl the stacks dissolve
 * (`contents`) and `order` keeps the reading order card, moves, say-vs-hear,
 * plans.
 */
export const MOVES_STACKS: readonly { col: number; keys: readonly string[] }[] = [
  { col: 5, keys: ['market.card', 'market.sayhear'] },
  { col: 7, keys: ['market.moves', 'market.plans'] },
]
/** Where each stacked tile sits in the single-column reading order below xl. */
const MOBILE_ORDER: Record<string, string> = {
  'market.card': 'order-1', 'market.moves': 'order-2', 'market.sayhear': 'order-3', 'market.plans': 'order-4',
}
const STACK_SPAN: Record<number, string> = { 5: 'xl:col-span-5', 7: 'xl:col-span-7' }

/**
 * AN ABSENCE IS A LINE, NEVER A CARD (layout sweep 3). With no plan uploaded,
 * "Plans re-checked" was a card whose whole body said nothing had been
 * uploaded; with no claim read, "Say vs hear" was the same. The "Upload a plan"
 * and "Register a claim you make" buttons in "How a move is made" already
 * carry that state and the act that ends it, so the page draws no card.
 */
export function drawnOnMarket(key: string, data: MarketSurfaceData): boolean {
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
        className={startClasses(place)}
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
        context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
        record={{ line: data.record.line, lines: data.record.lines }}
      >
        <HowToRead items={LEGEND} basePath="/dashboard/market" anchor="market" />
      </SurfacePageBar>

      {/* NO MASTHEAD. "We never claim you caused it" is said once per
          forwarded document, in its method sheet, and in Settings › How to
          read; it is cut from the in-app pages (copy de-clutter L6). */}

      <PageGrid>{READINGS.map(tile)}</PageGrid>

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
        {MOVES.filter((b) => !MOVES_STACKS.some((st) => st.keys.includes(b.key))).map((block) => (
          <Tile key={block.key} col={COLS[block.key] ?? 12} row={1} className="order-5 xl:order-none" distribute="between">
            {block.render(data, 'app', ctx)}
          </Tile>
        ))}
      </PageGrid>

      {/* No method footnote: soundness lives in the page bar's "How sound is
          this" pill and its record modal (copy de-clutter ruling B). The
          privacy line is legal, not method, and stays. */}
      {data.method ? (
        <p className="m-0 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{data.method.privacy}</p>
      ) : null}
    </PageFrame>
  )
}
