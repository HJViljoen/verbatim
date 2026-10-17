import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { AlsoThisWeek, SectionHead, SubjectCardsView, WeekCardView } from './analysis'
import { LongRunSection, LongRunUnread } from './long-run'
import { NumbersRow } from './rail'
import { ConversationTable } from './table'
import { TopRowView } from './top'

// MARKET'S TOP LAYER (analysis first, as pages, 17 Oct; boards F2-Market,
// F2-Market-Phone and F2-Market-States; `lib/pages/v2/market.ts` says what
// each part reads). This week: the bar, the week's read, one card per
// tracked subject, what else stood out this week, then the numbers behind
// the week (three side cards in a row, never a rail beside the table, and
// every conversation, full width). Every Open is a page under Market; nothing
// opens in place.
//
// THIS MONTH AND OVER TIME ARE NOT DRAWN by a board. The rule: the subject
// cards lead under the bar (they read the month); there is no week card and
// no "Also this week"; the numbers are today's for the period (the month's
// three biggest, or the market's months, then the side cards and the table);
// This month still ends with the month's long-run read, below all of it
// (Heinrich, 13 Oct; `./long-run.tsx`).

export const MARKET_TITLE = 'Market'

/** The one neutral line before the first update has been read. */
export const MARKET_FIRST_RUN = 'Your market’s first week will appear here after the first update.'

const fig = (n: number | null | undefined) => (n == null ? null : <span data-copy="figure">{fmtInt(n)}</span>)

/** The bar's quiet line: the period's dates and the market's size. */
function Meta({ data }: { data: MarketData }) {
  if (data.period === 'week' && data.week) {
    const { market } = data.week
    return (
      <>
        {data.week.dates}
        {market.videos != null ? <> · {fig(market.videos)} videos</> : null}
        {market.comments != null ? <> · {fig(market.comments)} comments</> : null}
        {data.month.market.videos != null ? <> · {fig(data.month.market.videos)} videos {data.week.inMonth}</> : null}
      </>
    )
  }
  const { market } = data.month
  return (
    <>
      {data.weekUnavailable ? <>This week’s read is not ready yet · </> : null}
      {data.period === 'time' ? `Month by month, to ${data.month.text}` : data.month.text}
      {market.videos != null ? <> · {fig(market.videos)} videos</> : null}
      {market.comments != null ? <> · {fig(market.comments)} comments</> : null}
    </>
  )
}

/** The numbers layer's head and its note: the market's size for the period,
 *  this week's beside its month (decision 1). */
function NumbersHead({ data }: { data: MarketData }) {
  if (data.period === 'week' && data.week) {
    const { market } = data.week
    return (
      <SectionHead
        title="The numbers behind the week"
        note={market.videos != null ? (
          <>
            Your market’s {fig(market.videos)} videos{market.comments != null ? <> and {fig(market.comments)} comments</> : null} this week
            {data.month.market.videos != null ? <> · {fig(data.month.market.videos)} {data.week.inMonth}</> : null}
          </>
        ) : null}
      />
    )
  }
  const { market } = data.month
  return (
    <SectionHead
      title={data.period === 'time' ? 'The numbers over time' : 'The numbers behind the month'}
      note={data.period === 'time'
        ? <>Month by month, to {data.month.text}</>
        : market.videos != null ? <>Your market’s {fig(market.videos)} videos{market.comments != null ? <> and {fig(market.comments)} comments</> : null} in {data.month.text}</> : null}
    />
  )
}

function periodSwitch(data: MarketData) {
  return <PeriodSwitch value={data.period} options={PERIODS} hrefFor={(p) => periodHref(data.params, p)} />
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
  const week = data.period === 'week'
  return (
    <PageFrame className="text-foreground">
      {/* The switch sits beside the title, and under the bar below 1024,
          where the two do not fit one line: a phone, and from 768 the pane
          beside the sidebar, which left the meta line a column of five (T9). */}
      <PageBar title={MARKET_TITLE} meta={<Meta data={data} />}>
        <div className="max-lg:hidden">{periodSwitch(data)}</div>
      </PageBar>
      <div className="-mt-2 lg:hidden">{periodSwitch(data)}</div>
      {data.weekCard ? <WeekCardView card={data.weekCard} /> : null}
      <SubjectCardsView cards={data.subjectCards ?? []} />
      {week ? <AlsoThisWeek data={data} /> : null}
      <NumbersHead data={data} />
      {week ? null : <TopRowView data={data} />}
      <NumbersRow data={data} />
      {data.table ? <ConversationTable table={data.table} data={data} /> : null}
      {/* This month only, below the month's data: the month's long-run read,
          where one is published for the month the view reads. */}
      {data.period === 'month' && data.longRun ? <LongRunSection read={data.longRun} data={data} /> : null}
      {data.period === 'month' && !data.longRun && data.longRunUnread ? <LongRunUnread /> : null}
    </PageFrame>
  )
}
