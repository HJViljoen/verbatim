import { ProportionBar } from '@/components/proportion-bar'
import { CARD, CardHead, EmptyBox, SpikeBars, TBL, TD, TD_NUM, TH, TickBarRow, TickKey } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { INSUFFICIENT, weeksFailed, type WeeksRead } from '@/lib/pages/home'
import { MARKET_KINDS, type KindsBlock, type MarketData, type PlatformsBlock } from '@/lib/pages/v2/market'
import { talkKindLabel } from '@/lib/pages/overview-market/kinds'
import { cn } from '@/lib/utils'

// THE NUMBERS' SIDE CARDS, drawn to the audit design's board (Market.dc.html,
// "The numbers behind the week", 7 Nov): what people do in the comments (the
// month so far, each row's bar its percentage, decision 5, the tick at last
// month where there is one), the market's videos week by week (the
// Dashboard's own chart and rules, or the dashed box where nothing can be
// drawn, decision 4), where it is said (the period's videos by platform, a
// table of the week beside the month). Their bases are the figures row's
// (decision 2). No board draws "a usual week" (decision 1).

/** The platforms' greys, largest first (the boards': ink, the rival grey,
 *  the pale grey), then the track. */
const PLATFORM_TONES = ['bg-foreground', 'bg-comp', 'bg-neutral-seg', 'bg-track'] as const

/** A side card's sub: what its rows are of, in words (the base is the
 *  figures row's). */
const kindsSub = (monthText: string) => <>Share of {monthText}’s videos where at least one comment did it</>

export function KindsCard({ block }: { block: KindsBlock }) {
  return (
    <article id="kinds" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead title="What people do in the comments" sub={kindsSub(block.monthText)} />
      <div className="flex flex-col gap-3">
        {block.rows.map((r) => (
          <TickBarRow
            key={r.kind}
            name={r.label}
            value={`${Math.round(r.pct)}%`}
            pct={r.pct}
            tick={r.prevPct}
            verdict={r.verdict?.state === 'moved' ? r.verdict : null}
            label={`${Math.round(r.pct)}% ${block.monthText}${r.prevPct != null ? `, ${Math.round(r.prevPct)}% in ${block.prevText}` : ''}`}
          />
        ))}
      </div>
      {block.ticks ? <TickKey fill={block.monthText} tick={block.prevText} /> : null}
    </article>
  )
}

/** What people do in the comments with no kind read for the month: the six
 *  kinds keep their names, with no empty bar, and the dashed box says why
 *  (decision 4). */
export function KindsFrame({ noun, monthText }: { noun: string | null; monthText: string }) {
  return (
    <article id="kinds" data-empty="" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead title="What people do in the comments" sub={kindsSub(monthText)} />
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.4] text-secondary-foreground">
        {MARKET_KINDS.map((k) => <li key={k}>{talkKindLabel(k, noun)}</li>)}
      </ul>
      <EmptyBox>Not read for {monthText} yet.</EmptyBox>
    </article>
  )
}

/** Where it's said with no video counted by platform: the dashed box. */
export function PlatformsFrame({ data }: { data: MarketData }) {
  return (
    <article id="where" data-empty="" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead title="Where it’s said" sub={data.period === 'week' ? 'This week’s videos, by platform' : <>The videos in {data.month.text}, by platform</>} />
      <EmptyBox>No video counted by platform yet.</EmptyBox>
    </article>
  )
}

/** A weekly volume read that failed: never "Insufficient data", which is the
 *  honest word for too few clean weeks (Phase 4 fix round). */
export const WEEKS_UNREAD = 'The weekly counts could not be read just now.'

/** The chart's rule, said wherever a slot is empty: only weeks read one way
 *  are drawn (`homeWeeks`), in plain words (5 Nov). */
export const WEEKS_RULE = 'We only draw weeks we counted the same way, so the bars compare fairly'

/**
 * THE CHART'S ONE QUIET LINE, one set of words for every state (the parity
 * pass, 13 Oct): no week to draw is Heinrich's "Insufficient data" with the
 * rule; slots left empty, the rule; the newest weeks still filling, said once
 * beside it where it holds. A read that failed says so instead
 * (`WEEKS_UNREAD`). Null where every slot is drawn and settled.
 */
export function weeksLine(columns: readonly { videos: number | null; settled: boolean }[] | null, failed = false): string | null {
  if (failed) return WEEKS_UNREAD
  const drawn = columns?.some((c) => c.videos != null) ?? false
  if (!columns || !drawn) return `${INSUFFICIENT}: ${WEEKS_RULE.charAt(0).toLowerCase()}${WEEKS_RULE.slice(1)}.`
  const gaps = columns.some((c) => c.videos == null)
  const filling = columns.some((c) => c.videos != null && !c.settled)
  if (gaps && filling) return `${WEEKS_RULE}; the newest are still filling.`
  if (gaps) return `${WEEKS_RULE}.`
  if (filling) return 'The newest weeks are still filling.'
  return null
}

/** The board's dashed box where no week can be drawn (decision 4). */
export const WEEKS_NOT_DRAWN_TITLE = 'Not drawn yet'
export const WEEKS_NOT_DRAWN = 'Only weeks read the same way are drawn, and there aren’t enough of them yet. The chart starts on its own once there are.'

