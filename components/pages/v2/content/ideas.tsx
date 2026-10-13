import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { CARD, equalColumns, FlagChip, MiniBars, panelItemOrder, panelPlacement, PanelSlot, SELECTED_CARD_RING, type PanelLayout, type PerBreakpoint } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import {
  askedPhrase, conversationHref, IDEA_PANEL_ID, IDEA_SLOTS, IDEAS_EMPTY, contentHref, monthWords, olderIdeasLine, POST_IDEA_SLOT, QUESTION_IDEA_LINE, questionsHeading,
  type ContentState, type IdeaCard, type IdeasBlock, type IdeasState, type OwnTouch, type QuestionSlot, type QuestionSlotsContext,
} from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fact, GroupNames, LABEL, Fig, OLink, RecipeChip } from './parts'

/**
 * WHAT TO POST NEXT (E5-Content, the first row): the week's post ideas, one
 * card each, biggest first. They refresh every week and read the questions
 * of the four weeks to their update (Heinrich, 13 Oct), and the section says
 * which days: "From questions asked 14 Sep to 11 Oct".
 *
 * A card is level 1, so it prints no comment's words: the idea's title (the
 * model's, `stored` under `post_idea`), how many of the market's videos over
 * those days it came up in with the month beside it (decision 1), each of
 * those weeks as a bare count, the flag only where the anomaly check or the
 * week read earned one, who asks by group name alone (decision 5), whether
 * your posts touched on it, and the format and opening code chose with
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

/** The figure over the days the ideas read, with its month under it, or the
 *  month's alone. The four weeks never print without their month (decision
 *  1): no month, no four-week figure. */
function Demand({ card, monthLabel, readLabel }: { card: IdeaCard; monthLabel: string; readLabel: string | null }) {
  const four = card.read && readLabel && card.month ? card.read : null
  return (
    <div className="min-w-0">
      {four ? (
        <div data-copy="level">
          <div className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums">{fmtInt(four.k)}</div>
          {/* The days on a line of their own where the card is narrow: the
              dates never break inside. */}
          <div className="mt-1.5 font-mono text-[12.5px] leading-[1.45] text-muted-foreground">of {fmtInt(four.n)} videos, <span className="whitespace-nowrap">{readLabel}</span></div>
        </div>
      ) : null}
      {card.month ? (
        <p data-copy="level" className={cn('m-0 font-mono text-[12.5px] leading-[1.45] text-muted-foreground', four ? null : 'text-[14px] text-foreground')}>
          {fmtInt(card.month.k)} of {fmtInt(card.month.n)} {monthLabel}
        </p>
      ) : null}
      {card.flag ? <div className="mt-2.5"><FlagChip verdict={card.flag} /></div> : null}
    </div>
  )
}

