import { Suspense, type ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, SkeletonStatStrip } from '@/components/shell/skeleton'
import { longDay, StatStripCell, StatStripFrame, type StatItem } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { DashboardBar, DashboardData, DashboardReads, TileRead, WeekTile } from '@/lib/pages/v2/home'
import { AgentBoxShell, AgentTries } from './agent-box'
import { ContentTileView } from './content-tile'
import { MarketTileView } from './market-tile'
import { MovesTileView } from './moves-tile'
import { ProductsTileView } from './products-tile'
import { TileBones } from './skeleton'
import { TileBoundary } from './tile-boundary'
import { VoicesTileView } from './voices-tile'
import { WeekTileView } from './week-tile'

// THE DASHBOARD, drawn to the audit design's board (Dashboard.dc.html, 7
// Nov): the title, the figures row under it (the week, its videos and
// comments, its month's, and the next update: the screen's base said once,
// decision 2), then one three-column grid of tiles, as the board lays them:
// Market (two columns) beside Your market this week; Voices, Your products
// and Content; Your moves (two columns) beside the Agent. Under 1180px every
// tile takes the row (the app's own point, small call 14). `lib/pages/v2/home.ts`
// says what each reads.
//
// TWO WAYS IN, ONE DRAWING. `DashboardPage` draws a settled `DashboardData`
// (the render tests, the shots, a dump); `DashboardStream` is what the route
// draws: the same tiles, each behind its own Suspense boundary with its own
// bones, so the page paints at once and a slow page's read holds only its
// tile. The figures row draws the week and the next update as soon as the
// bar's read settles, and its two figure cells as soon as the week's does
// (small call 9).

export const DASHBOARD_TITLE = surface('home').label

/** The month the week is restated against, as a cell's term: "October so
 *  far", "September" (the week tile's own words, `inMonth`, without "in"). */
const monthWords = (inMonth: string | null | undefined): string | null => {
  const w = (inMonth ?? '').replace(/^\s*in\s+/i, '').trim()
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : null
}

/** "241 videos, 3,912 comments"; the videos alone where the comments were
 *  not read; null where neither was. */
function videosAndComments(f: { videos: number | null; comments: number | null }): ReactNode {
  if (f.videos == null) return null
  return (
    <>
      <span data-copy="figure">{fmtInt(f.videos)}</span> videos
      {f.comments != null ? <>, <span data-copy="figure">{fmtInt(f.comments)}</span> comments</> : null}
    </>
  )
}

/** The words a cell prints where it has nothing to say a figure of. */
export const STRIP_NONE = { week: 'No update yet', figures: 'Not read yet', next: 'Not scheduled', paused: 'Paused' } as const

/**
 * The Dashboard's figures row, in the board's four cells and order: Week
 * ("5 to 11 Oct"), This week (its videos and comments, the read's frozen
 * figures), the week's month by name (its videos and comments) and Next
 * update ("Sunday 18 Oct"); a paused schedule says so in the last cell's
 * place. A week tile that failed, or holds no read, says so in its two
 * cells. Pure.
 */
export function dashboardStats(bar: DashboardBar, week: WeekTile | null): StatItem[] {
  const month = monthWords(week?.inMonth)
  return [
    { key: 'week', term: 'Week', value: bar.short ?? bar.dates ?? STRIP_NONE.week },
    { key: 'this-week', term: 'This week', value: (week && videosAndComments(week.week)) ?? STRIP_NONE.figures },
    { key: 'month', term: month ?? 'Month', value: (week && videosAndComments(week.month)) ?? STRIP_NONE.figures },
    bar.paused
      ? { key: 'next', term: 'Updates', value: STRIP_NONE.paused }
      : { key: 'next', term: 'Next update', value: bar.nextUpdate ? longDay(bar.nextUpdate) : STRIP_NONE.next },
  ]
}

const ok = (r: TileRead<WeekTile>): WeekTile | null => (r.state === 'ok' ? r.top : null)

/** The figures row from settled data. */
export function DashboardStrip({ bar, week }: { bar: DashboardBar; week: TileRead<WeekTile> }) {
  const items = dashboardStats(bar, ok(week))
  return <StatStripFrame cells={items.length}>{items.map((it) => <StatStripCell key={it.key} item={it} />)}</StatStripFrame>
}

/** The figures row as the route streams it: the week and the next update
 *  at once, the two figure cells as bones until the week's read settles. */
function DashboardStripStream({ bar, week }: { bar: DashboardBar; week: Promise<TileRead<WeekTile>> }) {
  const [first, , , last] = dashboardStats(bar, null)
  return (
    <StatStripFrame cells={4}>
      <StatStripCell item={first} />
      <Suspense fallback={<><CellBones /><CellBones /></>}>
        <Settled read={week}>
          {(r) => dashboardStats(bar, ok(r)).slice(1, 3).map((it) => <StatStripCell key={it.key} item={it} />)}
        </Settled>
      </Suspense>
      <StatStripCell item={last} />
    </StatStripFrame>
  )
}

function CellBones() {
  return (
    <div aria-hidden className="min-w-0">
      <Bone className="h-3 w-20" />
      <Bone className="mt-2 h-4 w-32 max-w-full" />
    </div>
  )
}

/** The tiles' grid: three columns from 1180px, one below (the board's
 *  `.grid3`, 20px between tiles). */
export const DASHBOARD_GRID = 'grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3'

function Layout({ strip, market, week, voices, products, content, moves, agent }: Record<'strip' | 'market' | 'week' | 'voices' | 'products' | 'content' | 'moves' | 'agent', ReactNode>) {
  return (
    <PageFrame className="text-foreground">
      <div className="flex shrink-0 flex-col">
        <PageBar title={DASHBOARD_TITLE} />
        <div className="mt-5">{strip}</div>
      </div>
      <div data-dashboard-grid="" className={DASHBOARD_GRID}>
        {market}{week}
        {voices}{products}{content}
        {moves}{agent}
      </div>
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
      strip={<DashboardStrip bar={data.bar} week={data.week} />}
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
      strip={<TileBoundary name="bar" fallback={null}><Suspense fallback={<SkeletonStatStrip cells={4} />}><Settled read={reads.bar}>{(bar) => <DashboardStripStream bar={bar} week={reads.week} />}</Settled></Suspense></TileBoundary>}
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
