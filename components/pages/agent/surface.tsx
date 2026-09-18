import type { ReactNode } from 'react'
import { PageFrame } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { HowToRead } from '@/components/how-to-read'
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
// ASK'S BAR IS `title`, DELIBERATELY. No month context line and no horizon:
// nothing here is a reading OF a month, so the context slot carries the ASK
// BASIS instead — which update an answer is given against, and how much of the
// corpus is searchable. That string is composed in the loader
// (`AgentThreadData.bar.context`) and passed in, so the page and the deck say
// it once.
//
// THE RECORD BAND IS THE ONE CONTROL ASK GAINED. `hasRecord(s)` admits Ask
// because Ask is the one reader whose direction-word flag is true, and a
// surface that may print a direction word and states no basis for it is the
// worst of both. The bar draws it only where a caller hands it one.

/**
 * The words the legend explains on this surface.
 *
 * `THIRTEEN_WORDS` plus the two `READER_FLAGS` — the whole vocabulary a new
 * reading surface may print, and nothing outside it (AGENTS.md). Not the rest
 * of GLOSSARY, which belongs to the pages Phase 1 retires.
 */
export const ASK_LEGEND = [...THIRTEEN_WORDS, ...READER_FLAGS]

export function AskShell({
  context,
  record,
  params = {},
  children,
}: {
  /** `AgentThreadData.bar.context` — the ask basis, never a month reading. */
  context: string
  /** The record band's sentence and the lines behind it. Null draws no band. */
  record: { line: string; lines: string[] } | null
  params?: Record<string, string | undefined>
  children: ReactNode
}) {
  const s = surface('ask')
  return (
    <PageFrame>
      <div className="flex shrink-0 flex-col gap-1.5">
        <SurfacePageBar nav="ask" params={params} record={record}>
          {/* The bar's own context slot takes a MONTH line on a reading
              surface and Ask has none, so the basis is printed here — in the
              same mono, at the same weight, in the same place the other six
              print their month. */}
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{context}</span>
          <HowToRead items={ASK_LEGEND} basePath={s.href} anchor="ask" />
          <ExportMenu />
        </SurfacePageBar>
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
