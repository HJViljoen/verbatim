import Link from 'next/link'

import { CARD, EmptyBox, GoLink, Label, SectionHead, type StatItem } from '@/components/v2'
import { CHIP, ROW } from '@/components/v2/look'
import { CONV_NONE_QUOTABLE_ALL, VideoCard, unquotable } from '@/components/pages/v2/market/conversation-page'
import { GroupRows } from '@/components/pages/v2/market/panel'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { inlineMonth } from '@/lib/reading/month-label'
import { monthStartOf } from '@/lib/reading/month-key'
import { noGroupSaying } from '@/lib/pages/v2/market'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { MOVES_PATH, MOVE_UNREAD, compareMonths, levelBase, comparePrintable, monthLabelOn, sharePct, type MoveCard, type MovePoint, type ReadingLabel } from '@/lib/pages/v2/moves'
import { MOVE_SAID_ANCHOR } from '@/lib/pages/v2/moves-address'
import {
  NEXT_MOVE_PAGE, NO_CAUSE, OTHER_MOVES_TITLE, SAID_HELD, SAID_NOTHING, SAID_TITLE, SAID_UNREAD, saidNone,
  type MoveEvidence, type MovePageData,
} from '@/lib/pages/v2/moves-levels'
import { cn } from '@/lib/utils'
import { BarRows, WhoLine } from './advice-page'
import { MoveMonths, MoveStatusChip, OnLabel, VerdictWords } from './moves'

// A DATED MOVE, THE EVIDENCE (board G6-Moves-Move; -Phone; since the audit
// design, 7 Nov, Moves-Move.dc.html). One concrete thing, so it is lighter
// than the advice's page and led by its one reading:
//   0. THE TITLE BLOCK: the move's own words, its status as a tag and Mark
//      done and Stop it at its right for an owner or an admin, and the
//      figures row (`moveStats`: what it is on, the day, the month it is
//      read on with that month's base, its videos since the day);
//   1. THE LEAD TILE: the one comparison in a sentence and its verdict, the
//      no-cause line, beside the move's months (`MoveMonths`, the top
//      page's), each "k of n";
//   2. WHAT PEOPLE SAID AFTER IT: Market's video tiles (`VideoCard`, each
//      caption on one line, as the board draws it) over the videos with a
//      comment about what the move is on, dated from its day to the latest
//      update (decision 6), most of those comments first;
//      THE FACTS beside it, one tile, its base said once ("Of the 24 videos
//      since 5 Oct"), bare counts with bars against the largest;
//   3. YOUR OTHER MOVES, and "Your next move" in the dashed box for an
//      owner; then the Agent.
// No week chip (decision 7): this page prints no week figure.

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>
// 44px to tap on a phone (`TAP`, written out): it stands alone in its cell.
const LINK = 'text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground max-sm:inline-block max-sm:min-h-11 max-sm:content-center'

// ---- 0. the title block -----------------------------------------------------------------

/** The figures row (the board's `.strip`): what it is on (its page in
 *  Market), the day, the month it is read on and that month's base, and its
 *  videos since the day. A state that prints no figure says so in its cell,
 *  in a word or two; the lead says why. Pure. */
export function moveStats(page: MovePageData): StatItem[] {
  const { card, on } = page
  const ev = page.evidence
  const since = shortDate(card.day)
  const label = card.label ? <OnLabel card={card} /> : null
  const href = on?.href ?? card.onHref ?? null
  const reading = inlineMonth(longMonth(monthStartOf(page.month)), page.monthLabel)
  return [
    {
      key: 'on',
      term: 'Move on',
      value: label ? (href ? <Link href={href} className={LINK}>{label}</Link> : label) : card.unread === 'several' ? 'Several themes' : 'Nothing read month by month',
    },
    { key: 'dated', term: 'Dated', value: since },
    {
      key: 'read',
      term: `Read on ${reading}`,
      value: on?.level ? <>{fig(on.level.n)} {levelBase(on.kind)}</> : on && !on.ready ? SUBJECT_NOT_MEASURED : 'No reading yet',
    },
    {
      key: 'since',
      term: `Since ${since}`,
      value: ev.state === 'ready'
        ? ev.total > 0 ? <>{fig(ev.total)} {ev.total === 1 ? 'video' : 'videos'}{label ? <> on {label}</> : null}</> : 'No video yet'
        : ev.state === 'unread' ? 'Could not be read just now' : ev.state === 'held' ? 'Not counted yet' : 'No video read after it',
    },
  ]
}

