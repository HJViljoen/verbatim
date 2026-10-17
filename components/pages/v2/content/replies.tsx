import type { CSSProperties } from 'react'
import { Reply } from 'lucide-react'
import { CARD, CardHead, StatCell } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { REPLIES_ANCHOR, repliesHref, type ContentState, type RepliesView } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, OLink } from './parts'

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
 */

/** The split by whose post (the board's "7 under your posts, 5 under
 *  creators' posts about you"), as its parts with a count. */
function underParts(under: RepliesView['under']): [number, string][] {
  const parts: [number, string][] = [
    [under.own, 'under your posts'],
    [under.about, 'under posts about you'],
    [under.elsewhere, 'elsewhere'],
  ]
  return parts.filter(([n]) => n > 0)
}

/** "6 under your posts, 3 under posts about you, 3 elsewhere"; where every
 *  comment sits in one place, where that is in words ("all elsewhere in your
 *  market"), since "9 comments · 9 elsewhere" repeats the count and reads
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
        <span key={words}>{i > 0 ? ', ' : null}<Fig>{fmtInt(n)}</Fig> {words}</span>
      ))}
    </>
  )
}

/** A count's cell where the count could not be read: the cell's frame and
 *  its label, a quiet dot for the number. */
function UnreadCell({ label }: { label: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-inner px-3.5 py-3">
      <div aria-hidden className="font-mono text-[24px] leading-none font-medium text-muted-foreground">·</div>
      <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">{label}</div>
    </div>
  )
}

export function RepliesCard({ view, state, className, style }: { view: RepliesView; state: ContentState; className?: string; style?: CSSProperties }) {
  const when = view.window?.phrase ?? 'this week'
  const cells: [number, string][] = [
    [view.counts.buying, 'ready to buy'],
    [view.counts.question, view.counts.question === 1 ? 'question' : 'questions'],
    [view.counts.objection, view.counts.objection === 1 ? 'objection' : 'objections'],
    [view.counts.flagged, 'wrong information'],
  ]
  return (
    // `worth-a-reply`: the anchor old reply links carry (REPLIES_ANCHOR).
    <article id={REPLIES_ANCHOR} aria-labelledby="replies-title" style={style} className={cn(CARD, 'scroll-mt-6', className)}>
      <CardHead
        icon={Reply}
        id="replies-title"
        title="Worth a reply"
        sub={`Comments written ${when} worth an answer from you`}
      />
      {/* The board's shape in every state: the count, the four cells and the
          link's line. Where the list could not be read the cells keep their
          frames and the count's place says why; where it is empty the zeros
          are true and the link's place says so. */}
      {view.unread ? (
        <>
          <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{view.unread}</p>
          <div className="grid grid-cols-2 gap-2.5">
            {cells.map(([, words]) => <UnreadCell key={words} label={words} />)}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Fig className="text-[30px] leading-none font-medium tracking-[-0.02em]">{fmtInt(view.total)}</Fig>
            <span className="font-mono text-[12.5px] leading-[1.45] text-muted-foreground">
              {view.total === 1 ? 'comment' : 'comments'}
              {view.total > 0 ? <> · <UnderLine under={view.under} /></> : null}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {cells.map(([n, words]) => <StatCell key={words} value={n} label={words} size="md" />)}
          </div>
          <div className="mt-auto">
            {view.total === 0 ? (
              <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">No comment from these days read as a question, an objection or someone ready to buy.</p>
            ) : (
              <OLink href={repliesHref(state.period)}>Open the replies →</OLink>
            )}
          </div>
        </>
      )}
    </article>
  )
}
