import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { BrandChip } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { PlayGlyph } from '@/components/shell/level-glyphs'
import { CARD, FlagChip, SpikeBars, TickBarRow } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { CONV_SAID_ANCHOR, MARKET_VIDEO_QUOTES, MARKET_VIDEO_QUOTES_PHONE, noGroupSaying, type ConvComment, type ConvEvidence, type ConvPage, type ConvSiblings, type ConvVideo, type MarketData } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { SectionHead } from './analysis'
import { ASK, GroupRows, WhoLine } from './panel'
import { Label, OLINK, Stored } from './parts'

// A CONVERSATION'S PAGE, THE EVIDENCE (F3-Market-Conversation, 17 Oct). Lighter
// than its subject's and led by what people said, so the two never look
// alike: the header on the page itself (the title block, then its one-line
// read as the lead and the week's chip only where the check flagged it, a
// hairline under), then "What people said", one card per video in it this
// period, most comments about it first, each with up to three of its
// comments about the conversation (two on a phone); the facts beside it,
// small, on the page (week by week, who it's about, what people did, who's
// saying it, where, each of the period's videos); its siblings; the Agent.
// It absorbs F2's "See the N videos and every comment", which no page served.
//
// THE COMMENTS ARE THE CONVERSATION'S COUNTED COMMENTS dated in the period's
// window, through the quote gate Market's quotes pass (`videoQuotes`), their
// words resolved at render as every quote's are. "Show all" and "Show more"
// are addresses (`?video=`, `?videos=all`), so they work without client code.

const FACT = 'flex min-w-0 flex-col gap-[9px] border-t border-border py-4 first-of-type:border-t-0 first-of-type:pt-2'

/** Where the videos could not be read: the section's frame, and one line. */
export const CONV_VIDEOS_UNREAD = 'Its videos could not be read just now.'
/** A video counted for what is said in it, with no comment about it. */
export const CONV_SAID_IN_VIDEO = 'Said in the video itself, with no comment about it.'
/** A video whose comments about it are counted and none reads clearly enough
 *  to print. */
export const CONV_NONE_QUOTABLE = 'None of its comments about this reads clearly enough to quote.'
/** Opened: the comments counted and not printed, said once under the list. */
export const notQuoted = (n: number): string => `The other ${n === 1 ? 'one is' : `${n} are`} counted, not quoted: a comment prints only where it reads clearly and speaks to this.`

/** The period in the page's words. */
const whenOf = (data: MarketData): string => (data.period === 'week' ? 'this week' : `in ${data.month.text}`)

/** The header under the title block: the one-line read (its description,
 *  Pass B's), and the week's chip only where the check flagged it. */
function Lead({ page }: { page: ConvPage }) {
  const flag = page.panel.flag
  return (
    <div data-conv-lead="" className="-mt-0.5 flex flex-col gap-3 border-b border-border pb-[22px] max-sm:gap-2.5 max-sm:pb-4">
      {page.lead ? <Stored line={page.lead} slot="pass_b_theme" className="m-0 max-w-[820px] text-[21px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[18px]" /> : null}
      {flag ? <div><FlagChip verdict={flag} /></div> : null}
    </div>
  )
}

/** One comment under a video: the commenter's words, its English where it
 *  has one, and its date (the platform is on the video). */
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

/** One video in the conversation (F3's `.vcard`): its creator, platform and
 *  day, who it is about where counted, its caption on one line, its comments
 *  about this of its own, the link out, its comments, "Show all". */
function VideoCard({ v, data, index, all }: { v: ConvVideo; data: MarketData; index: number; all: boolean }) {
  const shown = v.quotes
  const phoneMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES_PHONE
  const deskMore = !v.open && v.quotable > MARKET_VIDEO_QUOTES
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', !all && !v.open && index >= 3 ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-foreground"><PlayGlyph className="size-[15px]" /></span>
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] leading-[1.3] font-semibold text-foreground">{v.account || 'Unnamed account'}</span>
          <span className="block text-[12.5px] leading-[1.35] text-muted-foreground">{v.platform}{v.posted ? ` · posted ${v.posted}` : null}</span>
        </div>
        {v.about === 'client' ? <BrandChip who="you" className="ml-auto">{data.brand}</BrandChip> : v.about && v.about !== 'market' ? <BrandChip who="rival" className="ml-auto">{v.about.slice('rival:'.length)}</BrandChip> : null}
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
      {shown.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {shown.map((c, i) => <Comment key={i} c={c} hideOnPhone={!v.open && i >= MARKET_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.aboutCount > 0 ? <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{CONV_NONE_QUOTABLE}</p> : null}
      {v.open && v.quotable < v.aboutCount ? <p className="m-0 text-[12.5px] text-muted-foreground">{notQuoted(v.aboutCount - v.quotable)}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">Show fewer comments</Link></div>
      ) : phoneMore || deskMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className="text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline">Show all <span data-copy="figure">{fmtInt(v.quotable)}</span> comments</Link>
        </div>
      ) : null}
    </article>
  )
}

