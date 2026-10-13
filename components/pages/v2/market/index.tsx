import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PERIODS, PeriodSwitch } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { ConversationPanel, SubjectPanelView } from './panel'
import { RailView } from './rail'
import { SubjectBoardView } from './subjects'
import { ConversationTable } from './table'
import { TopRowView } from './top'

// MARKET (Design v2, depth plan T3): what the market is talking about, drawn
// to the boards E2-Market and E2-Market-Open (`lib/pages/v2/market.ts` says
// what each part reads). The bar, the top row, the subject board beside the
// rail, then every conversation; an open conversation or subject draws in
// place under the row it was opened from.

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
  const at = data.panel?.at ?? data.subjectPanel?.at ?? null
  const convPanel = data.panel ? <ConversationPanel panel={data.panel} data={data} /> : null
  return (
    <PageFrame className="text-foreground">
      {/* The switch sits beside the title, and under the bar on a phone,
          where the two do not fit one line. */}
      <PageBar title={MARKET_TITLE} meta={<Meta data={data} />}>
        <div className="max-sm:hidden">{periodSwitch(data)}</div>
      </PageBar>
      <div className="-mt-2 sm:hidden">{periodSwitch(data)}</div>
      <TopRowView data={data} />
      {at === 'top' && convPanel ? convPanel : null}
      <section aria-label="What the market is talking about" className="grid grid-cols-12 items-start gap-5">
        {data.subjects ? <SubjectBoardView board={data.subjects} data={data} /> : null}
        <RailView data={data} />
      </section>
      {at === 'subjects' && convPanel ? convPanel : null}
      {data.subjectPanel ? <SubjectPanelView panel={data.subjectPanel} data={data} /> : null}
      {data.table ? <ConversationTable table={data.table} data={data} /> : null}
      {/* An open conversation the table does not list and no card named
          (an old link to a quieter one) still opens, under the table. */}
      {convPanel && at === 'table' && !data.table?.rows.some((r) => r.open) ? convPanel : null}
    </PageFrame>
  )
}
