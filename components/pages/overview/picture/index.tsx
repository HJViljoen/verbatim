import type { MarketPictureData } from '@/lib/pages/overview-picture'
import { ConversationsBlockView, KindsBlockView } from './conversations'
import { HoldsBlock } from './holds'
import { StandsBlockView } from './stands'

// Your market as "the bigger picture" (pages build, 1 Oct), drawn to the
// approved artboard `Page-Your-market.dc.html`: the page's name, then
//  (a) What holds across {months}            (the long-run read)
//  (b) Where your market stands               (every tracked subject)
//  (c) The biggest conversations · (d) What people do in the comments, side
//      by side.
// A block with nothing to show is not drawn (client rule 2); the tracked
// subjects always appear, by name. No totals line at the top: each block
// states its base once, in its subtitle.
//
// The route renders `MarketPicturePage` with `loadMarketPicture`'s data
// (lib/pages/overview-picture.ts). Null data is the first-run state.

export const PAGE_TITLE = 'Your market'

/** The one neutral line before the first month exists (ruling U2). */
export const FIRST_RUN_LINE = 'Your market’s first month will appear here.'

export function MarketPicturePage({ data }: { data: MarketPictureData | null }) {
  const heading = (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <h1 className="m-0 text-[26px] font-bold text-[#26292C]">{PAGE_TITLE}</h1>
    </div>
  )
  if (!data) {
    return (
      <div className="flex flex-col gap-[22px] text-[#26292C]">
        {heading}
        <p className="m-0 text-[15px] text-[#5F656B]">{FIRST_RUN_LINE}</p>
      </div>
    )
  }
  const monthText = data.monthText
  const pair = [
    data.conversations && data.conversations.rows.length > 0
      ? <ConversationsBlockView key="conversations" block={data.conversations} brand={data.brand} noun={data.noun} />
      : null,
    data.kinds && data.kinds.rows.length > 0
      ? <KindsBlockView key="kinds" block={data.kinds} brand={data.brand} noun={data.noun} monthText={monthText} />
      : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-[22px] text-[#26292C]">
      {heading}
      {data.longRun ? <HoldsBlock read={data.longRun} brand={data.brand} noun={data.noun} /> : null}
      {data.stands ? <StandsBlockView block={data.stands} monthText={monthText} /> : null}
      {pair.length > 0 ? (
        <div className={`grid grid-cols-1 items-start gap-5 ${pair.length === 2 ? 'xl:grid-cols-2' : ''}`}>{pair}</div>
      ) : null}
    </div>
  )
}
