import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import type { StatementsBlockData } from '@/lib/statements/types'
import { marketContext } from '@/components/pages/market-surface'
import { marketMoves } from '@/components/pages/market-surface/moves'
import { marketPlans } from '@/components/pages/market-surface/plans'
import { MovesHeader } from './header'
import { Card } from './parts'
import { YourStatements } from './statements'
import { MovesWorthConsidering, consideringRows } from './considering'

// Your moves (/dashboard/market, nav key `market`), rebuilt to the approved
// artboard Page-Your-moves.dc.html (pages build, 1 Oct). In the artboard's
// order:
//
//   the head ("Check a plan", "Date a move") ·
//   Your statements (NEW: the client's own claims and how the market treats
//   them) · Moves worth considering (the current advice, Accept / Not for us) ·
//   Your moves (only with at least one dated move) · Plans re-checked (only
//   with at least one plan).
//
// CUT, per the page review and the owner's 1 Oct notes: In one line, Questions
// to answer (moved to Subjects), What you say and what your market says back
// (replaced by Your statements), the month's card / What you published, What
// we concluded and How a move is made. The blocks stay in `MARKET_BLOCKS`, the
// registry the briefs and stored snapshots resolve, and are simply not drawn
// here (the `WEEK_RETIRED_BLOCKS` rule).
//
// Each card is drawn only when it has something to show (rule 2). The two
// blocks the artboard does not draw (Sealand has no move and no plan) keep
// their existing rendering inside the artboard's card.

export function MovesPage({
  market,
  statements,
  params = {},
}: {
  market: MarketSurfaceData | null
  statements: StatementsBlockData | null
  params?: Record<string, string | undefined>
}) {
  const ctx = marketContext(params)
  const considering = consideringRows(market?.advice.shortlist?.rows)
  return (
    <div className="flex flex-col gap-[22px]">
      <MovesHeader dating={market?.moves.dating ?? null} />
      {statements ? <YourStatements data={statements} /> : null}
      <MovesWorthConsidering rows={considering} />
      {market && market.moves.rows.length > 0 ? (
        <Card pad="" gap="">{marketMoves.render(market, 'app', ctx)}</Card>
      ) : null}
      {market && market.plans.length > 0 ? (
        <Card pad="" gap="">{marketPlans.render(market, 'app', ctx)}</Card>
      ) : null}
    </div>
  )
}
