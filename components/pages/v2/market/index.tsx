import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { LongRunSection, LongRunUnread } from './long-run'
import { RailView } from './rail'
import { SubjectBoardView } from './subjects'
import { ConversationTable } from './table'
import { TopRowView } from './top'

// MARKET (Design v2, depth plan T3): what the market is talking about, drawn
// to the boards E2-Market and E2-Market-Open (`lib/pages/v2/market.ts` says
// what each part reads). The bar, the top row, the subject board beside the
// rail, then every conversation; an open conversation or subject draws in
// place under the row it was opened from. This month ends with the month's
// long-run read, below all of it (Heinrich, 13 Oct; `./long-run.tsx`).

export const MARKET_TITLE = 'Market'

/** The one neutral line before the first update has been read. */
export const MARKET_FIRST_RUN = 'Your market’s first week will appear here after the first update.'

/** The bar's quiet line: the period's dates and the market's size. */
function Meta({ data }: { data: MarketData }) {
  const fig = (n: number | null | undefined) => (n == null ? null : <span data-copy="figure">{fmtInt(n)}</span>)
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
  return (
    <PageFrame className="text-foreground">
      <PageBar title={MARKET_TITLE} meta={<Meta data={data} />}>
        <div className="max-lg:hidden">{periodSwitch(data)}</div>
      </PageBar>
      <div className="-mt-2 lg:hidden">{periodSwitch(data)}</div>
      <TopRowView data={data} />
      <section aria-label="What the market is talking about" className="grid grid-cols-12 items-start gap-5">
        <SubjectBoardView board={data.subjects} data={data} />
        <RailView data={data} />
      </section>
      {data.table ? <ConversationTable table={data.table} data={data} /> : null}
      {/* This month only, below the month's data: the month's long-run read,
          where one is published for the month the view reads. */}
      {data.period === 'month' && data.longRun ? <LongRunSection read={data.longRun} data={data} /> : null}
      {data.period === 'month' && !data.longRun && data.longRunUnread ? <LongRunUnread /> : null}
    </PageFrame>
  )
}
