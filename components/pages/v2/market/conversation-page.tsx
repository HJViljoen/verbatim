import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { CARD, CHIP, EmptyBox, FlagChip, GoLink, shortDates, SpikeBars, toMax, translationLine, type StatItem } from '@/components/v2'
import { GO, QUOTE, ROW } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { CONV_SAID_ANCHOR, MARKET_VIDEO_COMMENTS_MAX, MARKET_VIDEO_QUOTES, MARKET_VIDEO_QUOTES_PHONE, noGroupSaying, type ConvComment, type ConvEvidence, type ConvPage, type ConvSiblings, type ConvVideo, type MarketData } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { GroupRows } from './panel'
import { ABOUT_NOT_COUNTED, ABOUT_NOT_READ, BrandsNamed, Stored } from './parts'
import { WEEKS_NOT_DRAWN, WEEKS_NOT_DRAWN_TITLE } from './rail'

// A CONVERSATION'S PAGE, THE EVIDENCE (F3-Market-Conversation, 17 Oct), drawn
// to the audit design's board (Market-Conversation.dc.html, 7 Nov). Lighter
// than its subject's and led by what people said: the title and its figures
// row (`conversationStats`: the week, its videos this week and in the month,
// the brands its videos name), its one-line read as the lead and the week's
// chip only where the check flagged it; then "What people said", one card
// per video in it this period, most comments about it first, each with up
// to three of its comments about the conversation (two on a phone); the
// facts beside it, one tile, its base said once; its siblings; the Agent.
//
// THE COMMENTS ARE THE CONVERSATION'S COUNTED COMMENTS dated in the period's
// window, through the quote gate Market's quotes pass (`videoQuotes`), their
// words resolved at render as every quote's are. "Show all" and "Show more"
// are addresses (`?video=`, `?videos=all`), so they work without client code.

/** Where the videos could not be read: the section's frame, and one line. */
export const CONV_VIDEOS_UNREAD = 'Its videos could not be read just now.'
/** A video counted for what is said in it, with no comment about it. */
export const CONV_SAID_IN_VIDEO = 'Said in the video itself, with no comment about it.'
/** Why a counted comment may not print: the gate's two tests, in words. */
const QUOTE_RULE = 'a comment prints only where it reads clearly and speaks to this'
/** A video whose comments about it are counted and none may print: the
 *  gate's reason, whole (it can be either test that failed). */
export const CONV_NONE_QUOTABLE = `None of its comments about this can be quoted: ${QUOTE_RULE}.`
/** The same, said once under the head where no video on the page has a
 *  comment that may print (the board's). */
export const CONV_NONE_QUOTABLE_ALL = `None of the comments about this on these videos can be quoted: ${QUOTE_RULE}.`
/** Opened: the comments counted and not printed, said once under the list. */
export const notQuoted = (n: number): string => `The other ${n === 1 ? 'one is' : `${n} are`} counted, not quoted: ${QUOTE_RULE}.`

/**
 * "Show all 14 comments" where every comment about it may print; else "Show 9
 * of 14 comments", what the list it opens draws of the count the card states,
 * the first `MARKET_VIDEO_COMMENTS_MAX` where more may print. Never "all" of a
 * number smaller than the card's own. Pure.
 */
export function showCommentsOf(v: Pick<ConvVideo, 'quotable' | 'aboutCount'>): { shown: number; of: number | null } {
  const shown = Math.min(v.quotable, MARKET_VIDEO_COMMENTS_MAX)
  return { shown, of: shown < v.aboutCount ? v.aboutCount : null }
}

/**
 * Under an opened list, once: where the cap cut it, how many of the ones that
 * may print it draws ("The first 50 of the 120 that can be quoted are shown;
 * 80 more are counted, not quoted."); else the counted ones it does not print
 * and why (`notQuoted`); null where it draws every comment counted. Pure.
 */
