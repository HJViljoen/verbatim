import type { CSSProperties } from 'react'
import { CARD, CardHead, EmptyBox, GoLink } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { REPLIES_ANCHOR, repliesHref, type ContentState, type RepliesView } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig } from './parts'

/**
 * WORTH A REPLY (E5-Content's rail; decision 5): the comments worth an answer
 * from you, picked by what they ask (ready to buy, a question, an objection)
 * from This week's queue (`buildReplies`: the quote gate, three of a kind and
 * twelve in all), split by whose post they sit under (`ReplyRow.under`).
 * The list itself is its own page (`/dashboard/content/replies`, depth as
 * pages, 17 Oct): "Open the replies" goes there, the period kept.
 *
 * A LIST, NEVER "N WAITING". Nothing here can see whether you replied (no
 * comment carries its parent, and your replies are never matched), so the
 * card counts the comments it picked and claims nothing about an answer.
 * The comments' words are one click down, on the list's page.
 *
 * Since the audit design (7 Nov, `Content.dc.html`): the count and one
 * sentence of where they sit, then the four kinds as a list of names and
 * counts.
 */

/** The split by whose post (the board's "2 under your posts and 9
 *  elsewhere"), as its parts with a count. */
function underParts(under: RepliesView['under']): [number, string][] {
  const parts: [number, string][] = [
    [under.own, 'under your posts'],
    [under.about, 'under posts about you'],
    [under.elsewhere, 'elsewhere'],
  ]
  return parts.filter(([n]) => n > 0)
}

/** "6 under your posts, 3 under posts about you and 3 elsewhere"; where every
 *  comment sits in one place, where that is in words ("all elsewhere in your
 *  market"), since "9 comments, 9 elsewhere" repeats the count and reads
 *  oddly alone (Phase 4). */
function UnderLine({ under }: { under: RepliesView['under'] }) {
  const parts = underParts(under)
  if (parts.length === 0) return null
  if (parts.length === 1) {
    const only = under.own > 0 ? 'all under your posts' : under.about > 0 ? 'all under posts about you' : 'all elsewhere in your market'
    return <>{only}</>
  }
  return (
    <>
      {parts.map(([n, words], i) => (
        <span key={words}>{i === 0 ? null : i === parts.length - 1 ? ' and ' : ', '}<Fig>{fmtInt(n)}</Fig> {words}</span>
      ))}
    </>
  )
}

export function RepliesCard({ view, state, className, style }: { view: RepliesView; state: ContentState; className?: string; style?: CSSProperties }) {
  const when = view.window?.phrase ?? 'this week'
  const kinds: [number, string][] = [
    [view.counts.buying, 'Ready to buy'],
    [view.counts.question, 'Questions'],
    [view.counts.objection, 'Objections'],
    [view.counts.flagged, 'Wrong information'],
  ]
  return (
    // `worth-a-reply`: the anchor old reply links carry (REPLIES_ANCHOR).
    <article id={REPLIES_ANCHOR} aria-labelledby="replies-title" style={style} className={cn(CARD, 'scroll-mt-6', className)}>
      <CardHead id="replies-title" title="Worth a reply" sub={`Comments written ${when} worth an answer from you`} />
      {/* The board's shape in every state: the count, the four kinds and the
          link's line. Where the list could not be read the dashed box says
          why and the kinds keep their names with no number they cannot know
          (decision 4); where it is empty the zeros are true and the link's
          place says so. */}
      {view.unread ? (
        <EmptyBox>{view.unread}</EmptyBox>
      ) : (
        <div>
          <Fig className="block text-[36px] font-bold leading-none">{fmtInt(view.total)}</Fig>
          <p className="m-0 mt-1.5 text-[14.5px] leading-[1.45] text-secondary-foreground">
            {view.total === 1 ? 'comment' : 'comments'}
            {view.total > 0 ? <>, <UnderLine under={view.under} /></> : null}
          </p>
        </div>
      )}
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] text-[14.5px]">
        {kinds.map(([n, words]) => (
          <div key={words} className="contents">
            <dt className="border-t border-track py-2.5">{words}</dt>
            <dd className="m-0 border-t border-track py-2.5 text-right font-semibold">
              {view.unread ? <span className="font-normal text-muted-foreground">Not read</span> : <Fig>{fmtInt(n)}</Fig>}
            </dd>
          </div>
        ))}
      </dl>
      {view.unread ? null : (
        <div className="mt-auto">
          {view.total === 0 ? (
            <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">No comment from these days read as a question, an objection or someone ready to buy.</p>
          ) : (
            <GoLink href={repliesHref(state.period)}>Open the replies</GoLink>
          )}
        </div>
      )}
    </article>
  )
}
