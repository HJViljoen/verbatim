import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { GoLink, PERIODS, PeriodSwitch, withMonthName, type StatItem } from '@/components/v2'
import { periodHref, WEEK_PAGE_TITLE, type MarketData } from '@/lib/pages/v2/market'
import { marketConversationPath, marketSubjectPath, surface } from '@/lib/nav'
import { MARKET_FIRST_RUN, MARKET_TITLE } from './index'
import { WeekPageBody } from './week-page'
import { ConversationPageBody, conversationStats } from './conversation-page'
import { SubjectPageBody, subjectStats } from './subject-page'
import { fmtInt } from '@/lib/format'

// MARKET'S LEVEL PAGES (depth as pages, 17 Oct): a tracked subject, a
// conversation and the week's read, each its own address under Market
// (lib/nav.ts). Market stays the sidebar's active surface on every one.
//
// EACH OPENS WITH THE PATH, THEN THE PAGE NAMING ITS LEVEL (F3-Market-Nav):
// the slim crumb row and the title block (`LevelBar`), the period switch at
// the block's right-hand end; the week's read has no switch.

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
      <GoLink href={surface('market').href} className="self-start">{BACK_TO_MARKET}</GoLink>
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
  return <PeriodSwitch value={data.period} options={withMonthName(PERIODS, data.month.text)} hrefFor={(p) => periodHref(data.params, p, path)} />
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
      {data.crumbs ? (
        <LevelBar crumbs={data.crumbs} level="subject" title={page.panel.name} stats={subjectStats(page, data)} controls={<Switch data={data} path={path} />} open={switcherOpen ? 'current' : undefined} />
      ) : <PageBar title={page.panel.name} />}
      <SubjectPageBody page={page} data={data} />
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
  const crumbs = data.crumbs ?? []
  return (
    <PageFrame className="text-foreground">
      {crumbs.length > 0 ? (
        <LevelBar crumbs={crumbs} level="conversation" title={page.panel.label} stats={conversationStats(page, data)} controls={<Switch data={data} path={path} />} />
      ) : <PageBar title={page.panel.label} />}
      <ConversationPageBody page={page} data={data} />
    </PageFrame>
  )
}


/** The week's page's title and its crumb (the board's words; the path's own
 *  words, `WEEK_PAGE_TITLE`, stay in `lib`). */
export const THE_WEEKS_READ = 'The week’s read'

/** The week's page (`/dashboard/market/week`), drawn to the audit design's
 *  board (Market-Week.dc.html): "Market / The week's read", the title "The
 *  week's read", and the figures row (`weekStats`). No period switch and no
 *  chevron: a read is one week's. */
export function MarketWeekPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  return (
    <PageFrame className="text-foreground">
      {data.crumbs ? (
        // The crumb says the board's words too ("Market / The week's
        // read"); the path's own words are `lib`'s and stay there.
        <LevelBar crumbs={data.crumbs.map((c, i, all) => (i === all.length - 1 ? { ...c, label: THE_WEEKS_READ } : c))} level="week" title={THE_WEEKS_READ} stats={weekStats(data)} />
      ) : <PageBar title={WEEK_PAGE_TITLE} stats={weekStats(data)} />}
      {data.weekPage ? <WeekPageBody page={data.weekPage} data={data} /> : null}
    </PageFrame>
  )
}

const fig = (n: number | null | undefined) => (n == null ? null : <span data-copy="figure">{fmtInt(n)}</span>)

/** The week's figures row (the board's three cells): the week, the market's
 *  videos and comments this week, and the month's videos (decision 1: the
 *  week beside its month). Pure. */
export function weekStats(data: MarketData): StatItem[] {
  const week = data.week
  if (!week) return []
  const { videos, comments } = week.market
  return [
    { key: 'week', term: 'Week', value: week.dates },
    { key: 'market', term: 'Your market this week', value: videos != null ? <>{fig(videos)} videos{comments != null ? <>, {fig(comments)} comments</> : null}</> : 'Not read yet' },
    { key: 'month', term: data.month.text, value: data.month.market.videos != null ? <>{fig(data.month.market.videos)} videos</> : 'Not read yet' },
  ]
}
