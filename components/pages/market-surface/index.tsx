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
import { CARD_CLAIMS_SHOWN, marketCard } from './card'
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

// ── how tall each tile is, and where it starts ────────────────────────────────
//
// A TILE IS A FIXED BOX AND ITS CONTENT IS NOT, WHICH IS ONE DECISION SEEN FROM
// TWO ENDS. `Tile` is `overflow-hidden` over an `N × 116px` grid area at ≥xl:
// a block taller than its span is CUT — no scrollbar, no fade, no affordance —
// and a block shorter than it shows empty ground. Both ends shipped in the
// port, from one table of constants tuned against a fixture thinner than the
// page:
//
//   * the ledger draws THREE rows in the fixture and TWELVE in production.
//     Measured at 1440, twelve rows want 1,435px of a 644px box, so rows 5–12,
//     the "you have acted on 2 of 64" line and the grounding note were gone
//     from the page the block is named after;
//   * and in the arm every new workspace starts in — the gather is meant to
//     fill up over time, so this is the first weeks of every account, not an
//     edge case — the same constants held Plans re-checked at 644px for two
//     sentences, Say vs hear at 380 for one, and more than half the page was
//     white ground inside shadowed boxes.
//
// SO THE SPAN IS READ OFF THE DATA. Each block estimates the height it is
// about to draw from what it is about to draw — rows, claims, readings,
// series — in px measured at 1440 through the dashboard shell's own geometry
// (sidebar 14rem, main p-6), and the span is that height in row units, rounded
// up. The estimate errs HIGH by design: a row of slack is 132px of white and a
// row short is a table with its bottom cut off.
//
// AND EVERY TILE NOW SPENDS ITS OWN SLACK, NOT ITS NEIGHBOUR'S. The first cut
// of this rule gave every tile on a grid line the TALLEST estimate on that
// line, to keep CSS grid's auto-placement from flowing a later tile up into the
// gap beside a short one. Measured at 1440 on the populated fixture that cost
// 1,407px of white inside 4,888px of tile — a third of the page — and its worst
// case was not the fixture but the arm production is in: `market.unlocks` draws
// ~200px of ink and was handed a 644px box because `market.plans` sits beside
// it, and Say vs hear ran 54% blank for the same reason.
//
// THE REORDERING THAT JUSTIFIED IT CANNOT HAPPEN ONCE THE START IS PINNED.
// Auto-placement only moves a tile that has no explicit position; `Tile` set
// `xl:col-span-N` / `xl:row-span-N` and never a col-start or a row-start, so
// every tile was auto-placed and the argument held. `tileGrid` now hands each
// tile the column AND the row it begins on — the artboard's own grid, written
// down — so the layout is fixed by the page rather than by whichever tile
// happens to be tallest, and a per-tile height is free. The artboard does the
// same thing with no arithmetic at all: `repeat(12, minmax(0, 1fr))` and no
// `auto-rows`, so each of its rows is as tall as its own tallest card.
//
// A LINE STILL SHARES ITS ROW START, so the three narrow cards begin level with
// each other and `market.ways` begins under all three; what they no longer
// share is their BOTTOM. A ragged bottom edge inside one grid line is the cost,
// and it is 600px of white cheaper than the alternative.
const ROW_UNIT = 116
const ROW_GAP = 16
const spanFor = (px: number): number =>
  Math.min(12, Math.max(2, Math.ceil((px + ROW_GAP) / (ROW_UNIT + ROW_GAP))))

/**
 * What each block is about to draw, in px.
 *
 * MEASURED AT 1280, NOT AT 1440 — the low end of MASTER's stated primary range
 * ("verified at 1280–1440px") and the width at which these tiles are TALLEST,
 * because the grid is still twelve columns there and every column is narrower.
 * Tuning at 1440 is how the Plans tile came to drop its own footer — "See the
 * claim-by-claim verdicts → · as re-read on 13 Sep" — at 1280 and only at
 * 1280: present at the width it was reviewed at, gone at the width nobody
 * re-checked. The cost of measuring at the narrow end is some white at the
 * wide one, which `distribute="between"` spreads through the tile rather than
 * pooling under it.
 *
 * Every constant here was measured with the fix pass's own probe against all
 * five fixture states, and the comment beside each says what it counts.
 */
