import Link from 'next/link'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Crumbs } from '@/components/shell/crumbs'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { marketConversationPath, marketSubjectPath, surface } from '@/lib/nav'
import { MARKET_FIRST_RUN, MARKET_TITLE, Meta } from './index'
import { WeekPageBody } from './week-page'
import { ConversationPageBody } from './conversation-page'
import { SubjectPageBody, weekLevelOf } from './subject-page'
import { fmtInt } from '@/lib/format'
import { OLINK } from './parts'

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
export function MarketSubjectPage({ data, switcherOpen = false }: { data: MarketData | null; switcherOpen?: boolean }) {
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
      <PageBar title={page.panel.name} crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} open={switcherOpen ? 'current' : undefined} /> : null} meta={<SubjectMeta page={page} data={data} />}>
        <div className="max-lg:hidden"><Switch data={data} path={path} /></div>
      </PageBar>
      <div className="-mt-2 lg:hidden"><Switch data={data} path={path} /></div>
      <SubjectPageBody page={page} data={data} />
    </PageFrame>
  )
}

/** A subject's meta line: the period's dates, and where its check passed,
 *  its videos this week beside its month's (decision 1). No figure for one
 *  whose check has not (U6). */
function SubjectMeta({ page, data }: { page: NonNullable<MarketData['subjectPage']>; data: MarketData }) {
  const level = page.panel.level
  const week = data.period === 'week' && data.week ? data.week : null
  // This week's share on the level's base (17 Oct); none where unread.
  const stat = weekLevelOf(page)
  const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>
  if (week) {
    return (
      <>
        {week.dates}
        {level && stat ? <> · in {lv(stat.k, stat.n)} videos this week</> : null}
        {level ? <> · {lv(level.k, level.n)} {week.inMonth}</> : null}
      </>
    )
  }
  return <>{data.period === 'time' ? `Month by month, to ${data.month.text}` : data.month.text}{level ? <> · in {lv(level.k, level.n)} videos</> : null}</>
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
  const lv = (l: { k: number; n: number }) => <span data-copy="level">{fmtInt(l.k)} of {fmtInt(l.n)}</span>
  const meta = data.period === 'week' && data.week
    ? <>{data.week.dates}{page.week ? <> · in {lv(page.week)} category videos this week</> : null}{page.month ? <> · {lv(page.month)} {data.week.inMonth}</> : null}</>
    : <>{data.period === 'time' ? `Month by month, to ${data.month.text}` : data.month.text}{page.month ? <> · in {lv(page.month)} category videos</> : null}</>
  return (
    <PageFrame className="text-foreground">
      <PageBar title={page.panel.label} crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} /> : null} meta={meta}>
        <div className="max-lg:hidden"><Switch data={data} path={path} /></div>
      </PageBar>
      <div className="-mt-2 lg:hidden"><Switch data={data} path={path} /></div>
      <ConversationPageBody page={page} data={data} />
    </PageFrame>
  )
}

/** The week's page (`/dashboard/market/week`, F2-Market-Week): the published
 *  read in full. No period switch and no chevron: a read is one week's. */
export function MarketWeekPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  return (
    <PageFrame className="text-foreground">
      <PageBar title="This week’s read" crumbs={data.crumbs ? <Crumbs crumbs={data.crumbs} /> : null} meta={data.week ? <Meta data={data} /> : null} />
      {data.weekPage ? <WeekPageBody page={data.weekPage} data={data} /> : null}
    </PageFrame>
  )
}
