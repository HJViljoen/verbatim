import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { translationLabel, translationNote } from '@/components/quote-block'
import { CARD, FlagChip, SpikeBars, TickBarRow } from '@/components/v2'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { askedPhrase, fmtMultiple, groupHref, lengthWords, POST_IDEA_SLOT } from '@/lib/pages/v2/content'
import {
  IDEA_MISSING, IDEA_NOT_ON, IDEA_UNREAD, openedSubNote, showSubComments, SUB_NONE_QUOTABLE, SUB_UNREAD,
  type ContentIdeaData, type IdeaPage, type SubComment, type SubquestionCard,
} from '@/lib/pages/v2/content-idea'
import { subAnchor } from '@/lib/pages/v2/content-address'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { OwnTouchLine } from './ideas'
import { AskCard, ContentLevelTile, ContentMissing, ContentSectionHead, QuestionGlyph } from './level'
import { OLINK } from './parts'

// A POST IDEA'S PAGE, THE HUB (depth as pages, 17 Oct; boards G5-Content-Idea,
// -Idea-Switcher, -Idea-Thin and -Idea-Phone): the richest page under Content.
// The title block (a lightbulb on the yellow, "Post idea 1, from {its
// conversation}", the idea's title, the days it read beside its month); the
// header card that leads with what the post should cover, the medical line in
// a medical market, and four figures inside it; what they want to know, a card
// a sub-question with the comments asking it; the numbers; the market's videos
// where it came up; the conversation in Market; the Agent.
//
// THE COMMENTS ARE THE SUB-QUESTIONS' OWN (the stored ids), through the quote
// gate the root's panel ran, their words resolved at render, never stored.
// "Show all" is an address (`?sub=<n>`), so it works without client code.

const EYEBROW = 'm-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-orange-text'
const FKEY = 'm-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const FV = 'font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[26px]'
const FW = 'text-[21px] leading-[34px] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[17px] max-sm:leading-[24px]'
const FL = 'text-[13.5px] leading-[1.4] text-foreground max-sm:text-[12.5px]'
const FS = 'text-[12.5px] leading-[1.4] text-muted-foreground max-sm:text-[12px]'
const GAPLINE = 'm-0 text-[13.5px] leading-[1.5] text-muted-foreground'
const DLABEL = 'm-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

/** What prints where the page names no idea, by why. */
const MISSING_LINES: Record<Exclude<ContentIdeaData['state'], 'ready'>, string> = {
  missing: IDEA_MISSING,
  not_on: IDEA_NOT_ON,
  unread: IDEA_UNREAD,
}

/** "Post idea 1, from {its conversation}", the conversation a link to its
 *  page in Market; "Post idea 1" where the run named it nothing. */
export function IdeaLabel({ page }: { page: Pick<IdeaPage, 'rank' | 'label' | 'conversationHref'> }) {
  if (!page.label) return <>Post idea {page.rank}</>
  return (
    <>Post idea {page.rank}, from <Link href={page.conversationHref} className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:text-foreground"><span data-copy="subject" data-slot="pass_b_theme">{page.label}</span></Link></>
  )
}

const lv = (k: number, n: number, rest: ReactNode = null) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}{rest}</span>

/** The meta line as its phone lines: the days the idea read; its videos over
 *  them beside its month (decision 1: no month, no four-week figure). */
export function ideaMeta(page: IdeaPage): ReactNode[][] {
  const second: ReactNode[] = []
  if (page.read && page.month) second.push(lv(page.read.k, page.read.n, ' videos'))
  if (page.month) second.push(<>{lv(page.month.k, page.month.n)} {page.typicalWords}</>)
  return [[askedPhrase(page.week.read)], second]
}

/** One of the header card's four figures (the boards' `.fig`): four in a row
 *  from 1180, two to a row under it and on a phone, a hairline between. */
function Fig({ children }: { children: ReactNode }) {
  return (
    <div data-fig="" className="flex min-w-0 flex-col gap-1.5 border-border px-[22px] pt-5 pb-[22px] max-sm:px-4 max-sm:pt-[15px] max-sm:pb-4 min-[1180px]:border-l min-[1180px]:first:border-l-0 min-[1180px]:first:pl-[34px] max-[1179px]:odd:pl-[34px] max-[1179px]:even:border-l max-[1179px]:[&:nth-child(n+3)]:border-t max-sm:odd:pl-[18px]">
      {children}
    </div>
  )
}

