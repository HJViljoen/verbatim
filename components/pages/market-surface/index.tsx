import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import { marketConclusions } from './conclusions'
import { marketAdvice } from './advice'
import { marketMoves } from './moves'
import { marketWays } from './ways'
import { marketUnlocks } from './unlocks'

// Market — the page (Phase 1 WP14, design §3 MK1–MK7).
//
// THE ORDER IS THE ARGUMENT, and the design says so: "a reader coming to decide
// something meets the conclusions first, the standing advice second, and the
// scoreboard of their own past decisions third". Version 2 had the conclusions
// on one page and the decisions on another and the only thing connecting them
// was the reader's memory.
//
// THE MASTHEAD IS ONE CODE-WRITTEN LINE, printed once under the page bar and
// never inside a block: it is the sentence that keeps every line under it from
// reading as a causal claim, and a sentence repeated five times is a sentence
// nobody reads.

export const MARKET_BLOCKS: readonly Block<MarketSurfaceData>[] = [
  marketConclusions,
  marketAdvice,
  marketMoves,
  marketWays,
  marketUnlocks,
]

/** How tall each block's tile is, in the grid's 116px row units. A block that
 *  grows past its box scrolls with the page (MASTER rule 7). */
const ROWS: Record<string, number> = {
  'market.conclusions': 5,
  'market.advice': 4,
  'market.moves': 2,
  'market.ways': 4,
  'market.unlocks': 2,
}

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
  return (
    <PageFrame>
      <SurfacePageBar
        nav="market"
        params={params}
        context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
        record={{ line: data.record.line, lines: data.record.lines }}
      />
      <p className="m-0 text-[12px] text-muted-foreground">{data.masthead}</p>
      <PageGrid>
        {MARKET_BLOCKS.map((block) => (
          <Tile key={block.key} col={12} row={ROWS[block.key] ?? 2}>
            {block.render(data, 'app', ctx)}
          </Tile>
        ))}
      </PageGrid>
    </PageFrame>
  )
}
