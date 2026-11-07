import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PERIODS, PeriodSwitch, withMonthName, type StatItem } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { SectionHead, SubjectCardsView, WeekCardView } from './analysis'
import { LongRunSection, LongRunUnread } from './long-run'
import { NumbersRow } from './rail'
import { ConversationTable } from './table'
import { TopRowView } from './top'

// MARKET'S TOP LAYER, drawn to the audit design's board (Market.dc.html, 7
// Nov; `lib/pages/v2/market.ts` says what each part reads). This week: the
// title and the period switch, the figures row (the screen's base said once,
// decision 2), the week's read, one card per tracked subject, then the
// numbers behind the week (three side cards in a row, and every
// conversation, full width). Every Open is a page under Market; nothing opens
// in place. "Also this week" is gone (small call 12): its conversations are
// the table's rows, and its "nothing new" line is the table's.
//
// THIS MONTH AND OVER TIME ARE NOT DRAWN by a board. The rule: the subject
// cards lead under the bar (they read the month); there is no week card; the
// numbers are today's for the period (the month's three biggest, or the
// market's months, then the side cards and the table); This month still ends
// with the month's long-run read, below all of it (Heinrich, 13 Oct;
// `./long-run.tsx`).

export const MARKET_TITLE = 'Market'

/** The one neutral line before the first update has been read. */
export const MARKET_FIRST_RUN = 'Your market’s first week will appear here after the first update.'

/** The line under the title where the week has no read yet. */
export const WEEK_NOT_READY = 'This week’s read is not ready yet.'

const fig = (n: number | null | undefined) => (n == null ? null : <span data-copy="figure">{fmtInt(n)}</span>)
const videosAnd = (m: { videos: number | null; comments: number | null }) =>
  m.videos == null ? null : <>{fig(m.videos)} videos{m.comments != null ? <>, {fig(m.comments)} comments</> : null}</>
const NOT_READ = 'Not read yet'

/**
 * The figures row (the board's `.strip`): the screen's base said once, so
 * the counts below may be bare (decision 2). This week: the week, the
 * market's videos and comments, the category's videos (every conversation's
 * base), and the month's videos. This month: the month, the market's and the
 * category's. Over time: the months, and the market's latest month. Pure.
 */
export function marketStats(data: MarketData): StatItem[] {
  if (data.period === 'week' && data.week) {
    const w = data.week
    return [
      { key: 'week', term: 'Week', value: w.dates },
      { key: 'market', term: 'Your market this week', value: videosAnd(w.market) ?? NOT_READ },
      { key: 'category', term: 'The category this week', value: w.category != null ? <>{fig(w.category)} videos</> : NOT_READ },
      { key: 'month', term: data.month.text, value: data.month.market.videos != null ? <>{fig(data.month.market.videos)} videos</> : NOT_READ },
    ]
  }
  const m = data.month
  if (data.period === 'time') {
    return [
      { key: 'period', term: 'Months', value: <>Month by month, to {m.text}</> },
      { key: 'market', term: `Your market in ${m.text}`, value: videosAnd(m.market) ?? NOT_READ },
    ]
  }
  return [
    { key: 'month', term: 'Month', value: m.text },
    { key: 'market', term: 'Your market', value: videosAnd(m.market) ?? NOT_READ },
    { key: 'category', term: 'The category', value: m.category != null ? <>{fig(m.category)} videos</> : NOT_READ },
  ]
}

/** The numbers layer's head: its title alone (the figures row says the
 *  market's size). */
function NumbersHead({ data }: { data: MarketData }) {
  const title = data.period === 'week' && data.week ? 'The numbers behind the week' : data.period === 'time' ? 'The numbers over time' : 'The numbers behind the month'
  return <SectionHead title={title} />
}

/** The period switch, once, beside the title: This week, the month by its
 *  name ("October so far"), Over time. */
function periodSwitch(data: MarketData) {
  return <PeriodSwitch value={data.period} options={withMonthName(PERIODS, data.month.text)} hrefFor={(p) => periodHref(data.params, p)} />
}

export function MarketPage({ data }: { data: MarketData | null }) {
  if (!data) {
    return (
      <PageFrame className="text-foreground">
        <PageBar title={MARKET_TITLE} />
        <p className="m-0 text-[15px] text-muted-foreground">{MARKET_FIRST_RUN}</p>
      </PageFrame>
    )
  }
  return (
    <PageFrame className="text-foreground">
      <PageBar title={MARKET_TITLE} sub={data.weekUnavailable ? WEEK_NOT_READY : undefined} stats={marketStats(data)} phoneControls="below">
        {periodSwitch(data)}
      </PageBar>
      {data.weekCard ? <WeekCardView card={data.weekCard} /> : null}
      <SubjectCardsView cards={data.subjectCards ?? []} />
      <NumbersHead data={data} />
      {data.period === 'week' ? null : <TopRowView data={data} />}
      <NumbersRow data={data} />
      {data.table ? <ConversationTable table={data.table} data={data} /> : null}
      {/* This month only, below the month's data: the month's long-run read,
          where one is published for the month the view reads. */}
      {data.period === 'month' && data.longRun ? <LongRunSection read={data.longRun} data={data} /> : null}
      {data.period === 'month' && !data.longRun && data.longRunUnread ? <LongRunUnread /> : null}
    </PageFrame>
  )
}
