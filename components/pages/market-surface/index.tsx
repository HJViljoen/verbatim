import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { ExportMenu, ExportScope } from '@/components/export-menu'
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
import { marketUnlocks } from './unlocks'

// Market — the page (Phase 1 WP14, design §3 MK1–MK7; ported to the artboard,
// Block D wave 2).
//
// THE ORDER IS THE ARGUMENT, and the design says so: "a reader coming to decide
// something meets the conclusions first, the standing advice second, and the
// scoreboard of their own past decisions third". Version 2 had the conclusions
// on one page and the decisions on another and the only thing connecting them
// was the reader's memory.
//
// TWO GRIDS AND A HEADING BETWEEN THEM, which is the artboard's own structure:
// the two full-width readings, then "Your moves" as a bare heading row, then
// the moves grid — the card beside the first move's chart, and under them the
// three narrow cards. The page was five stacked full-width tiles, one block
// each, at about half the artboard's density.
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
// THE METHOD FOOTNOTE IS THE PAGE'S LAST LINE (`MarketSurfaceData.method`,
// `methodLines`), in mono at the artboard's 9.5px. It states what the reading
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
  marketUnlocks,
  marketWays,
]

/** The two full-width readings, above the moves heading. */
const READINGS: readonly Block<MarketSurfaceData>[] = [marketConclusions, marketAdvice]
/** The artboard's moves grid, in its rendered order. */
const MOVES: readonly Block<MarketSurfaceData>[] = [
  marketCard, marketMoves, marketSayHear, marketPlans, marketUnlocks, marketWays,
]

/** Each block's span on the 12-column grid — the artboard's own widths. */
const COLS: Record<string, number> = {
  'market.conclusions': 12,
  'market.advice': 12,
  'market.card': 5,
  'market.moves': 7,
  'market.sayhear': 4,
  'market.plans': 4,
  'market.unlocks': 4,
  'market.ways': 12,
}

/** How tall each block's tile is, in the grid's 116px row units. A block that
 *  grows past its box scrolls with the page (MASTER rule 7). */
const ROWS: Record<string, number> = {
  'market.conclusions': 3,
  'market.advice': 4,
  'market.card': 4,
  'market.moves': 4,
  'market.sayhear': 3,
  'market.plans': 3,
  'market.unlocks': 3,
  'market.ways': 1,
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
  const tile = (block: Block<MarketSurfaceData>) => (
    <Tile
      key={block.key}
      col={COLS[block.key] ?? 12}
      row={ROWS[block.key] ?? 2}
      exportKey={block.key}
      distribute="between"
    >
      {block.render(data, 'app', ctx)}
    </Tile>
  )
  // The masthead's two clauses: the promise, then the limit on it, quiet.
  const [promise, ...rest] = data.masthead.split(/(?<=\.)\s+/)

  return (
    <ExportScope page="market" params={params} tiles={MARKET_BLOCKS.map((b) => ({ key: b.key, title: b.title }))}>
      <PageFrame>
        <SurfacePageBar
          nav="market"
          params={params}
          context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
          record={{ line: data.record.line, lines: data.record.lines }}
        >
          <ExportMenu />
          <HowToRead items={LEGEND} basePath="/dashboard/market" anchor="market" />
        </SurfacePageBar>

        <p className="m-0 max-w-[86ch] font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">
          {promise}{rest.length > 0 ? <> <span className="text-muted-foreground">{rest.join(' ')}</span></> : null}
        </p>

        <PageGrid>{READINGS.map(tile)}</PageGrid>

        <div className="flex items-baseline justify-between gap-3 px-0.5">
          <h2 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">Your moves</h2>
          <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
            {data.moves.rows.length} declared · {data.moves.card ? '1 card waiting' : 'no card'}
          </span>
        </div>

        <PageGrid>{MOVES.map(tile)}</PageGrid>

        {data.method ? (
          <p className="m-0 flex flex-col gap-0.5 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
            {data.method.lines.map((line) => <span key={line}>{line}</span>)}
          </p>
        ) : null}
      </PageFrame>
    </ExportScope>
  )
}
