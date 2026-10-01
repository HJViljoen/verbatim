import Link from 'next/link'
import type { ReactNode } from 'react'

import { PlatformIcon } from '@/components/charts/platform-icon'
import { fmtInt, longMonth, monthName } from '@/lib/format'
import { levelText } from '@/lib/reading/level'
import { biggestSearchLine, type MakerState, type PlatformShare, type SearchPlan, type TermShare } from '@/lib/settings/your-market'
import { cn } from '@/lib/utils'

import { Card, CardLink, Fig, HATCH, HatchKey, HeadCell, Swatch } from './card'

// Settings › What we read, the market's blocks (market-first plan §2.10 D5,
// WP3.10), as the approved preview's "What we read" artboard draws them: Your
// market (with the page's index beside it), Where your market came from (each
// search with its makers, as bars), Where we read it and Searches each update
// side by side. Each is its title alone, its one-line answer, its rows and a
// footer of links only (the 25 Sep rulings). A part with no table behind it
// reads "not measured", never a zero.

/** At most twelve rows in any block (decision B); "Show all" opens the rest. */
export const SEARCH_ROWS = 12

const NOT_MEASURED = 'not measured'

/** The month's market, split the way the preview draws it: the category, and
 *  the videos filed under each brand you track (`market_month_videos`'
 *  audience). Counts only: every part is a count of the one market. */
export interface MarketSplit {
  videos: number
  category: number
  brands: number
  /** Each tracked brand's filed videos, biggest first; none at zero. */
  byBrand: { name: string; videos: number }[]
}

const RIVAL_PREFIX = 'competitor:'

export function marketSplit(videos: readonly { audience?: string }[]): MarketSplit {
  let category = 0
  const by = new Map<string, number>()
  for (const v of videos) {
    const a = v.audience ?? 'industry-other'
    if (a.startsWith(RIVAL_PREFIX)) {
      const name = a.slice(RIVAL_PREFIX.length)
      by.set(name, (by.get(name) ?? 0) + 1)
    } else category++
  }
  const byBrand = [...by].map(([name, n]) => ({ name, videos: n }))
    .sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
  return { videos: videos.length, category, brands: videos.length - category, byBrand }
}

/** One entry of the page's index ("On this page"). */
export interface IndexEntry { href: string; title: string; sub: string }

/**
 * YOUR MARKET (the artboard's first card): what the market is and its size in
 * the reading month, the bar of its two parts (the category and the brands you
 * track), the month before as counts where the pair joins, and what is not in it;
 * beside it, the page's index. The one link is the footer's.
 *
 * "The comments under brands' own posts" are not in it because a rival's own
 * post is never read on the full lane (lib/pipeline/pass-a.ts `passALane`:
 * claims or nothing), and `market_month_videos` reads full-lane videos only.
 */
