import Link from 'next/link'
import { NAV_ICON } from '@/components/nav-icons'
import { RecipeChip } from '@/components/pages/v2/content/parts'
import { fmtInt, longMonth } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { groupHref, IDEAS_EMPTY, POST_IDEA_SLOT, type OwnTouch, type TopAsked } from '@/lib/pages/v2/content'
import { tileHref } from '@/lib/pages/home'
import type { ContentTile, TileRead } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { MID, MONO_MUTED, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S CONTENT TILE (Design v2, T8; E1-Dashboard's second row),
// from `topContent`: the week's first post idea, which opens its brief in
// place on Content (`?idea=<rank>`), with how many of the market's videos it
// came up in over the days the ideas read ("of 640 videos, 14 Sep to 11
// Oct": four weeks of questions, Heinrich, 13 Oct) and the month beside it
// (decision 1), the format and opening code chose, and whether your posts
// touched on it; or why there is no idea (not switched on, none written, too
// old). In a medical market the medical team line prints under the idea,
// always (T13's done-when).
//
// The board's "12 comments are waiting for a reply" is not printed: nothing
// can see whether you replied (decision 5), so Content lists the comments
// worth an answer instead, one click down.

/** Whether your posts touched on it, in Content's words (`OwnTouchLine`), in
 *  the board's grey: the kit draws no orange words. */
export function OwnLine({ own }: { own: OwnTouch }) {
  const when = `since ${longMonth(own.since)}`
  if (own.state === 'unread') return <>Your posts could not be read just now</>
  if (own.state === 'no_posts') return <>You published nothing of your own {when}</>
  if (own.state === 'none') return <>None of your <span data-copy="figure">{fmtInt(own.posts)}</span> posts {when} touched on it</>
  return <><span data-copy="figure">{fmtInt(own.touched)}</span> of your <span data-copy="figure">{fmtInt(own.posts)}</span> posts {when} touched on it</>
}

/** The title where there is no idea: the question in the most of the week's
 *  videos that your posts have not touched (Content's "Also asked", its first
 *  row; a question your posts touched is left out, so the title says so
 *  rather than "asked most"). */
export const ASKED_TITLE = 'Not in your posts yet'
/** The neutral title where your posts could not be read: nothing was left
 *  out, so the question is the week's own ("Asked this week"). */
export const askedTitleUnread = (weekWords: string): string => `Asked ${weekWords}`

/** The tile with no post idea (parity pass, 13 Oct): the board's "Post next"
 *  card, title, count of the week's videos beside its month, and your posts,
 *  on the question the week asked most; why there is no idea, in one quiet
 *  line under it. */
function Asked({ asked, line }: { asked: TopAsked; line: string | null }) {
  // "Not in your posts yet" only where your posts were read: a failed read
  // left nothing out, so the title says only that it was asked.
  const read = asked.own != null && asked.own.state !== 'unread'
  return (
    <>
      <h3 className={TT}>
        {read ? ASKED_TITLE : askedTitleUnread(asked.weekWords)}: <span data-copy="subject" data-slot="pass_b_theme">{asked.label}</span>
      </h3>
      {/* The week's figure only beside its month (decision 1). */}
      {asked.week && asked.month ? (
        <>
          <div data-copy="level" className="flex flex-wrap items-baseline gap-x-2.5">
            <span className={MID}>{fmtInt(asked.week.k)}</span>
            <span className={MONO_MUTED}>of {fmtInt(asked.week.n)} videos {asked.weekWords}</span>
          </div>
          <p data-copy="level" className={cn(MONO_MUTED, 'm-0 -mt-2 max-sm:-mt-1')}>
            {fmtInt(asked.month.k)} of {fmtInt(asked.month.n)} {asked.monthWords}
          </p>
        </>
      ) : asked.month ? (
        <p data-copy="level" className={cn(MONO_MUTED, 'm-0 text-[14px] text-foreground')}>{fmtInt(asked.month.k)} of {fmtInt(asked.month.n)} {asked.monthWords}</p>
      ) : null}
      {/* Who asks, where the board draws its chips (names only, decision 5). */}
      {asked.groups.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] max-sm:hidden">
          <span className="text-muted-foreground">Who asks</span>
          {asked.groups.map((g) => (
            <Link key={g.key} href={groupHref(g.key)} className="rounded-md bg-inner px-2.5 py-1.5 leading-none text-foreground no-underline hover:bg-track">
              <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {asked.own ? <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground"><OwnLine own={asked.own} /></p> : null}
      {/* What else the week asked, from the same table: the board's weight
          in rows the data holds, each week beside its month (decision 1). */}
      {asked.next.length > 0 ? (
        <div data-asked-next="" className="flex flex-col max-sm:hidden">
          {asked.next.map((r) => (
            <Link key={r.registryId} href={asked.href} className="-mx-2 flex flex-col gap-0.5 rounded-md border-t border-track px-2 py-2 text-[14px] leading-[1.35] text-foreground no-underline hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0">{r.label}</span>
              {r.week != null && r.month != null && asked.week && asked.month ? (
                <span className={MONO_MUTED}>
                  <span data-copy="figure">{fmtInt(r.week)}</span> {asked.weekWords} · <span data-copy="level">{fmtInt(r.month)} of {fmtInt(asked.month.n)}</span> {asked.monthWords}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
      {line ? <p data-content-why="" className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{line}</p> : null}
    </>
  )
}

export function ContentTileView({ read }: { read: TileRead<ContentTile> }) {
  const top = read.state === 'ok' ? read.top : null
  const idea = top?.state === 'ready' ? top.idea : null
  const asked = !idea ? top?.asked ?? null : null
  // Where no idea prints, the tile opens Content's "Also asked" on its question.
  const href = asked ? asked.href : top?.href ?? tileHref('content')
  return (
    <article aria-labelledby="home-content" data-tile="content" data-state={top?.state ?? 'failed'} className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.content} name="Content" id="home-content" href={href} />
      {!top ? <TileLine>{TILE_FAILED}</TileLine>
        : asked ? <Asked asked={asked} line={top.state === 'ready' ? null : IDEAS_EMPTY[top.state]} />
          : !idea ? <TileLine>{top.line ?? IDEAS_EMPTY.none}</TileLine> : (
        <>
          {top.line ? <TileLine className="text-[13px]">{top.line}</TileLine> : null}
          <h3 className={TT}>
            Post next: <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{idea.title}</span>
          </h3>
          {/* The four weeks only beside their month (decision 1), as on
              Content and in the email. */}
          {idea.read && idea.month ? (
            <div data-copy="level" className="flex flex-wrap items-baseline gap-x-2.5">
              <span className={MID}>{fmtInt(idea.read.k)}</span>
              <span className={MONO_MUTED}>of {fmtInt(idea.read.n)} videos, <span className="whitespace-nowrap">{idea.ideasWeek.read.label}</span></span>
            </div>
          ) : null}
          {/* The ideas' days beside the month (decision 1); the month alone
              where those days were not read. */}
          {idea.month ? (
            <p data-copy="level" className={cn(MONO_MUTED, 'm-0', idea.read ? '-mt-2 max-sm:-mt-1' : 'text-[14px] text-foreground')}>
              {fmtInt(idea.month.k)} of {fmtInt(idea.month.n)} {idea.monthWords}
            </p>
          ) : null}
          {idea.format || idea.opening ? (
            <div className="flex flex-wrap gap-2 max-sm:hidden">
              {idea.format ? <RecipeChip recipe={idea.format} /> : null}
              {idea.opening ? <RecipeChip recipe={idea.opening} /> : null}
            </div>
          ) : null}
          <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground"><OwnLine own={idea.own} /></p>
          {idea.medical ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{MEDICAL_LINE}</p> : null}
        </>
      )}
    </article>
  )
}