// ---- 1. the lead tile -------------------------------------------------------------------

const LEAD = 'm-0 max-w-[820px] text-[24px] leading-[1.4] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[20px]'

/** "Share of market (or category) videos on X went from 11% in August, the month before, to
 *  14% in September, the last full month and the month of the move." The
 *  move's own sentence, by the root's branches, as the page's lead. */
function LeadSentence({ card, reading }: { card: MoveCard; reading: ReadingLabel }) {
  const on = card.label ? <> on <OnLabel card={card} /></> : null
  const pct = (p: MovePoint) => <span data-copy="figure">{sharePct(p.k, p.n)}</span>
  if (card.pending) {
    const last = card.points[card.points.length - 1]
    return last
      ? <p className={LEAD}>Share of {levelBase(card.kind)}{on}: {pct(last)} in {longMonth(last.month)}, before the move.</p>
      : <p className={cn(LEAD, 'text-muted-foreground')}>{longMonth(card.pending)} reads once the month has been read.</p>
  }
  const c = card.compare
  if (comparePrintable(c)) {
    const m = compareMonths(c, monthStartOf(card.day), reading)
    return <p className={LEAD}>Share of {levelBase(card.kind)}{on} went from {pct(c.before)} in {m.before}, to {pct(c.after)} in {m.after}.</p>
  }
  const latest = card.compare?.after ?? card.points[card.points.length - 1]
  if (!latest) return <p className={cn(LEAD, 'text-muted-foreground')}>{MOVE_UNREAD.no_reading}</p>
  return <p className={LEAD}>Share of {levelBase(card.kind)}{on}: {pct(latest)} in {inlineMonth(`${longMonth(latest.month)}${latest.soFar ? ' so far' : ''}`, monthLabelOn(latest.month, reading))}.</p>
}

/** A move on a subject whose check has not passed (U6) says why ONCE, in
 *  the lead's box (the review of Phases 6 and 7): its line and what people
 *  said after it both wait for the check, so "What people said after it"
 *  is not drawn as a second box saying the same. The figures row's short
 *  line is the other place it is said. */
export const HELD_WORDS = 'This subject is not measured yet: its line, and what people said after it, print once its check has passed.'

/** Whether the move's line and its videos both wait for its subject's
 *  check (U6), so the page says it once. */
const isHeld = (page: MovePageData): boolean => page.evidence.state === 'held' && page.card.unread != null

/** The lead tile: the sentence, its verdict in Your moves' words (the band
 *  in its title), the no-cause line, beside the move's months. A move with
 *  no line says why in the dashed box, in the months' place (decision 4). */
function Lead({ page }: { page: MovePageData }) {
  const { card } = page
  const reading: ReadingLabel = { month: page.month, label: page.monthLabel }
  const c = card.compare
  if (card.unread) {
    const why = !isHeld(page) ? MOVE_UNREAD[card.unread] : card.unread === 'not_measured' ? HELD_WORDS : `${MOVE_UNREAD[card.unread]} ${SAID_HELD}`
    return (
      <section aria-label="After your move" data-move-lead="" className={cn(CARD, 'gap-3.5 sm:p-[30px]')}>
        <EmptyBox title="No line drawn">{why}</EmptyBox>
        <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{NO_CAUSE}</p>
      </section>
    )
  }
  return (
    <section aria-label="After your move" data-move-lead="" className={cn(CARD, 'grid grid-cols-1 gap-10 max-sm:gap-6 sm:p-[30px] xl:grid-cols-2')}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <LeadSentence card={card} reading={reading} />
        {comparePrintable(c)
          ? <p className="m-0 text-[16px] font-semibold text-secondary-foreground"><VerdictWords verdict={c.verdict} good={card.direction === 'down' ? 'down' : 'up'} /></p>
          : null}
        <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{NO_CAUSE}</p>
      </div>
      <div className="min-w-0"><MoveMonths card={card} readingMonth={page.month} /></div>
    </section>
  )
}

