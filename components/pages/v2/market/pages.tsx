import Link from 'next/link'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Crumbs } from '@/components/shell/crumbs'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { marketConversationPath, marketSubjectPath, surface } from '@/lib/nav'
import { MARKET_FIRST_RUN, MARKET_TITLE } from './index'
import { ConversationPanel, SubjectPanelView } from './panel'
import { OLINK, Stored } from './parts'

// MARKET'S LEVEL PAGES (depth as pages, 17 Oct): a tracked subject, a
// conversation and the week's read, each its own address under Market
// (lib/nav.ts). Market stays the sidebar's active surface on every one.

/** A level page whose id names nothing Market follows (an unknown or a
 *  retired one): one calm line inside the page, and the way back. */
export const SUBJECT_MISSING = 'Market does not follow a subject at this address.'
export const CONVERSATION_MISSING = 'Market has no conversation at this address.'
export const BACK_TO_MARKET = 'Back to Market'

/** The one calm line, and Market. */
export function MarketMissing({ line }: { line: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p data-market-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
      <Link href={surface('market').href} className={OLINK}>{BACK_TO_MARKET} →</Link>
    </div>
  )
}

/** Before the first update: the top page's own line, and Market. */
function FirstRun() {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={MARKET_TITLE} />
      <p className="m-0 text-[15px] text-muted-foreground">{MARKET_FIRST_RUN}</p>
    </PageFrame>
  )
}

function Switch({ data, path }: { data: MarketData; path: string }) {
  return <PeriodSwitch value={data.period} options={PERIODS} hrefFor={(p) => periodHref(data.params, p, path)} />
}

/** A tracked subject's page (`/dashboard/market/subjects/[id]`). */
export function MarketSubjectPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  const page = data.subjectPage
  if (!page || data.missing) {
    return (
      <PageFrame className="text-foreground">
        <PageBar title={MARKET_TITLE} />
        <MarketMissing line={SUBJECT_MISSING} />
      </PageFrame>
    )
  }
  const path = marketSubjectPath(page.panel.id)
  return (
    <PageFrame className="text-foreground">
      <PageBar title={page.panel.name} crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} /> : null}>
        <div className="max-lg:hidden"><Switch data={data} path={path} /></div>
      </PageBar>
      <div className="-mt-2 lg:hidden"><Switch data={data} path={path} /></div>
      <SubjectPanelView panel={page.panel} data={data} />
    </PageFrame>
  )
}

/** A conversation's page (`/dashboard/market/conversations/[conv]`). */
export function MarketConversationPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  const page = data.convPage
  if (!page || data.missing) {
    return (
      <PageFrame className="text-foreground">
        <PageBar title={MARKET_TITLE} />
        <MarketMissing line={CONVERSATION_MISSING} />
      </PageFrame>
    )
  }
  const path = marketConversationPath(page.panel.id)
  return (
    <PageFrame className="text-foreground">
      <PageBar title={page.panel.label} crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} /> : null}>
        <div className="max-lg:hidden"><Switch data={data} path={path} /></div>
      </PageBar>
      <div className="-mt-2 lg:hidden"><Switch data={data} path={path} /></div>
      <ConversationPanel panel={page.panel} data={data} />
    </PageFrame>
  )
}

/** The week's page (`/dashboard/market/week`): the published read in full. */
export function MarketWeekPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  const page = data.weekPage
  return (
    <PageFrame className="text-foreground">
      <PageBar title="This week’s read" crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} /> : null} />
      {page && page.state === 'ready' && page.line ? <Stored line={page.line} slot="week_read" className="m-0 text-[15px]" /> : <p className="m-0 text-[15px] text-muted-foreground">This week’s read is not ready yet.</p>}
    </PageFrame>
  )
}
