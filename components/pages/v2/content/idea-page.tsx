import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { translationNote } from '@/components/quote-block'
import { CARD, EmptyBox, FlagChip, GoLink, SectionHead, TickBar, toMax, translationLine, type StatItem } from '@/components/v2'
import { GO, QUOTE } from '@/components/v2/look'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { fmtMultiple, groupHref, lengthWords, POST_IDEA_SLOT, type MarketVideoCard } from '@/lib/pages/v2/content'
import {
  IDEA_MISSING, IDEA_NOT_ON, IDEA_UNREAD, openedSubNote, showSubComments, SUB_NONE_QUOTABLE, SUB_UNREAD,
  type ContentIdeaData, type IdeaPage, type SubComment, type SubquestionCard,
} from '@/lib/pages/v2/content-idea'
import { subAnchor } from '@/lib/pages/v2/content-address'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { OwnTouchLine, weeksOverlapNote } from './ideas'
import { AskCard, ContentMissing } from './level'
import { WeekBars } from './parts'

// A POST IDEA'S PAGE, THE HUB (depth as pages, 17 Oct; boards G5-Content-Idea,
// -Idea-Switcher, -Idea-Thin and -Idea-Phone; since the audit design, 7 Nov,
// drawn to Content-Brief.dc.html): the richest page under Content. The title
// block (the idea's title, "Post idea 1, from the conversation {its
// conversation}" under it, the flag as a tag, and the figures row: the days
// it read, its videos over them, its month); the header tile that leads with
// what the post should cover, the medical line in a medical market, and how
// to make it in three facts; what they want to know, a tile a sub-question;
// the numbers, one tile; the market's videos where it came up; the
// conversation in Market; the Agent. The crumbs and their switcher stay
// (decision 15).
//
// THE COMMENTS ARE THE SUB-QUESTIONS' OWN (the stored ids), through the quote
// gate the root's idea panel ran until 17 Oct (`gateFor` with the idea's
// title as the claim, comments under your own posts allowed), their words
// resolved at render, never stored.
// "Show all" is an address (`?sub=<n>`), so it works without client code.

/** What prints where the page names no idea, by why. */
const MISSING_LINES: Record<Exclude<ContentIdeaData['state'], 'ready'>, string> = {
  missing: IDEA_MISSING,
  not_on: IDEA_NOT_ON,
  unread: IDEA_UNREAD,
}

/** "Post idea 1, from the conversation {its conversation}", the conversation
 *  a link to its page in Market; "Post idea 1" where the run named it
 *  nothing. The line under the title. */
export function IdeaLabel({ page }: { page: Pick<IdeaPage, 'rank' | 'label' | 'conversationHref'> }) {
  if (!page.label) return <>Post idea {page.rank}</>
  return (
    <>Post idea {page.rank}, from the conversation <GoLink href={page.conversationHref} inText className="text-[15px]"><span data-copy="subject" data-slot="pass_b_theme">{page.label}</span></GoLink></>
  )
}

const lv = (k: number, n: number, rest: ReactNode = null) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}{rest}</span>