export function WeeksCard({ weeks: read }: { weeks: WeeksRead; axis?: readonly string[] }) {
  const failed = weeksFailed(read)
  const weeks = failed ? null : read
  const drawn = weeks ? weeks.columns.some((c) => c.videos != null) : false
  // With no week to draw (too few clean weeks), the board's dashed box in
  // the chart's place; a read that failed says so in it (never the words
  // for too few weeks). A drawn chart keeps its weeks, a week our rules
  // leave out an empty column, and one quiet line says why.
  const line = drawn ? weeksLine(weeks!.columns, false) : null
  return (
    <article id="weeks" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead title="Videos, week by week" sub="By the week people commented" />
      {drawn ? (
        <>
          <SpikeBars weeks={weeks!.columns.map((c) => ({ label: c.label, count: c.videos }))} counts="all" size="md" highlightLast={false} label="The market's videos a week" />
          {line ? <p className="m-0 text-[13.5px] text-muted-foreground">{line}</p> : null}
        </>
      ) : (
        <EmptyBox chart title={failed ? 'Not read' : WEEKS_NOT_DRAWN_TITLE}>{failed ? WEEKS_UNREAD : WEEKS_NOT_DRAWN}</EmptyBox>
      )}
    </article>
  )
}

/** "172 of 318 (54%)": a count of the period's videos and its share, the
 *  percentage carrying its "of N" (decision 2 A). */
function CountShare({ k, n }: { k: number; n: number }) {
  if (n <= 0) return <span data-copy="figure">{fmtInt(k)}</span>
  return (
    <>
      <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>
      <span className="text-muted-foreground"> (<span data-copy="figure">{Math.round((100 * k) / n)}%</span>)</span>
    </>
  )
}

export function PlatformsCard({ block, data }: { block: PlatformsBlock; data: MarketData }) {
  const segments = block.rows.map((r, i) => ({ label: r.label, count: r.videos, pct: Math.round(r.pct), color: PLATFORM_TONES[Math.min(i, PLATFORM_TONES.length - 1)] }))
  const month = block.month
  return (
    <article id="where" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead title="Where it’s said" sub={block.basis === 'week' ? 'This week’s videos, by platform' : <>The videos in {data.month.text}, by platform</>} />
      <div>
        <ProportionBar of="videos" segments={segments} />
        {/* Each part named under it at its own width, as the board draws it;
            a part too narrow for its name (about 7px a letter on a 210px bar,
            the card's at 1440) is left unnamed, and the table under names
            every platform. */}
        <div aria-hidden data-where-names="" className="mt-1.5 flex gap-0.5 text-[12.5px] leading-[1.3] text-secondary-foreground">
          {segments.map((s) => <span key={s.label} className="min-w-0 truncate" style={{ width: `${Math.max(2, s.pct)}%` }}>{s.label.length * 3.4 <= s.pct ? s.label : null}</span>)}
        </div>
      </div>
      {/* The board's table: this week beside the month (decision 1), the
          month's count with its share of the month's videos. */}
      <table className={TBL}>
        <thead>
          <tr>
            <th scope="col" className={TH}>Platform</th>
            {month ? <th scope="col" className={cn(TH, TD_NUM)}>This week</th> : null}
            <th scope="col" className={cn(TH, TD_NUM, 'pr-0')}>{month ? month.text.replace(/^in /, '').replace(/^./, (c) => c.toUpperCase()) : 'Videos'}</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r) => (
            <tr key={r.platform}>
              <td className={cn(TD, 'py-2.5')}>{r.label}</td>
              {month ? <td className={cn(TD, TD_NUM, 'py-2.5')}><span data-copy="figure">{fmtInt(r.videos)}</span></td> : null}
              <td className={cn(TD, TD_NUM, 'py-2.5 pr-0 text-secondary-foreground')}>
                {month ? <CountShare k={month.counts[r.platform] ?? 0} n={month.n} /> : <CountShare k={r.videos} n={block.n} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

/** One platform's week, then its month with the month's n (a subject's
 *  page's "Where" this week, until its own table). */
export function PlatformMonthRow({ label, color, week, month, n }: { label: string; color?: string; week: number; month: number; n: number }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">{color ? <i aria-hidden className={cn('inline-block size-2 rounded-[2px]', color)} /> : null}{label}</span>
      <span data-copy="figure" className="text-right tabular-nums">{fmtInt(week)}</span>
      <span data-copy="level" className="text-right tabular-nums text-muted-foreground">{fmtInt(month)} of {fmtInt(n)}</span>
    </>
  )
}

/** THE NUMBERS' SIDE CARDS (F2-Market, ruling 2): a row of three above the
 *  full-width table, never a rail beside it, sharing a height, one to a row
 *  under 1180 and on a phone. In every data state each keeps its card. */
export function NumbersRow({ data }: { data: MarketData }) {
  const { rail } = data
  const cell = 'col-span-12 flex min-w-0 min-[1180px]:col-span-4 [&>article]:flex-1'
  return (
    <section id="numbers" aria-label="The numbers" className="grid grid-cols-12 gap-5 max-sm:gap-3.5">
      <div className={cell}>{rail.kinds ? <KindsCard block={rail.kinds} /> : <KindsFrame noun={data.noun} monthText={data.month.text} />}</div>
      <div className={cell}><WeeksCard weeks={rail.weeks} axis={rail.weeksAxis} /></div>
      <div className={cell}>{rail.platforms ? <PlatformsCard block={rail.platforms} data={data} /> : <PlatformsFrame data={data} />}</div>
    </section>
  )
}