const HEIGHT: Record<string, (d: MarketSurfaceData) => number> = {
  // Chrome, then one row of two-abreast cards per pair above the bar, then the
  // population line that no longer sits behind the disclosure (two lines at
  // 1280) and the disclosure's own summary.
  'market.conclusions': (d) => 155 + Math.ceil(d.conclusions.rows.filter((r) => r.tier !== 'archive').length / 2) * 137,
  // Chrome + header, a table row each, a taller row wherever the Afterwards
  // cell holds a verdict (two months, the badge and the caveat), and the one
  // expanded row's argument and comment.
  'market.advice': (d) => {
    const rows = d.advice.rows
    if (rows.length === 0) return 150
    const verdicts = rows.filter((r) => r.afterwards?.state === 'reading').length
    const expanded = rows.some((r) => r.why || r.quote) ? 130 : 0
    // The chrome carries the population line as well as the summary now: it is
    // outside the disclosure in every mode, so it is always drawn.
    //
    // AND `requestedLine`, WHICH THIS NEVER COUNTED (market V1). It is the
    // sentence answering a link the reader followed from a sent digest
    // (`?rec=<id>`), it is drawn outside the disclosure like the rest of the
    // notes, and only the `deepLink` arm has it — which is how an estimate
    // written against the other three arms came to leave it out. It costs
    // nothing today: measured with scripts/tile-overflow.ts at 1440 and 1280,
    // this tile clips by 0px on every one of the four arms, because the slack
    // fix 3 was thought to have eaten came back with the merge. It is counted
    // anyway, because "the clip is absorbed by something else's slack" is not
    // a property an estimate may rely on.
    const requested = d.advice.requestedLine ? 22 : 0
    return 155 + rows.length * 80 + verdicts * 45 + expanded + requested
  },
  // The card's parts, each counted: the lead figure and the floor, the claims
  // at up to three lines each, the hooks row, the subjects row and its basis, and a
  // movement row per side.
  'market.card': (d) => {
    const card = d.moves.card
    if (!card) return 150
    const claims = Math.min(card.claimRows.length, CARD_CLAIMS_SHOWN)
    const movements = [card.movement.yours, card.movement.category].filter(Boolean).length
    return 289 + claims * 56 + (card.hooks.some((h) => h.value.k > 0) ? 26 : 0) + 60 + movements * 62
  },
  // A read move is a chart, its legend and one line per side; a declared move
  // with nothing read yet is a sentence.
  'market.moves': (d) => {
    const read = d.moves.readings ?? []
    const sides = read.reduce((n, r) => n + (r.verdict ? 1 : 0) + r.control.length, 0)
    const charts = read.filter((r) => r.chartNote == null && r.months.length > 0).length
    const unscored = d.moves.rows.length - read.length
    return 110 + charts * 250 + read.length * 60 + sides * 40 + Math.max(0, unscored) * 24 + 60
  },
  // A claim is the client's line, its verdict and the audience's answer.
  'market.sayhear': (d) => 90 + d.ways.claims.length * 70 + 60,
  // The plan's title row, the bar, the three counts, the lead claim with its
  // comment, and a line per claim that moved.
  'market.plans': (d) => {
    const card = d.plans[0]
    if (!card) return 110
    const lead = card.claims.length > 0 ? 215 : 0
    return 260 + lead + card.moved.length * 48
  },
  // One block per section that is not built, each with its owner.
  'market.unlocks': (d) => 105 + d.unlocks.rows.length * 95,
  // TWO LINES OF 44px SLOTS AT 1280, ONE AT 1440, and under each the sentence a
  // dead way now prints for itself. Measured: the five slots want 1,024px and
  // the grid gives 1,136 at 1440 and 976 at 1280, so the row is 126px wide-open
  // and 180–199px at the narrow end. The box is budgeted for the narrow end,
  // which is this table's stated rule.
  'market.ways': (d) => {
    const ways = d.ways.ways
    const lines = Math.max(1, Math.ceil(ways.length / 4))
    const note = ways.some((w) => !w.live) ? 77 : ways.some((w) => w.unlock) ? 45 : 0
    return 60 + lines * (44 + note)
  },
}

/** The page's two grids, each as its own lines of tile keys, in order: the two
 *  full-width readings; then the artboard's moves row, the three narrow cards,
 *  and the button strip. Tiles named on one line START on the same grid row —
 *  they no longer END on the same one. */
const GRIDS: readonly (readonly (readonly string[])[])[] = [
  [['market.conclusions'], ['market.advice']],
  [
    ['market.card', 'market.moves'],
    ['market.sayhear', 'market.plans', 'market.unlocks'],
    ['market.ways'],
  ],
]

