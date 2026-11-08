import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { CARD, EmptyBox, GoLink, TickBar, toMax, translationLine, type StatItem } from '@/components/v2'
import { GO, QUOTE, ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtCompact, fmtInt, longMonth } from '@/lib/format'
import { monthTerm } from '@/lib/reading/month-label'
import { MARKET_VIDEO_COMMENTS_MAX, MARKET_VIDEO_QUOTES, MARKET_VIDEO_QUOTES_PHONE } from '@/lib/pages/v2/market'
import { inMonthWords, LEVEL_QUOTE_RULE, type CreatorComment, type CreatorPage, type CreatorVideoCard } from '@/lib/pages/v2/voices-levels'
import { cn } from '@/lib/utils'
import { Fig } from './parts'
import { AskBox } from './levels'

// A CREATOR'S PAGE, THE EVIDENCE (G3-Voices-Creator; since the audit design,
// 7 Nov, drawn to Voices-Creator.dc.html). The title block ("A creator on
// TikTok" under the name, and the figures row, `creatorStats`: the month,
// their videos of the market's, their following as of the month's videos),
// then ONE line code builds from figures (their biggest conversation, their
// videos in it of theirs, of all of its videos) and the brands named in their
// videos. Then, two to one: their videos, the most comments counted first,
// each a tile led by its caption, its day and the conversation it is in, its
// comments counted this month of all on it, and those that may print, each
// naming the conversation it is counted in (board decision 5: "comments
// counted", since a creator's comments sit in many conversations); beside
// them the facts (a tile of three tables and lists) and the other creators (a
// table); then the Agent. "Show all" and "Show more" are addresses
// (`?video=`, `?videos=all`, the creator's own videos alone), so they work
// without client code. Never Reddit.

/** Why a counted comment may not print, in the words of what this page's
 *  gate tests (`LEVEL_QUOTE_RULE`). Market's conversation page says "and
 *  speaks to this" because it requires each comment to speak to the
 *  conversation (`requireRelevance` on its label); a creator's comments sit
 *  in many conversations and are gated with no claim, so this page claims no
 *  relevance test it does not run. */
const QUOTE_RULE = LEVEL_QUOTE_RULE
export const CREATOR_NONE_QUOTABLE = `None of its counted comments can be quoted: ${QUOTE_RULE}.`
export const CREATOR_VIDEOS_UNREAD = 'Their videos could not be read just now.'

/** "Show all 22 comments", or "Show 9 of 22 comments" where fewer may print
 *  than are counted (Market's `showCommentsOf`). Pure. */
export function showCountedOf(v: Pick<CreatorVideoCard, 'quotable' | 'counted'>): { shown: number; of: number | null } {
  const shown = Math.min(v.quotable, MARKET_VIDEO_COMMENTS_MAX)
  return { shown, of: shown < v.counted ? v.counted : null }
}

/** Under an opened list, once: what the cap cut, else the counted comments it
 *  does not print and why (Market's `openedNote`). Pure. */
export function openedCountedNote(v: Pick<CreatorVideoCard, 'quotable' | 'counted'>): string | null {
  const unquoted = Math.max(0, v.counted - v.quotable)
  if (v.quotable > MARKET_VIDEO_COMMENTS_MAX) {
    return `The first ${fmtInt(MARKET_VIDEO_COMMENTS_MAX)} of the ${fmtInt(v.quotable)} that can be quoted are shown${unquoted > 0 ? `; ${fmtInt(unquoted)} more ${unquoted === 1 ? 'is' : 'are'} counted, not quoted` : ''}.`
  }
  return unquoted > 0 ? `The other ${unquoted === 1 ? 'one is' : `${fmtInt(unquoted)} are`} counted, not quoted: ${QUOTE_RULE}.` : null
}

/** The figures row: the month (`monthTerm`), their videos of the market's,
 *  and their following as of the month's videos (never Reddit's). Pure. */
export function creatorStats(page: CreatorPage): StatItem[] {
  const cells: StatItem[] = [
    { key: 'month', term: monthTerm(page.month.monthLabel), value: page.month.monthWords },
    { key: 'videos', term: 'Their videos', value: page.month.n != null ? <><Fig>{fmtInt(page.videos)}</Fig> of the market’s <Fig>{fmtInt(page.month.n)}</Fig></> : <><Fig>{fmtInt(page.videos)}</Fig> videos</> },
  ]
  if (page.followers != null) cells.push({ key: 'followers', term: `On ${page.platformLabel}`, value: <><Fig>{fmtCompact(page.followers)}</Fig> {page.followerWord}, as of their videos in {longMonth(page.month.month)}</> })
  return cells
}

