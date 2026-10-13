import { MessageSquare } from 'lucide-react'
import { CARD, CardHead, InPlacePanel, PanelSection, PanelTitle, StatCell, SELECTED_CARD_RING, type PerBreakpoint } from '@/components/v2'
import { QuoteBlock } from '@/components/quote-block'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { REPLIES_ANCHOR, REPLIES_PANEL_ID, contentHref, type ContentState, type RepliesView } from '@/lib/pages/v2/content'
import type { ReplyRow } from '@/lib/pages/week'
import { cn } from '@/lib/utils'
import { Fig, OLink } from './parts'

/**
 * WORTH A REPLY (E5-Content's rail; decision 5): the comments worth an answer
 * from you, picked by what they ask (ready to buy, a question, an objection)
 * from This week's queue (`buildReplies`: the quote gate, three of a kind and
 * twelve in all), split by whose post they sit under (`ReplyRow.under`).
 *
 * A LIST, NEVER "N WAITING". Nothing here can see whether you replied (no
 * comment carries its parent, and your replies are never matched), so the
 * card counts the comments it picked and claims nothing about an answer.
 * The comments' words are one click down, in the panel (`?replies=1`).
 */

const UNDER_WORDS: Record<NonNullable<ReplyRow['under']>, string> = {
  own_post: 'Under your post',
  names_you: 'Under a post about you',
  elsewhere: 'Elsewhere in your market',
}

const INTENT_WORDS: Record<string, string> = {
  buying: 'Ready to buy',
  question: 'Question',
  objection: 'Objection',
  misinformation: 'Wrong information',
}

/** The split by whose post, "7 under your posts, 3 under posts about you, 2
 *  elsewhere", as its parts; none where it has one part or none, because "9
 *  comments · 9 elsewhere" says nothing the count does not (each comment's
 *  row in the panel still says where it sits). */
function underParts(under: RepliesView['under']): [number, string][] {
  const parts: [number, string][] = [
    [under.own, 'under your posts'],
    [under.about, 'under posts about you'],
    [under.elsewhere, 'elsewhere'],
  ]
  const shown = parts.filter(([n]) => n > 0)
  return shown.length > 1 ? shown : []
}

function UnderLine({ parts }: { parts: [number, string][] }) {
  return (
    <>
      {parts.map(([n, words], i) => (
        <span key={words}>{i > 0 ? ', ' : null}<Fig>{fmtInt(n)}</Fig> {words}</span>
      ))}
    </>
  )
}

export function RepliesCard({ view, state, selected, className }: { view: RepliesView; state: ContentState; selected: boolean; className?: string }) {
  const when = view.window?.phrase ?? 'this week'
  const split = underParts(view.under)
  const cells: [number, string][] = [
    [view.counts.buying, 'ready to buy'],
    [view.counts.question, view.counts.question === 1 ? 'question' : 'questions'],
    [view.counts.objection, view.counts.objection === 1 ? 'objection' : 'objections'],
    [view.counts.flagged, 'wrong information'],
  ]
  return (
    // `worth-a-reply`: the anchor old reply links carry (REPLIES_ANCHOR).
    <article id={REPLIES_ANCHOR} aria-labelledby="replies-title" className={cn(CARD, 'scroll-mt-6', selected ? SELECTED_CARD_RING : null, className)}>
      <CardHead
        icon={MessageSquare}
        id="replies-title"
        title="Worth a reply"
        sub={`Comments written ${when} worth an answer from you`}
      />
      {view.unread ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{view.unread}</p>
      ) : view.total === 0 ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">No comment from these days read as a question, an objection or someone ready to buy.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Fig className="text-[30px] leading-none font-medium tracking-[-0.02em]">{fmtInt(view.total)}</Fig>
            <span className="font-mono text-[12.5px] leading-[1.45] text-muted-foreground">{view.total === 1 ? 'comment' : 'comments'}{split.length > 0 ? <> · <UnderLine parts={split} /></> : null}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {cells.map(([n, words]) => <StatCell key={words} value={n} label={words} size="md" />)}
          </div>
          <div className="mt-auto">
            {selected ? (
              <OLink href={contentHref({ ...state, open: null })} scroll={false} aria-expanded aria-controls={REPLIES_PANEL_ID}>Close ↑</OLink>
            ) : (
              <OLink href={contentHref({ ...state, open: { kind: 'replies' } })} aria-expanded={false} aria-controls={REPLIES_PANEL_ID}>Open the replies →</OLink>
            )}
          </div>
        </>
      )}
    </article>
  )
}

function ReplyItem({ row }: { row: ReplyRow }) {
  const cite = [platformLabel(row.platform), row.date ? shortDate(row.date) : null, row.context].filter(Boolean).join(' · ')
  return (
    <li className="flex min-w-0 flex-col gap-2 border-t border-track py-3.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="rounded-[6px] bg-accent px-2 py-[3px] leading-[1.3]">{INTENT_WORDS[row.intent] ?? 'Question'}</span>
        {/* The context line under the words already says "under your post"
            or whose post it is; a creator's video naming you is the one
            thing it cannot say. */}
        {row.under === 'names_you' ? <span className="text-muted-foreground">{UNDER_WORDS.names_you}</span> : null}
        <span className="text-muted-foreground">· about {row.reason.charAt(0).toLowerCase()}{row.reason.slice(1)}</span>
      </div>
      <QuoteBlock quote={row.quote} cite={cite} />
      {row.href ? (
        <a href={row.href} target="_blank" rel="noreferrer" className="self-start text-[13px] font-semibold text-orange-text no-underline hover:underline">
          {row.platform === 'youtube' ? 'Reply on YouTube' : `Open the post on ${platformLabel(row.platform)}`} →
        </a>
      ) : null}
    </li>
  )
}

export function RepliesPanel({ view, state, notchAt }: { view: RepliesView; state: ContentState; notchAt?: number | PerBreakpoint }) {
  return (
    <InPlacePanel
      id={REPLIES_PANEL_ID}
      notchAt={notchAt ?? 0.83}
      closeHref={contentHref({ ...state, open: null })}
      closeLabel="Close the replies"
      labelledBy="replies-panel-title"
      head={<PanelTitle id="replies-panel-title">Comments worth a reply</PanelTitle>}
    >
      {view.rows.length > 0 ? (
        <PanelSection label={<>Worth an answer · <Fig>{fmtInt(view.rows.length)}</Fig></>}>
          <ul className="m-0 flex list-none flex-col p-0">
            {view.rows.map((r) => <ReplyItem key={r.id} row={r} />)}
          </ul>
        </PanelSection>
      ) : null}
      {view.flagged.length > 0 ? (
        <PanelSection label={<>Wrong information, for awareness · <Fig>{fmtInt(view.flagged.length)}</Fig></>}>
          <p className="m-0 text-[13px] text-muted-foreground">Comments read as getting something about your market wrong. They carry no reply link: an answer under someone else’s post starts an argument.</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {view.flagged.map((r) => <ReplyItem key={r.id} row={r} />)}
          </ul>
        </PanelSection>
      ) : null}
      <p className="m-0 border-t border-track pt-4 text-[12.5px] leading-[1.5] text-muted-foreground">
        Picked from the comments written {view.window?.phrase ?? 'this week'}: at most three of a kind, twelve in all and two from one video. We cannot see whether you have replied, so a comment stays on the list.
      </p>
    </InPlacePanel>
  )
}
