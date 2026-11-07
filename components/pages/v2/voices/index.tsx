import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PeriodSwitch, type Period, type PeriodOption, type StatItem } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { monthTerm } from '@/lib/reading/month-label'
import { VOICES_ONE_MONTH, voicesHref, type VoicesData } from '@/lib/pages/v2/voices'
import { BrandsCard } from './brands'
import { CreatorsCard } from './creators'
import { GroupGrid, WhoCard } from './groups'
import { Fig } from './parts'

// VOICES, drawn to the audit design's board (Voices.dc.html, 7 Nov): the
// title with the month switch and its one line beside it, the figures row
// (the month, the market's videos, the groups, the regular creators, the
// brands: the screen's base said once, decision 2), who is in your market,
// "Each group in {month}" with its cards three to a row and the mix card
// last, then brands in your market and the creators who drive the talk, each
// a section of its own, full width. Since 17 Oct every row and card opens its
// own page (a group, a brand, a creator:
// components/pages/v2/voices/{group,brand,creator}-page.tsx) and nothing
// opens in place. The page reads one month (groups have no week or
// month-on-month reading yet, decision 2), so "This week" and "Over time"
// are shown and not offered, and the line beside the switch says why.

export { BrandsCard } from './brands'
export { CreatorsCard } from './creators'
export { GroupCard, GroupGrid, WhoCard } from './groups'

/** The figures row: the month ("The last full month: October", its term by
 *  `monthTerm`, decision 3), the market's videos, the groups, the regular
 *  creators and the brands, each where the page has it. Pure. */
export function voicesStats(data: VoicesData): StatItem[] {
  const cells: StatItem[] = [{ key: 'month', term: monthTerm(data.monthLabel), value: data.monthWords }]
  cells.push({ key: 'market', term: 'Your market', value: data.videos != null ? <><Fig>{fmtInt(data.videos)}</Fig> videos</> : 'Not read yet' })
  if (data.groups.state === 'ready') cells.push({ key: 'groups', term: 'Groups', value: <Fig>{fmtInt(data.groups.cards.length)}</Fig> })
  if (!data.creators.empty || data.creators.atFloor > 0) cells.push({ key: 'creators', term: 'Regular creators', value: <Fig>{fmtInt(data.creators.atFloor)}</Fig> })
  if (data.brands.tracked.length > 0) cells.push({ key: 'brands', term: 'Brands', value: <Fig>{fmtInt(data.brands.tracked.length)}</Fig> })
  return cells
}

/**
 * The board's period switch, as Voices can honour it: the month it reads,
 * on, by its name ("October", "November so far"), and the week and over
 * time shown but not offered (the kit's `disabled`), since a group has no
 * reading of either yet (decision 2). The reason is their tooltip and their
 * screen-reader words, and the line beside the switch (`MonthLine`).
 */
export function MonthSwitch({ data }: { data: Pick<VoicesData, 'month' | 'monthWords' | 'params'> }) {
  const options: PeriodOption<Period>[] = [
    { value: 'week', label: 'This week', disabled: VOICES_ONE_MONTH },
    { value: 'month', label: data.monthWords },
    { value: 'time', label: 'Over time', disabled: VOICES_ONE_MONTH },
  ]
  return <PeriodSwitch value="month" options={options} hrefFor={() => voicesHref(data.params)} />
}

/** The switch with its one line under it, at the bar's right-hand end (at
 *  the left under the title on a phone), as the board draws it. */
function MonthControls({ data }: { data: VoicesData }) {
  return (
    <div className="flex flex-col items-end gap-2 max-sm:items-start">
      <MonthSwitch data={data} />
      <p data-voices-one-month="" className="m-0 max-w-[360px] text-right text-[13px] leading-[1.45] text-muted-foreground max-sm:text-left">{VOICES_ONE_MONTH}</p>
    </div>
  )
}

export function VoicesPage({ data }: { data: VoicesData }) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={surface('voices').label} stats={voicesStats(data)} phoneControls="below">
        <MonthControls data={data} />
      </PageBar>
      <WhoCard groups={data.groups} videos={data.videos} monthWords={data.monthWords} failed={data.subjectsFailed} />
      {data.groups.state === 'ready' ? <GroupGrid data={data} /> : null}
      <BrandsCard brands={data.brands} monthWords={data.monthWords} />
      <CreatorsCard creators={data.creators} monthWords={data.monthWords} />
    </PageFrame>
  )
}
