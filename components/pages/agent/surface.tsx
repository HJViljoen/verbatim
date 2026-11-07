import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import type { ReadingMonth } from '@/lib/reading/reading-month'
import { ExportMenu } from '@/components/export-menu'
import type { StatItem } from '@/components/v2'
import { surface } from '@/lib/nav'
import { fmtInt, shortDate, weekdayDate } from '@/lib/format'
import { monthLabel } from '@/lib/shell/bar'
import type { AgentThreadData } from '@/lib/pages/agent-thread'
import { THIRTEEN_WORDS, READER_FLAGS } from '@/lib/calibration'

// Ask's shell (Block D wave 2, E-ask · `ask.shell`, `ask.bar.question`).
//
// SINCE THE AUDIT DESIGN (7 Nov; Agent-Thread.dc.html draws the plan check,
// and a question thread takes the recipe): the title "Agent", the line under
// it "{brand}, {month}" (the plan check's board), and Export as the kit's
// secondary button. The month was a chip with a menu of months until then;
// on the Agent its options led back to the Agent's own page, which reads no
// month, so the line says the month in words. The ask basis (which update an
// answer was given against) is printed with the answer, not in the bar.
//
// NO "HOW SOUND IS THIS" BAND (25 Sep rulings, market-first WP1.2). Ask used
// to mount its own record band and drawer under the bar; the band left every
// page, Ask's too. What an answer reads is stated in the open, in the rail's
// "What answers cover" tile.

/**
 * The words the legend explains on this surface.
 *
 * `THIRTEEN_WORDS` plus the two `READER_FLAGS` — the whole vocabulary a new
 * reading surface may print, and nothing outside it (AGENTS.md). Not the rest
 * of GLOSSARY, which belongs to the pages Phase 1 retires.
 */
export const ASK_LEGEND = [...THIRTEEN_WORDS, ...READER_FLAGS]

/** "Össur, October 2026": the brand and the reading month an answer's
 *  window ends in, the line under the title (the plan check's board); the
 *  brand alone where nothing has been delivered. Pure. */
export function askSub(bar: { brand: string; reading: ReadingMonth | null } | null): string | null {
  if (!bar) return null
  return bar.reading ? `${bar.brand}, ${monthLabel(bar.reading.month)}` : bar.brand
}

/**
 * The Agent's page bar on a thread: the title, its line, Export.
 */
export function AskShell({
  bar,
  children,
}: {
  /** The tenant's name and the reading month, or null. */
  bar: { brand: string; reading: ReadingMonth | null } | null
  children: ReactNode
}) {
  const s = surface('ask')
  return (
    <PageFrame>
      <PageBar title={s.label} sub={askSub(bar) ?? undefined}>
        <ExportMenu variant="secondary" />
      </PageBar>
      {children}
    </PageFrame>
  )
}

/**
 * The plan check's figures row (Agent-Thread.dc.html): the plan, when it was
 * asked, the update it was checked against, and its claims by verdict. A
 * verdict no claim earned is left out of the sentence (absent rather than
 * zero, the plan chip's rule). Pure.
 */
export function planCheckStats(d: Pick<AgentThreadData, 'title' | 'createdAt' | 'basis' | 'document'>): StatItem[] {
  const s = d.document?.summary
  const total = d.document?.claims.length ?? 0
  const parts = s
    ? ([[s.supported, 'supported'], [s.contradicted, 'contradicted'], [s.untested, 'untested']] as [number, string][]).filter(([n]) => n > 0)
    : []
  return [
    { key: 'plan', term: 'Plan', value: <span data-copy="subject" data-slot="ask_extract_title">{d.title}</span> },
    { key: 'asked', term: 'Asked', value: weekdayDate(d.createdAt) },
    { key: 'checked', term: 'Checked against', value: d.basis.updateAt ? `The update of ${shortDate(d.basis.updateAt)}` : 'No update read yet' },
    {
      key: 'claims',
      term: <><span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'claim' : 'claims'}</>,
      value: parts.length > 0
        ? parts.map(([n, w], i) => <span key={w}>{i > 0 ? ', ' : null}<span data-copy="figure">{fmtInt(n)}</span> {w}</span>)
        : 'None read',
    },
  ]
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
    <div className="flex flex-col items-start gap-5 xl:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">{children}</div>
      <div className="flex w-full flex-col gap-5 xl:w-[320px] xl:flex-none">{rail}</div>
    </div>
  )
}

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