/** The month's words as a figures row's term: "October so far". */
const monthTermOf = (words: string): string => {
  const w = words.replace(/^in /, '')
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}`
}

/** The figures row (the board's `.strip`): the days the idea read, its videos
 *  over them of the market's, and its month's (decision 1: the four weeks
 *  never print without their month). Pure. */
export function ideaStats(page: IdeaPage): StatItem[] {
  const four = page.read && page.month ? page.read : null
  return [
    { key: 'asked', term: 'Questions asked', value: page.week.read.label },
    { key: 'read', term: 'Came up in', value: four ? lv(four.k, four.n, ' videos in your market') : 'Could not be counted just now' },
    { key: 'month', term: monthTermOf(page.typicalWords), value: page.month ? lv(page.month.k, page.month.n, ' videos') : 'Not read yet' },
  ]
}

/** One of the header tile's three facts: its term, its value at 20px and
 *  its line; a fact with nothing to state says so in its place. */
function HowFact({ term, value, line, gap }: { term: string; value: ReactNode; line?: ReactNode; gap?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-1.5">
        {gap ? <span data-fig-gap="" className="block text-[14.5px] leading-[1.5] text-muted-foreground">{gap}</span> : (
          <>
            <span className="block text-[20px] font-semibold leading-[1.3]">{value}</span>
            {line ? <span className="mt-1 block text-[14.5px] leading-[1.5] text-secondary-foreground">{line}</span> : null}
          </>
        )}
      </dd>
    </div>
  )
}

/** The header tile: what the post should cover, the medical line, then how
 *  to make it, three facts (where it came up is the figures row's). */
function HubCard({ page }: { page: IdeaPage }) {
  return (
    <section id="idea-hub" aria-labelledby="hub-head" className={cn(CARD, 'gap-3.5 sm:p-[30px]')}>
      <h2 id="hub-head" className="m-0 text-[15px] font-semibold text-secondary-foreground">What the post should cover</h2>
      <p data-copy="stored" data-slot={POST_IDEA_SLOT} className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[23px]">{page.cover}</p>
      {page.medical ? <p data-medical-line="" className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">{MEDICAL_LINE}</p> : null}
      <dl className="m-0 mt-3 grid grid-cols-1 gap-8 border-t border-track pt-[22px] max-sm:gap-5 min-[900px]:grid-cols-3">
        <HowFact
          term="Make it as"
          value={page.format?.name}
          line={page.format?.multiple != null ? <><span data-copy="figure">{fmtMultiple(page.format.multiple)}</span> a typical video on this question</> : null}
          gap={page.format ? null : 'No format stands out on this question yet'}
        />
        <HowFact
          term="Open with"
          value={page.opening?.name}
          line={page.opening?.multiple != null ? <><span data-copy="figure">{fmtMultiple(page.opening.multiple)}</span> a typical video on this question</> : null}
          gap={page.opening ? null : 'No opening stands out on this question yet'}
        />
        <HowFact
          term="Length"
          value={page.length ? <span data-copy="figure">{lengthWords(page.length)}</span> : null}
          line={page.length ? <>The middle half of <span data-copy="figure">{fmtInt(page.length.videos)}</span> {page.length.basis === 'format' && page.format ? `${page.format.name.toLowerCase()} videos` : 'videos, in any format,'} on this question that drew at least a typical response</> : null}
          gap={page.length ? null : 'Too few videos on this question carry a length to suggest one'}
        />
      </dl>
    </section>
  )
}

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "Four questions inside it, sorted from 33 comments on 23 videos, the most
 *  videos first": the section's note, and the base each tile's count is of. */
export function subquestionsNote(page: Pick<IdeaPage, 'subquestions' | 'asked'>): ReactNode {
  const n = page.subquestions.length
  if (n === 0) return null
  const count = n < NUM_WORDS.length ? NUM_WORDS[n] : null
  const head = count ? `${count.charAt(0).toUpperCase()}${count.slice(1)}` : <span data-copy="figure">{fmtInt(n)}</span>
  return (
    <>
      {head} {n === 1 ? 'question' : 'questions'} inside it,{' '}
      {page.asked ? <>sorted from <span data-copy="figure">{fmtInt(page.asked.comments)}</span> comments on <span data-copy="figure">{fmtInt(page.asked.videos)}</span> videos, </> : null}
      the most videos first
    </>
  )
}

/** One comment asking a sub-question: the commenter's words, its English as
 *  every quote's, where and when in commas. */
function Comment({ c }: { c: SubComment }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLine(note)
  const cite = [c.platform ? platformLabel(c.platform) : null, c.date].filter(Boolean).join(', ')
  return (
    <figure data-sub-comment="" className="m-0 flex flex-col gap-1 border-t border-border py-3 first:border-t-0">
      <blockquote className="m-0"><p data-copy="quote" className={cn('m-0 text-foreground', QUOTE)}>“{c.text}”</p></blockquote>
      {label ? <span className="text-[13px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14.5px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {cite ? <figcaption className="text-[13px] text-muted-foreground">{cite}</figcaption> : null}
    </figure>
  )
}

/** Said once under the tiles where no sub-question's comments could be
 *  read (each tile's own words are `SUB_UNREAD`). */
export const SUBS_UNREAD = 'Their comments could not be read just now.'

/** A sub-question's tile: its label, its bar against the largest
 *  sub-question's (decision 5), one sentence of its videos and its comments,
 *  two of its comments and "Show all". `noneOnce`: the page says once, under
 *  the tiles, that none of their comments can be quoted. */
function SubCard({ card, bar, noneOnce, unreadOnce }: { card: SubquestionCard; bar: number; noneOnce: boolean; unreadOnce: boolean }) {
  const show = showSubComments(card)
  const note = openedSubNote(card)
  const asking = <><span data-copy="figure">{fmtInt(card.comments)}</span> {card.comments === 1 ? 'comment' : 'comments'} asking it</>
  return (
    <article id={subAnchor(card.n)} data-sub-card="" className={cn(CARD, 'scroll-mt-6 gap-3')}>
      <h3 data-copy="stored" data-slot={POST_IDEA_SLOT} className="m-0 text-[18px] leading-[1.3] font-semibold text-foreground">{card.label}</h3>
      <TickBar pct={bar} size="md" label={`${card.label}: ${fmtInt(card.videos)} videos`} />
      {/* Its videos of the videos asked, the section's note's base (decision
          2): bare counts in one sentence. */}
      <p className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">
        {card.of != null
          ? <>In <span data-copy="figure">{fmtInt(card.videos)}</span> of the <span data-copy="figure">{fmtInt(card.of)}</span> videos, with {asking}.</>
          : <>In <span data-copy="figure">{fmtInt(card.videos)}</span> {card.videos === 1 ? 'video' : 'videos'}, with {asking}.</>}
      </p>
      {card.quotes.length > 0 ? (
        <div data-sub-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {card.quotes.map((c) => <Comment key={c.ref} c={c} />)}
        </div>
      ) : card.comments > 0 && !(noneOnce && card.quotable != null) && !(unreadOnce && card.quotable == null) ? (
        <EmptyBox>{card.quotable == null ? SUB_UNREAD : SUB_NONE_QUOTABLE}</EmptyBox>
      ) : null}
      {note ? <p className="m-0 text-[13px] text-muted-foreground">{note}</p> : null}
      {card.open ? (
        <Link href={card.href} scroll={false} className={cn(GO, 'self-start')}>Show fewer comments</Link>
      ) : show ? (
        <Link href={card.href} scroll={false} className={cn(GO, 'self-start')}>
          {show.of == null
            ? <>Show all <span data-copy="figure">{fmtInt(show.shown)}</span> comments</>
            : <>Show <span data-copy="figure">{fmtInt(show.shown)}</span> of <span data-copy="figure">{fmtInt(show.of)}</span> comments</>}
        </Link>
      ) : null}
    </article>
  )
}

/** "1 August": the first day of the month the touch test reads from. */
const firstOf = (month: string): string => `1 ${longMonth(month)}`

const H3 = 'm-0 text-[16px] font-semibold text-foreground'
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground'

/** The numbers, one tile (the board's): its weeks beside where it came up and
 *  who's asking, then your posts and the words to borrow. Every count is of
 *  the figures row's "Came up in" (decision 2), and the month it sits beside
 *  is the figures row's too (decision 1). */
function NumbersCard({ page }: { page: IdeaPage }) {
  const four = page.read && page.month ? page.read : null
  const overlap = four && page.weeks ? weeksOverlapNote(page.weeks, four.k) : null
  const platforms = page.platforms ?? []
  const at = toMax(platforms.map((p) => p.videos))
  return (
    <section id="idea-numbers" aria-labelledby="idea-numbers-title" className={cn(CARD, 'mt-[26px] gap-6')}>
      <div>
        <h2 id="idea-numbers-title" className="m-0 text-[21px] font-semibold leading-[1.3]">The numbers</h2>
        <p className="m-0 mt-1.5 text-[14.5px] leading-[1.5] text-secondary-foreground">Over the four weeks the idea read, beside {page.typicalWords.replace(/^in /, '')}</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-10 max-sm:gap-6 min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col">
          <h3 className={cn(H3, 'mb-3.5')}>Market videos where it came up, week by week</h3>
          {page.weeks ? (
            <>
              <WeekBars bars={page.weeks.map((w) => ({ label: w.label, value: w.count }))} label="Market videos a week where it came up" size="lg" />
              {four ? <p className="m-0 mt-3.5 text-[14.5px] text-secondary-foreground"><span data-copy="figure">{fmtInt(four.k)}</span> over the four weeks.</p> : null}
              {overlap ? <p data-weeks-overlap="" className="m-0 mt-1.5 text-[13px] leading-[1.45] text-muted-foreground"><span data-copy="figure">{overlap}</span></p> : null}
            </>
          ) : <EmptyBox chart>Its weeks could not be counted just now.</EmptyBox>}
        </div>
        <div className="flex min-w-0 flex-col gap-[22px]">
          <div>
            <h3 className={cn(H3, 'mb-3')}>Where it came up</h3>
            {platforms.length > 0 ? (
              <div className="grid grid-cols-[minmax(0,1fr)_120px_28px] items-center gap-x-3.5 gap-y-3 text-[15px]">
                {platforms.map((p) => (
                  <div key={p.platform} className="contents">
                    <span className="min-w-0">{platformLabel(p.platform)}</span>
                    <TickBar pct={at(p.videos)} size="md" label={`${platformLabel(p.platform)}: ${fmtInt(p.videos)} videos`} />
                    <span data-copy="figure" className="text-right tabular-nums">{fmtInt(p.videos)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyBox>{page.platforms ? 'No video counted by platform yet.' : 'Not read yet.'}</EmptyBox>}
          </div>
          <div className="border-t border-track pt-[18px]">
            <h3 className={cn(H3, 'mb-2')}>Who’s asking</h3>
            {page.groups.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {page.groups.map((g) => (
                  <li key={g.key}><GoLink href={groupHref(g.key)} className="text-[15px]"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span> in Voices</GoLink></li>
                ))}
              </ul>
            ) : <p className={GAPLINE}>No group in your market’s profile cites it yet.</p>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-10 border-t border-track pt-[22px] max-sm:gap-5 min-[900px]:grid-cols-2">
        <div>
          <h3 className={cn(H3, 'mb-2')}>Your posts</h3>
          <p className="m-0 text-[15px] leading-[1.55]"><OwnTouchLine own={page.own} />. Read over your posts published since {firstOf(page.own.since)}, the touch test the idea was picked by.</p>
        </div>
        <div>
          <h3 className={cn(H3, 'mb-2')}>Words to borrow</h3>
          {page.words.length > 0 ? (
            <div>
              {page.words.map((w) => <span key={w.ref} data-copy="quote" className="mr-1.5 mb-1.5 inline-block rounded-[8px] bg-inner px-2.5 py-1.5 font-serif text-[15px] italic leading-[1.35]">“{w.text}”</span>)}
            </div>
          ) : <p className="m-0 text-[15px] leading-[1.55]">No short phrase in these comments reads well enough to borrow.</p>}
        </div>
      </div>
    </section>
  )
}

/** A market video's line under its title: "{account} on TikTok. Story,
 *  opens with a personal story." */
function videoLine(v: MarketVideoCard): string {
  const where = `${v.account?.trim() ? `${v.account.trim()} on` : 'On'} ${platformLabel(v.platform)}.`
  const format = v.format ? `${v.format.charAt(0).toUpperCase()}${v.format.slice(1)}` : null
  const opening = v.opening ? `opens with ${v.opening.charAt(0).toLowerCase()}${v.opening.slice(1)}` : null
  const how = format && opening ? `${format}, ${opening}.` : format ? `${format}.` : opening ? `${opening.charAt(0).toUpperCase()}${opening.slice(1)}.` : null
  return how ? `${where} ${how}` : where
}

/** "Market videos where this came up, best response first": each row the
 *  whole link to the video on its platform, its title in the commenters'
 *  serif, its response at the right. */
function VideosCard({ page }: { page: IdeaPage }) {
  const rated = page.videos.filter((v) => v.multiple != null).length
  const title = rated > 0 ? 'Market videos where this came up, best response first' : 'Market videos where this came up, the most viewed first'
  return (
    <section aria-label={title} className={cn(CARD, 'mt-[26px] gap-1.5')}>
      <h2 className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{title}</h2>
      <p className="m-0 mb-2.5 text-[14.5px] leading-[1.5] text-secondary-foreground">
        {page.videos.length === 0
          ? 'None of the videos these comments sit under could be read.'
          : rated > 0
            ? `Each video’s response against a typical market video published ${page.typicalWords}${rated < page.videos.length ? '; a video with no response figure follows, the most viewed first' : ''}. Each opens on its platform.`
            : 'None of these videos has a response figure, so they are ordered by views. Each opens on its platform.'}
      </p>
      {page.videos.map((v) => {
        const body = (
          <>
            <span className="min-w-0">
              <span data-copy="quote" className={cn('block text-[17px] group-hover:underline', QUOTE)}>“{v.title ?? 'Untitled video'}”</span>
              <span className="mt-1.5 block text-[14px] text-secondary-foreground">{videoLine(v)}</span>
            </span>
            <span className="shrink-0 text-right">
              {v.multiple != null ? (
                <>
                  <span data-copy="figure" className="block text-[22px] font-bold tabular-nums">{fmtMultiple(v.multiple)}</span>
                  <span className="block text-[13px] text-muted-foreground">a typical video</span>
                </>
              ) : <span className="block text-[13px] text-muted-foreground">no response figure</span>}
            </span>
          </>
        )
        const row = 'flex items-center justify-between gap-6 border-t border-track py-4 text-foreground no-underline max-sm:gap-4'
        return v.url
          ? <a key={v.id} data-market-video="" href={v.url} target="_blank" rel="noopener noreferrer" className={cn(row, 'group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground')}>{body}</a>
          : <div key={v.id} data-market-video="" className={row}>{body}</div>
      })}
    </section>
  )
}

/** The conversation it comes from, on its page in Market: not a copy of it. */
function ConversationCard({ page }: { page: IdeaPage }) {
  return (
    <section aria-label="The conversation in Market" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-6 max-sm:gap-3')}>
      <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55]">
        {page.label
          ? <>It comes from the conversation <span data-copy="subject" data-slot="pass_b_theme">{page.label}</span>. </>
          : <>It comes from a conversation in your market. </>}
        Every video and comment in it is on its page in Market.
      </p>
      <GoLink href={page.conversationHref}>Open the conversation in Market</GoLink>
    </section>
  )
}

/** The idea's page body under its title block, in the board's order. */
export function IdeaPageBody({ page }: { page: IdeaPage }) {
  const bar = toMax(page.subquestions.map((c) => c.videos))
  // Said once, under the tiles, where no sub-question has a comment that may
  // print (and each could be read); per tile where only some have none.
  const noneOnce = page.subquestions.length > 0 && page.subquestions.every((c) => c.quotable === 0 && c.quotes.length === 0)
  // And where no tile's comments could be read, that is said once too, in
  // the dashed box under the tiles (the review of Phases 6 and 7), never
  // the same box in every tile.
  const asked = page.subquestions.filter((c) => c.comments > 0)
  const unreadOnce = asked.length > 1 && asked.every((c) => c.quotable == null && c.quotes.length === 0)
  return (
    <>
      {page.older ? <p data-ideas-older="" className="m-0 text-[15px] leading-[1.55]">{page.older}</p> : null}
      <HubCard page={page} />
      <SectionHead id="inside" title="What they want to know" note={subquestionsNote(page)} />
      {page.subquestions.length > 0 ? (
        <section aria-label="What they want to know" className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-5 max-sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
            {page.subquestions.map((c) => <SubCard key={c.n} card={c} bar={bar(c.videos)} noneOnce={noneOnce} unreadOnce={unreadOnce} />)}
          </div>
          {noneOnce ? <p data-sub-none-once="" className="m-0 mx-0.5 text-[14px] leading-[1.5] text-secondary-foreground">{SUB_NONE_QUOTABLE}</p> : null}
          {unreadOnce ? <div data-sub-unread-once=""><EmptyBox>{SUBS_UNREAD}</EmptyBox></div> : null}
        </section>
      ) : (
        <div className={CARD}><EmptyBox>No sub-questions were sorted for it.</EmptyBox></div>
      )}
      <NumbersCard page={page} />
      <VideosCard page={page} />
      <ConversationCard page={page} />
      <AskCard line="Draft this post with the Agent, from what people asked." label="Ask the Agent to draft an outline" href={page.askHref} />
    </>
  )
}

/** A post idea's page (`/dashboard/content/ideas/[id]`). */
export function ContentIdeaPage({ data, switcherOpen = false }: { data: ContentIdeaData; switcherOpen?: boolean }) {
  const page = data.page
  if (data.state !== 'ready' || !page) {
    return (
      <PageFrame className="text-foreground">
        <PageBar title={surface('content').label} />
        <ContentMissing line={MISSING_LINES[data.state === 'ready' ? 'missing' : data.state]} />
      </PageFrame>
    )
  }
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="idea"
        title={<span data-copy="stored" data-slot={POST_IDEA_SLOT}>{page.title}</span>}
        sub={<IdeaLabel page={page} />}
        tags={page.flag ? <FlagChip verdict={page.flag} /> : undefined}
        stats={ideaStats(page)}
        open={switcherOpen ? 'current' : undefined}
      />
      <IdeaPageBody page={page} />
    </PageFrame>
  )
}
