import { BarChart3, ListChecks, Smartphone } from 'lucide-react'
import { ProportionBar } from '@/components/proportion-bar'
import { CARD, CardHead, SpikeBars, TickBar, TickBarRow, TickKey } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { INSUFFICIENT, weeksFailed, type WeeksRead } from '@/lib/pages/home'
import { MARKET_KINDS, type KindsBlock, type MarketData, type PlatformsBlock } from '@/lib/pages/v2/market'
import { talkKindLabel } from '@/lib/pages/overview-market/kinds'
import { cn } from '@/lib/utils'

// THE NUMBERS' SIDE CARDS (depth v2, T3; E2-Market's right-hand column, a row
// of three since F2-Market, 17 Oct): what people do in the comments (the month
// so far against last month, the tick at last month), the market's videos
// week by week (the Dashboard's own chart and rules), where it is said (the
// period's videos by platform). What is worth watching moved to the week's
// page with the rest of the read. The boards'
// "a usual week" tick and "a busy week, but within the normal range" are not
// drawn: no rule bands a week against a usual one (decision 1).

/** The platforms' greys, largest first (the boards': ink, the rival grey,
 *  the pale grey), then the track. */
const PLATFORM_TONES = ['bg-foreground', 'bg-comp', 'bg-neutral-seg', 'bg-track'] as const

export function KindsCard({ block }: { block: KindsBlock }) {
  return (
    <article id="kinds" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={ListChecks}
        title="What people do in the comments"
        sub={<>Share of {block.monthText}’s <span data-copy="figure">{fmtInt(block.n)}</span> videos where at least one comment did it</>}
      />
      <div className="flex flex-col gap-[11px]">
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
 *  rows keep their places on empty tracks, and one line says why (the parity
 *  pass, 13 Oct). */
export function KindsFrame({ noun, monthText }: { noun: string | null; monthText: string }) {
  return (
    <article id="kinds" data-empty="" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={ListChecks} title="What people do in the comments" sub={<>Share of {monthText}’s videos where at least one comment did it</>} />
      <div className="flex flex-col gap-[11px]">
        {MARKET_KINDS.map((k) => (
          <div key={k} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_44px] items-center gap-2.5 text-[13.5px] leading-[1.35] text-muted-foreground">
            <span className="min-w-0">{talkKindLabel(k, noun)}</span>
            <TickBar pct={0} label={`${talkKindLabel(k, noun)}: not read`} />
            <span />
          </div>
        ))}
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">Not read for {monthText} yet.</p>
    </article>
  )
}

/** Where it's said with no video counted by platform: the bar's empty track
 *  and one line. */
export function PlatformsFrame({ data }: { data: MarketData }) {
  return (
    <article id="where" data-empty="" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={Smartphone} title="Where it’s said" sub={data.period === 'week' ? 'This week’s videos, by platform' : <>The videos in {data.month.text}, by platform</>} />
      <div aria-hidden className="h-3 rounded-[6px] bg-track" />
      <p className="m-0 text-[13px] text-muted-foreground">No video counted by platform yet.</p>
    </article>
  )
}

/** A weekly volume read that failed: never "Insufficient data", which is the
 *  honest word for too few clean weeks (Phase 4 fix round). */
export const WEEKS_UNREAD = 'The weekly counts could not be read just now.'

/** The chart's rule, said wherever a slot is empty: only weeks read one way
 *  are drawn (`homeWeeks`). */
export const WEEKS_RULE = 'Only weeks read the same way are drawn'

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

export function WeeksCard({ weeks: read, axis = [] }: { weeks: WeeksRead; axis?: readonly string[] }) {
  const failed = weeksFailed(read)
  const weeks = failed ? null : read
  const drawn = weeks ? weeks.columns.some((c) => c.videos != null) : false
  // THE BOARD'S CHART IN EVERY STATE (the parity pass, 13 Oct): with no week
  // to draw (too few clean weeks, or a read that failed) the card still draws
  // its eight weeks' axis with the slots empty, and one quiet line says why.
  const line = weeksLine(weeks?.columns ?? null, failed)
  const columns = weeks && drawn
    ? weeks.columns.map((c) => ({ label: c.label, count: c.videos }))
    : (weeks?.columns.map((c) => c.label) ?? axis).map((label) => ({ label, count: null }))
  return (
    <article id="weeks" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={BarChart3} title="Videos, week by week" sub="Your market’s videos, by the week people commented" />
      {columns.length > 0
        ? <SpikeBars weeks={columns} variant="ink" counts="all" size="md" ghost label="The market's videos a week" />
        : null}
      {line ? <p className="m-0 text-[13px] text-muted-foreground">{line}</p> : null}
    </article>
  )
}

export function PlatformsCard({ block, data }: { block: PlatformsBlock; data: MarketData }) {
  const segments = block.rows.map((r, i) => ({ label: r.label, count: r.videos, pct: Math.round(r.pct), color: PLATFORM_TONES[Math.min(i, PLATFORM_TONES.length - 1)] }))
  return (
    <article id="where" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={Smartphone} title="Where it’s said" sub={block.basis === 'week'
        ? <>This week’s <span data-copy="figure">{fmtInt(block.n)}</span> videos, by platform</>
        : <>The <span data-copy="figure">{fmtInt(block.n)}</span> videos in {data.month.text}, by platform</>} />
      <ProportionBar of="videos" segments={segments} />
      {block.month ? (
        // This week: each platform's week beside its month (decision 1).
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-[13px]">
          <span />
          <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">This week</span>
          <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{block.month.text.replace(/^in /, '')}</span>
          {block.rows.map((r, i) => (
            <PlatformMonthRow key={r.platform} label={r.label} color={segments[i].color} week={r.videos} month={block.month!.counts[r.platform] ?? 0} n={block.month!.n} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap justify-between gap-2.5 text-[13px]">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <i aria-hidden className={cn('inline-block size-2 rounded-[2px]', s.color)} />{s.label} <span data-copy="figure" className="font-mono">{fmtInt(s.count)}</span>
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

/** One platform's week, then its month with the month's n (the rail's, and a
 *  subject panel's "Where" this week, with no swatch). */
export function PlatformMonthRow({ label, color, week, month, n }: { label: string; color?: string; week: number; month: number; n: number }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">{color ? <i aria-hidden className={cn('inline-block size-2 rounded-[2px]', color)} /> : null}{label}</span>
      <span data-copy="figure" className="text-right font-mono tabular-nums">{fmtInt(week)}</span>
      <span data-copy="level" className="text-right font-mono tabular-nums text-muted-foreground">{fmtInt(month)} of {fmtInt(n)}</span>
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