/** The grid lines of the moves grid, kept exported-shaped for the test that
 *  reads which tiles sit beside which. */
export const GRID_ROWS: readonly (readonly string[])[] = GRIDS.flat()

/** Where a tile sits and how big it is: the artboard's column, the column it
 *  starts in, its own height in 116px row units, and the row its line starts
 *  on. Exported so the rule is testable without a browser. */
export interface TilePlacement { col: number; colStart: number; row: number; rowStart: number }

export function tileGrid(data: MarketSurfaceData): Record<string, TilePlacement> {
  const out: Record<string, TilePlacement> = {}
  for (const grid of GRIDS) {
    let rowStart = 1
    for (const line of grid) {
      let colStart = 1
      let tallest = 2
      for (const key of line) {
        const col = COLS[key] ?? 12
        const row = spanFor(HEIGHT[key]?.(data) ?? 248)
        out[key] = { col, colStart, row, rowStart }
        colStart += col
        tallest = Math.max(tallest, row)
      }
      rowStart += tallest
    }
  }
  return out
}

/** How tall each block's tile is, in the grid's 116px row units — computed from
 *  the data it is about to draw. */
export function tileRows(data: MarketSurfaceData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, place] of Object.entries(tileGrid(data))) out[key] = place.row
  return out
}

// THE START CLASSES ARE WRITTEN OUT IN FULL, never interpolated, so Tailwind
// v4's scanner sees them — the rule `components/shell/tile.tsx` follows for its
// own span maps. Rows run past twelve because a row start is CUMULATIVE: the
// ledger alone can ask for eleven units, so `market.ways` can begin on row 25.
const COL_START: Record<number, string> = {
  1: 'xl:col-start-1', 2: 'xl:col-start-2', 3: 'xl:col-start-3', 4: 'xl:col-start-4',
  5: 'xl:col-start-5', 6: 'xl:col-start-6', 7: 'xl:col-start-7', 8: 'xl:col-start-8',
  9: 'xl:col-start-9', 10: 'xl:col-start-10', 11: 'xl:col-start-11', 12: 'xl:col-start-12',
}
const ROW_START: Record<number, string> = {
  1: 'xl:row-start-1', 2: 'xl:row-start-2', 3: 'xl:row-start-3', 4: 'xl:row-start-4',
  5: 'xl:row-start-5', 6: 'xl:row-start-6', 7: 'xl:row-start-7', 8: 'xl:row-start-8',
  9: 'xl:row-start-9', 10: 'xl:row-start-10', 11: 'xl:row-start-11', 12: 'xl:row-start-12',
  13: 'xl:row-start-13', 14: 'xl:row-start-14', 15: 'xl:row-start-15', 16: 'xl:row-start-16',
  17: 'xl:row-start-17', 18: 'xl:row-start-18', 19: 'xl:row-start-19', 20: 'xl:row-start-20',
  21: 'xl:row-start-21', 22: 'xl:row-start-22', 23: 'xl:row-start-23', 24: 'xl:row-start-24',
  25: 'xl:row-start-25', 26: 'xl:row-start-26',
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
  const grid = tileGrid(data)
  const tile = (block: Block<MarketSurfaceData>) => {
    const place = grid[block.key] ?? { col: COLS[block.key] ?? 12, colStart: 1, row: 2, rowStart: 1 }
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
  // The masthead's two clauses: the promise, then the limit on it, quiet.
  //
  // AND THE FACE IS THE ARTBOARD'S, RULED (block-d-review `market` finding 6,
  // referred to Heinrich twice and open since; closed here). The finding read
  // the serif as MASTER's speech face borrowed for the product's own sentence,
  // so that our words and a commenter's are typeset alike. It is not borrowed:
  // `spec/design-system.md:69` carries a ramp row for it — "Hero lead (the
  // page's one sentence) · serif · 17px · 500 · 1.35 · -0.005em" — and
  // `Market.dc.html:111` draws exactly that, as do `Main.dc.html:124` and
  // `Subjects.dc.html:294`. The hero lead is the one non-quote serif node the
  // system declares, and the mock states it three times. Nothing changed; the
  // measurement is pinned in index.test.tsx so the next reader does not have
  // to re-open it. Competitive was asked the same question and has no such
  // node: zero serif in its artboard, zero `font-serif` in its components.
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
