import type { CSSProperties } from 'react'
import { CARD, EmptyBox, FlagChip, GoLink } from '@/components/v2'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import {
  askedPhrase, conversationHref, fmtMultiple, IDEA_SLOTS, IDEAS_EMPTY, ideaHref, monthWords, olderIdeasLine, POST_IDEA_SLOT, QUESTION_IDEA_LINE, questionsAfterIdeas, questionsHeading, questionSlotId,
  type IdeaCard, type IdeasBlock, type IdeasState, type OwnTouch, type QuestionSlot, type QuestionSlotsContext, type Recipe,
} from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Facts, Fig, GroupNames, Lvl, WeekBars } from './parts'

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
 * their multiples. "Open the brief" opens the idea's own page
 * (`/dashboard/content/ideas/<id>`, depth as pages, 17 Oct).
 *
 * Since the audit design (7 Nov, `Content.dc.html`): a plain rank number, the
 * count as a figure and a sentence (its bases said once, decision 2), the
 * weeks as small yellow columns at the boards' 12px, the facts one list
 * (format and opening among them), and in a medical market the medical team
 * line once under the row (decision 14).
 */

/** "None of your 61 posts since August touched on it": the post-ideas step's
 *  own test over its own window (`ownTouch`). */
export function OwnTouchLine({ own }: { own: OwnTouch }) {
  const when = `since ${longMonth(own.since)}`
  if (own.state === 'unread') return <span className="text-muted-foreground">Your posts could not be read just now</span>
  if (own.state === 'no_posts') return <span className="text-muted-foreground">You published nothing of your own {when}</span>
  if (own.state === 'none') return <span>None of your <Fig>{fmtInt(own.posts)}</Fig> posts {when} touched on it</span>
  return <span><Fig>{fmtInt(own.touched)}</Fig> of your <Fig>{fmtInt(own.posts)}</Fig> posts {when} touched on it</span>
}

/** Under the weekly bars, only where they add up to more than the four
 *  weeks' total: a video is counted in every week it had comments in, and
 *  the total counts it once (5 Nov: Sealand's first idea drew 8 + 1 + 2 + 5
 *  beside "15 over the four weeks"). Null where they do not. Pure. */
export function weeksOverlapNote(weeks: readonly { count: number | null }[], total: number): string | null {
  const sum = weeks.reduce((a, w) => a + (w.count ?? 0), 0)
  return sum > total ? `A video commented on in two of these weeks counts in both, so the weeks add up to more than ${fmtInt(total)}.` : null
}

const BIG = 'text-[36px] font-bold leading-none tracking-[-0.01em] tabular-nums'
const SAYS = 'm-0 mt-2 text-[14.5px] leading-[1.45] text-secondary-foreground'

/** A count beside its month: bare where the figures row states the month's
 *  base (decision 2), else with its "of N". */
function MonthCount({ k, n, words, base }: { k: number; n: number; words: string; base: number | null }) {
  return n === base ? <><Fig>{fmtInt(k)}</Fig> {words}</> : <Lvl>{fmtInt(k)} of {fmtInt(n)} {words}</Lvl>
}

/** The figure over the days the ideas read, and its month in the same
 *  sentence ("12 / videos from 5 Oct to 1 Nov, and 13 in October so far."),
 *  or the month's alone. The four weeks never print without their month
 *  (decision 1): no month, no four-week figure. Each count is bare where its
 *  base is said once on the screen (the four weeks' in the row's lead, the
 *  month's in the figures row; decision 2), and keeps its "of N" otherwise
 *  (an older set's own month). */
function Demand({ card, monthLabel, readLabel, readBase, monthBase }: {
  card: IdeaCard
  monthLabel: string
  readLabel: string | null
  readBase: number | null
  monthBase: number | null
}) {
  const four = card.read && readLabel && card.month ? card.read : null
  const month = card.month
  return (
    <div className="min-w-0 flex-[1_1_140px]">
      {four && month ? (
        four.n === readBase ? (
          <>
            <div className={BIG}><Fig>{fmtInt(four.k)}</Fig></div>
            {/* The days never break inside. */}
            <p className={SAYS}>videos from <span className="whitespace-nowrap">{readLabel}</span>, and <MonthCount k={month.k} n={month.n} words={monthLabel} base={monthBase} />.</p>
          </>
        ) : (
          <>
            <div data-copy="level">
              <div className={BIG}>{fmtInt(four.k)}</div>
              <p className={SAYS}>of {fmtInt(four.n)} videos, <span className="whitespace-nowrap">{readLabel}</span></p>
            </div>
            <p className={cn(SAYS, 'mt-0')}>and <MonthCount k={month.k} n={month.n} words={monthLabel} base={monthBase} />.</p>
          </>
        )
      ) : month ? (
        month.n === monthBase ? (
          <>
            <div className={BIG}><Fig>{fmtInt(month.k)}</Fig></div>
            <p className={SAYS}>videos {monthLabel}.</p>
          </>
        ) : (
          <div data-copy="level">
            <div className={BIG}>{fmtInt(month.k)}</div>
            <p className={SAYS}>of {fmtInt(month.n)} videos {monthLabel}.</p>
          </div>
        )
      ) : null}
      {card.flag ? <div className="mt-2.5"><FlagChip verdict={card.flag} /></div> : null}
    </div>
  )
}

