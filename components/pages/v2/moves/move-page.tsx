import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

import { BrandChip } from '@/components/colour-roles'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { translationLabel, translationNote } from '@/components/quote-block'
import { PlayGlyph } from '@/components/shell/level-glyphs'
import { CARD, TickBarRow } from '@/components/v2'
import { SectionHead } from '@/components/pages/v2/market/analysis'
import { CONV_NONE_QUOTABLE, CONV_SAID_IN_VIDEO, openedNote, showCommentsOf } from '@/components/pages/v2/market/conversation-page'
import { ASK, GroupRows } from '@/components/pages/v2/market/panel'
import { Label } from '@/components/pages/v2/market/parts'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { inlineMonth } from '@/lib/reading/month-label'
import { monthStartOf } from '@/lib/reading/month-key'
import { MARKET_VIDEO_QUOTES, MARKET_VIDEO_QUOTES_PHONE, noGroupSaying, type ConvComment, type ConvVideo } from '@/lib/pages/v2/market'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { MOVES_PATH, MOVE_UNREAD, compareMonths, comparePrintable, monthLabelOn, sharePct, type MoveCard, type MovePoint, type ReadingLabel } from '@/lib/pages/v2/moves'
import { MOVE_SAID_ANCHOR } from '@/lib/pages/v2/moves-address'
import {
  NEXT_MOVE_PAGE, NO_CAUSE, OTHER_MOVES_TITLE, SAID_HELD, SAID_NOTHING, SAID_TITLE, SAID_UNREAD, saidNone,
  type MoveEvidence, type MovePageData,
} from '@/lib/pages/v2/moves-levels'
import { cn } from '@/lib/utils'
import { WhoLine } from './advice-page'
import { MoveChart, MoveStatusChip, OnLabel } from './moves'

// A DATED MOVE, THE EVIDENCE (board G6-Moves-Move; -Phone). One concrete
// thing, so it is lighter than the advice's page and led by its one reading:
//   1. A FLAT HEADER under the title block (no card, no figure tiles): the
//      one comparison in a sentence and its verdict, beside its month line on
//      its axis with the move marked; the no-cause line; a hairline under.
//   2. WHAT PEOPLE SAID AFTER IT: one card per video with a comment about
//      what the move is on, dated from its day to the latest update (decision
//      6), most of those comments first, Market's video cards over a different
//      window and set; THE FACTS beside it, small, each "of" those videos.
//   3. YOUR OTHER MOVES (and "Your next move" for an owner), then the Agent.
// No week chip (decision 7): this page prints no week figure.

/** The flat header: the one reading beside its line. */
function Lead({ page }: { page: MovePageData }) {
  const { card } = page
  const reading: ReadingLabel = { month: page.month, label: page.monthLabel }
  return (
    <div data-move-lead="" className="-mt-0.5 grid grid-cols-1 items-center gap-x-12 gap-y-5 border-b border-border pb-[22px] max-sm:gap-y-3.5 max-sm:pb-4 min-[1180px]:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex min-w-0 flex-col gap-3">
        <LeadSentence card={card} reading={reading} />
        <VerdictRow card={card} />
        <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{NO_CAUSE}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label>Month by month · share of market videos</Label>
        <MoveChart card={card} readingMonth={page.month} detail />
      </div>
    </div>
  )
}

const LEAD = 'm-0 max-w-[820px] text-[20px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[17px]'

/** "Share of market videos on X went from 11% in August, the month before, to
 *  14% in September, the last full month and the month of the move." The
 *  move's own sentence, by the root's branches, as the page's lead. */
