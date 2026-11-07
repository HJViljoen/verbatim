import Link from 'next/link'
import type { ReactNode } from 'react'
import { ROW } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { fmtMultiple, groupHref, IDEAS_EMPTY, POST_IDEA_SLOT, type OwnTouch, type Recipe, type TopAsked } from '@/lib/pages/v2/content'
import { tileHref } from '@/lib/pages/home'
import type { ContentTile, TileRead } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S CONTENT TILE, drawn to the audit design's board
// (Dashboard.dc.html, "Post next", 7 Nov), from `topContent`: the week's
// first post idea as the heading, which opens its own page
// (`/dashboard/content/ideas/<id>`), then its facts in one list: the videos
// it was asked under over the days the ideas read, beside its month
// (decision 1; four weeks of questions, Heinrich, 13 Oct), whether your
// posts touched on it, and what works best (the format and opening code
// chose, "×" said as "times"); or the week's most-asked question where there
// is no idea, and why. In a medical market the medical team line prints once,
// at the tile's foot (decision 14).
//
// The bases stay beside their counts here: the four weeks' videos and an
// older idea's month are not the figures row's (decision 2's own rule).
//
// The board's "12 comments are waiting for a reply" is not printed: nothing
// can see whether you replied (decision 5), so Content lists the comments
// worth an answer instead, one click down.

/** Whether your posts touched on it, in Content's words (`OwnTouchLine`). */
export function OwnLine({ own }: { own: OwnTouch }) {
  const when = `since ${longMonth(own.since)}`
  if (own.state === 'unread') return <>Your posts could not be read just now</>
  if (own.state === 'no_posts') return <>You published nothing of your own {when}</>
  if (own.state === 'none') return <>None of your <span data-copy="figure">{fmtInt(own.posts)}</span> posts {when} touched on it</>
  return <><span data-copy="figure">{fmtInt(own.touched)}</span> of your <span data-copy="figure">{fmtInt(own.posts)}</span> posts {when} touched on it</>
}

/** The title where there is no idea: the question in the most of the week's
 *  videos that your posts have not touched (Content's first question card; a
 *  question your posts touched is left out, so the title says so rather than
 *  "asked most"). */
export const ASKED_TITLE = 'Not in your posts yet'
/** The neutral title where your posts could not be read: nothing was left
 *  out, so the question is the week's own ("Asked this week"). */
export const askedTitleUnread = (weekWords: string): string => `Asked ${weekWords}`

/** A multiple, in words: "2.1 times", rounded as Content rounds it
 *  (`fmtMultiple`), so the tile and the page agree. */
const times = (m: number | null) => (m != null ? <><span data-copy="figure">{fmtMultiple(m).replace(/×$/, '')}</span> times</> : null)

/** The format and opening code chose, as one sentence each (the board's
 *  "Story format, 1.3 times a typical video on this question. Opening on a
 *  personal story, 1.5 times."): "×" said as "times". Null where neither. */
export function WorksBest({ format, opening }: { format: Recipe | null; opening: Recipe | null }) {
  if (!format && !opening) return null
  const typical = ' a typical video on this question'
  // The opening's chip words ("Open with a question") as the board's
  // sentence ("Opening with a question").
  const open = opening ? opening.label.replace(/^Open\b/, 'Opening') : null
  return (
    <>
      {format ? <>{format.name} format{format.multiple != null ? <>, {times(format.multiple)}{typical}</> : null}.</> : null}
      {format && opening ? ' ' : null}
      {opening ? <>{open}{opening.multiple != null ? <>, {times(opening.multiple)}{format?.multiple != null ? null : typical}</> : null}.</> : null}
    </>
  )
}

/** The tile's facts: a term over its words, two columns (the board's
 *  `<dl>`). */