/** A suggested format or opening: its own name, and its multiple on the
 *  question ("A personal story, 1.5×"). */
function RecipeWords({ recipe }: { recipe: Recipe }) {
  return <>{recipe.name}{recipe.multiple != null ? <>, <Fig>{fmtMultiple(recipe.multiple)}</Fig></> : null}</>
}

/** The rank, a plain grey number beside the title (the boards' card). */
function Rank({ n }: { n: number }) {
  return <span aria-hidden className="shrink-0 text-[19px] font-semibold leading-[1.35] tabular-nums text-muted-foreground">{n}</span>
}

const TITLE = 'm-0 text-[19px] font-semibold leading-[1.35] tracking-[-0.005em]'

/** Said once in the row's lead where any card's weeks add up to more than
 *  its figure (the review of Phases 6 and 7: never once a card). */
export const WEEKS_OVERLAP_ONCE = 'A video commented on in two of these weeks counts in both, so a card’s weeks can add up to more than its figure.'

export function IdeaCardView({ card, month, readLabel, readBase = null, monthBase = null, overlapSaid = false, style }: {
  card: IdeaCard
  month: { month: string; complete: boolean }
  /** The days the ideas read, "14 Sep to 11 Oct" (`IdeasRead.label`). */
  readLabel: string | null
  /** The four weeks' base where the row's lead says it ("across 640 market
   *  videos"): the card's count is then bare. */
  readBase?: number | null
  /** The month's base where the figures row says it. */
  monthBase?: number | null
  /** The row's lead says once why the weeks can add up to more, so the card
   *  does not. */
  overlapSaid?: boolean
  style?: CSSProperties
}) {
  const overlap = !overlapSaid && card.weeks && card.read && readLabel && card.month ? weeksOverlapNote(card.weeks, card.read.k) : null
  return (
    <article id={`idea-${card.rank}`} aria-labelledby={`idea-${card.rank}-title`} style={style} className={cn(CARD, 'scroll-mt-6 gap-[18px]')}>
      <div className="flex items-baseline gap-3">
        <Rank n={card.rank} />
        <h3 id={`idea-${card.rank}-title`} className={TITLE}>
          <span className="sr-only">Post idea {card.rank}: </span>
          <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{card.title}</span>
        </h3>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Demand card={card} monthLabel={monthWords(month)} readLabel={readLabel} readBase={readBase} monthBase={monthBase} />
        {card.weeks ? (
          <WeekBars bars={card.weeks.map((w) => ({ label: w.label, value: w.count }))} label="Market videos a week where it came up" />
        ) : null}
      </div>
      {overlap ? (
        <p data-weeks-overlap="" className="m-0 -mt-2 text-[13px] leading-[1.45] text-muted-foreground"><span data-copy="figure">{overlap}</span></p>
      ) : null}
      <Facts rows={[
        ["Who's asking", <WhoAsks key="who" groups={card.groups} />],
        ['Your posts', <OwnTouchLine key="own" own={card.own} />],
        card.format ? ['Suggested format', <RecipeWords key="f" recipe={card.format} />] : null,
        card.opening ? ['Suggested opening', <RecipeWords key="o" recipe={card.opening} />] : null,
      ]} />
      <GoLink href={ideaHref(card)} className="mt-auto self-start">Open the brief</GoLink>
    </article>
  )
}

/** Who asks, by group name (decision 5); where no group's profile cites the
 *  conversation, the fact stays and says so. */
function WhoAsks({ groups }: { groups: IdeaCard['groups'] }) {
  return groups.length > 0 ? <GroupNames groups={groups} /> : <span className="text-muted-foreground">No group cites it</span>
}

/** Its videos over the page's period with the month beside them in one
 *  sentence (decision 1: a week's figure never prints without its month),
 *  as an idea's. Both bases are the figures row's (decision 2), so both
 *  counts are bare. */
