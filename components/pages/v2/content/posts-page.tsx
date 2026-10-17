import Link from 'next/link'
import type { ReactNode } from 'react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { CARD, TickBarRow } from '@/components/v2'
import { fmtInt, platformLabel } from '@/lib/format'
import { CONTENT_PATH, fmtMultiple } from '@/lib/pages/v2/content'
import { postAnchor, WORKS_ANCHOR } from '@/lib/pages/v2/content-address'
import { monthText, POST_COMMENTS_MAX, POSTS_SHOWN_PHONE, type KindCount, type PostCard, type PostComment, type PostsPageData } from '@/lib/pages/v2/content-posts'
import { cn } from '@/lib/utils'
import { AskCard, ContentLevelTile, ElsewhereSection, FACT, FactLabel, MORE, RAIL, RAIL_ROW, VideoTile } from './level'
import { OLINK } from './parts'

// YOUR POSTS, THE EVIDENCE (depth as pages, 17 Oct; boards G5-Content-Posts
// and -Posts-Phone): the flat header (a person on the neutral, "Your own
// accounts", "Your posts", the month and the counts in mono), code's sentence
// about your mix as the lead, a hairline; then your posts newest first, each
// with its format, opening, response and what was said under it, beside the
// facts; elsewhere on Content; the Agent. No period switch: it reads the month.

/** The meta line as its phone lines: the month, then the posts and where. */
export function postsMeta(data: PostsPageData): ReactNode[][] {
  const b = data.block
  if (b.unread) return [[monthText(data.month)]]
  const where = b.byPlatform.map((p, i) => <span key={p.platform}>{i > 0 ? ', ' : null}{platformLabel(p.platform)} <span data-copy="figure">{fmtInt(p.posts)}</span></span>)
  return [[monthText(data.month)], [<><span data-copy="figure">{fmtInt(b.total)}</span> {b.total === 1 ? 'post' : 'posts'}</>, ...(where.length > 0 ? [<>{where}</>] : [])]]
}

/** Why a comment under a post may not print. */
const QUOTE_RULE = 'a comment prints only where it reads clearly'
export const POST_NONE_QUOTABLE = `None of the comments under it can be quoted: ${QUOTE_RULE}.`
export const POST_COMMENTS_UNREAD = 'The comments under it could not be read just now.'
export const POST_NO_COMMENTS = 'No comment under it has been read yet.'

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
  return unquoted > 0 ? `The other ${unquoted === 1 ? 'one is' : `${unquoted} are`} not quoted: ${QUOTE_RULE}.` : null
}

function Comment({ c }: { c: PostComment }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLabel(note)
  return (
    <div data-post-comment="" className="flex flex-col gap-[5px] border-t border-border py-3 first:border-t-0">
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground max-sm:text-[14.5px]">“{c.text}”</p>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {c.date ? <span className="text-[12px] text-muted-foreground">{c.date}</span> : null}
    </div>
  )
}

/** "opens with a question", "opens by showing it": an opening's name in a
 *  post's line. Pure. */
export const opensWords = (opening: string): string => (opening === 'Showing it' ? 'opens by showing it' : `opens with ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`)

/** "How-to · opens by showing it · 2.2× a typical video". */
function Recipe({ card }: { card: PostCard }) {
  const parts: ReactNode[] = []
  if (card.format) parts.push(card.format)
  if (card.opening) parts.push(opensWords(card.opening))
  parts.push(card.multiple != null ? <><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtMultiple(card.multiple)}</b> a typical video</> : 'no response figure')
  return <span>{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : null}{p}</span>)}</span>
}

/** One post (F3's `.vcard`): the account, platform and day, the best
 *  month's chip, its caption, its recipe and the link out, its comments. */
