import type { CSSProperties } from 'react'
import { ChartLine } from 'lucide-react'
import { CARD, CardHead, TickBar, UnitSquares, MAX_UNITS } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { fmtMultiple, monthWords, WORKS_SCALE_MAX, type WorksBlock, type WorksRow } from '@/lib/pages/v2/content'
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

function Chart({ title, rows, posts }: { title: string; rows: readonly WorksRow[]; posts: number }) {
  const marks = posts > 0 && posts <= MAX_UNITS
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="m-0 text-[13px] font-semibold">{title}</p>
      <div role="table" aria-label={title} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)] items-center gap-x-3.5 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,0.9fr)]">
        <div role="row" className="contents">
          <span role="columnheader" className={HEAD}><span className="sr-only">Kind of video</span></span>
          <span role="columnheader" className={HEAD}>Response · 1× = typical</span>
          <span role="columnheader" className={cn(HEAD, 'hidden sm:block')}>Your <Fig>{fmtInt(posts)}</Fig> {posts === 1 ? 'post' : 'posts'}</span>
        </div>
        {rows.map((r) => (
          <div role="row" key={r.key} className="contents">
            <span role="cell" className="min-w-0">
              {r.label}
              {r.share != null ? <span className="text-[11.5px] text-muted-foreground"> · <Fig>{Math.round(r.share)}%</Fig></span> : null}
            </span>
            <span role="cell" className="min-w-0 pr-11">
              <TickBar
                pct={(Math.min(r.multiple, WORKS_SCALE_MAX) / WORKS_SCALE_MAX) * 100}
                tick={100 / WORKS_SCALE_MAX}
                size="xl"
                figure={fmtMultiple(r.multiple)}
                label={`${r.label}: ${fmtMultiple(r.multiple)} a typical video's response`}
              />
            </span>
            <span role="cell" className="hidden sm:block">
              {marks ? (
                <UnitSquares k={r.yours} n={posts} tone="you" shape="bar" label={`${r.yours} of your ${posts} posts`} />
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
  return (
    <article aria-labelledby="works-title" style={style} className={cn(CARD, className)}>
      <CardHead
        icon={ChartLine}
        id="works-title"
        title="What works in your market’s videos"
        sub={`How well each kind of video does against a typical video in your market, and how often your own posts use it. Videos published ${when}.`}
      />
      {block.unread ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{block.unread}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-7">
            {block.formats.length > 0 ? <Chart title="How the video is made" rows={block.formats} posts={block.posts} /> : null}
            {block.openings.length > 0 ? <Chart title="How it opens" rows={block.openings} posts={block.posts} /> : null}
          </div>
          {block.sentence ? (
            <p className="m-0 rounded-[10px] bg-inner px-3.5 py-3 text-[14px] leading-[1.55]"><Sentence parts={block.sentence} /></p>
          ) : null}
          {block.basis ? <p className="m-0 text-[12px] leading-[1.45] text-muted-foreground"><Sentence parts={block.basis} /></p> : null}
        </>
      )}
    </article>
  )
}
