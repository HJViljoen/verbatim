import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { ReadingContext } from '@/components/shell/page-bar'
import type { ReadingMonth } from '@/lib/reading/reading-month'
import { ExportMenu } from '@/components/export-menu'
import { surface } from '@/lib/nav'
import { THIRTEEN_WORDS, READER_FLAGS } from '@/lib/calibration'

// Ask's shell (Block D wave 2, E-ask · `ask.shell`, `ask.bar.question`).
//
// THE PAGE BAR WAS ABSENT ENTIRELY. `lib/nav.ts` has carried Ask's title, its
// question ("What does the conversation say about this?") and — since wave 1 —
// `hasRecord` for years of commits, and no route on this surface mounted
// `SurfacePageBar`. So the one question the page answers, the "How to read
// this page" legend and Export (which existed only inside a thread) never
// printed. This mounts the bar the other six surfaces already wear.
//
// ASK'S BAR IS THE ONE-LINE BAR (WP3.9): the month selector's chip and "as at
// the {update} update · next update {date}", as on every reading page. The
// ask basis (which update an answer was given against) is printed with the
// answer, not in the bar. See `AskShell`.
//
// NO "HOW SOUND IS THIS" BAND (25 Sep rulings, market-first WP1.2). Ask used
// to mount its own record band and drawer under the bar; the band left every
// page, Ask's too. What an answer reads is stated in the open, in the rail's
// "What an answer reads" tile.

/**
 * The words the legend explains on this surface.
 *
 * `THIRTEEN_WORDS` plus the two `READER_FLAGS` — the whole vocabulary a new
 * reading surface may print, and nothing outside it (AGENTS.md). Not the rest
 * of GLOSSARY, which belongs to the pages Phase 1 retires.
 */
export const ASK_LEGEND = [...THIRTEEN_WORDS, ...READER_FLAGS]

/**
 * THE ONE-LINE BAR, ON ASK TOO (WP3.9; 25 Sep rulings, §5.12). The approved
 * preview draws Ask's bar as every reading page's: "Sealand · September 2026
 * as at the 24 Sep update · next update Sun 27 Sep". Ask's `lib/nav.ts` bar
 * kind stays `title` (that file is not this package's), so the shell composes
 * `PageBar` with the bar's own `line`, drawn by the same `ReadingContext` the
 * reading pages use, over the reading month an answer's window ends in. The
 * selector offers no other month here: an answer's window is chosen with the
 * window switch, not the month. Where nothing has been delivered there is no
 * reading month, and the bar is the title alone, which is true.
 */
export function AskShell({
  bar,
  params = {},
  children,
}: {
  /** The tenant's name and the reading month, or null. */
  bar: { brand: string; reading: ReadingMonth | null } | null
  params?: Record<string, string | undefined>
  children: ReactNode
}) {
  const s = surface('ask')
  const line = bar?.reading
    ? <ReadingContext context={{ brand: bar.brand, reading: bar.reading, others: [] }} basePath={s.href} params={params} />
    : undefined
  return (
    <PageFrame>
      <div className="flex shrink-0 flex-col gap-1.5">
        <PageBar title={s.label} line={line}>
          <ExportMenu />
        </PageBar>
      </div>
      {children}
    </PageFrame>
  )
}

/**
 * The artboard's composition: a left column that grows and a 320px rail.
 *
 * NOT `PageGrid`. The page's twelve columns are the right primitive for a board
 * of tiles; this surface is two columns of tiles with different rules — the
 * left one holds an ask box and an answer that can run to any height, the rail
 * holds three fixed tiles — and expressing that as spans would make the rail's
 * height a function of the answer's. It collapses to one column under `xl`,
 * the same breakpoint `PageGrid` and `TileColumns` collapse at, so the rail
 * lands under the answer on a narrow screen instead of beside it in 100px.
 */
export function AskColumns({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 xl:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">{children}</div>
      <div className="flex w-full flex-col gap-4 xl:w-[320px] xl:flex-none">{rail}</div>
    </div>
  )
}

/**
 * `Tile.row` ON THIS SURFACE, and why every tile here passes 1.
 *
 * `Tile.row` does two things: `xl:row-span-N` on a GRID, and `MIN_H[row]` below
 * `xl` where the grid is not in play. `AskColumns` composes with flex, so the
 * span half is inert at desktop — and the floor half still applied, on its own,
 * at every width under 1280. A history tile at `row={3}` forced 380px against
 * about 200px of content, and `distribute="between"` then pushed the footer to
 * the floor: measured at 1024, roughly 150px of white inside the history tile,
 * 60px in draws, 120px in the ask box. The props did nothing where they were
 * meant to and damage where they were not.
 *
 * One row unit is a floor low enough that no tile here has spare height to
 * distribute, at any width. `distribute="between"` stays — it is right the day
 * this surface is composed on a grid, and it costs nothing while the tiles are
 * their own height. Ask is NOT `PageGrid` and never becomes it (see
 * `AskColumns`): the left column's answer runs to any height and expressing
 * that as spans would make the rail's height a function of the answer's.
 */
export const ASK_TILE_ROW = 1

/**
 * The INDEX's composition — the ask box over three tiles, not beside them.
 *
 * WHAT THIS FIXES. `/dashboard/agent` is where every reader arrives from the
 * nav and where every new tenant starts, and composed as `AskColumns` it drew a
 * 130px ask tile top-left, about 900px of empty white under it and a 1,000px
 * rail beside it — an L of white space with no focal point, and the page's one
 * action ghosted at `disabled:opacity-30` over the void. The artboard never
 * draws this state, so the port inherited no answer for it.
 *
 * THE ANSWER IS THE CONTENT, NOT A DECORATION. The rail's three tiles are the
 * three questions a reader of Ask asks — what else have I asked, what stands
 * behind an answer, what could this not answer — and on a page with no answer
 * on it they are the whole page rather than its margin. Same tiles, same order,
 * same words; `TileColumns` of three under a full-width box. The moment there
 * IS an answer the thread route composes `AskColumns` and they go back to being
 * a rail beside it, which is where the artboard puts them.
 */
export function AskIndexColumns({ box, tiles }: { box: ReactNode; tiles: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {box}
      {/* The page's own twelve columns, three tiles of four — NOT
          `TileColumns`, whose children are plain cells inside one tile and
          which would fight a `Tile`'s own `xl:col-span-*`. Under `xl` they
          stack, the breakpoint the whole product collapses at. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">{tiles}</div>
    </div>
  )
}
