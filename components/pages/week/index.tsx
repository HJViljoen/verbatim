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
 *  A tile is `overflow-hidden` and its span is fixed, so a block whose content
 *  outgrows its span is CLIPPED, silently. The degraded arms are not the short
 *  ones: Sealand carries three rival rows where Össur carries one, and a
 *  refusal sentence is longer than the figure it replaces.
 *
 *  MEASURED AT 1008, NOT AT 1440 (design review F1). Every span here was set
 *  against the tallest of the three fixtures at 1440 — and 1440 is the WIDEST
 *  the twelve-column grid ever is. At a 1280 viewport the content column is
 *  1008 and every tile's content is taller: §1 lost 55px there, which took a
 *  quote's "YouTube · 11 Sep" citation and the tile's own footer, on the
 *  commonest laptop width after 1440. Below 1280 the grid stacks and tiles
 *  size to their content, so 1008 is the narrowest width at which a span can
 *  clip anything — which makes it the only width worth setting one against.
 *
 *  AND RE-MEASURED AT 1168 AND 1408 TOO (review W3), because a span set at the
 *  narrowest width carries its slack at every wider one and the page reads
 *  23% empty tile at 1440. Three things the re-measurement found, and only one
 *  of them is a span:
 *
 *  (1) NO SPAN HERE CAN SHRINK AT 1440. Natural heights per tile on the
 *      populated arm at 1168 are 518 · 451 · 312 · 417 · 306 · 426 · 459 ·
 *      155 · 289, and one row fewer is 512 · 380 · 248 · 380 · 248 · 380 ·
 *      380 · 116 · 248 — every tile is over its next span down. The slack is
 *      the 116px ROW UNIT, which is deviation 17 and the shell's grid, not
 *      this page's choice of how many of them to ask for.
 *  (2) TWO SPANS WERE SHORT, and a clip costs more than white. §5's is now a
 *      reading (`rivalPostsRows`) rather than a constant measured on a
 *      one-rival tenant. §7's is not: at 1008 its populated content measures
 *      11px over its box, but no node of it renders past the clip and its
 *      bottom padding is not eaten, so nothing is lost and a fifth row would
 *      buy 185px of white to fix a loss that does not happen.
 *  (3) A PER-WIDTH SPAN IS NOT AVAILABLE FROM THIS FILE. `Tile` takes one
 *      `row`, and a second span passed as `className` cannot win: Tailwind v4
 *      emits arbitrary `min-[1440px]:` variants BEFORE the named breakpoints,
 *      so `xl:row-span-5` beats `min-[1440px]:row-span-4` at 1440 (probed —
 *      the rule lands at line 4890 of the sheet against the xl rule's 5623).
 *      Registering a real breakpoint is `app/globals.css`, which this group
 *      does not own; it would buy one row on one tile on two arms.
 *
 *  The numbers below are `scrollHeight - clientHeight` per tile, per arm, at
 *  1008 and at 1216, zero everywhere. */
const ROWS: Record<string, number> = {
  'week.unusual': 5,
  'week.reply': 4,
  'week.subjects': 3,
  // `week.came-in` and `week.rival-posts` are not here: their spans are a
  // reading, not a constant — see `cameInRows` and `rivalPostsRows`.
  'week.worked': 4,
  'week.sales': 4,
  'week.flagged': 2,
  'week.rising': 3,
}

/** What a tile is worth on its SHORTER reading.
 *
 *  Not "when its block has nothing to draw" — that is what `emptyState` tests,
 *  and it is a good proxy but not the thing itself. §1 on Sealand returns a
 *  sentence ("the check cannot speak yet") AND draws its thirteen-point chart;
 *  measured, that reading is 383px where the flagged one is 553, so it takes
 *  the shorter span and neither clips.
 *
 *  These came down in the wave-2 fix pass (design review F3), which measured
 *  the white per tile rather than eyeballing it: the reply tile held 248px for
 *  71px of content and the sales tile 380px for 125px, which is a quarter of
 *  the page a tenant sees today given over to empty tile. */
const EMPTY_ROWS: Record<string, number> = {
  'week.unusual': 4,
  'week.reply': 1,
  'week.subjects': 2,
  'week.worked': 3,
  'week.sales': 2,
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
 * empty, and the two that do that have no entry in `EMPTY_ROWS` at all.
 *
 * THERE WAS A THIRD ARM HERE AND IT WAS UNREACHABLE (code review C9): §5 was
 * given back its full span when a rival was tracked, on the belief that it
 * draws its table under its own empty sentence. It does not —
 * `weekRivalPosts.emptyState` returns non-null only when there is no rival at
 * all, so `empty != null && rivals.length > 0` could never both hold. A guard
 * that cannot fire is a guard the next reader trusts.
 */
/**
 * The one block whose TALLEST reading is not its fullest one.
 *
 * §4 prints a sentence wherever a figure is absent — "The month's own reading
 * is not available here", "Comments in these days are not recorded for this
 * workspace yet" — and a sentence is taller than the number it replaces. So
 * Össur's populated arm is 465px at 1008 while Sealand's and the absent arm
 * are 571 and 555: `emptyState` is null on all three (every arm has audience
 * rows), and the block that needs five rows is the degraded one.
 *
 * The three conditions below are exactly the three extra lines: a window that
 * reaches into another month, no month reading to state a contribution
 * against, and no windowed comment count. Measured, not guessed.
 */
function cameInRows(data: WeekData): number {
  const c = data.cameIn
  return c.crossesInto != null || c.contribution == null || c.windowComments == null ? 5 : 4
}

/**
 * The other block whose span is a reading — §5, and it was CLIPPING.
 *
 * `week.rival-posts` had one constant, 3, measured on a tenant with ONE
 * tracked rival. A workspace tracking three draws three rival groups, and at
 * 1008 that reading is 429px against a 3-row box of 380: on the thin and
 * absent arms the tile's whole FOOTER — "Open Competitive →" and the note
 * saying what the audience asked is read per rival — was 34px below the clip,
 * at both 1280 and 1440, and had been (10px of it) before wave 3 touched the
 * file. A block cannot hide the link out of itself.
 *
 * So the span is computed from the two things that actually drive the height:
 * how many rivals there are, and how many post rows they carry between them
 * (a rival with no post still draws one row, saying so). Measured in a 1008
 * column over the sixteen shapes of 1–4 rivals × 0–3 posts, the natural height
 * is `175 + 66·rivals + 25·(post rows − rivals) + 21·(rivals with a post)`,
 * which reproduces the row count of all sixteen — 233 / 253 / 278 / 298 / 339
 * / 388 / 364 / 424 / 499 / 458 / 538 / 638 px — and of the three fixture arms
 * (populated 306 in a 3-row box, thin and absent 429 in a 4-row box). Widths
 * 1008 and 1168 measure identically: this tile is full-width and its rows wrap
 * the same way at both.
 */
function rivalPostsRows(data: WeekData): number {
  const rivals = data.cameIn.rivals
  if (rivals.length === 0) return 2
  const postRows = rivals.reduce((t, r) => t + Math.max(1, r.posts.length), 0)
  const withCounts = rivals.filter((r) => r.posts.length > 0).length
  const height = 175 + 66 * rivals.length + 25 * (postRows - rivals.length) + 21 * withCounts
  // N rows of the 116px unit, 16px apart, is `132N − 16` tall.
  return Math.min(8, Math.max(2, Math.ceil((height + 16) / 132)))
}

function tileRows(key: string, data: WeekData): number {
  if (key === weekCameIn.key) return cameInRows(data)
  if (key === weekRivalPosts.key) return rivalPostsRows(data)
  const full = ROWS[key] ?? 2
  const short = EMPTY_ROWS[key]
  if (short == null) return full
  const block = WEEK_BLOCKS.find((b) => b.key === key)
  const empty = block?.emptyState(data) ?? null
  if (empty == null) return full
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
          {/* EVERY BLOCK BUT THE FOOTNOTE. `week.coverage` is the artboard's
              method note, and the artboard sets it BARE on the page ground —
              no tile, no eyebrow, 10.5px mono under everything (design review,
              nits). The port had it inside a titled tile, which is both the
              wrong face and a 116px row a 124px footnote overflowed at 1280. */}
          {WEEK_BLOCKS.filter((b) => b.key !== weekCoverage.key).map((block) => (
            <Tile key={block.key} col={COLS[block.key] ?? 12} row={tileRows(block.key, data)}>
              {block.render(data, 'app', ctx)}
            </Tile>
          ))}
        </PageGrid>
        {weekCoverage.render(data, 'app', ctx)}
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
