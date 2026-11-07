import Link from 'next/link'
import type { ReactNode } from 'react'
import { translationNote } from '@/components/quote-block'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { CARD, EmptyBox, GoLink, SectionHead, Tag, TickBar, toMax, translationLine, type StatItem } from '@/components/v2'
import { CHIP, GO, QUOTE } from '@/components/v2/look'
import { fmtInt, platformLabel } from '@/lib/format'
import { CONTENT_PATH, fmtMultiple } from '@/lib/pages/v2/content'
import { postAnchor, WORKS_ANCHOR } from '@/lib/pages/v2/content-address'
import { monthText, POST_COMMENTS_MAX, POSTS_SHOWN_PHONE, type KindCount, type PostCard, type PostComment, type PostsPageData } from '@/lib/pages/v2/content-posts'
import { cn } from '@/lib/utils'
import { AskCard, ElsewhereSection } from './level'

// YOUR POSTS, THE EVIDENCE (depth as pages, 17 Oct; boards G5-Content-Posts
// and -Posts-Phone; since the audit design, 7 Nov, drawn to
// Content-Posts.dc.html): the title block with the figures row (the month,
// your posts, your typical post's response), code's sentence about your mix
// as the lead; then your posts newest first, each a tile with its format,
// opening, response and what was said under it, beside the facts in a tile;
// elsewhere on Content; the Agent. No period switch: it reads the month.

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>

/** The figures row (the board's `.strip`): the month, your posts on your own
 *  accounts (the base every count below is of, decision 2), and your typical
 *  post's response with how many it was read from. Pure. */