const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** "What people said": the head and its note, the video cards, then "Show
 *  more videos" with what remains (from 640, and on a phone, where three
 *  show). A frame and one line where there is nothing to list. */
function Said({ ev, data }: { ev: ConvEvidence; data: MarketData }) {
  const when = whenOf(data)
  return (
    <section id={CONV_SAID_ANCHOR} aria-labelledby="said-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        <h2 id="said-title" className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">What people said</h2>
        {ev.state === 'ready' && ev.total > 0 ? (
          <span className="text-[13px] leading-[1.4] text-muted-foreground"><span data-copy="figure">{fmtInt(ev.total)}</span> category {ev.total === 1 ? 'video' : 'videos'} {when}, most comments about it first</span>
        ) : null}
      </div>
      {ev.state === 'unread' || ev.total === 0 ? (
        <div data-said-gap={ev.state} className={cn(CARD, 'gap-2')}>
          <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{ev.state === 'unread' ? CONV_VIDEOS_UNREAD : `No video in it ${when}.`}</p>
        </div>
      ) : (
        <>
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} data={data} index={i} all={ev.all} />)}
          {ev.capped != null ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(ev.capped)}</span> of <span data-copy="figure">{fmtInt(ev.total)}</span> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-start max-sm:hidden')}><span>Show more videos · <span data-copy="figure">{fmtInt(ev.more.desktop)}</span>&nbsp;more</span></Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show more videos · <span data-copy="figure">{fmtInt(ev.more.phone)}</span>&nbsp;more</span></Link> : null}
        </>
      )}
    </section>
  )
}

/** "The facts", small, on the page (F3's `.rail3`; a card on a phone): each
 *  of the period's videos. No month chart and no tile row. */