/** The one line code builds, and the brands named in their videos. */
function Lead({ page }: { page: CreatorPage }) {
  const l = page.lead
  return (
    <div data-creator-lead="" className="flex flex-col gap-3">
      {l ? (
        <p className="m-0 max-w-[1000px] text-[22px] leading-[1.45] font-medium text-foreground max-sm:text-[19px]">
          Their biggest conversation is <Link href={l.href} className="text-foreground underline decoration-control underline-offset-[5px] hover:decoration-foreground"><span data-copy="subject" data-slot="pass_b_theme">{l.label}</span></Link>: <Fig>{fmtInt(l.k)}</Fig> of their <Fig>{fmtInt(page.videos)}</Fig> videos, of the <Fig>{fmtInt(l.ofTheme)}</Fig> in it {inMonthWords(page.month)}.
        </p>
      ) : (
        <p className="m-0 max-w-[1000px] text-[19px] leading-[1.45] text-muted-foreground">None of their videos {inMonthWords(page.month)} is in a named conversation.</p>
      )}
      {page.brands.length > 0 ? (
        // A list of names, never a chip in a sentence (the colour-role ban):
        // "Brands named in their videos: Össur (4), Ottobock (1)".
        <div data-creator-brands="" className="text-[15px] leading-[1.5] text-secondary-foreground">
          Brands named in their videos:{' '}
          {page.brands.map((b, i) => (
            <Fragment key={b.label}>
              {i > 0 ? ', ' : null}
              <Link href={b.href} className={cn(ROW, 'font-normal')}><BrandChip who={b.you ? 'you' : 'rival'} plain>{b.label}</BrandChip></Link> (<Fig>{fmtInt(b.k)}</Fig>)
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** One counted comment under a video: its words, its language line and its
 *  English where it has them, then its day and the conversation it is
 *  counted in ("24 Oct, in Staring and social stigma"). */
function Comment({ c, hideOnPhone }: { c: CreatorComment; hideOnPhone: boolean }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    <figure data-video-comment="" className={cn('m-0 flex min-w-0 flex-col gap-2 border-t border-track pt-4 first:border-t-0 first:pt-0', hideOnPhone ? 'max-sm:hidden' : null)}>
      <blockquote data-copy="quote" className={cn('m-0 text-foreground', QUOTE, 'text-[16.5px] leading-[1.5]')}>“{c.text}”</blockquote>
      {line ? <p className="m-0 text-[13px] text-muted-foreground">{line}</p> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[15px] leading-[1.5] text-secondary-foreground">{note.english}</p> : null}
      <figcaption className="text-[13.5px] text-muted-foreground">
        {c.date}
        {c.conv ? <>{c.date ? ', ' : null}in <GoLink href={c.conv.href} className="text-[13.5px]"><span data-copy="subject" data-slot="pass_b_theme">{c.conv.label}</span></GoLink></> : null}
      </figcaption>
    </figure>
  )
}

/** One of their videos (the board's tile): its caption as the heading, in up
 *  to four lines (the most Voices-Creator.dc.html draws at 1440; the
 *  real-data pass, 8 Nov: a YouTube description runs to 70 lines, and a long
 *  link breaks inside the card), the day, the brand named in it and its
 *  conversation, the link to watch it, its comments counted of all on it,
 *  then those that may print. */
function VideoCard({ v, index, all, platform }: { v: CreatorVideoCard; index: number; all: boolean; platform: string }) {
  const phoneMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES_PHONE
  const deskMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES
  const show = showCountedOf(v)
  const note = v.open ? openedCountedNote(v) : null
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6', !all && !v.open && index >= 3 ? 'max-sm:hidden' : null)}>
      <h3 data-video-caption="" className="m-0 line-clamp-4 text-[16px] leading-[1.5] font-semibold text-foreground [overflow-wrap:anywhere]">{v.caption ?? 'A video with no caption'}</h3>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[14px] text-secondary-foreground">
        <span>
          {v.posted ? <>Posted {v.posted}</> : null}
          {v.brand ? <>{v.posted ? ', ' : null}<BrandChip who={v.brand.you ? 'you' : 'rival'} plain>{v.brand.label}</BrandChip></> : null}
          {v.conv ? <>{v.posted || v.brand ? ', ' : null}in <GoLink href={v.conv.href}><span data-copy="subject" data-slot="pass_b_theme">{v.conv.label}</span></GoLink></> : null}
        </span>
        {v.url ? <GoLink href={v.url} external>Watch the video on {platform}</GoLink> : null}
      </div>
      <p className="m-0 text-[14.5px] text-foreground">
        {v.total != null && v.total >= v.counted
          ? <span data-copy="level"><b className="font-semibold tabular-nums">{fmtInt(v.counted)}</b> {v.counted === 1 ? 'comment' : 'comments'} counted, of {fmtInt(v.total)} on the video</span>
          : <span><b data-copy="figure" className="font-semibold tabular-nums">{fmtInt(v.counted)}</b> {v.counted === 1 ? 'comment' : 'comments'} counted</span>}
      </p>
      {v.quotes.length > 0 ? (
        <div data-video-comments="" className="flex flex-col gap-4 rounded-[10px] bg-inner px-5 py-[18px] max-sm:px-3.5 max-sm:py-3.5">
          {v.quotes.map((c, i) => <Comment key={i} c={c} hideOnPhone={!v.open && i >= MARKET_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.counted > 0 ? <p className="m-0 rounded-[10px] bg-inner px-5 py-3 text-[14px] text-secondary-foreground">{CREATOR_NONE_QUOTABLE}</p> : null}
      {note ? <p className="m-0 text-[13.5px] text-muted-foreground">{note}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className={GO}>Show fewer comments</Link></div>
      ) : phoneMore || deskMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className={GO}>
            {show.of == null
              ? <>Show all <Fig>{fmtInt(show.shown)}</Fig> comments</>
              : <>Show <Fig>{fmtInt(show.shown)}</Fig> of <Fig>{fmtInt(show.of)}</Fig> comments</>}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

/** A column's head (the board's `.h2row` at a column's top). */
function ColumnHead({ id, title, note }: { id: string; title: ReactNode; note?: ReactNode }) {
  return (
    <div className="mx-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{title}</h2>
      {note ? <span className="text-[14px] leading-[1.45] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

function Videos({ page }: { page: CreatorPage }) {
  const ev = page.evidence
  return (
    <section id="their-videos" aria-labelledby="videos-title" className="flex min-w-0 scroll-mt-6 flex-col gap-[18px]">
      <ColumnHead
        id="videos-title"
        title="Their videos"
        note={ev.state === 'ready' && ev.total > 0 ? <><Fig>{fmtInt(ev.total)}</Fig> {ev.total === 1 ? 'video' : 'videos'} in {page.month.monthWords}, the most comments counted first</> : null}
      />
      {ev.state === 'unread' || ev.total === 0 ? (
        <div data-videos-gap={ev.state} className={CARD}>
          <EmptyBox>{ev.state === 'unread' ? CREATOR_VIDEOS_UNREAD : `No video of theirs in ${page.month.monthWords}.`}</EmptyBox>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {ev.cards.map((v, i) => <VideoCard key={v.id} v={v} index={i} all={ev.all} platform={page.platformLabel} />)}
          {ev.capped != null ? <p className="m-0 text-[13.5px] text-muted-foreground">The first <Fig>{fmtInt(ev.capped)}</Fig> of <Fig>{fmtInt(ev.total)}</Fig> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(GO, 'self-start max-sm:hidden')}>Show <Fig>{fmtInt(ev.more.desktop)}</Fig> more videos</Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(GO, 'self-start sm:hidden')}>Show <Fig>{fmtInt(ev.more.phone)}</Fig> more videos</Link> : null}
        </div>
      )}
    </section>
  )
}

const H3 = 'm-0 text-[17px] leading-[1.3] font-semibold text-foreground'
const NOTE = 'm-0 text-[13.5px] leading-[1.45] text-muted-foreground'
const LINE = 'm-0 text-[15px] leading-[1.5] text-secondary-foreground'

/** A list's rows: a name, a bar against the list's largest, a count. */
function BarRows({ rows, label }: { rows: readonly { key: string; name: ReactNode; k: number }[]; label: (k: number) => string }) {
  const at = toMax(rows.map((r) => r.k))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_80px_26px] items-center gap-x-3.5 gap-y-3 text-[14.5px]">
      {rows.map((r) => (
        <Fragment key={r.key}>
          <span className="min-w-0">{r.name}</span>
          <TickBar pct={at(r.k)} size="md" label={label(r.k)} />
          <Fig className="text-right">{fmtInt(r.k)}</Fig>
        </Fragment>
      ))}
    </div>
  )
}

/** "The facts": their conversations, who comments and what people did, a
 *  tile with a hairline between its parts; then the other creators. */
function Facts({ page }: { page: CreatorPage }) {
  const of = <>, of <Fig>{fmtInt(page.videos)}</Fig></>
  const kindsN = page.kinds?.[0]?.n ?? page.videos
  const title = `Other creators, ${page.month.monthWords}`
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col gap-[18px]">
      <ColumnHead id="facts-title" title="The facts" />
      <section className={cn(CARD, 'gap-6')}>
        <div className="flex min-w-0 flex-col gap-3.5">
          <h3 className={H3}>Conversations their videos are in{of}</h3>
          {page.conversations.length > 0 ? (
            <>
              <table className={cn(TBL, 'text-[14.5px]')}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Conversation</th>
                    <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Theirs</th>
                    <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>All in it</th>
                  </tr>
                </thead>
                <tbody>
                  {page.conversations.map((c) => (
                    <tr key={c.id}>
                      <td className={TD}><Link href={c.href} className={cn(ROW, 'font-normal')}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link></td>
                      <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><Fig>{fmtInt(c.k)}</Fig></td>
                      <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 text-secondary-foreground')}><Fig>{fmtInt(c.ofTheme)}</Fig></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={NOTE}>Theirs, then all the videos in it. Each opens in Market.</p>
            </>
          ) : <p className={LINE}>None of their videos is in a named conversation.</p>}
        </div>
        <div className="h-px bg-track" aria-hidden />
        <div className="flex min-w-0 flex-col gap-3.5">
          <h3 className={H3}>Who comments{of}</h3>
          {page.groups.length > 0 ? (
            <>
              <BarRows rows={page.groups.map((g) => ({ key: g.key, k: g.k, name: <Link href={g.href} className={cn(ROW, 'font-normal')}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link> }))} label={(k) => `${fmtInt(k)} of ${fmtInt(page.videos)}`} />
              <p className={NOTE}>Each opens its page in Voices.</p>
            </>
          ) : <p className={LINE}>{page.groupsLine ?? `No group comments on their videos ${inMonthWords(page.month)}.`}</p>}
        </div>
        <div className="h-px bg-track" aria-hidden />
        <div className="flex min-w-0 flex-col gap-3.5">
          <h3 className={H3}>What people did{page.kinds ? <>, of <Fig>{fmtInt(kindsN)}</Fig></> : null}</h3>
          {page.kinds && page.kinds.length > 0
            ? <BarRows rows={page.kinds.map((k) => ({ key: k.kind, name: k.label, k: k.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(kindsN)}`} />
            : <p className={LINE}>Not read yet.</p>}
        </div>
      </section>
      <section aria-label={title} className={cn(CARD, 'gap-3.5')}>
        <h3 className={H3}>{title}</h3>
        {page.siblings.length === 0 ? (
          <EmptyBox>No other account made three or more of your market’s videos in {page.month.monthWords}.</EmptyBox>
        ) : (
          <table className={cn(TBL, 'text-[14.5px]')}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Creator</th>
                <th scope="col" className={TH}>Platform</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Videos</th>
              </tr>
            </thead>
            <tbody>
              {page.siblings.map((c) => (
                <tr key={c.key} data-sibling="">
                  <td className={TD}><Link href={c.href} className={ROW}>{c.account}</Link></td>
                  <td className={TD}>{c.platformLabel}</td>
                  <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5')}><Fig>{fmtInt(c.videos)}</Fig></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {page.atFloor > 0 ? <GoLink href={page.allHref} className="self-start">All <Fig>{fmtInt(page.atFloor)}</Fig> in Voices</GoLink> : null}
      </section>
    </aside>
  )
}

/** The page's body under its title block. */
export function CreatorPageBody({ page }: { page: CreatorPage }) {
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-7 min-[1180px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Videos page={page} />
        <Facts page={page} />
      </div>
      <AskBox
        text="Ask about these videos and what people said under them, in your own words."
        href={page.askHref}
        button={<><span className="max-sm:hidden">Ask the Agent about {page.account}</span><span className="sm:hidden">Ask the Agent about this creator</span></>}
      />
    </>
  )
}