// ---- 2. what people said after it, and the facts -----------------------------------------

/** The line a section with nothing to list says, by its state. */
function saidGap(ev: MoveEvidence, day: string): string {
  return ev.state === 'held' ? SAID_HELD : ev.state === 'nothing' ? SAID_NOTHING : ev.state === 'unread' ? SAID_UNREAD : saidNone(day)
}

function Said({ page }: { page: MovePageData }) {
  const ev = page.evidence
  const since = shortDate(page.card.day)
  const listed = ev.state === 'ready' && ev.total > 0
  const noneAll = listed && ev.videos.some(unquotable) && ev.videos.every((v) => v.aboutCount === 0 || unquotable(v))
  return (
    <section id={MOVE_SAID_ANCHOR} aria-labelledby="said-title" className="flex min-w-0 scroll-mt-6 flex-col gap-[18px] max-sm:gap-3.5">
      <SectionHead id="said-title" title={SAID_TITLE} note={listed ? <>{fig(ev.total)} {ev.total === 1 ? 'video' : 'videos'} since {since}, most comments about it first</> : null} />
      {!listed ? <div data-said-gap={ev.state}><EmptyBox>{saidGap(ev, page.card.day)}</EmptyBox></div> : (
        <>
          {noneAll ? <p data-none-quotable="" className="m-0 text-[14.5px] leading-[1.55] text-secondary-foreground">{CONV_NONE_QUOTABLE_ALL}</p> : null}
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} brand={page.brand} index={i} all={ev.all} onceSaid={noneAll} namePlatform oneLine />)}
          {ev.capped != null ? <p className="m-0 text-[13.5px] text-muted-foreground">The first {fig(ev.capped)} of {fig(ev.total)} are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-start font-semibold no-underline max-sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(ev.more.desktop)}</span> more videos</Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-stretch justify-center font-semibold no-underline sm:hidden')}>Show <span data-copy="figure" className="mx-1">{fmtInt(ev.more.phone)}</span> more videos</Link> : null}
        </>
      )}
    </section>
  )
}

const QUIET = 'm-0 text-[14.5px] leading-[1.5] text-secondary-foreground'

/** "The facts": one tile beside the videos (the board's), its base said
 *  once under its heading, then what it is on (its level in the reading
 *  month, "k of n", and its page in Market), who it is about, what people
 *  did, who's saying it and where, each a list of bare counts against its
 *  largest. */
