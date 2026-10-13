import Link from 'next/link'

import { DateMove } from '@/components/pages/market-surface/date-move'
import { PageBar } from '@/components/shell/page-grid'
import { longMonth } from '@/lib/format'
import { canDate } from '@/lib/pages/date-move'
import { barMonth } from '@/lib/reading/month-label'
import { CHECK_A_PLAN_HREF, PAGE_TITLE, headerParts, type MovesPageData } from '@/lib/pages/v2/moves'
import type { StatementsBlockData } from '@/lib/statements/types'
import { cn } from '@/lib/utils'
import { AdviceSection } from './advice'
import { ConclusionsSection } from './conclusions'
import { MovesSection } from './moves'
import { BTN, MONO } from './parts'
import { PlanCard } from './plan'
import { WhatYouSay } from './say'

// YOUR MOVES, DESIGN v2 (depth plan T7; boards E6-Moves and E6-Moves-Open),
// at /dashboard/moves. Its own layout, in the board's order: the bar (the
// three counts; Check a plan; Date a move), the advice to decide on (three
// cards across, one opened in place under its row), your moves and what
// happened after (two across), what you say beside your plan (two across, or
// the plan alone), and what we concluded with the advice record.
//
// The data is `loadMovesPage` (lib/pages/v2/moves.ts); the statements are
// read by the route behind `maySeeStatements` and drawn only where rows
// exist or the reader may add the first (held from tenants, AGENTS.md).
// THE BOARD'S LAYOUT IS FIXED (the parity pass, 13 Oct): every other section
// keeps its card in every data state and shows its gap inside it, in its own
// shape (the advice record's card, the next move's card, the plan card with
// no plan, the conclusions' card with one calm line).

export { CHECK_A_PLAN_HREF }

function Header({ data }: { data: MovesPageData }) {
  const parts = headerParts(data.counts)
  // Decision 3: the month the moves' lines are read to, where it is not the
  // current calendar month; only where a move draws a line at all.
  const month = data.monthLabel && data.moves.cards.some((c) => c.points.length > 0)
    ? barMonth(longMonth(data.month), data.monthLabel)
    : null
  return (
    <PageBar
      title={PAGE_TITLE}
      // Two buttons beside the title leave it one word a line on a phone, so
      // there they go under the bar (T9).
      phoneControls="below"
      meta={(
        <span className={cn(MONO, 'text-[12.5px] text-muted-foreground')}>
          {parts.map((p, i) => (
            <span key={p.words}>{i > 0 ? ' · ' : null}<span data-copy="figure">{p.n}</span> {p.words}</span>
          ))}
          {month ? <span> · {month}</span> : null}
        </span>
      )}
    >
      <div className="flex flex-wrap items-center justify-end gap-2" data-print-hide>
        <Link href={CHECK_A_PLAN_HREF} className={BTN}>Check a plan</Link>
        {data.canDecide && canDate(data.dating) ? <DateMove dating={data.dating} place="ink" /> : null}
      </div>
    </PageBar>
  )
}

/** The empty page: no delivered update yet. */
export const MOVES_FIRST_RUN = 'Advice, moves and plans land with your first update.'

export function MovesV2Page({ data, statements }: { data: MovesPageData | null; statements: StatementsBlockData | null }) {
  if (!data) {
    return (
      <div className="flex flex-col gap-5 leading-[normal]">
        <PageBar title={PAGE_TITLE} />
        <p className="m-0 text-[14px] text-muted-foreground">{MOVES_FIRST_RUN}</p>
      </div>
    )
  }
  // Drawn where there are statements, or where the reader may add the first
  // (the operator: the route reads none for a tenant, `maySeeStatements`).
  const say = statements && (statements.statements.length > 0 || statements.canEdit) ? statements : null
  return (
    <div className="flex min-w-0 flex-col gap-5 leading-[normal]">
      <Header data={data} />
      <AdviceSection data={data} />
      <MovesSection data={data} />
      {/* The board's two across: what you say beside the plan. The plan card
          is always drawn (with no plan, its empty shape); the statements are
          held from tenants (AGENTS.md, open ruling 7), so for a tenant the
          plan takes the row. */}
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {say ? <WhatYouSay data={say} /> : null}
        <PlanCard plan={data.plan} failed={data.failed?.plan === true} className={say ? undefined : 'min-[1180px]:col-span-2'} />
      </div>
      <ConclusionsSection data={data} />
    </div>
  )
}
