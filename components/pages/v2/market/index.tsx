import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { panelItemOrder, panelPlacement, PanelSlot, PERIODS, PeriodSwitch, type PanelLayout, type PerBreakpoint } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { periodHref, type MarketData } from '@/lib/pages/v2/market'
import { LongRunSection, LongRunUnread } from './long-run'
import { ConversationPanel, SubjectPanelView } from './panel'
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

/** The subject board and the rail at each width: stacked on a phone and up
 *  to 1280, then the board's 8 · 4, in every data state (the parity pass, 13
 *  Oct: the rail never leaves its column for a row). A panel opened from the
 *  board sits under the board at every width: before the rail where they
 *  stack, under the pair where they stand side by side. */
export function boardLayout(): PanelLayout {
  return { base: { spans: [12, 12], of: 12 }, xl: { spans: [8, 4], of: 12 } }
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
  const convPanel = (notchAt?: number | PerBreakpoint) => (data.panel ? <ConversationPanel panel={data.panel} data={data} notchAt={notchAt} /> : null)
  // Opened from the subject board (a subject, or a conversation inside one):
  // under the board, at every width.
  const fromBoard = Boolean((at === 'subjects' && data.panel) || data.subjectPanel)
  const boardPlace = fromBoard ? panelPlacement(0, boardLayout()) : null
  return (
    <PageFrame className="text-foreground">
      {/* The switch sits beside the title, and under the bar below 1024,
          where the two do not fit one line: a phone, and from 768 the pane
          beside the sidebar, which left the meta line a column of five (T9). */}
      <PageBar title={MARKET_TITLE} meta={<Meta data={data} />}>
        <div className="max-lg:hidden">{periodSwitch(data)}</div>
      </PageBar>
      <div className="-mt-2 lg:hidden">{periodSwitch(data)}</div>
      <TopRowView data={data} panel={at === 'top' && data.panel ? convPanel : undefined} />
      <section aria-label="What the market is talking about" className="grid grid-cols-12 items-start gap-5">
        <SubjectBoardView board={data.subjects} data={data} style={panelItemOrder(0)} />
        {boardPlace ? (
          <PanelSlot placement={boardPlace} className="flex flex-col gap-5">
            {at === 'subjects' ? convPanel(boardPlace.notch) : null}
            {data.subjectPanel ? <SubjectPanelView panel={data.subjectPanel} data={data} notchAt={boardPlace.notch} /> : null}
          </PanelSlot>
        ) : null}
        <RailView data={data} style={panelItemOrder(1)} />
      </section>
      {!boardPlace && at === 'subjects' ? convPanel() : null}
      {!boardPlace && data.subjectPanel ? <SubjectPanelView panel={data.subjectPanel} data={data} /> : null}
      {data.table ? <ConversationTable table={data.table} data={data} /> : null}
      {/* An open conversation the table does not list and no card named
          (an old link to a quieter one) still opens, under the table. */}
      {data.panel && at === 'table' && !data.table?.rows.some((r) => r.open) ? convPanel() : null}
      {/* This month only, below the month's data: the month's long-run read,
          where one is published for the month the view reads. */}
      {data.period === 'month' && data.longRun ? <LongRunSection read={data.longRun} data={data} /> : null}
      {data.period === 'month' && !data.longRun && data.longRunUnread ? <LongRunUnread /> : null}
    </PageFrame>
  )
}