/** A figure with nothing to state: its frame, a quiet mark and one line. */
function NoFigure({ line }: { line: string }) {
  return (
    <>
      <div aria-hidden className={cn(FW, 'text-muted-foreground')}>·</div>
      <p data-fig-gap="" className={cn(FS, 'm-0')}>{line}</p>
    </>
  )
}

/** The header card (the hub's `.hub`): what the post should cover, the
 *  medical line, then the brief in four figures inside the card. */
function HubCard({ page }: { page: IdeaPage }) {
  const four = page.read && page.month ? page.read : null
  return (
    <article id="idea-hub" aria-labelledby="hub-head" className={cn(CARD, 'gap-[22px] overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:gap-4 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0')}>
      <div className="flex flex-col gap-3">
        <p className={EYEBROW}>What the post should cover</p>
        <h2 id="hub-head" data-copy="stored" data-slot={POST_IDEA_SLOT} className="m-0 max-w-[900px] text-[32px] leading-[1.24] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[23px] max-sm:leading-[1.28]">{page.cover}</h2>
        {page.medical ? (
          <p data-medical-line="" className="m-0 mt-0.5 flex items-center gap-2 text-[13.5px] leading-[1.45] text-secondary-foreground max-sm:items-start max-sm:text-[13px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-[15px] shrink-0 text-muted-foreground max-sm:mt-0.5"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            {MEDICAL_LINE}
          </p>
        ) : null}
      </div>
      <div role="group" aria-label="The post idea in figures" className="-mx-[34px] mt-1.5 grid grid-cols-2 border-t border-track bg-inner max-sm:-mx-[18px] max-sm:mt-1 min-[1180px]:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
        <Fig>
          <p className={FKEY}>Came up in</p>
          {four ? (
            <div data-copy="level" className="flex flex-col gap-1.5">
              <div className={FV}>{fmtInt(four.k)}</div>
              <div className={FL}>of {fmtInt(four.n)} videos in your market, <span className="whitespace-nowrap">{page.week.read.label}</span></div>
            </div>
          ) : page.month ? (
            <div data-copy="level" className="flex flex-col gap-1.5">
              <div className={FV}>{fmtInt(page.month.k)}</div>
              <div className={FL}>of {fmtInt(page.month.n)} videos in your market {page.typicalWords}</div>
            </div>
          ) : <NoFigure line="Its videos could not be counted just now." />}
          {four && page.month ? <div className={FS}>{lv(page.month.k, page.month.n)} {page.typicalWords}</div> : null}
          {page.flag ? <div className="mt-1"><FlagChip verdict={page.flag} /></div> : null}
        </Fig>
        <Fig>
          <p className={FKEY}>Make it as</p>
          {page.format ? (
            <>
              <div className={FW}>{page.format.name}</div>
              {page.format.multiple != null ? <div className={FL}><span data-copy="figure">{fmtMultiple(page.format.multiple)}</span> a typical video on this question</div> : null}
            </>
          ) : <NoFigure line="No format stands out on this question yet" />}
        </Fig>
        <Fig>
          <p className={FKEY}>Open with</p>
          {page.opening ? (
            <>
              <div className={FW}>{page.opening.name}</div>
              {page.opening.multiple != null ? <div className={FL}><span data-copy="figure">{fmtMultiple(page.opening.multiple)}</span> a typical video on this question</div> : null}
            </>
          ) : <NoFigure line="No opening stands out on this question yet" />}
        </Fig>
        <Fig>
          <p className={FKEY}>Length</p>
          {page.length ? (
            <>
              <div data-copy="figure" className={FW}>{lengthWords(page.length)}</div>
              <div className={FS}>
                The middle half of <span data-copy="figure" className="font-mono">{fmtInt(page.length.videos)}</span> {page.length.basis === 'format' && page.format ? `${page.format.name.toLowerCase()} videos` : 'videos, in any format,'} on this question that drew at least a typical response
              </div>
            </>
          ) : <NoFigure line="Too few videos on this question carry a length to suggest one" />}
        </Fig>
      </div>
    </article>
  )
}

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "Four questions inside it, sorted from 33 comments on 23 videos, the most
 *  videos first". */