export function YourMarketCard({
  month, soFar = false, videos, split = null, prev = null, ownPosts = null, movesLabel, movesHref, marketLabel, marketHref, index = [],
}: {
  month: string
  /** The reading month is still running ("in September so far"). */
  soFar?: boolean
  videos: number | null
  split?: MarketSplit | null
  /** The month before, as counts, where it was read. */
  prev?: { month: string; split: MarketSplit } | null
  /** Your own posts dated in the month; null where they were not read. */
  ownPosts?: number | null
  movesLabel?: string
  movesHref?: string
  marketLabel?: string
  marketHref?: string
  index?: readonly IndexEntry[]
}) {
  const m = longMonth(month)
  const moves = movesLabel && movesHref
    ? <Link href={movesHref} className="font-medium text-foreground underline decoration-border decoration-1 underline-offset-4 hover:decoration-foreground">{movesLabel}</Link>
    : null
  return (
    <Card
      title="Your market"
      footer={marketLabel && marketHref ? <CardLink href={marketHref}>Read it on {marketLabel}</CardLink> : null}
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]">
        <div className="flex min-w-0 flex-col gap-8 pt-1">
          {videos == null ? (
            <p className="m-0 text-[15px] text-muted-foreground">{NOT_MEASURED}</p>
          ) : (
            <p className="m-0 max-w-[680px] text-[22px] font-medium leading-[1.3] tracking-[-0.02em] [text-wrap:balance] sm:text-[28px]">
              Your market is everything we read except your own posts:{' '}
              <Fig n={videos} className="tracking-[-0.04em]" /> videos in {m}{soFar ? ' so far' : ''}.
            </p>
          )}
          {split && split.videos > 0 ? (
            <div className="flex flex-col gap-2.5">
              <div role="img" aria-label={`${fmtInt(split.videos)} videos: ${fmtInt(split.category)} in the category, ${fmtInt(split.brands)} filed under brands you track`} className="flex h-4 gap-0.5">
                {split.category > 0 ? <span className={cn('bg-ink-market', split.brands > 0 ? 'rounded-l-[3px]' : 'rounded-[3px]')} style={{ flex: `${split.category} 1 0` }} /> : null}
                {split.brands > 0 ? <span className={cn('bg-ink-rival', split.category > 0 ? 'rounded-r-[3px]' : 'rounded-[3px]')} style={{ flex: `${split.brands} 1 0` }} /> : null}
              </div>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px]"><Fig n={split.category} /> in the category</span>
                  <span className="font-mono text-[13px] text-muted-foreground">not filed under any brand</span>
                </span>
                {split.brands > 0 ? (
                  <span className="flex flex-col gap-0.5 sm:items-end sm:text-right">
                    <span className="inline-flex items-center gap-2 text-[15px]">
                      <Swatch className="bg-ink-rival" />
                      <span><Fig n={split.brands} /> filed under brands you track</span>
                    </span>
                    <span className="font-mono text-[13px] text-muted-foreground">
                      {split.byBrand.map((b) => `${b.name} ${fmtInt(b.videos)}`).join(', ')}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {prev ? (
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[13px] text-muted-foreground">
                {longMonth(prev.month)}: <PrevFig n={prev.split.videos} /> · <PrevFig n={prev.split.category} /> in the category and <PrevFig n={prev.split.brands} /> under brands you track
              </span>
            </div>
          ) : null}
          <div className="border-t border-border/60 pt-4">
            <p className="m-0 max-w-[600px] text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]">
              <span className="font-semibold text-foreground">Not in it:</span>{' '}
              <Swatch className="mr-1.5 bg-ink-you" />
              {ownPosts != null
                ? <>your own posts (<Fig n={ownPosts} /> in {m}{moves ? <>, read on {moves}</> : null}) and the comments under brands’ own posts.</>
                : <>your own posts{moves ? <>, read on {moves},</> : null} and the comments under brands’ own posts.</>}
            </p>
          </div>
        </div>
        {index.length > 0 ? (
          <aside className="flex flex-col gap-2 self-start rounded-lg bg-inner p-6">
            <h3 className="m-0 mb-1 text-[15px] font-semibold">On this page</h3>
            <nav aria-label="On this page" className="flex flex-col">
              {index.map((e) => (
                <a key={e.href} href={e.href} className="group/index flex min-h-12 items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-medium text-foreground group-hover/index:underline">{e.title}</span>
                    <span className="font-mono text-[13px] text-muted-foreground">{e.sub}</span>
                  </span>
                  <span aria-hidden className="text-secondary-foreground">↓</span>
                </a>
              ))}
            </nav>
          </aside>
        ) : null}
      </div>
    </Card>
  )
}

function PrevFig({ n }: { n: number }) {
  return <span data-copy="figure" className="font-medium text-secondary-foreground">{fmtInt(n)}</span>
}

/** "Sep" for a column head. */
const monAbbr = (month: string): string => monthName(month).split(' ')[0]

const SEARCH_COLS = '32px minmax(0,300px) minmax(96px,1fr) 96px 96px'
const SEARCH_COLS_NO_MAKERS = '32px minmax(0,300px) minmax(96px,1fr) 96px'

/**
 * WHERE YOUR MARKET CAME FROM: each search's videos in the reading month's
 * market, as a bar of the videos that are not makers' and the makers' hatch
 * beside it, and the makers of them as a count. A video first found by two
 * searches counts for both, so the rows do not sum to the market.
 */
export function WhereItCameFrom({
  month, marketVideos, terms, makers, all = false, allHref, topHref, askOnCall = false,
}: {
  month: string
  /** The month's market videos, or null where MF1 is not there. */
  marketVideos: number | null
  /** Each search's videos, or null where `video_provenance` is not there. */
  terms: { rows: readonly TermShare[]; unknown: number } | null
  makers: MakerState
  /** Every search, not the first twelve. */
  all?: boolean
  allHref: string
  topHref: string
  /** The searches are held still, and a change to the biggest one waits for
   *  our next call with you. */
  askOnCall?: boolean
}) {
  const m = longMonth(month)
  const measured = makers === 'measured'
  const cols = measured ? SEARCH_COLS : SEARCH_COLS_NO_MAKERS
  const rows = terms?.rows ?? []
  const shown = all ? rows : rows.slice(0, SEARCH_ROWS)
  const top = rows[0] ?? null
  const lead = biggestSearchLine(rows)
  const max = top?.videos ?? 0
  const mostly = (r: TermShare) => measured && r.makers != null && r.videos > 0 && r.makers / r.videos >= 0.5
  const footer = rows.length > SEARCH_ROWS
    ? all
      ? <CardLink href={topHref}>Show the first {fmtInt(SEARCH_ROWS)}</CardLink>
      : <CardLink href={allHref}>Show all {fmtInt(rows.length)} searches</CardLink>
    : null
  return (
    <Card id="by-search" title="Where your market came from" footer={footer}>
      {marketVideos == null || terms == null ? (
        <p className="m-0 text-[15px] text-muted-foreground">{NOT_MEASURED}</p>
      ) : top == null ? (
        <Lead>No video in {m} carries a record of the search that found it yet.</Lead>
      ) : (
        <>
          {measured && lead?.mostlyMakers && lead.makers != null ? (
            <Lead>
              Your biggest search, {lead.search}, finds mostly makers:{' '}
              <OfIts k={lead.makers} n={lead.videos} />.
            </Lead>
          ) : (
            <Lead>
              Your biggest search, {top.search}, found{' '}
              <span data-copy="level"><Fig n={top.videos} /> of your market’s <Fig n={marketVideos} /> videos</span> in {m}.
            </Lead>
          )}
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex min-w-[600px] flex-col">
              <div className="grid items-end gap-x-4 border-b border-border pb-2.5" style={{ gridTemplateColumns: cols }}>
                <span />
                <HeadCell>Search</HeadCell>
                {measured ? (
                  <span className="flex items-center gap-4 whitespace-nowrap text-[13px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Swatch className="bg-ink-market" />not makers</span>
                    <span className="inline-flex items-center gap-1.5"><HatchKey />makers</span>
                  </span>
                ) : <span />}
                <HeadCell align="right" sub={monAbbr(month)}>Videos</HeadCell>
                {measured ? <HeadCell align="right" sub="of them">Makers</HeadCell> : null}
              </div>
              {shown.map((r, i) => {
                const makersK = measured && r.makers != null ? r.makers : 0
                const rest = r.videos - makersK
                return (
                  <div key={r.search} className="grid min-h-11 items-center gap-x-4 border-b border-border/60 last:border-b-0" style={{ gridTemplateColumns: cols }}>
                    <span className="font-mono text-[13px] text-muted-foreground">{fmtInt(i + 1)}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="min-w-0 truncate text-[15px]">{r.search}</span>
                      {mostly(r) ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-muted-foreground"><HatchKey />mostly makers</span>
                      ) : null}
                    </span>
                    <span aria-hidden className="flex h-2 items-center gap-0.5">
                      {rest > 0 ? <span className="h-2 rounded-[2px] bg-ink-market" style={{ width: `${(rest / max) * 100}%` }} /> : null}
                      {makersK > 0 ? <span className="h-2 shrink-0 rounded-[2px]" style={{ ...HATCH, width: `${(makersK / max) * 100}%` }} /> : null}
                    </span>
                    <span className="text-right font-mono text-[15px] font-semibold tabular-nums">{fmtInt(r.videos)}</span>
                    {measured ? (
                      <span className="text-right font-mono text-[15px] font-medium tabular-nums text-secondary-foreground">{r.makers == null ? NOT_MEASURED : fmtInt(r.makers)}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          {askOnCall && mostly(top) ? (
            <div className="rounded-lg bg-inner p-6">
              <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]">
                Taking <span className="font-semibold text-foreground">{top.search}</span> out would bring in fewer makers, but it would restart the count, so we will look at it with you on our next call.
              </p>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

/** "84% of 110 videos", or "44 of 85 videos" under 100 (`levelText`): the
 *  level with its base, as every level prints it (§4.0). */
function OfIts({ k, n }: { k: number; n: number }) {
  const l = levelText(k, n)
  return (
    <span data-copy="level">
      <span className="font-mono font-semibold tabular-nums text-foreground">{l?.kind === 'share' ? l.text : fmtInt(k)}</span> of <Fig n={n} /> videos
    </span>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="-mt-2 mb-0 max-w-[760px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]">{children}</p>
}

/** What each platform gives us to read, in the preview's words. */
const PLATFORM_READS: Readonly<Record<string, string>> = {
  youtube: 'comments, titles and speech',
  tiktok: 'comments and captions',
  reddit: 'threads and their comments',
  instagram: 'comments and captions',
}

const MIX_COLS = 'minmax(0,212px) minmax(48px,1fr) 48px 56px'

/**
 * WHERE WE READ IT: the category's videos in the reading month by platform,
 * biggest first, as bars, with the two biggest named in the answer. The share
 * column's base is its head ("of 625").
 */
export function WhereWeReadIt({ month, category, mix, conversationLabel, conversationHref }: {
  month: string
  /** The category's videos in the month; null where MF1 is not there. */
  category: number | null
  mix: readonly PlatformShare[] | null
  conversationLabel: string
  conversationHref: string
}) {
  const two = mix && mix.length >= 2 ? mix[0].videos + mix[1].videos : null
  const max = mix?.[0]?.videos ?? 0
  return (
    <Card id="platforms" span={6} title="Where we read it" footer={<CardLink href={conversationHref}>Where your market talks, on {conversationLabel}</CardLink>}>
      {mix == null || category == null || category === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">{NOT_MEASURED}</p>
      ) : (
        <>
          {two != null ? (
            <Lead>
              {mix[0].label} and {mix[1].label} hold{' '}
              <span data-copy="level">
                <span className="font-mono font-semibold tabular-nums">{levelText(two, category)?.text}</span>
                {levelText(two, category)?.kind === 'share' ? <> of <Fig n={category} /> category videos</> : <> category videos</>}
              </span>{' '}in {longMonth(month)}.
            </Lead>
          ) : null}
          <div className="flex flex-col">
            <div className="grid items-end gap-x-4 border-b border-border pb-2.5" style={{ gridTemplateColumns: MIX_COLS }}>
              <HeadCell>Platform</HeadCell>
              <span />
              <HeadCell align="right" sub={monAbbr(month)}>Videos</HeadCell>
              <HeadCell align="right" sub={`of ${fmtInt(category)}`}>Share</HeadCell>
            </div>
            {mix.map((p) => (
              <div key={p.platform} className="grid min-h-[60px] items-center gap-x-4 border-b border-border/60 py-2 last:border-b-0" style={{ gridTemplateColumns: MIX_COLS }}>
                <span className="flex min-w-0 items-start gap-3">
                  <span className="pt-[3px]"><PlatformIcon platform={p.platform} size={16} className="text-muted-foreground" /></span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px]">{p.label}</span>
                    <span className="text-[13px] text-muted-foreground">{PLATFORM_READS[p.platform] ?? 'comments'}</span>
                  </span>
                </span>
                <span aria-hidden className="block h-2"><span className="block h-2 rounded-[2px] bg-ink-market" style={{ width: `${max > 0 ? (p.videos / max) * 100 : 0}%` }} /></span>
                <span className="text-right font-mono text-[15px] font-semibold tabular-nums">{fmtInt(p.videos)}</span>
                {/* The base is the column head's ("of 625"). */}
                <span data-copy="figure" className="text-right font-mono text-[15px] tabular-nums text-secondary-foreground">{levelText(p.videos, category)?.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/** The groups' inks: your name in yours, the brands you track in theirs, the
 *  category in the market's, the communities in the muted ink. */
const GROUP_INK: Readonly<Record<SearchPlan['groups'][number]['key'], string>> = {
  brand: 'bg-ink-you',
  competitor: 'bg-ink-rival',
  industry: 'bg-ink-market',
  communities: 'bg-muted-foreground',
}

/**
 * SEARCHES EACH UPDATE: the searches an update plans against the cap of 120,
 * as the figure, the stacked bar of the four groups and what is free, and the
 * groups with their terms and searches.
 */
export function SearchesEachUpdate({ plan, terms }: {
  plan: SearchPlan
  /** The terms in the search set, for the footer's link. */
  terms: number
}) {
  const free = plan.cap - plan.used
  return (
    <Card id="searches" span={6} title="Searches each update" footer={<CardLink href="#search-set" arrow="↑">See the {fmtInt(terms)} terms in the search set</CardLink>}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-copy="figure" className="font-mono text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{fmtInt(plan.used)}</span>
        <span className="text-[15px] text-secondary-foreground">of <span className="font-mono font-semibold text-foreground">{fmtInt(plan.cap)}</span> searches each update</span>
        <span className={cn('ml-auto font-mono text-[13px]', free < 0 ? 'text-negative' : 'text-muted-foreground')}>
          {free > 0 ? `${fmtInt(free)} free` : free === 0 ? 'none free' : `${fmtInt(-free)} over`}
        </span>
      </div>
      <div role="img" aria-label={`${fmtInt(plan.used)} of ${fmtInt(plan.cap)} searches: ${plan.groups.map((g) => `${g.label.toLowerCase()} ${fmtInt(g.searches)}`).join(', ')}${free > 0 ? `, ${fmtInt(free)} free` : ''}`} className="flex gap-0.5">
        {plan.groups.filter((g) => g.searches > 0).map((g) => (
          <span key={g.key} className={cn('h-4 rounded-[2px]', GROUP_INK[g.key])} style={{ flex: `${g.searches} 1 0` }} />
        ))}
        {free > 0 ? <span className="h-4 rounded-[2px] bg-border/70" style={{ flex: `${free} 1 0` }} /> : null}
      </div>
      <div className="flex flex-col">
        {plan.groups.map((g) => (
          <div key={g.key} className="grid min-h-10 grid-cols-[minmax(0,1fr)_96px_48px] items-center gap-x-4 border-b border-border/60 last:border-b-0">
            <span className="inline-flex min-w-0 items-center gap-2.5">
              <Swatch className={GROUP_INK[g.key]} />
              <span className="truncate text-[15px]">{g.label}</span>
            </span>
            <span className="text-right font-mono text-[13px] text-muted-foreground">
              {g.key === 'communities' ? `${fmtInt(g.terms)} on Reddit` : `${fmtInt(g.terms)} ${g.terms === 1 ? 'term' : 'terms'}`}
            </span>
            <span className="text-right font-mono text-[15px] font-semibold tabular-nums">{fmtInt(g.searches)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