function Facts({ page, besideLead = false }: { page: MovePageData; besideLead?: boolean }) {
  const { on, facts } = page
  const since = shortDate(page.card.day)
  const reading = inlineMonth(longMonth(monthStartOf(page.month)), page.monthLabel)
  return (
    <aside aria-labelledby="facts-title" className={cn(CARD, besideLead ? 'gap-0' : 'gap-0 xl:mt-[67px]', '[&>section]:mt-[18px] [&>section]:flex [&>section]:flex-col [&>section]:gap-2.5 [&>section]:border-t [&>section]:border-track [&>section]:pt-4')}>
      <h2 id="facts-title" className="m-0 text-[19px] font-semibold leading-[1.3] text-foreground">The facts</h2>
      {facts ? <p className="m-0 mt-1 text-[14px] text-muted-foreground">Of the {fig(facts.n)} {facts.n === 1 ? 'video' : 'videos'} since {since}</p> : null}
      <section>
        <Label as="h3">What it is on</Label>
        {on ? (
          <>
            <p className="m-0 text-[16px] font-semibold text-foreground"><OnLabel card={page.card} /></p>
            <p className={QUIET}>
              {on.kind === 'subject' ? 'A subject you track.' : 'A conversation in your market.'}
              {/* A subject whose check is open says so once, in the figures
                  row (U6); here it is only named. */}
              {on.level ? <> <span data-copy="level">{fmtInt(on.level.k)} of {fmtInt(on.level.n)}</span> {levelBase(on.kind)} in {reading}.</> : null}
            </p>
            {on.href ? <div><GoLink href={on.href}>Open it in Market</GoLink></div> : null}
          </>
        ) : <p className={QUIET}>{MOVE_UNREAD[page.card.unread ?? 'nothing']}</p>}
      </section>
      {facts ? (
        <>
          <section>
            <Label as="h3">Who it’s about</Label>
            {facts.brands !== 'counted'
              ? <p className={QUIET}>{facts.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
              : facts.who ? <WhoLine parts={facts.who.parts} brand={page.brand} noun={page.noun} /> : <p className={QUIET}>No brand named</p>}
          </section>
          <section>
            <Label as="h3">What people did</Label>
            {facts.doing.length > 0
              ? <BarRows rows={facts.doing.map((r) => ({ key: r.kind, name: r.label, k: r.k }))} />
              : <p className={QUIET}>Not read yet.</p>}
          </section>
          <section>
            <Label as="h3">Who’s saying it</Label>
            {facts.groups && facts.groups.length > 0
              ? <GroupRows groups={facts.groups} n={facts.n} />
              : <p className={QUIET}>{facts.groups ? noGroupSaying(`since ${since}`) : 'Not linked to a group.'}</p>}
          </section>
          <section>
            <Label as="h3">Where</Label>
            {facts.where
              ? <BarRows rows={facts.where.rows.map((r) => ({ key: r.platform, name: r.label, k: r.videos }))} />
              : <p className={QUIET}>No video counted by platform yet.</p>}
          </section>
        </>
      ) : page.evidence.state === 'ready' || page.evidence.state === 'unread' ? (
        // Its videos not read, or none yet: said once here beside the list's
        // own line. A subject whose check is open, or a move on nothing read
        // month by month, already says why above and in "What it is on".
        <section>
          <Label as="h3">Since {since}</Label>
          <p className={QUIET}>{page.evidence.state === 'unread' ? 'Not read just now.' : 'No video yet.'}</p>
        </section>
      ) : null}
    </aside>
  )
}

// ---- 3. your other moves ----------------------------------------------------------------

/** A dashed box that fills its grid cell. */
const FILL = 'flex [&>[data-empty-box]]:flex-1'

function OtherMoves({ page }: { page: MovePageData }) {
  return (
    <>
      <SectionHead title={OTHER_MOVES_TITLE} action={<GoLink href={`${MOVES_PATH}#moves-title`}>All your moves</GoLink>} />
      <nav aria-label={OTHER_MOVES_TITLE} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {page.others.map((m) => (
          <div key={m.id} data-sibling="" className={cn(CARD, 'gap-2')}>
            <div className="flex items-start justify-between gap-3">
              <Link href={m.href} className={cn(ROW, 'min-w-0 text-[16px] leading-[1.35]')}><span data-copy="quote">{m.title}</span></Link>
              <MoveStatusChip status={m.status} />
            </div>
            <p className="m-0 text-[14px] text-muted-foreground">Dated {shortDate(m.day)}{m.label ? <>, on <OnLabel card={m} /></> : null}</p>
          </div>
        ))}
        {page.invite ? <div data-next-move="" className={FILL}><EmptyBox title={NEXT_MOVE_PAGE.title}>{NEXT_MOVE_PAGE.line}</EmptyBox></div> : null}
        {page.others.length === 0 && !page.invite ? (
          // The row keeps a card's frame where there is nothing else to show.
          <div data-no-other-move="" className={FILL}><EmptyBox title="No other move yet">This is the only move dated so far.</EmptyBox></div>
        ) : null}
      </nav>
    </>
  )
}

/** The page's body under its title block, in the board's order. */
export function MovePageBody({ page }: { page: MovePageData }) {
  return (
    <>
      {isHeld(page) ? (
        // Held (U6): the lead's one box says why for the line and the videos
        // both, with the facts beside it; no second box under a heading. The
        // two tiles share their row's height.
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Lead page={page} />
          <Facts page={page} besideLead />
        </div>
      ) : (
        <>
          <Lead page={page} />
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Said page={page} />
            <Facts page={page} />
          </div>
        </>
      )}
      <OtherMoves page={page} />
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-5 max-sm:gap-3')}>
        <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55] text-secondary-foreground">Ask what people said about {page.card.label ? <OnLabel card={page.card} /> : 'it'} after this move, in your own words.</p>
        <GoLink href={page.askHref}>Ask the Agent about this</GoLink>
      </section>
    </>
  )
}