export function subquestionsNote(page: Pick<IdeaPage, 'subquestions' | 'asked'>): ReactNode {
  const n = page.subquestions.length
  if (n === 0) return null
  const count = n < NUM_WORDS.length ? NUM_WORDS[n] : null
  const head = count ? `${count.charAt(0).toUpperCase()}${count.slice(1)}` : <span data-copy="figure">{fmtInt(n)}</span>
  return (
    <>
      {head} {n === 1 ? 'question' : 'questions'} inside it,{' '}
      {page.asked ? <>sorted from <span data-copy="figure" className="font-mono">{fmtInt(page.asked.comments)}</span> comments on <span data-copy="figure" className="font-mono">{fmtInt(page.asked.videos)}</span> videos, </> : null}
      the most videos first
    </>
  )
}

/** One comment asking a sub-question: the commenter's words, its English as
 *  every quote's, where and when. */
function Comment({ c }: { c: SubComment }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLabel(note)
  const cite = [c.platform ? platformLabel(c.platform) : null, c.date].filter(Boolean).join(' · ')
  return (
    <div data-sub-comment="" className="flex flex-col gap-[5px] border-t border-border py-3 first:border-t-0">
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground max-sm:text-[14.5px]">“{c.text}”</p>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {cite ? <span className="text-[12px] text-muted-foreground">{cite}</span> : null}
    </div>
  )
}

/** A sub-question's card (the boards' `.sqcard`): its videos of the videos
 *  asked, its bar, its comments asking it, two of them, "Show all". */
