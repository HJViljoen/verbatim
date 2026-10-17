import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { BubbleGlyph, PlayGlyph } from '@/components/shell/level-glyphs'
import { CARD, TickBarRow } from '@/components/v2'
import { fmtCompact, fmtInt, longMonth } from '@/lib/format'
import { MARKET_VIDEO_COMMENTS_MAX, MARKET_VIDEO_QUOTES, MARKET_VIDEO_QUOTES_PHONE } from '@/lib/pages/v2/market'
import { inMonthWords, LEVEL_QUOTE_RULE, type CreatorComment, type CreatorPage, type CreatorVideoCard } from '@/lib/pages/v2/voices-levels'
import { cn } from '@/lib/utils'
import { Fig, OLINK } from './parts'
import { AskBox, Caps, GAPLINE, LevelSection } from './levels'

// A CREATOR'S PAGE, THE EVIDENCE (G3-Voices-Creator and its phone board). A
// flat header with no card and no figure tiles: the title block, then ONE line
// code builds from figures (their biggest conversation, their videos in it of
// theirs, of all of its videos) and the brands named in their videos. Then
// their videos, the most comments counted first, each led by its caption, its
// day and the conversation it is in, its comments counted this month of all on
// it, and those that may print, each naming the conversation it is counted in
// (board decision 5: "comments counted", since a creator's comments sit in
// many conversations); a small facts rail; the other creators; the Agent.
// "Show all" and "Show more" are addresses (`?video=`, `?videos=all`, the
// creator's own videos alone), so they work without client code. Never Reddit.

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

/** The one line code builds, and the brands named in their videos. */
function Lead({ page }: { page: CreatorPage }) {
  const l = page.lead
  return (
    <div data-creator-lead="" className="-mt-0.5 flex flex-col gap-3 border-b border-border pb-[22px] max-sm:gap-2.5 max-sm:pb-4">
      {l ? (
        <p className="m-0 max-w-[820px] text-[21px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[18px]">
          Their biggest conversation is <Link href={l.href} className="text-foreground underline decoration-foreground/25 underline-offset-[4px] hover:decoration-foreground"><span data-copy="subject" data-slot="pass_b_theme">{l.label}</span></Link>: <Fig>{fmtInt(l.k)}</Fig> of their <Fig>{fmtInt(page.videos)}</Fig> videos, of the <Fig>{fmtInt(l.ofTheme)}</Fig> in it {inMonthWords(page.month)}.
        </p>
      ) : (
        <p className="m-0 max-w-[820px] text-[18px] leading-[1.45] text-muted-foreground">None of their videos {inMonthWords(page.month)} is in a named conversation.</p>
      )}
      {page.brands.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {page.brands.map((b) => (
            <Link key={b.label} href={b.href} className="no-underline"><BrandChip who={b.you ? 'you' : 'rival'} className="px-2 py-1 text-[12.5px]">{b.label} <Fig>{fmtInt(b.k)}</Fig></BrandChip></Link>
          ))}
          <span className="text-[12.5px] text-muted-foreground">brands named in their videos</span>
        </div>
      ) : null}
    </div>
  )
}

/** One counted comment under a video: its words, its English where it has
 *  one, its day and the conversation it is counted in. */
function Comment({ c, hideOnPhone }: { c: CreatorComment; hideOnPhone: boolean }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLabel(note)
  return (
    <div data-video-comment="" className={cn('flex flex-col gap-[5px] border-t border-border py-3 first:border-t-0', hideOnPhone ? 'max-sm:hidden' : null)}>
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground max-sm:text-[14.5px]">“{c.text}”</p>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      <span className="text-[12px] text-muted-foreground">
        {c.date}
        {c.conv ? <>{c.date ? ' · ' : null}in <Link href={c.conv.href} className="text-muted-foreground underline decoration-muted-foreground/35 underline-offset-[3px] hover:text-foreground"><span data-copy="subject" data-slot="pass_b_theme">{c.conv.label}</span></Link></> : null}
      </span>
    </div>
  )
}