export function openedNote(v: Pick<ConvVideo, 'quotable' | 'aboutCount'>): string | null {
  const unquoted = Math.max(0, v.aboutCount - v.quotable)
  if (v.quotable > MARKET_VIDEO_COMMENTS_MAX) {
    return `The first ${fmtInt(MARKET_VIDEO_COMMENTS_MAX)} of the ${fmtInt(v.quotable)} that can be quoted are shown${unquoted > 0 ? `; ${fmtInt(unquoted)} more ${unquoted === 1 ? 'is' : 'are'} counted, not quoted` : ''}.`
  }
  return unquoted > 0 ? notQuoted(unquoted) : null
}

/** The period in the page's words. */
const whenOf = (data: MarketData): string => (data.period === 'week' ? 'this week' : `in ${data.month.text}`)

const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)} category videos</span>

/**
 * The conversation's figures row (the board's four cells): the week; its
 * category videos this week and in the month, each with its base; the
 * brands its videos name ("Ottobock (1), others (10)", "None", or why they
 * are not said). Off the week, the month and the brands. Pure.
 */
export function conversationStats(page: ConvPage, data: MarketData): StatItem[] {
  const week = data.period === 'week' && data.week ? data.week : null
  const cells: StatItem[] = []
  if (week) cells.push({ key: 'week', term: 'Week', value: shortDates(week.dates) })
  if (week && page.week) cells.push({ key: 'this-week', term: 'This week', value: lv(page.week.k, page.week.n) })
  if (page.month) cells.push({ key: 'month', term: `${data.month.text.charAt(0).toUpperCase()}${data.month.text.slice(1)}`, value: lv(page.month.k, page.month.n) })
  const who = page.panel.who
  const brands: ReactNode = data.brands !== 'counted'
    ? <span className="font-normal">{(data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ).replace(/^./, (c) => c.toUpperCase())}</span>
    : who ? <BrandsNamed parts={who.parts} brand={data.brand} noun={data.noun} /> : <span className="font-normal">None</span>
  cells.push({ key: 'brands', term: 'Brands named', value: brands })
  return cells
}