function Facts({ page, data }: { page: ConvPage; data: MarketData }) {
  const { panel } = page
  const base = panel.groupBase ?? null
  const weeks = page.weeks.length > 0 ? page.weeks : null
  const of = (x: number | null | undefined) => (x != null ? <> · <span data-copy="level">of {fmtInt(x)}</span></> : null)
  return (
    // From 640 the rail's box reaches 8px past its column each side, so a
    // group row's hover ground (the boards' `.conv`, 8px outside its text)
    // stays inside it; the text keeps the column's edge.
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col sm:-mx-2 sm:px-2 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-[18px] max-sm:pt-4 max-sm:pb-1.5 max-sm:shadow-card">
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      {weeks ? (
        <div className={FACT}>
          <Label>Week by week · videos</Label>
          {/* The newest week in the accent only where the check flagged it. */}
          <SpikeBars weeks={weeks} counts="all" size="rail" ghost highlightLast={Boolean(panel.flag)} className="max-w-[300px]" label={`${panel.label}, category videos a week`} />
          <p className="m-0 text-[12.5px] text-muted-foreground">
            {page.week ? <><span data-copy="figure">{fmtInt(page.week.k)}</span> this week</> : null}
            {page.week && page.month ? ' · ' : null}
            {page.month ? <><span data-copy="figure">{fmtInt(page.month.k)}</span> {data.week?.inMonth ?? `in ${data.month.text}`}</> : null}
          </p>
        </div>
      ) : null}
      <div className={FACT}>
        <Label>Who it’s about</Label>
        {data.brands !== 'counted'
          ? <p className="m-0 text-[13px] text-muted-foreground">{data.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
          : panel.who ? <WhoLine parts={panel.who.parts} data={data} /> : <p className="m-0 text-[13px] text-muted-foreground">No video read for who it is about.</p>}
      </div>
      <div className={FACT}>
        <Label>What people did{panel.doing ? of(panel.doing.n) : null}</Label>
        {panel.doing
          ? panel.doing.rows.map((r) => <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} className="text-[13px]" />)
          : <p className="m-0 text-[13px] text-muted-foreground">Not read yet.</p>}
      </div>
      <div className={FACT}>
        {/* Each group's videos of the conversation's in the period, the base
            in the label; Pass E's names alone where they were not counted. */}
        <Label>Who’s saying it{base ? of(base.n) : null}</Label>
        {panel.groups.length > 0
          ? <GroupRows groups={panel.groups} n={base?.n ?? null} />
          : <p className="m-0 text-[13px] text-muted-foreground">{base ? noGroupSaying(base.text) : 'Not linked to a group.'}</p>}
      </div>
      <div className={FACT}>
        <Label>Where{panel.platforms ? of(panel.platforms.n) : null}</Label>
        {panel.platforms
          ? panel.platforms.rows.map((r) => <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(panel.platforms!.n)}`} className="text-[13px]" />)
          : <p className="m-0 text-[13px] text-muted-foreground">No video counted by platform yet.</p>}
      </div>
    </aside>
  )
}

/** "Other conversations in {subject}": small cards from 640, a two-line list
 *  on a phone, then the whole subject. */
function Siblings({ s, data }: { s: ConvSiblings; data: MarketData }) {
  const week = data.period === 'week'
  const title = s.parent ? `Other conversations in ${s.parent.name}` : `Other conversations ${whenOf(data)}`
  const whole = s.parent ? <Link href={s.parent.href} className={OLINK}>{s.parent.name}, the whole subject →</Link> : null
  const monthWords = data.week?.inMonth ?? `in ${data.month.text}`
  return (
    <>
      <div className="max-sm:hidden"><SectionHead title={title} note={whole} /></div>
      {s.items.length === 0 ? (
        <div className={cn(CARD, 'gap-2')}>
          <h2 className="m-0 text-[17px] font-semibold sm:hidden">{title}</h2>
          <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">No other conversation {s.parent ? `in ${s.parent.name} ` : ''}{whenOf(data)}.</p>
          <div className="sm:hidden">{whole}</div>
        </div>
      ) : (
        <>
          <nav aria-label={title} className="grid grid-cols-2 gap-3 max-sm:hidden min-[1180px]:grid-cols-4">
            {s.items.map((c) => (
              <Link key={c.id} href={c.href} data-sibling="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-4 pt-3.5 pb-[13px] no-underline shadow-card transition-shadow hover:shadow-panel">
                <span data-copy="subject" data-slot="pass_b_theme" className="text-[14px] leading-[1.35] font-semibold text-foreground">{c.label}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {c.count != null ? <><span data-copy="figure" className="font-mono text-foreground">{fmtInt(c.count)}</span> {week ? 'this week' : monthWords}</> : null}
                  {week && c.month != null ? <> · <span data-copy="figure" className="font-mono text-foreground">{fmtInt(c.month)}</span> {monthWords}</> : null}
                </span>
              </Link>
            ))}
          </nav>
          <section aria-label={title} className={cn(CARD, 'gap-3 sm:hidden')}>
            <div>
              <h2 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">{week ? `This week, then ${data.month.text}` : `Videos ${monthWords}`}</p>
            </div>
            <div className="flex flex-col">
              {s.items.map((c) => (
                <div key={c.id} data-phone-sibling="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
                  <Link href={c.href} className="min-w-0 text-[14px] font-medium text-foreground no-underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                  <span className="text-right font-mono text-[13.5px] tabular-nums">{c.count != null ? <span data-copy="figure">{fmtInt(c.count)}</span> : null}</span>
                  {week && c.month != null ? <span className="col-span-2 text-[12.5px] text-muted-foreground"><span data-copy="figure" className="font-mono text-foreground">{fmtInt(c.month)}</span> {monthWords}</span> : null}
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
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        {ev ? <Said ev={ev} data={data} /> : <div />}
        <Facts page={page} data={data} />
      </div>
      {page.siblings ? <Siblings s={page.siblings} data={data} /> : null}
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">Ask about these videos and what people said under them, in your own words.</p>
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </section>
      {/* On a phone the Agent closes the page, full width (F3-Market-Conversation-Phone). */}
      <Link href={panel.askHref} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
    </>
  )
}
