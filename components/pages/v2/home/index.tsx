import { Suspense, type ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone } from '@/components/shell/skeleton'
import { weekdayDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { DashboardBar, DashboardData, DashboardReads } from '@/lib/pages/v2/home'
import { AgentBoxShell, AgentBoxView, AgentTries } from './agent-box'
import { ContentTileView } from './content-tile'
import { MarketTileView } from './market-tile'
import { MovesTileView } from './moves-tile'
import { ProductsTileView } from './products-tile'
import { TileBones } from './skeleton'
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
 *  next update Sun 18 Oct". */
export function BarMeta({ bar }: { bar: DashboardBar }) {
  const parts: string[] = []
  if (bar.dates) parts.push(`Week of ${bar.dates}`)
  if (bar.asAt) parts.push(`updated ${weekdayDate(bar.asAt)}`)
  if (bar.paused) parts.push('updates paused')
  else if (bar.nextUpdate) parts.push(`next update ${weekdayDate(bar.nextUpdate)}`)
  return parts.length > 0 ? <>{parts.join(' · ')}</> : null
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

/** The Dashboard from settled data. */
export function DashboardPage({ data }: { data: DashboardData }) {
  return (
    <Layout
      meta={<BarMeta bar={data.bar} />}
      market={<MarketTileView read={data.market} />}
      week={<WeekTileView read={data.week} />}
      voices={<VoicesTileView read={data.voices} />}
      products={<ProductsTileView read={data.products} />}
      content={<ContentTileView read={data.content} />}
      moves={<MovesTileView read={data.moves} />}
      agent={<AgentBoxView box={data.agent} />}
    />
  )
}

/** A part of the page, drawn once its read settles (a server component). */
async function Settled<T>({ read, children }: { read: Promise<T>; children: (value: T) => ReactNode }) {
  return <>{children(await read)}</>
}

/** The Dashboard as the route streams it: every tile's read already started
 *  (`startDashboard`), each tile drawn as its own settles. */
export function DashboardStream({ reads }: { reads: DashboardReads }) {
  return (
    <Layout
      meta={<Suspense fallback={<Bone className="h-3 w-72" />}><Settled read={reads.bar}>{(bar) => <BarMeta bar={bar} />}</Settled></Suspense>}
      market={<Suspense fallback={<TileBones span="wide" tall label="Loading Market" />}><Settled read={reads.market}>{(r) => <MarketTileView read={r} />}</Settled></Suspense>}
      week={<Suspense fallback={<TileBones span="narrow" tall label="Loading your market this week" />}><Settled read={reads.week}>{(r) => <WeekTileView read={r} />}</Settled></Suspense>}
      voices={<Suspense fallback={<TileBones span="narrow" label="Loading Voices" />}><Settled read={reads.voices}>{(r) => <VoicesTileView read={r} />}</Settled></Suspense>}
      products={<Suspense fallback={<TileBones span="narrow" label="Loading Your products" />}><Settled read={reads.products}>{(r) => <ProductsTileView read={r} />}</Settled></Suspense>}
      content={<Suspense fallback={<TileBones span="narrow" label="Loading Content" />}><Settled read={reads.content}>{(r) => <ContentTileView read={r} />}</Settled></Suspense>}
      moves={<Suspense fallback={<TileBones span="wide" label="Loading Your moves" />}><Settled read={reads.moves}>{(r) => <MovesTileView read={r} />}</Settled></Suspense>}
      agent={(
        // The question box draws at once; only its questions to try wait.
        <AgentBoxShell action={surface('ask').href}>
          <Suspense fallback={null}><Settled read={reads.agent}>{(box) => <AgentTries tries={box.tries} />}</Settled></Suspense>
        </AgentBoxShell>
      )}
    />
  )
}
