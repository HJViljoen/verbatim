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
  marketUnlocks,
  marketWays,
]

/** The two full-width readings, at the top of the page. */
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
  'market.advice': 5,
  'market.card': 5,
  'market.moves': 5,
  'market.sayhear': 3,
  'market.plans': 5,
  'market.unlocks': 3,
  'market.ways': 2,
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
      distribute="between"
    >
      {block.render(data, 'app', ctx)}
    </Tile>
  )
  // The masthead's two clauses: the promise, then the limit on it, quiet.
  const [promise, ...rest] = data.masthead.split(/(?<=\.)\s+/)

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

      <p className="m-0 max-w-[86ch] font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">
        {promise}{rest.length > 0 ? <> <span className="text-muted-foreground">{rest.join(' ')}</span></> : null}
      </p>

      <PageGrid>{READINGS.map(tile)}</PageGrid>

      <PageGrid>{MOVES.map(tile)}</PageGrid>

      {data.method ? (
        <p className="m-0 flex flex-col gap-0.5 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
          {data.method.lines.map((line) => <span key={line}>{line}</span>)}
        </p>
      ) : null}
    </PageFrame>
  )
}
