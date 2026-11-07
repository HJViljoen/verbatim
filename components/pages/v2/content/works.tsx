import type { CSSProperties } from 'react'
import { CARD, CardHead, EmptyBox, TBL, TD, TH, toMaxAtLeast } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { fmtMultiple, monthWords, type WorksBlock, type WorksRow } from '@/lib/pages/v2/content'
import { WORKS_ANCHOR } from '@/lib/pages/v2/content-address'
import { cn } from '@/lib/utils'
import { Fig, Sentence } from './parts'

/**
 * WHAT WORKS IN YOUR MARKET'S VIDEOS (E5-Content; the audit design's
 * `Content.dc.html`, 7 Nov): two tables, how a video is made
 * (`classified_type`) and how it opens (`hook_style`), each row the market's
 * videos of that kind published this month, its share, its median response
 * against the market's median video (`buildPlaybook`'s multiple) and your own
 * posts this month of that kind (`clientSide: 'owned'`: the brand's own
 * accounts, never a creator naming it), a bare count whose base is the
 * figures row's "Your posts" (decision 2). Under them, one sentence about
 * your mix that code writes from the same rows, and what the reading was
 * read off.
 *
 * HOW LONG A BAR IS (decision 5, small call 11): each table's bars scale to
 * its largest multiple but never below 1× (`toMaxAtLeast(…, 1)`), so the
 * dark tick that marks 1×, a typical video, stands at `100 / max` and always
 * on the bar.
 *
 * Published clock: a format is a property of a video, dated by its upload
 * (lib/reading/formats.ts), and the card says so.
 */

/** A kind that draws less than a typical video (under 1.0× as printed): its
 *  figure in regular weight where the others are at 600, as the board draws
 *  it. */
const belowTypical = (multiple: number): boolean => Math.round(multiple * 10) / 10 < 1

/** The response bar: the yellow fill against the table's largest multiple on
 *  the track, the 1× tick standing proud of it, the figure after it. */
function ResponseBar({ row, scale, tick }: { row: WorksRow; scale: (v: number) => number; tick: number }) {
  const below = belowTypical(row.multiple)
  return (
    <div className="flex items-center gap-2.5" data-below={below ? '' : undefined}>
      <div role="img" aria-label={`${row.label}: ${fmtMultiple(row.multiple)} a typical video's response`} className="relative h-2.5 min-w-[64px] flex-1 rounded-[4px] bg-track">
        <div className="h-2.5 rounded-[4px] bg-brand" style={{ width: `${scale(row.multiple)}%` }} />
        <div data-tick="" className="absolute -top-1 -bottom-1 w-[2px] bg-foreground" style={{ left: `${tick}%` }} />
      </div>
      <Fig className={cn('w-10 shrink-0 text-right', below ? null : 'font-semibold')}>{fmtMultiple(row.multiple)}</Fig>
    </div>
  )
}

function Chart({ title, head, rows, empty }: { title: string; head: string; rows: readonly WorksRow[]; empty: string }) {
  const scale = toMaxAtLeast(rows.map((r) => r.multiple), 1)
  const max = Math.max(1, ...rows.map((r) => r.multiple))
  const tick = 100 / max
  // A table with no rows keeps its caption and says why in the dashed box in
  // its place (decision 4); where neither table has rows, the panel under
  // them says it once.
  if (rows.length === 0) {
    return (
      <div data-works-empty="" className="flex min-w-0 flex-col gap-2">
        <p className="m-0 text-[16px] font-semibold">{title}</p>
        <EmptyBox>{empty}</EmptyBox>
      </div>
    )
  }
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className={cn(TBL, 'min-w-[520px]')}>
        <caption className="pb-2 text-left text-[16px] font-semibold">{title}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TH, 'pr-3')}>{head}</th>
            <th scope="col" className={cn(TH, 'pr-3 text-right')}>Share of market videos</th>
            <th scope="col" className={cn(TH, 'w-[38%] px-3')}>Response</th>
            <th scope="col" className={cn(TH, 'pr-0 text-right')}>Your posts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={cn(TD, 'py-2.5 pr-3')}>{r.label}</td>
              <td className={cn(TD, 'py-2.5 pr-3 text-right tabular-nums text-secondary-foreground')}>
                {r.share != null ? <Fig>{Math.round(r.share)}%</Fig> : <span className="text-muted-foreground">Not read</span>}
              </td>
              <td className={cn(TD, 'py-2.5 px-3 align-middle')}><ResponseBar row={r} scale={scale} tick={tick} /></td>
              <td className={cn(TD, 'py-2.5 pr-0 text-right')}><Fig>{fmtInt(r.yours)}</Fig></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WorksCard({ block, className, style }: { block: WorksBlock; className?: string; style?: CSSProperties }) {
  const when = monthWords(block)
  const neither = block.formats.length === 0 && block.openings.length === 0
  return (
    // `what-works`: where your posts' page sends a reader for the market's
    // formats (WORKS_ANCHOR).
    <article id={WORKS_ANCHOR} aria-labelledby="works-title" style={style} className={cn(CARD, 'scroll-mt-6 gap-[18px]', className)}>
      <CardHead
        id="works-title"
        size="lg"
        title="What works in your market’s videos"
        sub={`How well each kind of video does against a typical video in your market, and how often your own posts use it. Videos published ${when}. The dark line on each bar marks 1×, a typical video.`}
      />
      {/* Both tables and the sentence's panel in every state (the board's
          shape): a table with no rows says so in its place, and where the
          whole reading could not be made, the panel says why. */}
      <div className="grid grid-cols-1 gap-7">
        <Chart title="How the video is made" head="Kind of video" rows={block.formats} empty={neither ? 'Not drawn yet.' : 'Too few rated videos of any one format yet.'} />
        <Chart title="How it opens" head="Opening" rows={block.openings} empty={neither ? 'Not drawn yet.' : 'Too few rated videos of any one opening yet.'} />
      </div>
      {block.unread || block.sentence ? (
        <p className={cn('m-0 rounded-[10px] bg-inner px-5 py-4 text-[15.5px] leading-[1.6]', block.unread ? 'text-secondary-foreground' : null)}>
          {block.unread ?? <Sentence parts={block.sentence!} />}
        </p>
      ) : null}
      {!block.unread && block.basis ? <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground"><Sentence parts={block.basis} /></p> : null}
    </article>
  )
}