function SubCard({ card }: { card: SubquestionCard }) {
  const show = showSubComments(card)
  const note = openedSubNote(card)
  const pct = card.of ? Math.min(100, Math.round((100 * card.videos) / Math.max(1, card.of))) : null
  return (
    <article id={subAnchor(card.n)} data-sub-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-6 pt-[22px] pb-5 max-sm:gap-2.5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="flex min-h-[26px] items-center justify-between gap-2.5">
        <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-track text-secondary-foreground"><QuestionGlyph className="size-3.5" /></span>
        <span className="font-mono text-[13px] whitespace-nowrap text-foreground tabular-nums">
          {card.of != null ? <span data-copy="level">{fmtInt(card.videos)} <span className="text-[12.5px] text-muted-foreground">of {fmtInt(card.of)} videos</span></span> : <><span data-copy="figure">{fmtInt(card.videos)}</span> <span className="text-[12.5px] text-muted-foreground">{card.videos === 1 ? 'video' : 'videos'}</span></>}
        </span>
      </div>
      <h3 data-copy="stored" data-slot={POST_IDEA_SLOT} className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">{card.label}</h3>
      {pct != null ? (
        <div role="img" aria-label={`${card.videos} of ${card.of} videos`} className="relative h-1.5 rounded-full bg-track">
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="m-0 text-[13px] text-muted-foreground"><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(card.comments)}</b> {card.comments === 1 ? 'comment' : 'comments'} asking it</p>
      {card.quotes.length > 0 ? (
        <div data-sub-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {card.quotes.map((c) => <Comment key={c.ref} c={c} />)}
        </div>
      ) : card.comments > 0 ? (
        <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{card.quotable == null ? SUB_UNREAD : SUB_NONE_QUOTABLE}</p>
      ) : null}
      {note ? <p className="m-0 text-[12.5px] text-muted-foreground">{note}</p> : null}
      {card.open ? (
        <div><Link href={card.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">Show fewer comments</Link></div>
      ) : show ? (
        <div>
          <Link href={card.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">
            {show.of == null
              ? <>Show all <span data-copy="figure">{fmtInt(show.shown)}</span> comments</>
              : <>Show <span data-copy="figure">{fmtInt(show.shown)}</span> of <span data-copy="figure">{fmtInt(show.of)}</span> comments</>}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

/** "1 August": the first day of the month the touch test reads from. */
const firstOf = (month: string): string => `1 ${longMonth(month)}`

/** The numbers (the hub's `.pcard`): its four weeks and who's asking, then
 *  where it came up, your posts and the words to borrow. */
function NumbersCard({ page }: { page: IdeaPage }) {
  const four = page.read && page.month ? page.read : null
  const where = page.platforms ? page.platforms.reduce((a, p) => a + p.videos, 0) : 0
  return (
    <section id="idea-numbers" aria-label="The numbers" className={cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-5 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <p className={DLABEL}>Week by week · market videos where it came up</p>
          {page.weeks ? (
            <>
              <SpikeBars weeks={page.weeks} counts="all" size="wide" ghost highlightLast={false} className="max-w-[520px] max-sm:hidden" label="Market videos a week where it came up" />
              <SpikeBars weeks={page.weeks} counts="all" size="phone" ghost highlightLast={false} className="sm:hidden" label="Market videos a week where it came up" />
              {four && page.month ? (
                <p className="m-0 text-[12.5px] text-muted-foreground"><span data-copy="figure" className="font-mono">{fmtInt(four.k)}</span> over the four weeks · <span data-copy="figure" className="font-mono">{fmtInt(page.month.k)}</span> {page.typicalWords}</p>
              ) : null}
            </>
          ) : <p className={GAPLINE}>Its weeks could not be counted just now.</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-3 max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <p className={DLABEL}>Who’s asking</p>
          {page.groups.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {page.groups.map((g) => (
                <Link key={g.key} href={groupHref(g.key)} className="-mx-2 flex items-center justify-between gap-3 rounded-[6px] px-2 py-1 text-[13.5px] text-foreground no-underline transition-colors hover:bg-inner">
                  <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
                  <span aria-hidden className="text-muted-foreground">→</span>
                </Link>
              ))}
              <span className="text-[12px] text-muted-foreground">Each opens in Voices</span>
            </div>
          ) : <p className={GAPLINE}>No group in your market’s profile cites it yet.</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:pt-0 max-sm:border-t-0 min-[1180px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3 max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <p className={DLABEL}>Where it came up{page.platforms && where > 0 ? <> · <span data-copy="level">of {fmtInt(where)}</span></> : null}</p>
          {page.platforms && page.platforms.length > 0
            ? page.platforms.map((p) => <TickBarRow key={p.platform} name={platformLabel(p.platform)} value={fmtInt(p.videos)} pct={(100 * p.videos) / Math.max(1, where)} tone="ink" valueWidth="narrow" label={`${fmtInt(p.videos)} of ${fmtInt(where)}`} />)
            : <p className={GAPLINE}>{page.platforms ? 'No video counted by platform yet.' : 'Not read yet.'}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-3 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <p className={DLABEL}>Your posts</p>
          <p className="m-0 text-[14px] leading-[1.45]"><OwnTouchLine own={page.own} /></p>
          <p className="m-0 text-[12.5px] text-muted-foreground">Read over your posts published since {firstOf(page.own.since)}, the touch test the idea was picked by.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <p className={DLABEL}>Words to borrow</p>
          {page.words.length > 0 ? (
            <div>
              {page.words.map((w) => <span key={w.ref} data-copy="quote" className="mr-1.5 mb-1.5 inline-block rounded-[8px] bg-inner px-2.5 py-1.5 font-serif text-[14px] italic leading-[1.35]">“{w.text}”</span>)}
            </div>
          ) : <p className={GAPLINE}>No short phrase in these comments reads well enough to borrow.</p>}
        </div>
      </div>
    </section>
  )
}

/** "Market videos where this came up, best response first" (the hub's
 *  `.listcard`), each opening on its platform. */
function VideosCard({ page }: { page: IdeaPage }) {
  const rated = page.videos.filter((v) => v.multiple != null).length
  const title = rated > 0 ? 'Market videos where this came up, best response first' : 'Market videos where this came up, the most viewed first'
  return (
    <section aria-label={title} className={cn(CARD, 'gap-3.5 px-[26px] pt-[22px] pb-5 max-sm:px-[18px]')}>
      <div>
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h2>
        <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
          {page.videos.length === 0
            ? 'None of the videos these comments sit under could be read.'
            : rated > 0
              ? `Each video’s response against a typical market video published ${page.typicalWords}${rated < page.videos.length ? '; a video with no response figure follows, the most viewed first' : ''}. Each opens on its platform.`
              : 'None of these videos has a response figure, so they are ordered by views. Each opens on its platform.'}
        </p>
      </div>
      {page.videos.length > 0 ? (
        <div>
          {page.videos.map((v) => {
            const name = <span data-copy="quote">“{v.title ?? 'Untitled video'}”</span>
            return (
              <div key={v.id} data-market-video="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-track py-3 first:border-t-0 first:pt-0.5 max-sm:gap-3 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                <div aria-hidden className="hidden h-[68px] items-center justify-center rounded-[8px] bg-track text-muted-foreground sm:flex">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]"><path d="m8 6 10 6-10 6z" /></svg>
                </div>
                <div className="min-w-0">
                  {v.url
                    ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="block text-[14.5px] leading-[1.4] font-semibold text-foreground no-underline hover:underline">{name}</a>
                    : <span className="block text-[14.5px] leading-[1.4] font-semibold text-foreground">{name}</span>}
                  <span className="mt-[3px] block text-[12.5px] text-muted-foreground">
                    {[v.account?.trim() || null, platformLabel(v.platform), v.format?.toLowerCase(), v.opening ? `opens with ${v.opening.charAt(0).toLowerCase()}${v.opening.slice(1)}` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="text-right whitespace-nowrap">
                  {v.multiple != null ? (
                    <>
                      <span data-copy="figure" className="block font-mono text-[18px] font-medium tabular-nums">{fmtMultiple(v.multiple)}</span>
                      <span className="text-[12px] text-muted-foreground">a typical video</span>
                    </>
                  ) : <span className="text-[12px] text-muted-foreground">no response figure</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

/** The conversation it comes from, on its page in Market (the hub's
 *  `.convlink`): not a copy of it. */
function ConversationCard({ page }: { page: IdeaPage }) {
  return (
    <section aria-label="The conversation in Market" className={cn(CARD, 'flex-row items-center gap-3.5 px-6 py-[18px] max-sm:flex-col max-sm:items-start max-sm:gap-2.5 max-sm:px-[18px] max-sm:py-4')}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-secondary-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-[19px]"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
      </span>
      <p className="m-0 text-[14.5px] leading-[1.45] text-secondary-foreground">
        {page.label
          ? <>It comes from the conversation <Link href={page.conversationHref} className="font-semibold text-foreground underline underline-offset-[3px]"><span data-copy="subject" data-slot="pass_b_theme">{page.label}</span></Link>. </>
          : <>It comes from a conversation in your market. </>}
        Every video and comment in it is on its page in Market.
      </p>
      <Link href={page.conversationHref} className={cn(OLINK, 'whitespace-nowrap sm:ml-auto')}>Open the conversation in Market →</Link>
    </section>
  )
}

/** The idea's page body under its title block, in the board's order. */
export function IdeaPageBody({ page }: { page: IdeaPage }) {
  return (
    <>
      {page.older ? <p data-ideas-older="" className="m-0 text-[14px] leading-[1.5]">{page.older}</p> : null}
      <HubCard page={page} />
      <ContentSectionHead id="inside" title="What they want to know" note={subquestionsNote(page)} />
      {page.subquestions.length > 0 ? (
        <section aria-label="What they want to know" className="grid grid-cols-1 gap-5 max-sm:gap-3 lg:grid-cols-2">
          {page.subquestions.map((c) => <SubCard key={c.n} card={c} />)}
        </section>
      ) : (
        <div className={cn(CARD, 'gap-2')}><p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">No sub-questions were sorted for it.</p></div>
      )}
      <ContentSectionHead title="The numbers" note={<>Over the four weeks the idea read, beside {page.typicalWords.replace(/^in /, '')}</>} />
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
        tile={<ContentLevelTile level="idea" />}
        label={<IdeaLabel page={page} />}
        title={<span data-copy="stored" data-slot={POST_IDEA_SLOT}>{page.title}</span>}
        meta={ideaMeta(page)}
        open={switcherOpen ? 'current' : undefined}
      />
      <IdeaPageBody page={page} />
    </PageFrame>
  )
}