/** A column's head (the board's `.h2row`, inside the page's two columns). */
function ColHead({ id, title, note }: { id: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-[26px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-0.5 max-sm:mt-4">
      <h2 id={id} className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{title}</h2>
      {note ? <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/** The lead under the figures row: the one-line read (its description,
 *  Pass B's), and the week's chip only where the check flagged it. */
function Lead({ page }: { page: ConvPage }) {
  const flag = page.panel.flag
  return (
    <div data-conv-lead="" className="flex flex-col gap-3">
      {page.lead ? <Stored line={page.lead} slot="pass_b_theme" className="m-0 max-w-[900px] text-[17px] leading-[1.55] text-secondary-foreground max-sm:text-[16px]" /> : null}
      {flag ? <div><FlagChip verdict={flag} /></div> : null}
    </div>
  )
}

/** One comment under a video: the commenter's words, its language line and
 *  its English where it has them, and its date (the platform is on the
 *  video). */
function Comment({ c, hideOnPhone }: { c: ConvComment; hideOnPhone: boolean }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    <div data-video-comment="" className={cn('flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0', hideOnPhone ? 'max-sm:hidden' : null)}>
      <p data-copy="quote" className={cn('m-0 text-foreground', QUOTE, 'text-[15.5px] leading-[1.55]')}>“{c.text}”</p>
      {line ? <span className="text-[13px] text-muted-foreground">{line}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{note.english}</p> : null}
      {c.date ? <span className="text-[13px] text-muted-foreground">{c.date}</span> : null}
    </div>
  )
}

/** A video whose comments about this are counted and none may print. */
const unquotable = (v: Pick<ConvVideo, 'quotes' | 'aboutCount'>): boolean => v.quotes.length === 0 && v.aboutCount > 0

/** One video in the conversation (the board's tile): its creator as the
 *  heading, "TikTok, posted 31 Oct" (and who it is about where counted), its
 *  caption in full, its comments about this of its own, the link out, its
 *  comments, "Show all". `onceSaid`: the page has said that none can be
 *  quoted, so the card does not. */
function VideoCard({ v, data, index, all, onceSaid }: { v: ConvVideo; data: MarketData; index: number; all: boolean; onceSaid: boolean }) {
  const shown = v.quotes
  const phoneMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES_PHONE
  const deskMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES
  const show = showCommentsOf(v)
  const note = v.open ? openedNote(v) : null
  const about = v.about === 'client' ? <BrandChip who="you" plain>{data.brand}</BrandChip> : v.about && v.about !== 'market' ? <BrandChip who="rival" plain>{v.about.slice('rival:'.length)}</BrandChip> : null
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3', !all && !v.open && index >= 3 ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="m-0 min-w-0 text-[16px] leading-[1.35] font-semibold text-foreground">{v.account || 'Unnamed account'}</h3>
        <span className="text-[13.5px] leading-[1.4] text-muted-foreground">{v.platform}{v.posted ? `, posted ${v.posted}` : null}{about ? <>, {about}</> : null}</span>
      </div>
      {v.caption ? <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{v.caption}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[14px] text-secondary-foreground">
        {v.aboutCount === 0
          ? <span>{CONV_SAID_IN_VIDEO}</span>
          : v.total != null && v.total >= v.aboutCount
            ? <span data-copy="level"><b className="font-semibold tabular-nums text-foreground">{fmtInt(v.aboutCount)}</b> {v.aboutCount === 1 ? 'comment' : 'comments'} about this, of {fmtInt(v.total)} on the video</span>
            : <span><b data-copy="figure" className="font-semibold tabular-nums text-foreground">{fmtInt(v.aboutCount)}</b> {v.aboutCount === 1 ? 'comment' : 'comments'} about this</span>}
        {v.url ? <GoLink href={v.url} external>Watch the video</GoLink> : null}
      </div>
      {shown.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-[18px] py-0.5 max-sm:px-3.5">
          {shown.map((c, i) => <Comment key={i} c={c} hideOnPhone={!v.open && i >= MARKET_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : unquotable(v) && !onceSaid ? <p className="m-0 rounded-[10px] bg-inner px-[18px] py-3 text-[14px] text-secondary-foreground">{CONV_NONE_QUOTABLE}</p> : null}
      {note ? <p className="m-0 text-[13.5px] text-muted-foreground">{note}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className={GO}>Show fewer comments</Link></div>
      ) : phoneMore || deskMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className={GO}>
            {show.of == null
              ? <>Show all <span data-copy="figure">{fmtInt(show.shown)}</span> comments</>
              : <>Show <span data-copy="figure">{fmtInt(show.shown)}</span> of <span data-copy="figure">{fmtInt(show.of)}</span> comments</>}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

/** "What people said": the head and its note, the line that none can be
 *  quoted where that holds for every video, the video cards, then "Show N
 *  more videos" (from 640, and on a phone, where three show). A frame and one
 *  line where there is nothing to list. */
function Said({ ev, data }: { ev: ConvEvidence; data: MarketData }) {
  const when = whenOf(data)
  const listed = ev.state !== 'unread' && ev.total > 0
  const noneAll = listed && ev.videos.some(unquotable) && ev.videos.every((v) => v.aboutCount === 0 || unquotable(v))
  return (
    <section id={CONV_SAID_ANCHOR} aria-labelledby="said-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
      <ColHead id="said-title" title="What people said" note={listed ? `${data.period === 'week' ? 'This week’s videos' : `Videos in ${data.month.text}`}, most comments about it first` : null} />
      {!listed ? (
        <div data-said-gap={ev.state} className={cn(CARD, 'gap-2')}>
          <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{ev.state === 'unread' ? CONV_VIDEOS_UNREAD : `No video in it ${when}.`}</p>
        </div>
      ) : (
        <>
          {noneAll ? <p data-none-quotable="" className="m-0 text-[14.5px] leading-[1.55] text-secondary-foreground">{CONV_NONE_QUOTABLE_ALL}</p> : null}
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} data={data} index={i} all={ev.all} onceSaid={noneAll} />)}
          {ev.capped != null ? <p className="m-0 text-[13.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(ev.capped)}</span> of <span data-copy="figure">{fmtInt(ev.total)}</span> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-start font-semibold no-underline max-sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(ev.more.desktop)}</span> more videos</Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-stretch justify-center font-semibold no-underline sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(ev.more.phone)}</span> more videos</Link> : null}
        </>
      )}
    </section>
  )
}

/** A heading inside the facts' tile. */
const H3 = 'm-0 text-[15px] leading-[1.4] font-semibold text-secondary-foreground'

/** A row of a facts list: the name, a bar against the list's largest
 *  (decision 5), the bare count (the tile's base line says of what). */
function BarRow({ name, k, pct }: { name: ReactNode; k: number; pct: number }) {
  return (
    <div role="listitem" className="grid grid-cols-[minmax(0,1fr)_72px_32px] items-center gap-2.5 text-[14.5px] leading-[1.35]">
      <span className="min-w-0">{name}</span>
      <div aria-hidden className="h-2 rounded-[4px] bg-track"><div className="h-2 rounded-[4px] bg-brand" style={{ width: `${pct}%` }} /></div>
      <span data-copy="figure" className="text-right tabular-nums">{fmtInt(k)}</span>
    </div>
  )
}

/** "The facts": one tile, its base said once at the top ("Counted in this
 *  week's 23 videos."), then week by week (or the dashed box), what people
 *  did, who's saying it and where, each a list against its largest. Who it
 *  is about is the figures row's ("Brands named"). */
function Facts({ page, data }: { page: ConvPage; data: MarketData }) {
  const { panel } = page
  const base = panel.groupBase ?? null
  const weeks = page.weeks.length > 0 ? page.weeks : null
  const drawn = weeks ? weeks.some((w) => w.count != null) : false
  const n = panel.doing?.n ?? base?.n ?? panel.platforms?.n ?? null
  const did = panel.doing ? toMax(panel.doing.rows.map((r) => r.k)) : null
  const where = panel.platforms ? toMax(panel.platforms.rows.map((r) => r.videos)) : null
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col gap-4">
      <ColHead id="facts-title" title="The facts" />
      {/* A hairline between its parts, as the board rules them. */}
      <div className={cn(CARD, 'gap-[22px] [&>section+section]:border-t [&>section+section]:border-track [&>section+section]:pt-[22px]')}>
        {n != null ? <p data-facts-base="" className="m-0 text-[14px] leading-[1.45] text-secondary-foreground">{data.period === 'week' ? <>Counted in this week’s <span data-copy="figure">{fmtInt(n)}</span> videos.</> : <>Counted in the <span data-copy="figure">{fmtInt(n)}</span> videos {whenOf(data)}.</>}</p> : null}
        {weeks ? (
          <section className="flex flex-col gap-3">
            <h3 className={H3}>Videos, week by week</h3>
            {drawn
              // The newest week in the accent only where the check flagged it.
              ? <SpikeBars weeks={weeks} counts="all" size="rail" highlightLast={Boolean(panel.flag)} className="max-w-[300px]" label={`${panel.label}, category videos a week`} />
              : <EmptyBox title={WEEKS_NOT_DRAWN_TITLE}>{WEEKS_NOT_DRAWN}</EmptyBox>}
          </section>
        ) : null}
        <section className="flex flex-col gap-3">
          <h3 className={H3}>What people did</h3>
          {panel.doing && did
            ? <div role="list" className="flex flex-col gap-2.5">{panel.doing.rows.map((r) => <BarRow key={r.kind} name={r.label} k={r.k} pct={did(r.k)} />)}</div>
            : <p className="m-0 text-[14px] text-secondary-foreground">Not read yet.</p>}
        </section>
        <section className="flex flex-col gap-3">
          {/* Each group's videos of the conversation's in the period; Pass
              E's names alone where they were not counted. */}
          <h3 className={H3}>Who’s saying it</h3>
          {panel.groups.length > 0
            ? <GroupRows groups={panel.groups} n={base?.n ?? null} />
            : <p className="m-0 text-[14px] text-secondary-foreground">{base ? noGroupSaying(base.text) : 'Not linked to a group.'}</p>}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className={H3}>Where it’s said</h3>
          {panel.platforms && where
            ? <div role="list" className="flex flex-col gap-2.5">{panel.platforms.rows.map((r) => <BarRow key={r.platform} name={r.label} k={r.videos} pct={where(r.videos)} />)}</div>
            : <p className="m-0 text-[14px] text-secondary-foreground">No video counted by platform yet.</p>}
        </section>
      </div>
    </aside>
  )
}

/** "Other conversations in {subject}": small cards from 640, a two-line list
 *  on a phone, then the whole subject. */
function Siblings({ s, data }: { s: ConvSiblings; data: MarketData }) {
  const week = data.period === 'week'
  const title = s.parent ? `Other conversations in ${s.parent.name}` : `Other conversations ${whenOf(data)}`
  const whole = s.parent ? <GoLink href={s.parent.href}>{s.parent.name}, the whole subject</GoLink> : null
  const monthWords = data.week?.inMonth ?? `in ${data.month.text}`
  return (
    <>
      <div className="max-sm:hidden"><ColHead id="siblings-title" title={title} note={whole} /></div>
      {s.items.length === 0 ? (
        <div className={cn(CARD, 'gap-2')}>
          <h2 className="m-0 text-[18px] font-semibold sm:hidden">{title}</h2>
          <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">No other conversation {s.parent ? `in ${s.parent.name} ` : ''}{whenOf(data)}.</p>
          <div className="sm:hidden">{whole}</div>
        </div>
      ) : (
        <>
          <nav aria-label={title} className="grid grid-cols-2 gap-4 max-sm:hidden min-[1180px]:grid-cols-4">
            {s.items.map((c) => (
              <Link key={c.id} href={c.href} data-sibling="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-[18px] py-4 no-underline shadow-card transition-shadow hover:shadow-panel">
                <span data-copy="subject" data-slot="pass_b_theme" className="text-[15px] leading-[1.35] font-semibold text-foreground">{c.label}</span>
                <span className="text-[13.5px] text-muted-foreground">
                  {c.count != null ? <><span data-copy="figure" className="tabular-nums">{fmtInt(c.count)}</span> {week ? 'this week' : monthWords}</> : null}
                  {week && c.month != null ? <>, <span data-copy="figure" className="tabular-nums">{fmtInt(c.month)}</span> {monthWords}</> : null}
                </span>
              </Link>
            ))}
          </nav>
          <section aria-label={title} className={cn(CARD, 'gap-3 sm:hidden')}>
            <div>
              <h2 className="m-0 text-[18px] leading-[1.3] font-semibold text-foreground">{title}</h2>
              <p className="m-0 mt-0.5 text-[13.5px] text-muted-foreground">{week ? `This week, then ${data.month.text}` : `Videos ${monthWords}`}</p>
            </div>
            <div className="flex flex-col">
              {s.items.map((c) => (
                <div key={c.id} data-phone-sibling="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-3 first:border-t-0 first:pt-0">
                  <Link href={c.href} className={cn(ROW, 'min-w-0 text-[15px] font-medium')}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                  <span className="text-right text-[15px] font-semibold tabular-nums">{c.count != null ? <span data-copy="figure">{fmtInt(c.count)}</span> : null}</span>
                  {week && c.month != null ? <span className="col-span-2 text-[13px] text-muted-foreground"><span data-copy="figure" className="tabular-nums text-foreground">{fmtInt(c.month)}</span> {monthWords}</span> : null}
                </div>
              ))}
            </div>
            {whole}
          </section>
        </>
      )}
    </>
  )
}

/** The page's body under its title block. */
export function ConversationPageBody({ page, data }: { page: ConvPage; data: MarketData }) {
  const { panel } = page
  const ev = page.evidence ?? null
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-x-11 gap-y-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
        {ev ? <Said ev={ev} data={data} /> : <div />}
        <Facts page={page} data={data} />
      </div>
      {page.siblings ? <Siblings s={page.siblings} data={data} /> : null}
      <section aria-label="Ask the Agent" className={cn(CARD, 'mt-[26px] flex-row flex-wrap items-center justify-between gap-3.5')}>
        <p className="m-0 text-[15px] text-secondary-foreground">Ask about these videos and what people said under them, in your own words.</p>
        <GoLink href={panel.askHref}>Ask the Agent about this</GoLink>
      </section>
    </>
  )
}
