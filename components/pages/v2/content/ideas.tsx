import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { CARD, equalColumns, FlagChip, MiniBars, panelItemOrder, panelPlacement, PanelSlot, SELECTED_CARD_RING, type PanelLayout, type PerBreakpoint } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import {
  ASKED_ID, IDEA_PANEL_ID, IDEAS_EMPTY, contentHref, monthWords, olderIdeasLine, POST_IDEA_SLOT,
  type ContentState, type IdeaCard, type IdeasBlock, type OwnTouch,
} from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fact, GroupNames, LABEL, Fig, OLink, RecipeChip } from './parts'

/**
 * WHAT TO POST NEXT (E5-Content, the first row): the week's post ideas, one
 * card each, biggest first.
 *
 * A card is level 1, so it prints no comment's words: the idea's title (the
 * model's, `stored` under `post_idea`), how many of the week's market videos
 * it came up in with the month beside it (decision 1), the last three weeks
 * as three bare counts, the flag only where the anomaly check or the week
 * read earned one, who asks by group name alone (decision 5), whether your
 * posts this month touched on it, and the format and opening code chose with
 * their multiples. In a medical market every card carries the medical team
 * line. "Open the brief" opens the idea in place (`?idea=<rank>`).
 */

/** "None of your 61 posts since August touched on it": the post-ideas step's
 *  own test over its own window (`ownTouch`). */
export function OwnTouchLine({ own }: { own: OwnTouch }) {
  const when = `since ${longMonth(own.since)}`
  if (own.state === 'unread') return <span className="text-muted-foreground">Your posts could not be read just now</span>
  if (own.state === 'no_posts') return <span className="text-muted-foreground">You published nothing of your own {when}</span>
  if (own.state === 'none') {
    return <span className="text-[12.5px] font-semibold text-orange-text">None of your <Fig>{fmtInt(own.posts)}</Fig> posts {when} touched on it</span>
  }
  return <span><Fig>{fmtInt(own.touched)}</Fig> of your <Fig>{fmtInt(own.posts)}</Fig> posts {when} touched on it</span>
}

/** The week's figure with its month under it, or the month's alone. */
function Demand({ card, monthLabel, weekWord }: { card: IdeaCard; monthLabel: string; weekWord: string }) {
  return (
    <div className="min-w-0">
      {card.week ? (
        <div data-copy="level">
          <div className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums">{fmtInt(card.week.k)}</div>
          <div className="mt-1.5 font-mono text-[12.5px] leading-[1.45] text-muted-foreground">of {fmtInt(card.week.n)} videos {weekWord}</div>
        </div>
      ) : null}
      {card.month ? (
        <p data-copy="level" className={cn('m-0 font-mono text-[12.5px] leading-[1.45] text-muted-foreground', card.week ? null : 'text-[14px] text-foreground')}>
          {fmtInt(card.month.k)} of {fmtInt(card.month.n)} {monthLabel}
        </p>
      ) : null}
      {card.flag ? <div className="mt-2.5"><FlagChip verdict={card.flag} /></div> : null}
    </div>
  )
}

