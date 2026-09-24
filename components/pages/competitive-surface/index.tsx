import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { GlossaryKey } from '@/lib/calibration'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { competitiveRivals } from './rivals'
import { competitiveStandings } from './standings'
import { competitiveHeadToHead } from './head-to-head'
import { competitiveOwnClaims } from './own-claims'
import { competitiveSaidAbout } from './said-about'
import { competitiveQuestions } from './questions'
import { competitivePlaybook } from './playbook'

// Competitive — the page (Phase 1 WP14, design §3 CO1–CO7; ported to the
// artboard in Block D wave 2).
//
// THE SELECTION SCOPES THE SURFACE. CO1 is first because everything under it is
// about one rival; `?vs=` carries that selection, and the horizon control
// carries the reader's window through every link the page draws.
//
// THE ARTBOARD'S COMPOSITION, NOT A STACK OF FULL-WIDTH BANDS. Every block was
// `col={12}`, so the page was four bands down a twelve-column grid where the
// artboard runs 12 / 7+5 / 3+4+5 / 12 — roughly nine tiles against four, in
// about half the vertical space per unit of content (mock-gap's own measure).
// `SPAN` below is read off the artboard's own `grid-column: span N`
// declarations rather than guessed.
//
// CO1 IS NOT A TILE ANY MORE. The artboard puts the rival selection inline
// under the soundness band — a pill row outside any card — because it is a
// CONTROL for the page and not a reading of it. A full-width card with an
// uppercase eyebrow and a block question, which is what it was, gave a selector
// the weight of a finding.
//
// THE FINDINGS RAIL (CO6) IS STILL NOT BUILT, and its five columns are where
// "Not on this page yet" now sits, so the artboard's third row still adds to
// twelve. CO6 needs a finding identity that survives an update: `recurrenceOf`
// is built and waiting, and nothing loads a `monthsSeen` for it to key on.

export const COMPETITIVE_BLOCKS: readonly Block<CompetitiveSurfaceData>[] = [
  competitiveRivals,
  competitiveStandings,
  competitiveHeadToHead,
  competitiveOwnClaims,
  competitiveSaidAbout,
  competitiveQuestions,
  competitivePlaybook,
]

/** The blocks that are TILES, in the artboard's order. CO1 is drawn inline
 *  above the grid and is deliberately absent. */
export const COMPETITIVE_TILES: readonly Block<CompetitiveSurfaceData>[] = [
  competitiveStandings,
  competitiveHeadToHead,
  competitiveOwnClaims,
  competitiveSaidAbout,
  competitiveQuestions,
  competitivePlaybook,
]

/** The artboard's twelve-column grid: `span 12` · `span 7` + `span 5` ·
 *  `span 3` + `span 4` + `span 5` · `span 12`. Rows are 116px MINIMUMS. */
const SPAN: Record<string, { col: number; row: number }> = {
  'competitive.months': { col: 12, row: 4 },
  'competitive.h2h': { col: 7, row: 4 },
  'competitive.ownclaims': { col: 5, row: 4 },
  // The two in one grid row share its height. "Not on this page yet" (5 cols)
  // is off the reading page, so the pair takes the row: the roadmap is listed
  // once in Settings › Readiness (copy de-clutter ruling G).
  'competitive.saidabout': { col: 5, row: 5 },
  'competitive.questions': { col: 7, row: 5 },
  'competitive.playbook': { col: 12, row: 5 },
}

/**
 * THE ROWS ARE CONTENT-SIZED, WHICH IS WHAT THE ARTBOARD'S OWN GRID DOES.
 *
 * `PageGrid` WAS `xl:auto-rows-[116px]` (every page's rows are `minmax(116px,
 * auto)` since 2026-09-24, so GRID_ROWS's first half is now the default) and a
 * `Tile` is `overflow-hidden`, so a
 * hard-coded integer row span is a hard ceiling: any block taller than its span
 * is CUT, with no scroll and no indication. The numbers above were fitted to
 * one fixture by eye and four of the six states fell outside them — measured at
 * head, the head-to-head overflowed by 94px at 1440 and 128px at 1280 and lost
 * its footer and two of its five verdict reasons, and the own-claims tile lost
 * Patagonia's row and its "2 of 3 tracked" footer in the claims arm. The render
 * tier asserts what a block PRINTS, not where its pixels land, so 122 green
 * tests passed through both.
 *
 * The artboard's grid declares no `grid-auto-rows` at all — its rows are sized
 * by their content — so this page asks for the same thing through the className
 * `PageGrid` already takes: `minmax(116px, auto)`. The spans above keep their
 * meaning as the MINIMUM height a tile claims (which is what holds the
 * artboard's rhythm when a state is short); they stop being a ceiling. Nothing
 * outside this page changes.
 *
 * AND A SHORT TILE IS NO LONGER STRETCHED TO ITS ROW-MATE'S FLOOR. A grid item
 * defaults to `align-self: stretch`, so the three tiles in a row all took the
 * height of the tallest and the surplus became WHITE INSIDE A CARD: measured to
 * the block footer at 1440 on the populated fixture, CO4 carried 305px of a
 * 656px tile, CO5 208px and CO6 376px — 889px of empty card on one screen. It
 * is the artboard's own device, and the artboard fills those tiles; this page,
 * in the state it ships in, does not. At 1024 the same tiles have 20px of
 * surplus because the grid is one stacked column and every tile takes its own
 * height, which is exactly what `items-start` asks for above `xl`. The row
 * BAND is unchanged — it is still as tall as its tallest member, so the
 * artboard's rhythm and the page's total height are what they were — but the
 * air now falls on the page ground where there is nothing to read, instead of
 * inside a card that looks like it lost its content.
 */
