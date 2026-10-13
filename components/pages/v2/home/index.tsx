import { Suspense, type ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone } from '@/components/shell/skeleton'
import { weekdayDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { DashboardBar, DashboardData, DashboardReads } from '@/lib/pages/v2/home'
import { AgentBoxShell, AgentTries } from './agent-box'
import { ContentTileView } from './content-tile'
import { MarketTileView } from './market-tile'
import { MovesTileView } from './moves-tile'
import { ProductsTileView } from './products-tile'
import { TileBones } from './skeleton'
import { TileBoundary } from './tile-boundary'
import { VoicesTileView } from './voices-tile'
import { WeekTileView } from './week-tile'

// THE DASHBOARD (Design v2, depth plan T8), drawn to the boards E1-Dashboard
// (1440) and E1-Dashboard-Phone (390): the bar, then three rows of tiles on a
// twelve-column grid, as the board lays them: Market (8) beside Your market
// this week (4); Voices, Your products and Content (4 each); Your moves (8)
// beside the Agent (4). Under 1180px every tile takes the row (the board's own
// breakpoint), and under 640px each takes the phone board's tighter card and
// drops what that board drops. `lib/pages/v2/home.ts` says what each reads.
//
// TWO WAYS IN, ONE DRAWING. `DashboardPage` draws a settled `DashboardData`
// (the render tests, the shots, a dump); `DashboardStream` is what the route
// draws: the same tiles, each behind its own Suspense boundary with its own
// bones, so the page paints at once and a slow page's read holds only its
// tile.

export const DASHBOARD_TITLE = surface('home').label

/** The bar's quiet line: "Week of 5 to 11 October · updated Sun 11 Oct ·
 *  next update Sun 18 Oct"; on a phone the board's short one, "5 to 11 Oct ·
 *  next update Sun 18 Oct". */
export function BarMeta({ bar }: { bar: DashboardBar }) {
  const next = bar.paused ? 'updates paused' : bar.nextUpdate ? `next update ${weekdayDate(bar.nextUpdate)}` : null
  const wide = [bar.dates ? `Week of ${bar.dates}` : null, bar.asAt ? `updated ${weekdayDate(bar.asAt)}` : null, next].filter(Boolean).join(' · ')
  const phone = [bar.short, next].filter(Boolean).join(' · ')
  if (!wide && !phone) return null
  return (
    <>
      <span className="max-sm:hidden">{wide}</span>
      <span className="sm:hidden">{phone}</span>
    </>
  )
}

function Layout({ meta, market, week, voices, products, content, moves, agent }: Record<'meta' | 'market' | 'week' | 'voices' | 'products' | 'content' | 'moves' | 'agent', ReactNode>) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={DASHBOARD_TITLE} meta={meta} />
      <section aria-label="Your market this week" className="grid grid-cols-12 gap-5">{market}{week}</section>
      <section aria-label="Who, what you sell and what to post" className="grid grid-cols-12 gap-5">{voices}{products}{content}</section>
      <section aria-label="Your moves and the Agent" className="grid grid-cols-12 gap-5">{moves}{agent}</section>
    </PageFrame>
  )
}

/** Each tile drawn failed: what its boundary shows where the tile throws
 *  while it draws (its own failure line, its head and its link). */
const FAILED = { state: 'failed' } as const
export const FAILED_TILE = {
  market: <MarketTileView read={FAILED} />,
  week: <WeekTileView read={FAILED} />,
  voices: <VoicesTileView read={FAILED} />,
  products: <ProductsTileView read={FAILED} />,
  content: <ContentTileView read={FAILED} />,
  moves: <MovesTileView read={FAILED} />,
} as const

/** The Dashboard from settled data. Each tile behind its own boundary, as the
 *  route draws them. */