function LeadSentence({ card, reading }: { card: MoveCard; reading: ReadingLabel }) {
  const on = card.label ? <> on <OnLabel card={card} /></> : null
  const pct = (p: MovePoint) => <span data-copy="figure">{sharePct(p.k, p.n)}</span>
  if (card.unread) return <p className={cn(LEAD, 'text-muted-foreground')}>{MOVE_UNREAD[card.unread]}</p>
  if (card.pending) {
    const last = card.points[card.points.length - 1]
    return last
      ? <p className={LEAD}>Share of market videos{on}: {pct(last)} in {longMonth(last.month)}, before the move. {longMonth(card.pending)} reads once the month has been read.</p>
      : <p className={cn(LEAD, 'text-muted-foreground')}>{longMonth(card.pending)} reads once the month has been read.</p>
  }
  const c = card.compare
  if (comparePrintable(c)) {
    const m = compareMonths(c, monthStartOf(card.day), reading)
    return <p className={LEAD}>Share of market videos{on} went from {pct(c.before)} in {m.before}, to {pct(c.after)} in {m.after}.</p>
  }
  const latest = card.compare?.after ?? card.points[card.points.length - 1]
  if (!latest) return <p className={cn(LEAD, 'text-muted-foreground')}>{MOVE_UNREAD.no_reading}</p>
  return <p className={LEAD}>Share of market videos{on}: {pct(latest)} in {inlineMonth(`${longMonth(latest.month)}${latest.soFar ? ' so far' : ''}`, monthLabelOn(latest.month, reading))}.</p>
}

/** The verdict beside it: the badge's word as the row's title and the change
 *  and its band in the mono beside it ("No clear change +3 pts · band ±3.4
 *  pts"); a movement as the one badge. Nothing where no comparison prints. */
function VerdictRow({ card }: { card: MoveCard }) {
  const c = card.compare
  if (!comparePrintable(c)) return null
  const parts = nonAnswerParts(c.verdict, 'pts')
  if (!parts) {
    return (
      <div data-copy="verdict" className="flex flex-wrap items-center gap-2 text-[15px]">
        <MovementBadge verdict={c.verdict} unit="pts" good={card.direction === 'down' ? 'down' : 'up'} />
      </div>
    )
  }
  const word = `${parts.word.charAt(0).toUpperCase()}${parts.word.slice(1)}`
  return (
    <div data-copy="verdict" title={parts.title} className="flex flex-wrap items-center gap-2">
      <span className="text-[15px] font-semibold text-secondary-foreground max-sm:text-[14.5px]">{word}</span>
      {parts.change != null ? (
        <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
          {signedChange(parts.change, 'pts')}{parts.bandPts != null ? ` · band ±${parts.bandPts.toLocaleString('en-US')} pts` : null}
        </span>
      ) : null}
    </div>
  )
}

// ---- what people said after it --------------------------------------------------------

function Comment({ c, hideOnPhone }: { c: ConvComment; hideOnPhone: boolean }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLabel(note)
  return (
    <div data-video-comment="" className={cn('flex flex-col gap-[5px] border-t border-border py-3 first:border-t-0', hideOnPhone ? 'max-sm:hidden' : null)}>
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground max-sm:text-[14.5px]">“{c.text}”</p>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {c.date ? <span className="text-[12px] text-muted-foreground">{c.date}</span> : null}
    </div>
  )
}

