import type { CSSProperties } from 'react'
import { BarChart3, ListChecks, Smartphone } from 'lucide-react'
import { ProportionBar } from '@/components/proportion-bar'
import { CARD, CardHead, SpikeBars, TickBarRow, TickKey } from '@/components/v2'
import { EYEBROW } from '@/components/colour-roles'
import { fmtInt } from '@/lib/format'
import { INSUFFICIENT, weeksFailed, type WeeksRead } from '@/lib/pages/home'
import type { KindsBlock, MarketData, PlatformsBlock, StoredLine } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { Stored } from './parts'

// MARKET'S RAIL (depth v2, T3; E2-Market's right-hand column): what people do
// in the comments (the month so far against last month, the tick at last
// month), the market's videos week by week (the Dashboard's own chart and
// rules), where it is said (the period's videos by platform) and, this week,
// what is worth watching (the published read's stored lines). The boards'
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

/** A weekly volume read that failed: never "Insufficient data", which is the
 *  honest word for too few clean weeks (Phase 4 fix round). */
export const WEEKS_UNREAD = 'The weekly counts could not be read just now.'

export function WeeksCard({ weeks: read }: { weeks: WeeksRead }) {
  const failed = weeksFailed(read)
  const weeks = failed ? null : read
  const drawn = weeks ? weeks.columns.some((c) => c.videos != null) : false
  return (
    <article id="weeks" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead icon={BarChart3} title="Videos, week by week" sub="Your market’s videos, by the week people commented" />
      {weeks && drawn
        ? <SpikeBars weeks={weeks.columns.map((c) => ({ label: c.label, count: c.videos }))} variant="ink" counts="all" size="md" label="The market's videos a week" />
        : <p className="m-0 text-[13.5px] text-muted-foreground">{failed ? WEEKS_UNREAD : INSUFFICIENT}</p>}
      {weeks && drawn && weeks.columns.some((c) => c.videos != null && !c.settled)
        ? <p className="m-0 text-[12.5px] text-muted-foreground">The newest weeks are still filling: a week settles two updates after it ends.</p>
        : null}
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

/** One platform's week, then its month with the month's n. */
function PlatformMonthRow({ label, color, week, month, n }: { label: string; color: string; week: number; month: number; n: number }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className={cn('inline-block size-2 rounded-[2px]', color)} />{label}</span>
      <span data-copy="figure" className="text-right font-mono tabular-nums">{fmtInt(week)}</span>
      <span data-copy="level" className="text-right font-mono tabular-nums text-muted-foreground">{fmtInt(month)} of {fmtInt(n)}</span>
    </>
  )
}

export function WatchCard({ lines }: { lines: readonly StoredLine[] }) {
  return (
    <article id="watch" className={cn(CARD, 'scroll-mt-6')}>
      <p className={cn('m-0', EYEBROW)}>Worth watching next week</p>
      {lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className="m-0 text-[14.5px] leading-[1.55] text-foreground" />)}
    </article>
  )
}

/** Beside the subject board, the rail is a column; with no board (no subject
 *  named yet, or none measured), its cards share the row. */
export function railIsWide(data: Pick<MarketData, 'subjects'>): boolean {
  return !data.subjects || data.subjects.rows.length === 0
}

export function RailView({ data, style }: { data: MarketData; style?: CSSProperties }) {
  const { rail } = data
  const wide = railIsWide(data)
  return (
    <div style={style} className={cn('col-span-12 min-w-0 gap-5', wide ? 'grid grid-cols-1 items-start md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col xl:col-span-4')}>
      {rail.kinds ? <KindsCard block={rail.kinds} /> : null}
      <WeeksCard weeks={rail.weeks} />
      {rail.platforms ? <PlatformsCard block={rail.platforms} data={data} /> : null}
      {rail.watch.length > 0 ? <WatchCard lines={rail.watch} /> : null}
    </div>
  )
}
