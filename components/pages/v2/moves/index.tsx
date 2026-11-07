import { DateMove } from '@/components/pages/market-surface/date-move'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { GoLink, type StatItem } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { canDate } from '@/lib/pages/date-move'
import { inlineMonth } from '@/lib/reading/month-label'
import { CHECK_A_PLAN_HREF, PAGE_TITLE, headerParts, type MovesPageData } from '@/lib/pages/v2/moves'
import type { StatementsBlockData } from '@/lib/statements/types'
import { AdviceSection } from './advice'
import { ConclusionsSection } from './conclusions'
import { MovesSection } from './moves'
import { PlanCard } from './plan'
import { WhatYouSay } from './say'

// YOUR MOVES, DESIGN v2 (depth plan T7; boards E6-Moves and E6-Moves-Open;
// since the audit design, 7 Nov, Moves.dc.html), at /dashboard/moves. Its own
// layout, in the board's order: the title (Check a plan; Date a move) and the
// figures row, the advice to decide on (three cards across), your moves and
// what happened after (two across), what you say beside your plan (two
// across, or the plan alone), and what we concluded with the advice record.
//
// The data is `loadMovesPage` (lib/pages/v2/moves.ts); the statements are
// read by the route behind `maySeeStatements` and drawn only where rows
// exist or the reader may add the first (held from tenants, AGENTS.md).
// THE BOARD'S LAYOUT IS FIXED (the parity pass, 13 Oct): every other section
// keeps its card in every data state and shows its gap inside it, in its own
// shape (the advice record's card, the next move's card, the plan card with
// no plan, the conclusions' card with one calm line).

export { CHECK_A_PLAN_HREF }

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>

/**
 * The figures row (the board's `.strip`; the audit design, 7 Nov): the
 * advice waiting, the moves dated, the plans checked (`headerParts`' counts),
 * and the reading month with the market's videos in it, its label where it
 * is not the current month (decision 3, the one helper's words). The
 * market's videos are the base a subject's level is of, said once
 * (decision 2). Pure.
 */
export function movesStats(data: MovesPageData): StatItem[] {
  const [waiting, dated, plans] = headerParts(data.counts)
  const market = data.marketN?.market
  return [
    { key: 'waiting', term: 'Advice waiting', value: <>{fig(waiting.n)} {waiting.n === 1 ? 'piece' : 'pieces'}</> },
    { key: 'dated', term: 'Moves dated', value: fig(dated.n) },
    { key: 'plans', term: 'Plans checked', value: fig(plans.n) },
    {
      key: 'month',
      term: inlineMonth(longMonth(data.month), data.monthLabel ?? null),
      value: market != null ? <>{fig(market)} market videos</> : 'Not read yet',
    },
  ]
}

/** The title, its two controls (Check a plan, a link; Date a move, the
 *  page's yellow button, for an owner or an admin) and the figures row. */
function Header({ data }: { data: MovesPageData }) {
  return (
    <PageBar
      title={PAGE_TITLE}
      stats={movesStats(data)}
      // Two controls beside the title leave it one word a line on a phone,
      // so there they go under the bar (T9).
      phoneControls="below"
    >
      <div className="flex flex-wrap items-center justify-end gap-5" data-print-hide>
        <GoLink href={CHECK_A_PLAN_HREF}>Check a plan</GoLink>
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
      <PageFrame>
        <PageBar title={PAGE_TITLE} />
        <p className="m-0 text-[15px] text-muted-foreground">{MOVES_FIRST_RUN}</p>
      </PageFrame>
    )
  }
  // Drawn where there are statements, or where the reader may add the first
  // (the operator: the route reads none for a tenant, `maySeeStatements`).
  const say = statements && (statements.statements.length > 0 || statements.canEdit) ? statements : null
  return (
    <PageFrame>
      <Header data={data} />
      <AdviceSection data={data} />
      <MovesSection data={data} />
      {/* The board's two across: what you say beside the plan, each its own
          height. The plan card is always drawn (with no plan, its empty
          shape); the statements are held from tenants (AGENTS.md, open
          ruling 7), so for a tenant the plan takes the row. */}
      <div className="grid grid-cols-1 items-start gap-5 min-[1180px]:grid-cols-2">
        {say ? <WhatYouSay data={say} /> : null}
        <PlanCard plan={data.plan} failed={data.failed?.plan === true} className={say ? undefined : 'min-[1180px]:col-span-2'} />
      </div>
      <ConclusionsSection data={data} />
    </PageFrame>
  )
}