export function IdeaCardView({ card, state, selected, month, readLabel, style }: {
  card: IdeaCard
  state: ContentState
  selected: boolean
  month: { month: string; complete: boolean }
  /** The days the ideas read, "14 Sep to 11 Oct" (`IdeasRead.label`). */
  readLabel: string | null
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
        <Demand card={card} monthLabel={monthWords(month)} readLabel={readLabel} />
        {card.weeks ? (
          <div className={cn('shrink-0', card.weeks.length > 3 ? 'w-[150px]' : 'w-[118px]')}>
            <MiniBars
              bars={card.weeks.map((w) => ({ label: w.label, value: w.count }))}
              label={`Market videos a week where it came up, the weeks of ${card.weeks.map((w) => w.label).join(', ')}`}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col border-t border-track">
        <Fact name="Who's asking"><WhoAsks groups={card.groups} /></Fact>
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

/** Who asks, by group name (decision 5); where no group's profile cites the
 *  conversation, the fact stays and says so. */
function WhoAsks({ groups }: { groups: IdeaCard['groups'] }) {
  return groups.length > 0 ? <GroupNames groups={groups} /> : <span className="text-muted-foreground">No group cites it</span>
}

/** The rank's disc: the orange-text ground for a card that holds something,
 *  the track for an empty one. */
function Rank({ n, muted = false }: { n: number; muted?: boolean }) {
  return (
    <span aria-hidden className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold', muted ? 'bg-track text-muted-foreground' : 'bg-orange-text text-white')}>{n}</span>
  )
}

/** Its videos over the page's period with the month beside them (decision
 *  1: a week's figure never prints without its month), as an idea's. */
function QuestionDemand({ row, ctx }: { row: QuestionSlot; ctx: QuestionSlotsContext }) {
  const month = row.month != null && ctx.market.month ? { k: row.month, n: ctx.market.month } : null
  const week = ctx.period === 'week' && month && row.week != null && ctx.market.week ? { k: row.week, n: ctx.market.week } : null
  const big = week ?? month
  return (
    <div className="min-w-0">
      {big ? (
        <div data-copy="level">
          <div className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums">{fmtInt(big.k)}</div>
          <div className="mt-1.5 font-mono text-[12.5px] leading-[1.45] text-muted-foreground">of {fmtInt(big.n)} videos {week ? ctx.when : monthWords(ctx.month)}</div>
        </div>
      ) : null}
      {week && month ? (
        <p data-copy="level" className="m-0 font-mono text-[12.5px] leading-[1.45] text-muted-foreground">{fmtInt(month.k)} of {fmtInt(month.n)} {monthWords(ctx.month)}</p>
      ) : null}
      {row.flag ? <div className="mt-2.5"><FlagChip verdict={row.flag} /></div> : null}
    </div>
  )
}

/** "None of your 61 posts since August touched on it": every question in a
 *  card passed the touch test (it is the top of the also-asked list). */
function QuestionTouchLine({ ctx }: { ctx: QuestionSlotsContext }) {
  const when = `since ${longMonth(ctx.since)}`
  if (ctx.posts === null) return <span className="text-muted-foreground">Your posts could not be read just now</span>
  if (ctx.posts === 0) return <span className="text-muted-foreground">You published nothing of your own {when}</span>
  return (
    <span className="text-[12.5px] font-semibold text-orange-text">
      {ctx.posts === undefined ? <>None of your posts {when} touched on it</> : <>None of your <Fig>{fmtInt(ctx.posts)}</Fig> posts {when} touched on it</>}
    </span>
  )
}

/**
 * A CARD THE IDEAS LEFT, HOLDING THE NEXT QUESTION IN LINE (parity pass): the
 * idea card's anatomy, fed by what the data holds without a post idea. The
 * conversation's own label in the title's place (a `subject` node, Pass B's),
 * its videos beside the month, the three weeks as bare counts, the flag an
 * idea would wear, who asks and your posts; and, where the idea's format and
 * opening would be, one calm line saying why there is no idea for it. It
 * opens the conversation in Market, where its evidence is.
 */
export function QuestionCardView({ row, rank, state, ctx, style }: {
  row: QuestionSlot
  rank: number
  state: IdeasState
  ctx: QuestionSlotsContext
  style?: CSSProperties
}) {
  const bars = row.weeks && ctx.weekLabels && row.weeks.length === ctx.weekLabels.length ? row.weeks.map((n, i) => ({ label: ctx.weekLabels![i], value: n })) : null
  return (
    <article id={`idea-slot-${rank}`} data-idea-slot="question" aria-labelledby={`idea-slot-${rank}-title`} style={style} className={CARD}>
      <div className="flex items-start gap-3">
        <Rank n={rank} />
        <h3 id={`idea-slot-${rank}-title`} className="m-0 text-[18px] leading-[1.35] font-semibold tracking-[-0.005em]">
          <span className="sr-only">Question {rank}: </span>
          <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
        </h3>
      </div>
      <div className="flex items-end justify-between gap-3">
        <QuestionDemand row={row} ctx={ctx} />
        {bars ? (
          <div className="w-[118px] shrink-0">
            <MiniBars bars={bars} label={`Market videos a week where it came up, the weeks of ${bars.map((b) => b.label).join(', ')}`} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col border-t border-track">
        <Fact name="Who's asking"><WhoAsks groups={row.groups} /></Fact>
        <Fact name="Your posts"><QuestionTouchLine ctx={ctx} /></Fact>
      </div>
      {/* At the card's foot with its link, so beside an idea's taller card
          the room falls above it, not under it. */}
      <div className="mt-auto flex flex-col gap-4">
        <div>
          <p className={cn(LABEL, 'mb-1.5')}>Post idea</p>
          <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">{QUESTION_IDEA_LINE[state]}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OLink href={conversationHref(row.registryId)}>Open in Market →</OLink>
        </div>
      </div>
    </article>
  )
}

/** A card with neither an idea nor a question left for it: its rank and,
 *  on the first such card, the one line saying why. */
function EmptySlotCard({ rank, line, style }: { rank: number; line: string | null; style?: CSSProperties }) {
  return (
    <div data-idea-slot="empty" style={style} className={CARD}>
      <div className="flex items-start gap-3">
        <Rank n={rank} muted />
        {line ? <p className="m-0 pt-0.5 text-[14px] leading-[1.5] text-muted-foreground">{line}</p> : null}
      </div>
    </div>
  )
}

/** The ideas' columns: one on a phone and up to 1280, three from there. */
export function ideasLayout(count: number): PanelLayout {
  return { base: equalColumns(1, count), xl: equalColumns(3, count) }
}

/** The line over the row, in the board's place: the days the ideas read, or,
 *  where every card is a question, what the questions are. */
function RowLine({ block, ctx, month }: { block: IdeasBlock; ctx: QuestionSlotsContext; month: { month: string } }) {
  const read = block.week?.read ?? null
  const since = block.cards[0]?.own.since
  if (block.cards.length > 0 && read) {
    return <>{askedPhrase(read)} that none of your posts since {longMonth(since ?? month.month)} had touched on when they were picked, biggest first</>
  }
  if (block.cards.length === 0 && block.questions.length > 0) return <>{questionsHeading(ctx)}</>
  return null
}

/**
 * The week's ideas, and the open one's brief (`panel`) under its card at
 * every width: one grid, the brief a child of it placed after the card's row
 * (`panelPlacement`) and in the markup right after the card. A brief whose
 * card is not drawn opens under the row.
 *
 * ALWAYS THREE CARDS (the board's row, in every state): the ideas, then a
 * question card for each place they leave (`IdeasBlock.questions`), then an
 * empty card for any place no question is left for.
 */
export function IdeasSection({ block, state, month, ctx, panel }: {
  block: IdeasBlock
  state: ContentState
  month: { month: string; complete: boolean }
  /** What the question cards print beside their figures. */
  ctx: QuestionSlotsContext
  panel?: (notchAt?: number | PerBreakpoint) => ReactNode
}) {
  const openRank = state.open?.kind === 'idea' ? state.open.rank : null
  const read = block.week?.read ?? null
  // The month each card's figure sits beside: the ideas' own (the page's for
  // this week's ideas; an older set's read window's).
  const ideasMonth = block.week?.month ?? month
  const cards = block.cards.slice(0, IDEA_SLOTS)
  const questions = block.questions.slice(0, IDEA_SLOTS - cards.length)
  const empty = IDEA_SLOTS - cards.length - questions.length
  // An empty card says one thing each: where no card holds anything, why
  // there is no idea (no question card says it), then why no question is
  // left; the rest keep the row's place.
  const emptyLines = [
    ...(cards.length === 0 && questions.length === 0 && block.state !== 'ready' ? [IDEAS_EMPTY[block.state]] : []),
    ctx.emptyLine,
  ]
  const at = panel && openRank != null ? cards.findIndex((c) => c.rank === openRank) : -1
  const place = panel && at >= 0 ? panelPlacement(at, ideasLayout(IDEA_SLOTS)) : null
  const line = RowLine({ block, ctx, month })
  return (
    <section aria-labelledby="ideas-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="ideas-title" className="m-0 text-[19px] leading-[1.3] font-semibold">What to post next</h2>
        {line ? <span className="text-[13px] leading-[1.4] text-muted-foreground">{line}</span> : null}
      </div>
      {cards.length > 0 && block.week && !block.week.current ? (
        <p data-ideas-older="" className="m-0 px-0.5 text-[14px] leading-[1.5]">{olderIdeasLine(block.week)}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3" data-ideas-state={block.state}>
        {cards.map((c, i) => (
          <Fragment key={c.rank}>
            <IdeaCardView card={c} state={state} selected={openRank === c.rank} month={ideasMonth} readLabel={read?.label ?? null} style={panelItemOrder(i)} />
            {place && panel && i === at ? <PanelSlot placement={place}>{panel(place.notch)}</PanelSlot> : null}
          </Fragment>
        ))}
        {questions.map((q, i) => (
          <QuestionCardView key={q.registryId} row={q} rank={cards.length + i + 1} state={block.state} ctx={ctx} style={panelItemOrder(cards.length + i)} />
        ))}
        {Array.from({ length: empty }, (_, i) => {
          const rank = cards.length + questions.length + i + 1
          return <EmptySlotCard key={`empty-${rank}`} rank={rank} line={emptyLines[i] ?? null} style={panelItemOrder(rank - 1)} />
        })}
      </div>
      {panel && !place ? panel() : null}
    </section>
  )
}
