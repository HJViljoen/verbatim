import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PeriodSwitch, type Period, type PeriodOption } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { barMonth, monthHeading } from '@/lib/reading/month-label'
import { VOICES_ONE_MONTH, voicesHref, type VoicesData } from '@/lib/pages/v2/voices'
import { BrandsCard } from './brands'
import { CreatorsCard } from './creators'
import { GroupGrid, WhoCard } from './groups'
import { Fig } from './parts'

// VOICES (depth v2, T4), drawn to the boards E3-Voices and E3-Voices-Open:
//   the bar: the title and its mono meta line (the month, the market's videos,
//     the groups, the regular creators, the brands);
//   who is in your market: every group's videos this month;
//   the groups, three to a row;
//   brands in your market (7) beside creators who drive the talk (5).
// Since 17 Oct (G3-Voices) every row and card opens its own page (a group, a
// brand, a creator: components/pages/v2/voices/{group,brand,creator}-page.tsx)
// and nothing opens in place.
// The board's period switch is drawn with the month on (the parity pass, 13
// Oct): the page reads one month (groups have no week or month-on-month
// reading yet, decision 2), so "This week" and "Over time" are shown and not
// offered, each saying why (`MonthSwitch`).

export { BrandsCard } from './brands'
export { CreatorsCard } from './creators'
export { GroupCard, GroupGrid, WhoCard } from './groups'

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

/**
 * The board's period switch, as Voices can honour it: the month it reads,
 * on, named as decision 3 names a column of the month's counts
 * (`monthHeading`: "This month" while it is, "September" once it is not),
 * and the week and over time shown but not offered (the kit's `disabled`),
 * since a group has no reading of either yet (decision 2). The reason is
 * their tooltip and their screen-reader words.
 */
export function MonthSwitch({ data }: { data: Pick<VoicesData, 'month' | 'monthLabel' | 'params'> }) {
  const options: PeriodOption<Period>[] = [
    { value: 'week', label: 'This week', disabled: VOICES_ONE_MONTH },
    { value: 'month', label: monthHeading(longMonth(data.month), data.monthLabel) },
    { value: 'time', label: 'Over time', disabled: VOICES_ONE_MONTH },
  ]
  return <PeriodSwitch value="month" options={options} hrefFor={() => voicesHref(data.params)} />
}

export function VoicesPage({ data }: { data: VoicesData }) {
  return (
    <PageFrame className="gap-5 leading-[normal]">
      <PageBar title={surface('voices').label} meta={<VoicesMeta data={data} />} phoneControls="below">
        <MonthSwitch data={data} />
      </PageBar>
      <WhoCard groups={data.groups} videos={data.videos} monthWords={data.monthWords} failed={data.subjectsFailed} />
      {data.groups.state === 'ready' ? <GroupGrid data={data} /> : null}
      {/* Brands beside creators: stacked on a phone and up to 1280, then 7 · 5. */}
      <section aria-label="Brands and creators" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <BrandsCard brands={data.brands} monthWords={data.monthWords} />
        <CreatorsCard creators={data.creators} monthWords={data.monthWords} />
      </section>
    </PageFrame>
  )
}