export function DashboardPage({ data }: { data: DashboardData }) {
  return (
    <Layout
      meta={<BarMeta bar={data.bar} />}
      market={<TileBoundary name="market" fallback={FAILED_TILE.market}><MarketTileView read={data.market} /></TileBoundary>}
      week={<TileBoundary name="week" fallback={FAILED_TILE.week}><WeekTileView read={data.week} /></TileBoundary>}
      voices={<TileBoundary name="voices" fallback={FAILED_TILE.voices}><VoicesTileView read={data.voices} /></TileBoundary>}
      products={<TileBoundary name="products" fallback={FAILED_TILE.products}><ProductsTileView read={data.products} /></TileBoundary>}
      content={<TileBoundary name="content" fallback={FAILED_TILE.content}><ContentTileView read={data.content} /></TileBoundary>}
      moves={<TileBoundary name="moves" fallback={FAILED_TILE.moves}><MovesTileView read={data.moves} /></TileBoundary>}
      agent={(
        <AgentBoxShell action={data.agent.action}>
          <TileBoundary name="agent" fallback={null}><AgentTries tries={data.agent.tries} /></TileBoundary>
        </AgentBoxShell>
      )}
    />
  )
}

/** A part of the page, drawn once its read settles (a server component). */
async function Settled<T>({ read, children }: { read: Promise<T>; children: (value: T) => ReactNode }) {
  return <>{children(await read)}</>
}

/** The Dashboard as the route streams it: every tile's read already started
 *  (`startDashboard`), each tile drawn as its own settles, each behind its
 *  own error boundary, so a tile that throws while it draws loses only
 *  itself. */
export function DashboardStream({ reads }: { reads: DashboardReads }) {
  return (
    <Layout
      meta={<TileBoundary name="bar" fallback={null}><Suspense fallback={<Bone className="h-3 w-72" />}><Settled read={reads.bar}>{(bar) => <BarMeta bar={bar} />}</Settled></Suspense></TileBoundary>}
      market={<TileBoundary name="market" fallback={FAILED_TILE.market}><Suspense fallback={<TileBones span="wide" tall label="Loading Market" />}><Settled read={reads.market}>{(r) => <MarketTileView read={r} />}</Settled></Suspense></TileBoundary>}
      week={<TileBoundary name="week" fallback={FAILED_TILE.week}><Suspense fallback={<TileBones span="narrow" tall label="Loading your market this week" />}><Settled read={reads.week}>{(r) => <WeekTileView read={r} />}</Settled></Suspense></TileBoundary>}
      voices={<TileBoundary name="voices" fallback={FAILED_TILE.voices}><Suspense fallback={<TileBones span="narrow" label="Loading Voices" />}><Settled read={reads.voices}>{(r) => <VoicesTileView read={r} />}</Settled></Suspense></TileBoundary>}
      products={<TileBoundary name="products" fallback={FAILED_TILE.products}><Suspense fallback={<TileBones span="narrow" label="Loading Your products" />}><Settled read={reads.products}>{(r) => <ProductsTileView read={r} />}</Settled></Suspense></TileBoundary>}
      content={<TileBoundary name="content" fallback={FAILED_TILE.content}><Suspense fallback={<TileBones span="narrow" label="Loading Content" />}><Settled read={reads.content}>{(r) => <ContentTileView read={r} />}</Settled></Suspense></TileBoundary>}
      moves={<TileBoundary name="moves" fallback={FAILED_TILE.moves}><Suspense fallback={<TileBones span="wide" label="Loading Your moves" />}><Settled read={reads.moves}>{(r) => <MovesTileView read={r} />}</Settled></Suspense></TileBoundary>}
      agent={(
        // The question box draws at once; only its questions to try wait.
        <AgentBoxShell action={surface('ask').href}>
          <TileBoundary name="agent" fallback={null}>
            <Suspense fallback={null}><Settled read={reads.agent}>{(box) => <AgentTries tries={box.tries} />}</Settled></Suspense>
          </TileBoundary>
        </AgentBoxShell>
      )}
    />
  )
}
