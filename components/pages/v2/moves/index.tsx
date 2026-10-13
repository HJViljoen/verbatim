import Link from 'next/link'

import { DateMove } from '@/components/pages/market-surface/date-move'
import { PageBar } from '@/components/shell/page-grid'
import { longMonth } from '@/lib/format'
import { canDate } from '@/lib/pages/date-move'
import { barMonth } from '@/lib/reading/month-label'
import { PAGE_TITLE, headerParts, type MovesPageData } from '@/lib/pages/v2/moves'
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
// exist. A section with nothing to show is not drawn (the moves, the plan,
// the statements, the conclusions); the advice says so in one line.

export const CHECK_A_PLAN_HREF = '/dashboard/agent'

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
      {say || data.plan ? (
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
          {say ? <WhatYouSay data={say} className={data.plan ? undefined : 'min-[1180px]:col-span-2'} /> : null}
          {data.plan ? <PlanCard plan={data.plan} className={say ? undefined : 'min-[1180px]:col-span-2'} /> : null}
        </div>
      ) : null}
      <ConclusionsSection data={data} />
    </div>
  )
}