function PostCardView({ card, index, all }: { card: PostCard; index: number; all: boolean }) {
  const show = showPostComments(card)
  const note = openedPostNote(card)
  return (
    <article id={postAnchor(card.id)} data-post-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', !all && !card.open && index >= POSTS_SHOWN_PHONE ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-center gap-3">
        <VideoTile />
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] leading-[1.3] font-semibold text-foreground">{card.account ?? 'Your account'}</span>
          <span className="block text-[12.5px] leading-[1.35] text-muted-foreground">{card.platform} · posted {card.posted}</span>
        </div>
        {card.best ? <span data-best="" className="ml-auto inline-flex items-center rounded-full bg-accent px-2 py-[5px] text-[12px] leading-none font-semibold whitespace-nowrap text-foreground">Best this month</span> : null}
      </div>
      {card.caption ? <p data-copy="quote" className="m-0 truncate text-[14.5px] leading-[1.5] text-secondary-foreground">{card.caption}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-muted-foreground max-sm:flex-col max-sm:items-start">
        <Recipe card={card} />
        {card.url ? <a href={card.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">Watch the post ↗</a> : null}
      </div>
      {card.held != null ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          {card.onPlatform != null
            ? <span data-copy="level"><b className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(card.held)}</b> of the {fmtInt(card.onPlatform)} comments on it are here</span>
            : <><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(card.held)}</b> {card.held === 1 ? 'comment' : 'comments'} on it</>}
        </p>
      ) : null}
      {card.quotes.length > 0 ? (
        <div data-post-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {card.quotes.map((c) => <Comment key={c.ref} c={c} />)}
        </div>
      ) : (
        <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{card.held == null ? POST_COMMENTS_UNREAD : card.held === 0 ? POST_NO_COMMENTS : POST_NONE_QUOTABLE}</p>
      )}
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

/** A fact's rows: each kind's posts of the month's, the yellow bars. */
function KindRows({ rows, total, tone = 'market' }: { rows: readonly KindCount[]; total: number; tone?: 'market' | 'ink' }) {
  return <>{rows.map((r) => <TickBarRow key={r.key} name={r.label} value={fmtInt(r.posts)} pct={(100 * r.posts) / Math.max(1, total)} tone={tone} valueWidth="narrow" label={`${fmtInt(r.posts)} of ${fmtInt(total)}`} className={RAIL_ROW} />)}</>
}

/** The facts (F3's `.rail3`; a card on a phone): how they were made, how they
 *  open, where, and the response. */
function Facts({ data }: { data: PostsPageData }) {
  const b = data.block
  const total = b.total
  const of = <> · <span data-copy="level">of {fmtInt(total)}</span></>
  const rated = b.rated ?? b.rows.filter((r) => r.multiple != null).length
  return (
    <aside aria-labelledby="facts-title" className={RAIL}>
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      {b.unread || total === 0 ? (
        <div className={FACT}><p className="m-0 text-[13px] text-muted-foreground">{b.unread ?? `You published nothing of your own in ${monthText(data.month)}.`}</p></div>
      ) : (
        <>
          <div className={FACT}>
            <FactLabel>How they were made{of}</FactLabel>
            <KindRows rows={data.formats} total={total} />
            {data.unread.format > 0 ? <p className="m-0 text-[12px] text-muted-foreground"><span data-copy="figure">{fmtInt(data.unread.format)}</span> not read yet</p> : null}
          </div>
          <div className={FACT}>
            <FactLabel>How they open{of}</FactLabel>
            <KindRows rows={data.openings} total={total} />
            {data.unread.opening > 0 ? <p className="m-0 text-[12px] text-muted-foreground"><span data-copy="figure">{fmtInt(data.unread.opening)}</span> not read yet</p> : null}
          </div>
          <div className={FACT}>
            <FactLabel>Where{of}</FactLabel>
            <KindRows rows={b.byPlatform.map((p) => ({ key: p.platform, label: platformLabel(p.platform), posts: p.posts }))} total={total} tone="ink" />
          </div>
        </>
      )}
      <div className={FACT}>
        <FactLabel>Response</FactLabel>
        {b.response ? (
          <p className="m-0 text-[13.5px] leading-[1.45]">
            <span data-copy="figure" className="font-mono text-[18px] font-medium">{fmtMultiple(b.response.multiple)}</span> your typical post against the market’s
            {b.response.rated < total ? <>, read from <span data-copy="level" className="font-mono">{fmtInt(b.response.rated)} of {fmtInt(total)}</span> with a response figure</> : null}
          </p>
        ) : total > 0 && !b.unread ? (
          <p className="m-0 text-[13.5px] leading-[1.45]"><span data-copy="level"><span className="font-mono">{fmtInt(rated)}</span> of {fmtInt(total)}</span> {b.marketTypical === false ? 'with a response figure; the market’s typical video could not be read to compare them' : 'with a response figure, too few to state a typical one'}</p>
        ) : null}
        <p className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">Response is the post’s likes, shares and comments against its views, as a multiple of a typical market video published in {monthText(data.month)}. Reddit is left out, and a photo has no views to read it against.</p>
        <Link href={`${CONTENT_PATH}#${WORKS_ANCHOR}`} className={cn(OLINK, 'text-[12.5px]')}>What works in your market’s videos →</Link>
      </div>
    </aside>
  )
}

/** Your posts' page body under its title block. */
export function PostsPageBody({ data }: { data: PostsPageData }) {
  const b = data.block
  return (
    <>
      {data.lead ? (
        <div data-posts-lead="" className="-mt-0.5 border-b border-border pb-[22px] max-sm:pb-4">
          {/* The lead's figures in the lead's own face (the board's `.lead .mono`). */}
          <p className="m-0 max-w-[820px] text-[21px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[18px]">
            {data.lead.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <span key={i} data-copy="figure" className="tabular-nums">{p.figure}</span>))}
          </p>
        </div>
      ) : <div className="-mt-0.5 border-b border-border" />}
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <section id="posted" aria-labelledby="posted-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
          <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
            <h2 id="posted-title" className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">What you posted</h2>
            {data.cards.length > 0 ? <span className="text-[13px] leading-[1.4] text-muted-foreground">Newest first, each with what people said under it</span> : null}
          </div>
          {b.unread || data.cards.length === 0 ? (
            <div data-posts-gap="" className={cn(CARD, 'gap-2')}><p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{b.unread ?? `You published nothing of your own in ${monthText(data.month)}.`}</p></div>
          ) : (
            <>
              {data.cards.map((c, i) => <PostCardView key={c.id} card={c} index={i} all={data.all} />)}
              {data.capped != null ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(data.capped)}</span> of <span data-copy="figure">{fmtInt(b.total)}</span> are listed.</p> : null}
              {data.more && data.more.desktop > 0 ? <Link href={data.more.href} className={cn(MORE, 'self-start max-sm:hidden')}><span>Show <span data-copy="figure">{fmtInt(data.more.desktop)}</span> more {data.more.desktop === 1 ? 'post' : 'posts'}</span></Link> : null}
              {data.more && data.more.phone > 0 ? <Link href={data.more.href} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show <span data-copy="figure">{fmtInt(data.more.phone)}</span> more {data.more.phone === 1 ? 'post' : 'posts'}</span></Link> : null}
            </>
          )}
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
      <LevelBar crumbs={data.crumbs} level="posts" tile={<ContentLevelTile level="posts" />} label="Your own accounts" title="Your posts" meta={postsMeta(data)} />
      <PostsPageBody data={data} />
    </PageFrame>
  )
}