export function postsStats(data: PostsPageData): StatItem[] {
  const b = data.block
  const rated = b.rated ?? b.rows.filter((r) => r.multiple != null).length
  const response: ReactNode = b.unread || b.total === 0
    ? 'No response to state'
    : b.response
      ? (
        <>
          <span data-copy="figure">{fmtMultiple(b.response.multiple)}</span> the market’s
          {b.response.rated < b.total ? <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">Read from <span data-copy="level">{fmtInt(b.response.rated)} of {fmtInt(b.total)}</span> with a response figure</span> : null}
        </>
      )
      : (
        <>
          Not stated
          <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
            <span data-copy="level">{fmtInt(rated)} of {fmtInt(b.total)}</span> {b.marketTypical === false ? 'with a response figure; the market’s typical video could not be read to compare them' : 'with a response figure, too few to state a typical one'}
          </span>
        </>
      )
  return [
    { key: 'month', term: 'Month', value: monthText(data.month) },
    { key: 'posts', term: 'Posted on your own accounts', value: b.unread ? 'Could not be read just now' : <>{fig(b.total)} {b.total === 1 ? 'post' : 'posts'}</> },
    { key: 'response', term: 'Typical response', value: response },
  ]
}

/** Why a comment under a post may not print: said once, under the section's
 *  head (the board's), and on a card only that none of its comments can be. */
export const POST_QUOTE_RULE = 'A comment is quoted only where it reads clearly.'
export const POST_NONE_QUOTABLE = 'None of them can be quoted.'
export const POST_COMMENTS_UNREAD = 'The comments under it could not be read just now.'
export const POST_NO_COMMENTS = 'No comment under it has been read yet.'
/** Said once over the cards where the comments under every one of them
 *  could not be read (the review of Phases 6 and 7: never once a card). */
export const POSTS_COMMENTS_UNREAD = 'The comments under your posts could not be read just now.'

/** "Show all 6 comments" where every comment under it may print, else "Show
 *  4 of 6", at most the opened list's cap; null where the card shows every one
 *  that may print. Pure. */
export function showPostComments(card: Pick<PostCard, 'quotable' | 'held' | 'quotes' | 'open'>): { shown: number; of: number | null } | null {
  if (card.open || card.held == null || card.quotable <= card.quotes.length) return null
  const shown = Math.min(card.quotable, POST_COMMENTS_MAX)
  return { shown, of: shown < card.held ? card.held : null }
}

/** Under an opened list, once. Pure. */
export function openedPostNote(card: Pick<PostCard, 'quotable' | 'held' | 'open'>): string | null {
  if (!card.open || card.held == null) return null
  const unquoted = Math.max(0, card.held - card.quotable)
  if (card.quotable > POST_COMMENTS_MAX) return `The first ${POST_COMMENTS_MAX} of the ${card.quotable} that can be quoted are shown${unquoted > 0 ? `; ${unquoted} more ${unquoted === 1 ? 'is' : 'are'} not quoted` : ''}.`
  return unquoted > 0 ? `The other ${unquoted === 1 ? 'one is' : `${unquoted} are`} not quoted: a comment prints only where it reads clearly.` : null
}

/** One comment, a figure of its own (the board's): the commenter's words in
 *  the serif, its English as every quote's, "Instagram, 30 Oct". */
function Comment({ c, platform }: { c: PostComment; platform: string }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLine(note)
  return (
    <figure data-post-comment="" className="m-0 flex flex-col gap-1.5 rounded-[10px] bg-inner px-5 py-4 max-sm:px-4">
      <blockquote className="m-0"><p data-copy="quote" className={cn('m-0 text-foreground', QUOTE)}>“{c.text}”</p></blockquote>
      {label ? <span className="text-[13px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14.5px] leading-[1.5] text-foreground">{note.english}</p> : null}
      <figcaption className="mt-0.5 text-[13px] text-muted-foreground">{c.date ? `${platform}, ${c.date}` : platform}</figcaption>
    </figure>
  )
}

/** "opens with a question", "opens by showing it": an opening's name in a
 *  post's line. Pure. */
export const opensWords = (opening: string): string => (opening === 'Showing it' ? 'opens by showing it' : `opens with ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`)

/** "Story, opens with a personal story. 1.5× a typical video." */
function Recipe({ card }: { card: PostCard }) {
  const how = card.format && card.opening ? `${card.format}, ${opensWords(card.opening)}.` : card.format ? `${card.format}.` : card.opening ? `${opensWords(card.opening).replace(/^o/, 'O')}.` : null
  return (
    <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">
      {how ? <>{how} </> : null}
      {card.multiple != null
        ? <><b data-copy="figure" className="font-semibold tabular-nums text-foreground">{fmtMultiple(card.multiple)}</b> a typical video.</>
        : 'No response figure.'}
    </p>
  )
}

/** After "6 of 9 comments on it", where the platform counts more than we
 *  hold: the account's own replies are left out by rule, so the line names
 *  them where it replied ("; your own replies are left out"), and otherwise
 *  says what the six are (" are here"). Pure. */
export const onPlatformTail = (card: Pick<PostCard, 'ownLeftOut'>): string =>
  (card.ownLeftOut ? '; your own replies are left out' : ' are here')

/** One post (the board's tile): its account, platform and day, "Watch the
 *  post" at the right, the best month's tag, its caption in two lines, its
 *  recipe in a sentence, then under a hairline its comments, a figure each. */
function PostCardView({ card, index, all, unreadSaid }: { card: PostCard; index: number; all: boolean; unreadSaid: boolean }) {
  const show = showPostComments(card)
  const note = openedPostNote(card)
  // Where every card's comments could not be read, the page says so once
  // over the cards and a card says nothing of its own about them.
  const quiet = unreadSaid && card.held == null && card.quotes.length === 0
  return (
    <article id={postAnchor(card.id)} data-post-card="" className={cn(CARD, 'scroll-mt-6 gap-3', !all && !card.open && index >= POSTS_SHOWN_PHONE ? 'max-sm:hidden' : null)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="m-0 min-w-0 text-[16px] leading-[1.35] font-semibold text-foreground">{card.account ?? 'Your account'}</h3>
            {card.best ? <span data-best=""><Tag>Best this month</Tag></span> : null}
          </div>
          <span className="block text-[14px] leading-[1.4] text-muted-foreground">{card.platform}, posted {card.posted}</span>
        </div>
        {card.url ? <GoLink href={card.url} external>Watch the post</GoLink> : null}
      </div>
      {card.caption ? <p data-copy="quote" className="m-0 line-clamp-2 text-[15.5px] leading-[1.55] text-foreground">{card.caption}</p> : null}
      <Recipe card={card} />
      {quiet ? null : (
      <div className={cn('flex flex-col border-t border-track pt-3 text-[14.5px]', card.quotes.length > 0 ? 'gap-3.5' : 'gap-1.5')}>
        {card.held != null ? (
          <span className="font-semibold">
            {card.onPlatform != null
              ? <><span data-copy="level"><b className="font-semibold tabular-nums">{fmtInt(card.held)}</b> of {fmtInt(card.onPlatform)} comments</span> on it{onPlatformTail(card)}</>
              : <><b data-copy="figure" className="font-semibold tabular-nums">{fmtInt(card.held)}</b> {card.held === 1 ? 'comment' : 'comments'} on it</>}
          </span>
        ) : null}
        {card.quotes.length > 0
          ? card.quotes.map((c) => <Comment key={c.ref} c={c} platform={card.platform} />)
          : <span className="text-secondary-foreground">{card.held == null ? POST_COMMENTS_UNREAD : card.held === 0 ? POST_NO_COMMENTS : POST_NONE_QUOTABLE}</span>}
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
      </div>
      )}
    </article>
  )
}

/** A fact's rows: each kind's posts, a bar in your gold against the list's
 *  largest (decision 5), a bare count of the figures row's posts. */
function KindRows({ rows }: { rows: readonly KindCount[] }) {
  const at = toMax(rows.map((r) => r.posts))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_24px] items-center gap-x-3 gap-y-2.5 text-[14.5px]">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="min-w-0">{r.label}</span>
          <TickBar pct={at(r.posts)} tone="you" size="md" label={`${r.label}: ${fmtInt(r.posts)} posts`} />
          <span data-copy="figure" className="text-right tabular-nums">{fmtInt(r.posts)}</span>
        </div>
      ))}
    </div>
  )
}

const H3 = 'm-0 mb-3 text-[15px] font-semibold text-foreground'
const RULED = 'border-t border-track pt-5'

