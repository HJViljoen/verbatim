import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { VoicesData } from '@/lib/pages/v2/voices'
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
// The board's period switch is not drawn: the page reads one month (groups
// have no week or month-on-month reading yet, decision 2), so a switch would
// offer views with nothing behind them.

export { BrandPanelView, BrandsCard } from './brands'
export { CreatorPanelView, CreatorsCard } from './creators'
export { GroupCard, GroupGrid, GroupPanelView, WhoCard } from './groups'

/** The bar's meta line: "September · 487 videos · 5 groups · 21 regular
 *  creators · 2 brands". */
export function VoicesMeta({ data }: { data: VoicesData }) {
  const parts: React.ReactNode[] = [<span key="m">{data.monthWords}</span>]
  if (data.videos != null) parts.push(<span key="v"><Fig>{fmtInt(data.videos)}</Fig> videos</span>)
  if (data.groups.state === 'ready') parts.push(<span key="g"><Fig>{fmtInt(data.groups.cards.length)}</Fig> {data.groups.cards.length === 1 ? 'group' : 'groups'}</span>)
  if (!data.creators.empty || data.creators.atFloor > 0) parts.push(<span key="c"><Fig>{fmtInt(data.creators.atFloor)}</Fig> regular {data.creators.atFloor === 1 ? 'creator' : 'creators'}</span>)
  if (data.brands.tracked.length > 0) parts.push(<span key="b"><Fig>{fmtInt(data.brands.tracked.length)}</Fig> {data.brands.tracked.length === 1 ? 'brand' : 'brands'}</span>)
  return <>{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : null}{p}</span>)}</>
}

export function VoicesPage({ data }: { data: VoicesData }) {
  const panel = data.panel
  return (
    <PageFrame className="gap-5 leading-[normal]">
      <PageBar title={surface('voices').label} meta={<VoicesMeta data={data} />} />
      <WhoCard groups={data.groups} videos={data.videos} monthWords={data.monthWords} />
      {data.groups.state === 'ready' ? <GroupGrid data={data} /> : null}
      <section aria-label="Brands and creators" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <BrandsCard brands={data.brands} monthWords={data.monthWords} />
        <CreatorsCard creators={data.creators} monthWords={data.monthWords} />
      </section>
      {panel?.kind === 'brand' ? <BrandPanelView panel={panel} monthWords={data.monthWords} /> : null}
      {panel?.kind === 'creator' ? <CreatorPanelView panel={panel} monthWords={data.monthWords} /> : null}
    </PageFrame>
  )
}