function Facts({ rows }: { rows: readonly (readonly [string, ReactNode] | null)[] }) {
  const shown = rows.filter((r): r is readonly [string, ReactNode] => r != null)
  if (shown.length === 0) return null
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14.5px] leading-[1.5]">
      {shown.map(([term, words]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="m-0 min-w-0">{words}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The medical team line, once, at the tile's foot. */
function Medical() {
  return <p data-medical="" className="m-0 mt-auto border-t border-track pt-3 text-[13px] leading-[1.45] text-muted-foreground">{MEDICAL_LINE}</p>
}

/** The tile with no post idea (parity pass, 13 Oct): the question the week
 *  asked most that your posts have not touched, its videos beside its month,
 *  who asks, your posts and what else was asked; why there is no idea, in
 *  one quiet line under it. */
function Asked({ asked, line }: { asked: TopAsked; line: string | null }) {
  // "Not in your posts yet" only where your posts were read: a failed read
  // left nothing out, so the title says only that it was asked.
  const read = asked.own != null && asked.own.state !== 'unread'
  return (
    <>
      <h2 className={TT}>
        {read ? ASKED_TITLE : askedTitleUnread(asked.weekWords)}:{' '}
        <Link href={asked.href} className={ROW}><span data-copy="subject" data-slot="pass_b_theme">{asked.label}</span></Link>
      </h2>
      <Facts rows={[
        // The week's figure only beside its month (decision 1).
        asked.month ? ['Asked under', asked.week
          ? <><span data-copy="level">{fmtInt(asked.week.k)} of {fmtInt(asked.week.n)} videos</span> {asked.weekWords}, and <span data-copy="level">{fmtInt(asked.month.k)} of {fmtInt(asked.month.n)}</span> {asked.monthWords}</>
          : <><span data-copy="level">{fmtInt(asked.month.k)} of {fmtInt(asked.month.n)} videos</span> {asked.monthWords}</>] as const : null,
        // Who asks (names only, decision 5), each opening its group.
        asked.groups.length > 0 ? ['Who asks', <>{asked.groups.map((g, i) => (
          <span key={g.key}>{i > 0 ? ', ' : null}<Link href={groupHref(g.key)} className={cn(ROW, 'font-normal underline')}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link></span>
        ))}</>] as const : null,
        asked.own ? ['Your posts', <OwnLine key="own" own={asked.own} />] as const : null,
        // What else the week asked, next in line on Content, each opening its
        // own card; its week beside its month (decision 1).
        asked.next.length > 0 ? ['Also asked', <>{asked.next.map((r, i) => (
          <span key={r.registryId} data-asked-next="">
            {i > 0 ? '; ' : null}
            <Link href={r.href} className={cn(ROW, 'font-normal underline')}><span data-copy="subject" data-slot="pass_b_theme">{r.label}</span></Link>
            {r.week != null && r.month != null && asked.week && asked.month
              ? <>, <span data-copy="figure">{fmtInt(r.week)}</span> {asked.weekWords} and <span data-copy="level">{fmtInt(r.month)} of {fmtInt(asked.month.n)}</span> {asked.monthWords}</>
              : null}
          </span>
        ))}</>] as const : null,
      ]} />
      {line ? <p data-content-why="" className="m-0 border-t border-track pt-3 text-[13px] leading-[1.45] text-muted-foreground">{line}</p> : null}
    </>
  )
}

export function ContentTileView({ read }: { read: TileRead<ContentTile> }) {
  const top = read.state === 'ok' ? read.top : null
  const idea = top?.state === 'ready' ? top.idea : null
  const asked = !idea ? top?.asked ?? null : null
  return (
    <article aria-labelledby="home-content" data-tile="content" data-state={top?.state ?? 'failed'} className={cn(TILE, 'min-[1180px]:col-span-1')}>
      <TileHead label={idea ? 'Post next' : 'Content'} id="home-content" open={{ href: tileHref('content'), words: 'Open Content' }} />
      {!top ? <TileLine>{TILE_FAILED}</TileLine>
        : asked ? <Asked asked={asked} line={top.state === 'ready' ? null : IDEAS_EMPTY[top.state]} />
          : !idea ? <TileLine>{top.line ?? IDEAS_EMPTY.none}</TileLine> : (
        <>
          {top.line ? <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{top.line}</p> : null}
          <h2 className={TT}>
            <Link href={top.href} className={ROW}><span data-copy="stored" data-slot={POST_IDEA_SLOT}>{idea.title}</span></Link>
          </h2>
          <Facts rows={[
            // The four weeks only beside their month (decision 1), as on
            // Content and in the email; the month alone where those days
            // were not read.
            idea.month ? ['Asked under', idea.read
              ? <><span data-copy="level">{fmtInt(idea.read.k)} of {fmtInt(idea.read.n)} videos, {idea.ideasWeek.read.label}</span>, and <span data-copy="level">{fmtInt(idea.month.k)} of {fmtInt(idea.month.n)}</span> {idea.monthWords}</>
              : <><span data-copy="level">{fmtInt(idea.month.k)} of {fmtInt(idea.month.n)} videos</span> {idea.monthWords}</>] as const : null,
            ['Your posts', <OwnLine key="own" own={idea.own} />] as const,
            idea.format || idea.opening ? ['Works best', <WorksBest key="best" format={idea.format} opening={idea.opening} />] as const : null,
          ]} />
          {idea.medical ? <Medical /> : null}
        </>
      )}
    </article>
  )
}
