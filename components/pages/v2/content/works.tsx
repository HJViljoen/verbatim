import type { CSSProperties } from 'react'
import { ChartLine } from 'lucide-react'
import { CARD, CardHead, TickBar, UnitSquares, MAX_UNITS } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { fmtMultiple, monthWords, WORKS_SCALE_MAX, type WorksBlock, type WorksRow } from '@/lib/pages/v2/content'
import { WORKS_ANCHOR } from '@/lib/pages/v2/content-address'
import { cn } from '@/lib/utils'
import { Fig, Lvl, Sentence } from './parts'

/**
 * WHAT WORKS IN YOUR MARKET'S VIDEOS (E5-Content): two charts, how a video is
 * made (`classified_type`) and how it opens (`hook_style`), each row the
 * market's videos of that kind published this month, its share, its median
 * response against the market's median video (`buildPlaybook`'s multiple; 1×
 * is the tick a quarter of the way along), and your own posts this month of
 * that kind as marks (`clientSide: 'owned'`: the brand's own accounts, never
 * a creator naming it). Under them, one sentence about your mix that code
 * writes from the same rows, and what the reading was read off.
 *
 * Published clock: a format is a property of a video, dated by its upload
 * (lib/reading/formats.ts), and the card says so.
 */

const HEAD = 'pb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'

/** A kind that draws less than a typical video (under 1.0× as printed): its
 *  fill in the market yellow's pale tint, as the board draws it (#ECE3BE).
 *  The kit's own tint for the yellow (MiniBars' filling bar, 0.35), not a new
 *  colour (lead's ruling, 13 Oct). The tick is the bar's other child and keeps
 *  its ink. */
const BELOW_TYPICAL = '[&>div:not([data-tick])]:bg-brand/35'
const belowTypical = (multiple: number): boolean => Math.round(multiple * 10) / 10 < 1

/** Your posts as marks, the board's nine-to-a-row bars: each mark 9px where
 *  the column has room and narrower where it has not, so thirteen posts
 *  stay one row (Sealand's wrapped to two at 1440). */
const MARKS_FIT = 'flex-nowrap gap-[2px] [&>span]:min-w-[3px] [&>span]:max-w-[9px] [&>span]:flex-1'
/** The most posts the marks draw: one row of 3px marks and 2px gaps in the
 *  column at its narrowest (about 68px, a 768 window beside the sidebar).
 *  Above it the column prints "k of n", as it does past `MAX_UNITS`, rather
 *  than run the row past the card (the fresh check: 28 posts and up did at
 *  1440). */
export const MARKS_MAX = 14

function Chart({ title, rows, posts, empty }: { title: string; rows: readonly WorksRow[]; posts: number; empty: string }) {
  const marks = posts > 0 && posts <= Math.min(MARKS_MAX, MAX_UNITS)
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="m-0 text-[13px] font-semibold">{title}</p>
      <div role="table" aria-label={title} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)] items-center gap-x-3.5 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,0.9fr)]">
        <div role="row" className="contents">
          <span role="columnheader" className={HEAD}><span className="sr-only">Kind of video</span></span>
          <span role="columnheader" className={HEAD}>Response · 1× = typical</span>
          <span role="columnheader" className={cn(HEAD, 'hidden sm:block')}>{posts > 0 ? <>Your <Fig>{fmtInt(posts)}</Fig> {posts === 1 ? 'post' : 'posts'}</> : 'Your posts'}</span>
        </div>
        {/* A chart with no rows keeps its frame: its headings and the axis
            (an empty track with the 1× tick), with the line saying why beside
            it where the other chart has rows (where neither has, the panel
            under them says it once). */}
        {rows.length === 0 ? (
          <div role="row" data-works-empty="" className="contents">
            <span role="cell" className="min-w-0 text-[13px] leading-[1.4] text-muted-foreground">{empty}</span>
            <span role="cell" className="min-w-0 pr-11">
              <TickBar pct={0} tick={100 / WORKS_SCALE_MAX} size="xl" label="No rows to draw" />
            </span>
            <span role="cell" className="hidden sm:block" />
          </div>
        ) : null}
        {rows.map((r) => (
          <div role="row" key={r.key} className="contents">
            <span role="cell" className="min-w-0">
              {r.label}
              {r.share != null ? <span className="text-[11.5px] text-muted-foreground"> · <Fig>{Math.round(r.share)}%</Fig></span> : null}
            </span>
            <span role="cell" className="min-w-0 pr-11" data-below={belowTypical(r.multiple) ? '' : undefined}>
              <TickBar
                className={belowTypical(r.multiple) ? BELOW_TYPICAL : undefined}
                pct={(Math.min(r.multiple, WORKS_SCALE_MAX) / WORKS_SCALE_MAX) * 100}
                tick={100 / WORKS_SCALE_MAX}
                size="xl"
                figure={fmtMultiple(r.multiple)}
                label={`${r.label}: ${fmtMultiple(r.multiple)} a typical video's response`}
              />
            </span>
            <span role="cell" className="hidden sm:block">
              {posts === 0 ? (
                <span aria-label="You published nothing of your own" className="text-muted-foreground">·</span>
              ) : marks ? (
                <UnitSquares k={r.yours} n={posts} tone="you" shape="bar" label={`${r.yours} of your ${posts} posts`} className={MARKS_FIT} />
              ) : (
                <Lvl className="text-[12.5px]">{fmtInt(r.yours)} of {fmtInt(posts)}</Lvl>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorksCard({ block, className, style }: { block: WorksBlock; className?: string; style?: CSSProperties }) {
  const when = monthWords(block)
  const neither = block.formats.length === 0 && block.openings.length === 0
  return (
    // `what-works`: where your posts' page sends a reader for the market's
    // formats (WORKS_ANCHOR).
    <article id={WORKS_ANCHOR} aria-labelledby="works-title" style={style} className={cn(CARD, 'scroll-mt-6', className)}>
      <CardHead
        icon={ChartLine}
        id="works-title"
        title="What works in your market’s videos"
        sub={`How well each kind of video does against a typical video in your market, and how often your own posts use it. Videos published ${when}.`}
      />
      {/* Both charts and the sentence's panel in every state (the board's
          shape): a chart with no rows says so inside its own frame, and where
          the whole reading could not be made, the panel says why. */}
      <div className="grid grid-cols-1 gap-7">
        <Chart title="How the video is made" rows={block.formats} posts={block.posts} empty={neither ? '' : 'Too few rated videos of any one format yet'} />
        <Chart title="How it opens" rows={block.openings} posts={block.posts} empty={neither ? '' : 'Too few rated videos of any one opening yet'} />
      </div>
      {block.unread || block.sentence ? (
        <p className={cn('m-0 rounded-[10px] bg-inner px-3.5 py-3 text-[14px] leading-[1.55]', block.unread ? 'text-muted-foreground' : null)}>
          {block.unread ?? <Sentence parts={block.sentence!} />}
        </p>
      ) : null}
      {!block.unread && block.basis ? <p className="m-0 text-[12px] leading-[1.45] text-muted-foreground"><Sentence parts={block.basis} /></p> : null}
    </article>
  )
}