function QuestionDemand({ row, ctx }: { row: QuestionSlot; ctx: QuestionSlotsContext }) {
  const month = row.month != null && ctx.market.month ? row.month : null
  const week = ctx.period === 'week' && month != null && row.week != null && ctx.market.week ? row.week : null
  const big = week ?? month
  return (
    <div className="min-w-0 flex-[1_1_140px]">
      {big != null ? (
        <>
          <div className={BIG}><Fig>{fmtInt(big)}</Fig></div>
          <p className={SAYS}>
            {week != null && month != null
              ? <>videos {ctx.when}, and <Fig>{fmtInt(month)}</Fig> {monthWords(ctx.month)}.</>
              : <>videos {monthWords(ctx.month)}.</>}
          </p>
        </>
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
  return ctx.posts === undefined ? <>None of your posts {when} touched on it</> : <>None of your <Fig>{fmtInt(ctx.posts)}</Fig> posts {when} touched on it</>
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
  const bars = questionBars(row, ctx)
  return (
    <article id={questionSlotId(rank)} data-idea-slot="question" aria-labelledby={`${questionSlotId(rank)}-title`} style={style} className={cn(CARD, 'scroll-mt-6 gap-[18px]')}>
      <div className="flex items-baseline gap-3">
        <Rank n={rank} />
        <h3 id={`${questionSlotId(rank)}-title`} className={TITLE}>
          <span className="sr-only">Question {rank}: </span>
          <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
        </h3>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <QuestionDemand row={row} ctx={ctx} />
        {bars ? <WeekBars bars={bars} label="Market videos a week where it came up" /> : null}
      </div>
      {/* The facts the question carries, flowing from the top as an idea's
          do: who asks, where it came up, its comments, its subject, your
          posts, and why it holds no idea (where that is not said over the
          row). A fact the page could not read is left out. */}
      <Facts rows={[
        ["Who's asking", <WhoAsks key="who" groups={row.groups} />],
        row.platforms && row.platforms.length > 0
          ? ['Came up on', <>{row.platforms.map((p, i) => <span key={p.platform}>{i > 0 ? ', ' : null}{platformLabel(p.platform)} <Fig>{fmtInt(p.videos)}</Fig></span>)}</>]
          : null,
        row.comments?.month != null
          ? ['Comments', <>{ctx.period === 'week' && row.comments.week != null ? <><Fig>{fmtInt(row.comments.week)}</Fig> {ctx.when}, </> : null}<Fig>{fmtInt(row.comments.month)}</Fig> {monthWords(ctx.month)}</>]
          : null,
        ['Subject', row.subject ?? <span key="none" className="text-muted-foreground">No subject holds it</span>],
        ['Your posts', <QuestionTouchLine key="own" ctx={ctx} />],
        QUESTION_IDEA_LINE[state] ? ['Post idea', <span key="idea" className="text-muted-foreground">{QUESTION_IDEA_LINE[state]}</span>] : null,
      ]} />
      <GoLink href={conversationHref(row.registryId)} className="mt-auto self-start">Open in Market</GoLink>
    </article>
  )
}

/** A question card's three weeks, named, where the page's week is seven
 *  days; null otherwise. */
function questionBars(row: QuestionSlot, ctx: QuestionSlotsContext): { label: string; value: number }[] | null {
  return row.weeks && ctx.weekLabels && row.weeks.length === ctx.weekLabels.length ? row.weeks.map((n, i) => ({ label: ctx.weekLabels![i], value: n })) : null
}

/** The places no idea or question is left for: ONE dashed box across them
 *  with the one sentence why (decision 4; the review of Phases 6 and 7),
 *  never a numbered white card each. */
const SPAN: Record<number, string> = { 1: '', 2: 'xl:col-span-2', 3: 'xl:col-span-3' }

function EmptySlots({ count, line }: { count: number; line: string | null }) {
  if (count <= 0 || !line) return null
  return (
    <div data-idea-slot="empty" className={cn('flex min-w-0', SPAN[count])}>
      <div className="flex w-full flex-col [&>[data-empty-box]]:flex-1"><EmptyBox>{line}</EmptyBox></div>
    </div>
  )
}

/** The row's lead, said once under its heading (the board's paragraph): the
 *  days the ideas read and the market's videos over them (the four weeks'
 *  base, so each card's count is bare), the untouched rule, what the bars
 *  count and what 1× is; or, where every card is a question, what the
 *  questions are. Null where the row has nothing to say. */
function RowLead({ block, ctx, month, readBase, overlap }: { block: IdeasBlock; ctx: QuestionSlotsContext; month: { month: string }; readBase: number | null; overlap: boolean }) {
  const read = block.week?.read ?? null
  const since = block.cards[0]?.own.since
  const bars = block.cards.some((c) => c.weeks) || block.questions.some((q) => questionBars(q, ctx))
  const typical = block.cards.some((c) => c.format?.multiple != null || c.opening?.multiple != null)
  const tail = <>{bars ? ' The bars count market videos a week where the question came up.' : null}{overlap ? ` ${WEEKS_OVERLAP_ONCE}` : null}{typical ? ' In the suggestions, 1× is a typical market video on this question.' : null}</>
  if (block.cards.length > 0 && read) {
    // A row of fewer ideas says what its other cards are too.
    const after = block.questions.length > 0 ? questionsAfterIdeas(ctx) : ''
    return (
      <>
        {askedPhrase(read)}
        {readBase != null ? <>, across <Fig>{fmtInt(readBase)}</Fig> market videos,</> : null}
        {' '}that none of your posts since {longMonth(since ?? month.month)} had touched on when they were picked{after}.{tail}
      </>
    )
  }
  if (block.cards.length === 0 && block.questions.length > 0) return <>{questionsHeading(ctx, block.state)}.{tail}</>
  return null
}

/**
 * The week's ideas, one card each in a grid of three from 1280 (one a row
 * under it). Each opens its own page; nothing opens in place.
 *
 * ALWAYS THREE CARDS (the board's row, in every state): the ideas, then a
 * question card for each place they leave (`IdeasBlock.questions`), then an
 * empty card for any place no question is left for.
 *
 * Said once for the row (the audit design, 7 Nov): the four weeks' base and
 * what 1× is, in the lead under the heading; the medical team line under the
 * cards, where any idea needs it (decision 14).
 */
export function IdeasSection({ block, month, ctx }: {
  block: IdeasBlock
  month: { month: string; complete: boolean }
  /** What the question cards print beside their figures. */
  ctx: QuestionSlotsContext
}) {
  const read = block.week?.read ?? null
  // The month each card's figure sits beside: the ideas' own (the page's for
  // this week's ideas; an older set's read window's).
  const ideasMonth = block.week?.month ?? month
  const cards = block.cards.slice(0, IDEA_SLOTS)
  const questions = block.questions.slice(0, IDEA_SLOTS - cards.length)
  const empty = IDEA_SLOTS - cards.length - questions.length
  // The places left say ONE thing, once: where no card holds anything, why
  // there is no idea (no question card says it), else why no question is
  // left.
  const emptyLine = (cards.length === 0 && questions.length === 0 && block.state !== 'ready' ? IDEAS_EMPTY[block.state] : null) ?? ctx.emptyLine ?? null
  // The bases said once: the four weeks' in the lead (every idea of a set
  // reads the same days), the month's in the figures row where the ideas'
  // month is the page's.
  const readBase = read ? cards[0]?.read?.n ?? null : null
  const monthBase = ideasMonth.month === month.month ? ctx.market.month : null
  // Why a card's weeks can add up to more than its figure: once, in the lead.
  const overlap = Boolean(read) && cards.some((c) => c.weeks && c.read && c.month && weeksOverlapNote(c.weeks, c.read.k) != null)
  const lead = RowLead({ block, ctx, month, readBase, overlap })
  return (
    <section aria-labelledby="ideas-title" className="flex flex-col">
      <div className="mx-0.5 mt-1 mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="ideas-title" className="m-0 text-[21px] font-semibold leading-[1.3]">What to post next</h2>
        {cards.length > 0 ? <span className="text-[14px] leading-[1.45] text-muted-foreground">Biggest first</span> : null}
      </div>
      {lead ? <p className="mx-0.5 mt-0 mb-[18px] max-w-[900px] text-[15px] leading-[1.55] text-secondary-foreground">{lead}</p> : null}
      {cards.length > 0 && block.week && !block.week.current ? (
        <p data-ideas-older="" className="mx-0.5 mt-0 mb-[18px] text-[15px] leading-[1.55]">{olderIdeasLine(block.week)}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3" data-ideas-state={block.state}>
        {cards.map((c) => <IdeaCardView key={c.rank} card={c} month={ideasMonth} readLabel={read?.label ?? null} readBase={readBase} monthBase={monthBase} overlapSaid={overlap} />)}
        {questions.map((q, i) => (
          <QuestionCardView key={q.registryId} row={q} rank={cards.length + i + 1} state={block.state} ctx={ctx} />
        ))}
        <EmptySlots count={empty} line={emptyLine} />
      </div>
      {cards.some((c) => c.medical) ? <p data-medical="" className="mx-0.5 mt-4 mb-0 text-[14px] leading-[1.5] text-secondary-foreground">{MEDICAL_LINE}</p> : null}
    </section>
  )
}