export const GRID_ROWS = 'xl:auto-rows-[minmax(116px,auto)] xl:items-start'

/** Has this block nothing to draw? `emptyState` is every block's own answer and
 *  the one the block itself renders (`BlockEmpty`), so the tile and the block
 *  cannot disagree about which arm is on screen. */
export const emptyRow = (block: Block<CompetitiveSurfaceData>, data: CompetitiveSurfaceData): boolean =>
  Boolean(block.emptyState?.(data))

/** Below `xl` the grid is one stacked column and `Tile`'s `MIN_H` still applies
 *  a height derived from the row span — at 1024 that is 776px of tile under a
 *  245px block, and the page ran 5,579px of mostly air. Stacked, a tile has no
 *  neighbour to match, so it takes its own height. */
export const STACKED = 'min-h-0'

/** The app's context: RELATIVE links. */
export function competitiveContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/** The words this page is measured against. Every one is in `THIRTEEN_WORDS`
 *  (lib/calibration.ts) — a new reading surface prints no term outside the
 *  thirteen and the two flags, and the legend may not explain one it does not
 *  print. */
const LEGEND: GlossaryKey[] = ['audience', 'rival', 'video', 'level', 'change', 'month']

export function CompetitiveSurfacePage({
  data,
  params = {},
}: {
  data: CompetitiveSurfaceData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="competitive" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. Your rivals&rsquo; standings land with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = competitiveContext(params)
  return (
    <ExportScope page="competitive" params={params} tiles={COMPETITIVE_TILES.map((b) => ({ key: b.key, title: b.title }))}>
      <PageFrame>
        <SurfacePageBar
          nav="competitive"
          params={params}
          context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
          record={{ line: data.record.line, lines: data.record.lines }}
        >
          <ExportMenu />
          <HowToRead items={LEGEND} basePath="/dashboard/competitive" anchor="competitive" />
        </SurfacePageBar>
        {/* CO1, inline: the artboard's RIVAL pill row, under the band and
            outside any card. */}
        {competitiveRivals.render(data, 'app', ctx)}
        <PageGrid className={GRID_ROWS}>
          {COMPETITIVE_TILES.map((block) => {
            const span = SPAN[block.key] ?? { col: 12, row: 2 }
            // A REFUSAL DOES NOT CLAIM FOUR ROWS. `PageGrid` is
            // `auto-rows-[minmax(116px,auto)]`, so a `row-span-4` tile has a
            // FLOOR of 4 × 116 + 3 × 16 = 512px whatever is in it — and until
            // M3/M5 are applied every tenant's standings tile is the refusal,
            // three lines of text, first thing on the page: measured at 1440,
            // 512px of tile under 120px of content. The span is the artboard's
            // rhythm for a tile that HAS a reading; a tile that has just said
            // it has none takes one row and lets its own content size it.
            const row = emptyRow(block, data) ? 1 : span.row
            // NO `distribute`: every tile has exactly ONE child — the block's
            // own `<section>` — so `justify-between` had nothing to spread and
            // the prop read as a fix that was never applied. What actually puts
            // a footer on the floor is the block filling the tile (`h-full` on
            // its own `BlockFrame`), which is where each block now does it.
            return (
              <Tile key={block.key} col={span.col} row={row} exportKey={block.key} className={STACKED}>
                {block.render(data, 'app', ctx)}
              </Tile>
            )
          })}
        </PageGrid>
        {/* No method footnote: soundness lives in the page bar's "How sound
            is this" pill and its record modal (copy de-clutter ruling B). The
            privacy line is legal, not method, and stays. */}
        {data.method ? (
          <p className="m-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{data.method.privacy}</p>
        ) : null}
      </PageFrame>
    </ExportScope>
  )
}
