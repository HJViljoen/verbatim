import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { ConversationLabel, LevelBar } from '@/components/shell/level-bar'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { periodHref, WEEK_PAGE_TITLE, type MarketData } from '@/lib/pages/v2/market'
import { marketConversationPath, marketSubjectPath, surface } from '@/lib/nav'
import { MARKET_FIRST_RUN, MARKET_TITLE } from './index'
import { WeekPageBody } from './week-page'
import { ConversationPageBody } from './conversation-page'
import { SubjectPageBody, weekLevelOf } from './subject-page'
import { fmtInt } from '@/lib/format'
import { OLINK } from './parts'

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
      {data.crumbs ? (
        <LevelBar crumbs={data.crumbs} level="subject" label="Subject" title={page.panel.name} meta={subjectMeta(page, data)} controls={<Switch data={data} path={path} />} open={switcherOpen ? 'current' : undefined} />
      ) : <PageBar title={page.panel.name} />}
      <SubjectPageBody page={page} data={data} />
    </PageFrame>
  )
}

const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>

/** A subject's meta line, as its phone lines: the period's dates, and where
 *  its check passed its videos this week beside its month's (decision 1),
 *  "82 of 241 videos this week · 108 of 318 in October so far". No figure for
 *  one whose check has not (U6). */
export function subjectMeta(page: NonNullable<MarketData['subjectPage']>, data: MarketData): ReactNode[][] {
  const level = page.panel.level
  const week = data.period === 'week' && data.week ? data.week : null
  // This week's count on the level's base (17 Oct); none where unread.
  const stat = weekLevelOf(page)
  if (week) {
    return [
      [week.dates, ...(level && stat ? [<>{lv(stat.k, stat.n)} videos this week</>] : [])],
      level ? [<>{lv(level.k, level.n)} {week.inMonth}</>] : [],
    ]
  }
  const when = data.period === 'time' ? `Month by month, to ${data.month.text}` : data.month.text
  return [[when], level ? [<>{lv(level.k, level.n)} videos{data.period === 'time' ? ` in ${data.month.text}` : null}</>] : []]
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
  const parent = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null
  return (
    <PageFrame className="text-foreground">
      {crumbs.length > 0 ? (
        <LevelBar crumbs={crumbs} level="conversation" label={<ConversationLabel parent={parent} />} meta={conversationMeta(page, data)} controls={<Switch data={data} path={path} />} />
      ) : <PageBar title={page.panel.label} />}
      <ConversationPageBody page={page} data={data} />
    </PageFrame>
  )
}

/** A conversation's meta line, as its phone lines: the dates, its category
 *  videos this week, its month (decision 1: the week beside its month). */
export function conversationMeta(page: NonNullable<MarketData['convPage']>, data: MarketData): ReactNode[][] {
  if (data.period === 'week' && data.week) {
    return [
      [data.week.dates],
      page.week ? [<>{lv(page.week.k, page.week.n)} category videos this week</>] : [],
      page.month ? [<>{lv(page.month.k, page.month.n)} {data.week.inMonth}</>] : [],
    ]
  }
  return [[data.period === 'time' ? `Month by month, to ${data.month.text}` : data.month.text], page.month ? [<>{lv(page.month.k, page.month.n)} category videos{data.period === 'time' ? ` in ${data.month.text}` : null}</>] : []]
}

/** The week's page (`/dashboard/market/week`, F2-Market-Week): the published
 *  read in full, titled by its dates ("5 to 11 October", F3-Market-Nav 7). No
 *  period switch and no chevron: a read is one week's. */
export function MarketWeekPage({ data }: { data: MarketData | null }) {
  if (!data) return <FirstRun />
  return (
    <PageFrame className="text-foreground">
      {data.crumbs ? (
        <LevelBar crumbs={data.crumbs} level="week" label="The week’s read" title={data.week?.dates || WEEK_PAGE_TITLE} meta={weekMeta(data)} />
      ) : <PageBar title={WEEK_PAGE_TITLE} />}
      {data.weekPage ? <WeekPageBody page={data.weekPage} data={data} /> : null}
    </PageFrame>
  )
}

const fig = (n: number | null | undefined) => (n == null ? null : <span data-copy="figure">{fmtInt(n)}</span>)

/** The week's meta: the market's videos and comments this week, then its
 *  month (decision 1); the dates are the title. */
export function weekMeta(data: MarketData): ReactNode[][] | null {
  const week = data.week
  if (!week) return null
  const { videos, comments } = week.market
  const first = videos != null && comments != null
    ? <>{fig(videos)} videos and {fig(comments)} comments this week</>
    : videos != null ? <>{fig(videos)} videos this week</> : null
  return [first ? [first] : [], data.month.market.videos != null ? [<>{fig(data.month.market.videos)} videos {week.inMonth}</>] : []]
}