/** The facts, one tile (the board's): how they were made, how they open,
 *  where, each a bare count of the figures row's posts, and how response is
 *  read with the way to What works (the typical response is the figures
 *  row's). */
function Facts({ data }: { data: PostsPageData }) {
  const b = data.block
  const total = b.total
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col">
      <SectionHead id="facts-title" title="The facts" />
      <div className={cn(CARD, 'mt-[22px] gap-[22px]')}>
        {/* Nothing posted, or nothing read: "What you posted" says so once,
            so the facts hold only how response is read. */}
        {b.unread || total === 0 ? null : (
          <>
            <div>
              <h3 className={H3}>How they were made</h3>
              <KindRows rows={data.formats} />
              {data.unread.format > 0 ? <p className="m-0 mt-2.5 text-[13px] text-muted-foreground">{fig(data.unread.format)} not read yet</p> : null}
            </div>
            <div className={RULED}>
              <h3 className={H3}>How they open</h3>
              <KindRows rows={data.openings} />
              {data.unread.opening > 0 ? <p className="m-0 mt-2.5 text-[13px] text-muted-foreground">{fig(data.unread.opening)} not read yet</p> : null}
            </div>
            <div className={RULED}>
              <h3 className={H3}>Where</h3>
              <KindRows rows={b.byPlatform.map((p) => ({ key: p.platform, label: platformLabel(p.platform), posts: p.posts }))} />
            </div>
          </>
        )}
        <div className={cn(b.unread || total === 0 ? null : RULED, 'flex flex-col gap-3')}>
          <h3 className={cn(H3, 'mb-0')}>How response is read</h3>
          <p className="m-0 text-[14px] leading-[1.55] text-secondary-foreground">Response is the post’s likes, shares and comments against its views, as a multiple of a typical market video published in {monthText(data.month)}. Reddit is left out, and a photo has no views to read it against.</p>
          <GoLink href={`${CONTENT_PATH}#${WORKS_ANCHOR}`} className="self-start">What works in your market’s videos</GoLink>
        </div>
      </div>
    </aside>
  )
}

/** Your posts' page body under its title block. */
export function PostsPageBody({ data }: { data: PostsPageData }) {
  const b = data.block
  // Nothing posted, or nothing read: said once, in "What you posted"'s box
  // (the review of Phases 6 and 7), so no lead says it first.
  const gap = Boolean(b.unread) || data.cards.length === 0
  const unreadAll = !gap && data.cards.every((c) => c.held == null && c.quotes.length === 0)
  return (
    <>
      {data.lead && !gap ? (
        <p data-posts-lead="" className="m-0 max-w-[1000px] text-[21px] leading-[1.45] text-foreground max-sm:text-[18px]">
          {data.lead.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <span key={i} data-copy="figure" className="tabular-nums">{p.figure}</span>))}
        </p>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section id="posted" aria-labelledby="posted-title" className="flex min-w-0 scroll-mt-6 flex-col">
          <SectionHead id="posted-title" title="What you posted" note={data.cards.length > 0 ? 'Newest first, each with what people said under it' : undefined} />
          {!gap && !unreadAll ? <p data-quote-rule="" className="m-0 mx-0.5 mt-1.5 text-[14px] text-secondary-foreground">{POST_QUOTE_RULE}</p> : null}
          <div className="mt-4 flex flex-col gap-4">
            {unreadAll ? <div data-comments-unread=""><EmptyBox>{POSTS_COMMENTS_UNREAD}</EmptyBox></div> : null}
            {gap ? (
              <div data-posts-gap="" className={CARD}><EmptyBox>{b.unread ?? `You published nothing of your own in ${monthText(data.month)}.`}</EmptyBox></div>
            ) : (
              <>
                {data.cards.map((c, i) => <PostCardView key={c.id} card={c} index={i} all={data.all} unreadSaid={unreadAll} />)}
                {data.capped != null ? <p className="m-0 text-[13px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(data.capped)}</span> of <span data-copy="figure">{fmtInt(b.total)}</span> are listed.</p> : null}
                {data.more && data.more.desktop > 0 ? <Link href={data.more.href} className={cn(CHIP, 'h-10 self-start font-semibold no-underline max-sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(data.more.desktop)}</span> more {data.more.desktop === 1 ? 'post' : 'posts'}</Link> : null}
                {data.more && data.more.phone > 0 ? <Link href={data.more.href} className={cn(CHIP, 'h-10 justify-center self-stretch font-semibold no-underline sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(data.more.phone)}</span> more {data.more.phone === 1 ? 'post' : 'posts'}</Link> : null}
              </>
            )}
          </div>
        </section>
        <Facts data={data} />
      </div>
      <ElsewhereSection data={data.elsewhere} />
      <AskCard line="Ask about your posts and what people said under them, in your own words." label="Ask the Agent about your posts" href={data.askHref} />
    </>
  )
}

/** Your posts' page (`/dashboard/content/posts`). */
export function ContentPostsPage({ data }: { data: PostsPageData }) {
  return (
    <PageFrame className="text-foreground">
      <LevelBar crumbs={data.crumbs} level="posts" title="Your posts" stats={postsStats(data)} />
      <PostsPageBody data={data} />
    </PageFrame>
  )
}
