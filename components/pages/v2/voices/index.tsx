import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { panelItemOrder, panelPlacement, PanelSlot, type PanelLayout } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { barMonth, monthHeading } from '@/lib/reading/month-label'
import { VOICES_ONE_MONTH, type VoicesData } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { BrandPanelView, BrandsCard } from './brands'
import { CreatorPanelView, CreatorsCard } from './creators'
import { GroupGrid, WhoCard } from './groups'
import { Fig } from './parts'

// VOICES (depth v2, T4), drawn to the boards E3-Voices and E3-Voices-Open:
//   the bar: the title and its mono meta line (the month, the market's videos,
//     the groups, the regular creators, the brands);
//   who is in your market: every group's videos this month;
//   the groups, three to a row, a group's panel in place under its row;
//   brands in your market (7) beside creators who drive the talk (5);
//   a brand's or a creator's panel in place under the pair.
// The board's period switch is drawn with the month on (the parity pass, 13
// Oct): the page reads one month (groups have no week or month-on-month
// reading yet, decision 2), so "This week" and "Over time" are shown and not
// offered, each saying why (`MonthSwitch`).

export { BrandPanelView, BrandsCard } from './brands'
export { CreatorPanelView, CreatorsCard } from './creators'
export { GroupCard, GroupGrid, GroupPanelView, WhoCard } from './groups'

/** The bar's meta line: "September · the last full month · 487 videos · 5
 *  groups · 21 regular creators · 2 brands"; the month's label only where the
 *  page reads a month that is not the current one (decision 3,
 *  `readingMonthLabel`). */
export function VoicesMeta({ data }: { data: VoicesData }) {
  const parts: React.ReactNode[] = [<span key="m">{barMonth(data.monthWords, data.monthLabel)}</span>]
  if (data.videos != null) parts.push(<span key="v"><Fig>{fmtInt(data.videos)}</Fig> videos</span>)
  if (data.groups.state === 'ready') parts.push(<span key="g"><Fig>{fmtInt(data.groups.cards.length)}</Fig> {data.groups.cards.length === 1 ? 'group' : 'groups'}</span>)
  if (!data.creators.empty || data.creators.atFloor > 0) parts.push(<span key="c"><Fig>{fmtInt(data.creators.atFloor)}</Fig> regular {data.creators.atFloor === 1 ? 'creator' : 'creators'}</span>)
  if (data.brands.tracked.length > 0) parts.push(<span key="b"><Fig>{fmtInt(data.brands.tracked.length)}</Fig> {data.brands.tracked.length === 1 ? 'brand' : 'brands'}</span>)
  return <>{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : null}{p}</span>)}</>
}

/** The segments' shape: the kit's `PeriodSwitch` (components/v2). */
const SEGMENT = 'whitespace-nowrap rounded-[7px] px-[13px] py-[7px] text-[13.5px] leading-[1.2]'

/**
 * The board's period switch, as Voices can honour it: the month it reads,
 * on, named as decision 3 names a column of the month's counts
 * (`monthHeading`: "This month" while it is, "September" once it is not),
 * and the week and over time shown but not offered, since a group has no
 * reading of either yet (decision 2). They are not links, so nothing promises
 * a view that is not there; the reason is their title and their screen-reader
 * words.
 */
export function MonthSwitch({ data }: { data: Pick<VoicesData, 'month' | 'monthLabel'> }) {
  const off = (label: string) => (
    <span aria-disabled="true" title={VOICES_ONE_MONTH} className={cn(SEGMENT, 'cursor-default text-muted-foreground/70')}>
      {label}<span className="sr-only"> (not read for Voices yet)</span>
    </span>
  )
  return (
    <nav aria-label="Period" data-print-hide className="inline-flex max-w-full shrink-0 flex-wrap gap-0.5 rounded-[9px] bg-card p-[3px] shadow-block ring-1 ring-foreground/6">
      {off('This week')}
      <span aria-current="page" className={cn(SEGMENT, 'bg-accent font-semibold text-accent-foreground')}>{monthHeading(longMonth(data.month), data.monthLabel)}</span>
      {off('Over time')}
    </nav>
  )
}

/** Brands beside creators: stacked on a phone and up to 1280, then 7 · 5. A
 *  brand's or a creator's panel sits under its card at every width: between
 *  the two where they stack, under the pair where they stand side by side. */
export const PAIR_LAYOUT: PanelLayout = { base: { spans: [12, 12], of: 12 }, xl: { spans: [7, 5], of: 12 } }

export function VoicesPage({ data }: { data: VoicesData }) {
  const panel = data.panel
  const pairAt = panel?.kind === 'brand' ? 0 : panel?.kind === 'creator' ? 1 : -1
  const pair = pairAt >= 0 ? panelPlacement(pairAt, PAIR_LAYOUT) : null
  const pairPanel = pair && panel?.kind === 'brand'
    ? <BrandPanelView panel={panel} monthWords={data.monthWords} notchAt={pair.notch} />
    : pair && panel?.kind === 'creator'
      ? <CreatorPanelView panel={panel} monthWords={data.monthWords} notchAt={pair.notch} />
      : null
  return (
    <PageFrame className="gap-5 leading-[normal]">
      <PageBar title={surface('voices').label} meta={<VoicesMeta data={data} />} phoneControls="below">
        <MonthSwitch data={data} />
      </PageBar>
      <WhoCard groups={data.groups} videos={data.videos} monthWords={data.monthWords} />
      {data.groups.state === 'ready' ? <GroupGrid data={data} /> : null}
      <section aria-label="Brands and creators" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <BrandsCard brands={data.brands} monthWords={data.monthWords} style={panelItemOrder(0)} />
        {pair && pairAt === 0 ? <PanelSlot placement={pair}>{pairPanel}</PanelSlot> : null}
        <CreatorsCard creators={data.creators} monthWords={data.monthWords} style={panelItemOrder(1)} />
        {pair && pairAt === 1 ? <PanelSlot placement={pair}>{pairPanel}</PanelSlot> : null}
      </section>
    </PageFrame>
  )
}