export function IdeaCardView({ card, state, selected, month, weekWord, style }: {
  card: IdeaCard
  state: ContentState
  selected: boolean
  month: { month: string; complete: boolean }
  weekWord: string
  style?: CSSProperties
}) {
  const open = contentHref({ ...state, open: { kind: 'idea', rank: card.rank } })
  const close = contentHref({ ...state, open: null })
  return (
    <article id={`idea-${card.rank}`} aria-labelledby={`idea-${card.rank}-title`} style={style} className={cn(CARD, 'scroll-mt-6', selected ? SELECTED_CARD_RING : null)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-orange-text text-[13px] font-bold text-white">{card.rank}</span>
        <h3 id={`idea-${card.rank}-title`} className="m-0 text-[18px] leading-[1.35] font-semibold tracking-[-0.005em]">
          <span className="sr-only">Post idea {card.rank}: </span>
          <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{card.title}</span>
        </h3>
      </div>
      <div className="flex items-end justify-between gap-3">
        <Demand card={card} monthLabel={monthWords(month)} weekWord={weekWord} />
        {card.weeks ? (
          <div className="w-[118px] shrink-0">
            <MiniBars
              bars={card.weeks.map((w) => ({ label: w.label, value: w.count }))}
              label="Market videos a week where it came up, the last three weeks"
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col border-t border-track">
        {card.groups.length > 0 ? <Fact name="Who's asking"><GroupNames groups={card.groups} /></Fact> : null}
        <Fact name="Your posts"><OwnTouchLine own={card.own} /></Fact>
      </div>
      {card.format || card.opening ? (
        <div>
          <p className={cn(LABEL, 'mb-2')}>{card.format && card.opening ? 'Suggested format and opening' : card.format ? 'Suggested format' : 'Suggested opening'}</p>
          <div className="flex flex-wrap gap-2">
            {card.format ? <RecipeChip recipe={card.format} /> : null}
            {card.opening ? <RecipeChip recipe={card.opening} /> : null}
          </div>
          {/* The multiples are T13's: on the question, never the whole market. */}
          {card.format?.multiple != null || card.opening?.multiple != null ? (
            <p className="m-0 mt-2 text-[12px] leading-[1.4] text-muted-foreground">1× is a typical market video on this question</p>
          ) : null}
        </div>
      ) : null}
      {card.medical ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{MEDICAL_LINE}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        {selected ? (
          <OLink href={close} scroll={false} aria-expanded aria-controls={IDEA_PANEL_ID}>Close ↑</OLink>
        ) : (
          <OLink href={open} aria-expanded={false} aria-controls={IDEA_PANEL_ID}>Open the brief →</OLink>
        )}
      </div>
    </article>
  )
}

/** Why there are no cards, honestly, and where the questions are. */
function IdeasEmpty({ block }: { block: IdeasBlock }) {
  const line = block.state === 'ready' ? IDEAS_EMPTY.none : IDEAS_EMPTY[block.state]
  return (
    <div className={cn(CARD, 'gap-2 max-sm:gap-2')} data-ideas-empty={block.state}>
      <p className="m-0 text-[15px] leading-[1.5]">{line}</p>
      <p className="m-0 text-[13.5px] text-muted-foreground">
        The questions people asked are listed under <a href={`#${ASKED_ID}`} className="font-semibold text-orange-text no-underline hover:underline">Also asked</a>.
      </p>
    </div>
  )
}

/** The ideas' columns: one on a phone and up to 1280, three from there. */
export function ideasLayout(count: number): PanelLayout {
  return { base: equalColumns(1, count), xl: equalColumns(3, count) }
}

/** The week's ideas, and the open one's brief (`panel`) under its card at
 *  every width: one grid, the brief a child of it placed after the card's row
 *  (`panelPlacement`) and in the markup right after the card. A brief whose
 *  card is not drawn opens under the row. */
export function IdeasSection({ block, state, month, weekWord, panel }: {
  block: IdeasBlock
  state: ContentState
  month: { month: string; complete: boolean }
  weekWord: string
  panel?: (notchAt?: number | PerBreakpoint) => ReactNode
}) {
  const openRank = state.open?.kind === 'idea' ? state.open.rank : null
  const since = block.cards[0]?.own.since
  const at = panel && openRank != null ? block.cards.findIndex((c) => c.rank === openRank) : -1
  const place = panel && at >= 0 ? panelPlacement(at, ideasLayout(block.cards.length)) : null
  return (
    <section aria-labelledby="ideas-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="ideas-title" className="m-0 text-[19px] leading-[1.3] font-semibold">What to post next</h2>
        {block.cards.length > 0 && block.week ? (
          <span className="text-[13px] leading-[1.4] text-muted-foreground">
            For {block.week.label}: questions people asked that none of your posts since {longMonth(since ?? month.month)} had touched on when they were picked, biggest first
          </span>
        ) : null}
      </div>
      {block.cards.length > 0 && block.week && !block.week.current ? (
        <p data-ideas-older="" className="m-0 px-0.5 text-[14px] leading-[1.5]">{olderIdeasLine(block.week)}</p>
      ) : null}
      {block.cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {block.cards.map((c, i) => (
            <Fragment key={c.rank}>
              <IdeaCardView card={c} state={state} selected={openRank === c.rank} month={month} weekWord={weekWord} style={panelItemOrder(i)} />
              {place && panel && i === at ? <PanelSlot placement={place}>{panel(place.notch)}</PanelSlot> : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <IdeasEmpty block={block} />
      )}
      {panel && !place ? panel() : null}
    </section>
  )
}