/** One of their videos (the boards' caption-led `.vcard`). */
function VideoCard({ v, index, all }: { v: CreatorVideoCard; index: number; all: boolean }) {
  const phoneMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES_PHONE
  const deskMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES
  const show = showCountedOf(v)
  const note = v.open ? openedCountedNote(v) : null
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', !all && !v.open && index >= 3 ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-foreground"><PlayGlyph className="size-[15px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 text-[15.5px] leading-[1.4] font-semibold text-foreground max-sm:text-[15px]">{v.caption ?? 'A video with no caption'}</p>
          <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted-foreground">
            {v.posted ? <>Posted {v.posted}</> : null}
            {/* On a phone the brand rides after the day, and the conversation
                takes its own line (G3-Voices-Creator-Phone). */}
            {v.brand ? <span className="sm:hidden"> · <BrandChip who={v.brand.you ? 'you' : 'rival'} className="text-[12px]">{v.brand.label}</BrandChip></span> : null}
            {v.conv ? <><span className="max-sm:hidden">{v.posted ? ' · ' : null}</span><span className="max-sm:mt-1 max-sm:block">in <Link href={v.conv.href} className="inline-flex items-center gap-[5px] font-medium text-secondary-foreground no-underline hover:text-foreground hover:underline hover:underline-offset-[3px]"><BubbleGlyph className="size-3 text-muted-foreground" /><span data-copy="subject" data-slot="pass_b_theme">{v.conv.label}</span></Link></span></> : null}
          </span>
        </div>
        {v.brand ? <BrandChip who={v.brand.you ? 'you' : 'rival'} className="shrink-0 self-start text-[12px] max-sm:hidden">{v.brand.label}</BrandChip> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {v.total != null && v.total >= v.counted
          ? <span data-copy="level"><b className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.counted)}</b> {v.counted === 1 ? 'comment' : 'comments'} counted, of {fmtInt(v.total)} on the video</span>
          : <span><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.counted)}</b> {v.counted === 1 ? 'comment' : 'comments'} counted</span>}
        {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">Watch the video ↗</a> : null}
      </div>
      {v.quotes.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {v.quotes.map((c, i) => <Comment key={i} c={c} hideOnPhone={!v.open && i >= MARKET_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.counted > 0 ? <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{CREATOR_NONE_QUOTABLE}</p> : null}
      {note ? <p className="m-0 text-[12.5px] text-muted-foreground">{note}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">Show fewer comments</Link></div>
      ) : phoneMore || deskMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">
            {show.of == null
              ? <>Show all <Fig>{fmtInt(show.shown)}</Fig> comments</>
              : <>Show <Fig>{fmtInt(show.shown)}</Fig> of <Fig>{fmtInt(show.of)}</Fig> comments</>}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Videos({ page }: { page: CreatorPage }) {
  const ev = page.evidence
  return (
    <section id="their-videos" aria-labelledby="videos-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        <h2 id="videos-title" className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">Their videos</h2>
        {ev.state === 'ready' && ev.total > 0 ? (
          <span className="text-[13px] leading-[1.4] text-muted-foreground"><Fig>{fmtInt(ev.total)}</Fig> {ev.total === 1 ? 'video' : 'videos'} in {page.month.monthWords}, the most comments counted first</span>
        ) : null}
      </div>
      {ev.state === 'unread' || ev.total === 0 ? (
        <div data-videos-gap={ev.state} className={cn(CARD, 'gap-2')}>
          <p className={GAPLINE}>{ev.state === 'unread' ? CREATOR_VIDEOS_UNREAD : `No video of theirs in ${page.month.monthWords}.`}</p>
        </div>
      ) : (
        <>
          {ev.cards.map((v, i) => <VideoCard key={v.id} v={v} index={i} all={ev.all} />)}
          {ev.capped != null ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <Fig>{fmtInt(ev.capped)}</Fig> of <Fig>{fmtInt(ev.total)}</Fig> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-start max-sm:hidden')}><span>Show more videos · <Fig>{fmtInt(ev.more.desktop)}</Fig>&nbsp;more</span></Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show more videos · <Fig>{fmtInt(ev.more.phone)}</Fig>&nbsp;more</span></Link> : null}
        </>
      )}
    </section>
  )
}

const FACT = 'flex min-w-0 flex-col gap-[9px] border-t border-border py-4 first-of-type:border-t-0 first-of-type:pt-2'

/** "The facts", small, beside the videos (a card on a phone). */
function Facts({ page }: { page: CreatorPage }) {
  const of = <> · <span data-copy="level">of {fmtInt(page.videos)}</span></>
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col sm:-mx-2 sm:px-2 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-[18px] max-sm:pt-4 max-sm:pb-1.5 max-sm:shadow-card">
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      <div className={FACT}>
        <Caps>On {page.platformLabel}</Caps>
        {page.followers != null ? (
          <p className="m-0 flex items-baseline gap-2 text-[13px] text-secondary-foreground"><span data-copy="figure" className="font-mono text-[22px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground">{fmtCompact(page.followers)}</span> {page.followerWord}, as of their videos in {longMonth(page.month.month)}</p>
        ) : null}
        <p className="m-0 flex items-baseline gap-2 text-[13px] text-secondary-foreground">
          <span data-copy="figure" className="font-mono text-[22px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground">{fmtInt(page.videos)}</span>
          <span>{page.month.n != null ? <>of your market’s <Fig>{fmtInt(page.month.n)}</Fig> videos</> : 'of your market’s videos'}, {page.month.monthWords}</span>
        </p>
      </div>
      <div className={FACT}>
        <Caps>Conversations their videos are in{of}</Caps>
        {page.conversations.length > 0 ? (
          <>
            {page.conversations.map((c) => (
              <Link key={c.id} href={c.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1 text-[13px] text-foreground no-underline hover:bg-inner">
                <span className="min-w-0"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[12.5px] tabular-nums text-secondary-foreground"><Fig>{fmtInt(c.k)}</Fig> · <span data-copy="level">of {fmtInt(c.ofTheme)}</span></span>
              </Link>
            ))}
            <p className="m-0 text-[12px] text-muted-foreground">Theirs, then all the videos in it · each opens in Market</p>
          </>
        ) : <p className="m-0 text-[13px] text-muted-foreground">None of their videos is in a named conversation.</p>}
      </div>
      <div className={FACT}>
        <Caps>Who comments{of}</Caps>
        {page.groups.length > 0 ? (
          <>
            {page.groups.map((g) => (
              <Link key={g.key} href={g.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1 text-[13px] text-foreground no-underline hover:bg-inner">
                <span className="min-w-0"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></span>
                <span data-copy="level" className="shrink-0 whitespace-nowrap font-mono text-[12.5px] tabular-nums text-secondary-foreground">{fmtInt(g.k)} of {fmtInt(page.videos)}</span>
              </Link>
            ))}
            <p className="m-0 text-[12px] text-muted-foreground">Each opens its page in Voices</p>
          </>
        ) : <p className="m-0 text-[13px] text-muted-foreground">{page.groupsLine ?? `No group comments on their videos ${inMonthWords(page.month)}.`}</p>}
      </div>
      <div className={FACT}>
        <Caps>What people did{page.kinds ? <> · <span data-copy="level">of {fmtInt(page.kinds[0]?.n ?? page.videos)}</span></> : null}</Caps>
        {page.kinds && page.kinds.length > 0
          ? page.kinds.map((k) => <TickBarRow key={k.kind} name={k.label} value={fmtInt(k.k)} pct={k.n > 0 ? (100 * k.k) / k.n : 0} valueWidth="narrow" label={`${fmtInt(k.k)} of ${fmtInt(k.n)}`} className="text-[13px]" />)
          : <p className="m-0 text-[13px] text-muted-foreground">Not read yet.</p>}
      </div>
    </aside>
  )
}

/** "Other creators, {month}": cards from 640, a list on a phone; then the
 *  root's full list. */
function Siblings({ page }: { page: CreatorPage }) {
  const all = page.allHref
  const title = `Other creators, ${page.month.monthWords}`
  const link = page.atFloor > 0 ? <Link href={all} className={OLINK}>All <Fig>{fmtInt(page.atFloor)}</Fig> in Voices →</Link> : null
  return (
    <>
      <div className="max-sm:hidden"><LevelSection title={title} note={link} /></div>
      {page.siblings.length === 0 ? (
        <div className={cn(CARD, 'gap-2')}>
          <h2 className="m-0 text-[17px] font-semibold sm:hidden">{title}</h2>
          <p className={GAPLINE}>No other account made three or more of your market’s videos in {page.month.monthWords}.</p>
        </div>
      ) : (
        <>
          <nav aria-label={title} className="grid grid-cols-2 gap-3 max-sm:hidden min-[1180px]:grid-cols-4">
            {page.siblings.map((c) => (
              <Link key={c.key} href={c.href} data-sibling="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-4 pt-3.5 pb-[13px] no-underline shadow-card transition-shadow hover:shadow-panel">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-track text-[10.5px] font-semibold text-secondary-foreground">{c.initials}</span>
                  <span className="truncate text-[14px] leading-[1.35] font-semibold text-foreground">{c.account}</span>
                </span>
                <span className="text-[12.5px] text-muted-foreground">{c.platformLabel} · <Fig className="text-foreground">{fmtInt(c.videos)}</Fig> {c.videos === 1 ? 'video' : 'videos'}</span>
              </Link>
            ))}
          </nav>
          <section aria-label={title} className={cn(CARD, 'gap-3 sm:hidden')}>
            <div>
              <h2 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">Their videos in your market</p>
            </div>
            <div className="flex flex-col">
              {page.siblings.slice(0, 5).map((c) => (
                <div key={c.key} data-phone-sibling="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
                  <Link href={c.href} className="min-w-0 truncate text-[14px] font-medium text-foreground no-underline">{c.account}</Link>
                  <span className="text-right font-mono text-[13.5px] tabular-nums"><Fig>{fmtInt(c.videos)}</Fig></span>
                  <span className="col-span-2 text-[12.5px] text-muted-foreground">{c.platformLabel}</span>
                </div>
              ))}
            </div>
            {link}
          </section>
        </>
      )}
    </>
  )
}

/** The page's body under its title block. */
export function CreatorPageBody({ page }: { page: CreatorPage }) {
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <Videos page={page} />
        <Facts page={page} />
      </div>
      <Siblings page={page} />
      <AskBox
        text="Ask about these videos and what people said under them, in your own words."
        href={page.askHref}
        button={<><span className="max-sm:hidden">Ask the Agent about {page.account}</span><span className="sm:hidden">Ask the Agent about this creator</span></>}
      />
    </>
  )
}