/** One video (Market's `.vcard`, over the move's window and set). */
function VideoCard({ v, brand, index, all }: { v: ConvVideo; brand: string; index: number; all: boolean }) {
  const phoneMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES_PHONE
  const deskMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES
  const show = showCommentsOf(v)
  const note = v.open ? openedNote(v) : null
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', !all && !v.open && index >= 3 ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-foreground"><PlayGlyph className="size-[15px]" /></span>
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] leading-[1.3] font-semibold text-foreground">{v.account || 'Unnamed account'}</span>
          <span className="block text-[12.5px] leading-[1.35] text-muted-foreground">{v.platform}{v.posted ? ` · posted ${v.posted}` : null}</span>
        </div>
        {v.about === 'client' ? <BrandChip who="you" className="ml-auto">{brand}</BrandChip> : v.about && v.about !== 'market' ? <BrandChip who="rival" className="ml-auto">{v.about.slice('rival:'.length)}</BrandChip> : null}
      </div>
      {v.caption ? <p className="m-0 truncate text-[14.5px] leading-[1.5] text-secondary-foreground">{v.caption}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {v.aboutCount === 0
          ? <span>{CONV_SAID_IN_VIDEO}</span>
          : v.total != null && v.total >= v.aboutCount
            ? <span data-copy="level"><b className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.aboutCount)}</b> {v.aboutCount === 1 ? 'comment' : 'comments'} about this, of {fmtInt(v.total)} on the video</span>
            : <span><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.aboutCount)}</b> {v.aboutCount === 1 ? 'comment' : 'comments'} about this</span>}
        {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">Watch the video ↗</a> : null}
      </div>
      {v.quotes.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {v.quotes.map((c, i) => <Comment key={i} c={c} hideOnPhone={!v.open && i >= MARKET_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.aboutCount > 0 ? <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{CONV_NONE_QUOTABLE}</p> : null}
      {note ? <p className="m-0 text-[12.5px] text-muted-foreground">{note}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">Show fewer comments</Link></div>
      ) : phoneMore || deskMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">
            {show.of == null
              ? <>Show all <span data-copy="figure">{fmtInt(show.shown)}</span> comments</>
              : <>Show <span data-copy="figure">{fmtInt(show.shown)}</span> of <span data-copy="figure">{fmtInt(show.of)}</span> comments</>}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The line a section with nothing to list says, by its state. */
function saidGap(ev: MoveEvidence, day: string): string {
  return ev.state === 'held' ? SAID_HELD : ev.state === 'nothing' ? SAID_NOTHING : ev.state === 'unread' ? SAID_UNREAD : saidNone(day)
}

function Said({ page }: { page: MovePageData }) {
  const ev = page.evidence
  const since = shortDate(page.card.day)
  return (
    <section id={MOVE_SAID_ANCHOR} aria-labelledby="said-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        <h2 id="said-title" className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{SAID_TITLE}</h2>
        {ev.state === 'ready' && ev.total > 0 ? (
          <span className="text-[13px] leading-[1.4] text-muted-foreground"><span data-copy="figure">{fmtInt(ev.total)}</span> {ev.total === 1 ? 'video' : 'videos'} since {since}, most comments about it first</span>
        ) : null}
      </div>
      {ev.state !== 'ready' || ev.total === 0 ? (
        <div data-said-gap={ev.state} className={cn(CARD, 'gap-2')}>
          <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{saidGap(ev, page.card.day)}</p>
        </div>
      ) : (
        <>
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} brand={page.brand} index={i} all={ev.all} />)}
          {ev.capped != null ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(ev.capped)}</span> of <span data-copy="figure">{fmtInt(ev.total)}</span> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-start max-sm:hidden')}><span>Show more videos · <span data-copy="figure">{fmtInt(ev.more.desktop)}</span>&nbsp;more</span></Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show more videos · <span data-copy="figure">{fmtInt(ev.more.phone)}</span>&nbsp;more</span></Link> : null}
        </>
      )}
    </section>
  )
}

// ---- the facts --------------------------------------------------------------------------

const FACT = 'flex min-w-0 flex-col gap-[9px] border-t border-border py-4 first-of-type:border-t-0 first-of-type:pt-2'

function Facts({ page }: { page: MovePageData }) {
  const { on, facts } = page
  const since = shortDate(page.card.day)
  const reading = monthStartOf(page.month)
  const of = (x: number | null | undefined, words?: string): ReactNode => (x != null ? <> · <span data-copy="level">of {fmtInt(x)}</span>{words ? ` ${words}` : null}</> : null)
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col sm:-mx-2 sm:px-2 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-[18px] max-sm:pt-4 max-sm:pb-1.5 max-sm:shadow-card">
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      <div className={FACT}>
        <Label>What it is on</Label>
        {on ? (
          <>
            {on.href
              ? <Link href={on.href} className="text-[14.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline"><OnLabel card={page.card} /></Link>
              : <span className="text-[14.5px] font-semibold text-foreground"><OnLabel card={page.card} /></span>}
            <p className="m-0 text-[12.5px] text-muted-foreground">
              {on.kind === 'subject' ? 'A subject you track' : 'A conversation in your market'}
              {on.level ? <> · <span data-copy="level">{fmtInt(on.level.k)} of {fmtInt(on.level.n)}</span> market videos in {inlineMonth(longMonth(reading), page.monthLabel)}</> : on.ready ? null : <> · not measured yet</>}
            </p>
            {on.href ? <Link href={on.href} className="text-[12.5px] font-semibold text-orange-text no-underline underline-offset-[3px] hover:underline">Open it in Market →</Link> : null}
          </>
        ) : <p className="m-0 text-[13px] text-muted-foreground">{MOVE_UNREAD[page.card.unread ?? 'nothing']}</p>}
      </div>
      {facts ? (
        <>
          <div className={FACT}>
            <Label>Who it’s about{of(facts.n, `since ${since}`)}</Label>
            {facts.brands !== 'counted'
              ? <p className="m-0 text-[13px] text-muted-foreground">{facts.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
              : facts.who ? <WhoLine parts={facts.who.parts} brand={page.brand} noun={page.noun} /> : <p className="m-0 text-[13px] text-muted-foreground">No video read for who it is about.</p>}
          </div>
          <div className={FACT}>
            <Label>What people did{of(facts.n)}</Label>
            {facts.doing.length > 0
              ? facts.doing.map((r) => <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} className="text-[13px]" />)
              : <p className="m-0 text-[13px] text-muted-foreground">Not read yet.</p>}
          </div>
          <div className={FACT}>
            <Label>Who’s saying it{of(facts.n)}</Label>
            {facts.groups && facts.groups.length > 0
              ? <GroupRows groups={facts.groups} n={facts.n} />
              : <p className="m-0 text-[13px] text-muted-foreground">{facts.groups ? noGroupSaying(`since ${since}`) : 'Not linked to a group.'}</p>}
          </div>
          <div className={FACT}>
            <Label>Where{of(facts.where?.n ?? null)}</Label>
            {facts.where
              ? facts.where.rows.map((r) => <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(facts.where!.n)}`} className="text-[13px]" />)
              : <p className="m-0 text-[13px] text-muted-foreground">No video counted by platform yet.</p>}
          </div>
        </>
      ) : (
        <div className={FACT}>
          <Label>Since {since}</Label>
          <p className="m-0 text-[13px] text-muted-foreground">{saidGap(page.evidence, page.card.day)}</p>
        </div>
      )}
    </aside>
  )
}

// ---- your other moves -------------------------------------------------------------------

function OtherMoves({ page }: { page: MovePageData }) {
  const all = <Link href={`${MOVES_PATH}#moves-title`} className="text-[13.5px] font-semibold text-orange-text no-underline underline-offset-[3px] hover:underline">All your moves →</Link>
  return (
    <>
      <SectionHead title={OTHER_MOVES_TITLE} note={all} />
      <nav aria-label={OTHER_MOVES_TITLE} className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-4">
        {page.others.map((m) => (
          <Link key={m.id} href={m.href} data-sibling="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-4 pt-3.5 pb-[13px] no-underline shadow-card transition-shadow hover:shadow-panel">
            <span className="text-[14px] leading-[1.35] font-semibold text-foreground"><span data-copy="quote">{m.title}</span></span>
            <span className="text-[12.5px] text-muted-foreground">Dated {shortDate(m.day)}{m.label ? <> · on <OnLabel card={m} /></> : null}</span>
            <MoveStatusChip status={m.status} className="self-start bg-transparent px-0 py-0" />
          </Link>
        ))}
        {page.invite ? (
          <div data-next-move="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] px-4 pt-3.5 pb-[13px] ring-1 ring-border">
            <span className="text-[14px] leading-[1.35] font-semibold text-foreground">{NEXT_MOVE_PAGE.title}</span>
            <span className="text-[12.5px] text-muted-foreground">{NEXT_MOVE_PAGE.line}</span>
          </div>
        ) : null}
        {page.others.length === 0 && !page.invite ? (
          <p className="m-0 text-[14px] text-muted-foreground">No other move is dated yet.</p>
        ) : null}
      </nav>
    </>
  )
}

/** The page's body under its title block, in the board's order. */
export function MovePageBody({ page }: { page: MovePageData }) {
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <Said page={page} />
        <Facts page={page} />
      </div>
      <OtherMoves page={page} />
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">Ask what people said about {page.card.label ? <OnLabel card={page.card} /> : 'it'} after this move, in your own words.</p>
        <Link href={page.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </section>
      <Link href={page.askHref} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
    </>
  )
}

/** The title block's meta line, as its phone lines: the day, the months its
 *  line reads, and its videos since the day. */
export function moveMeta(page: MovePageData, read: string | null): ReactNode[][] {
  const ev = page.evidence
  return [
    [`Dated ${shortDate(page.card.day)}`],
    read ? [read] : [],
    ev.state === 'ready' && page.card.label ? [<><span data-copy="figure">{fmtInt(ev.total)}</span> {ev.total === 1 ? 'video' : 'videos'} on <OnLabel card={page.card} /> since {shortDate(page.card.day)}</>] : [],
  ]
}
