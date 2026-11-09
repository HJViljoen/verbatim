import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { CARD, EmptyBox, FlagChip, GoLink, translationLine, type StatItem } from '@/components/v2'
import { CHIP, GO, QUOTE, ROW, TBL, TD } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import { WHERE_NAMED_ID } from '@/lib/pages/v2/products-address'
import {
  PRODUCT_VIDEO_COMMENTS_MAX, PRODUCT_VIDEO_QUOTES, PRODUCT_VIDEO_QUOTES_PHONE, PRODUCT_VIDEOS_SHOWN_PHONE,
  type NamedComment, type NamedVideo, type ProductEvidence, type ProductPage, type ProductsLevelData,
} from '@/lib/pages/v2/products-levels'
import { prevMonth } from '@/lib/reading/month-key'
import { monthTerm } from '@/lib/reading/month-label'
import { cn } from '@/lib/utils'
import { AskCard, Block, GAPLINE, GroupsBlockView, inWords, KindsBlock, MonthTable, of, PlatformsBlockView, QUIETLINE, SubjectsBlock } from './level-parts'

// A PRODUCT'S PAGE, THE EVIDENCE (G4-Products-Product, 17 Oct; since the
// audit design, 7 Nov, drawn to Products-Product.dc.html). Lighter than its
// category's and led by where it was named, so the two never look alike: the
// figures row (`productStats`), the one line in code's words, then "Where it
// was named", one tile per video naming it this month (the most comments
// naming it first), each with up to three of those comments (two on a
// phone), the video's own words noted where they name it (said once above
// the tiles where every video is named only so), an own post marked with the
// line that its comments count and its own words never do; beside it, 1.65
// to 1, the facts in one tile (its place in its category and month by month
// as tables, what people did, what it's about, who's talking, where), and its
// siblings as one table; the Agent.
//
// "Show all" and "Show the other N videos" are addresses (`?video=`,
// `?videos=all`), so they work without client code.

/** Why a counted comment may not print: the root's words for the gate. */
export const NONE_QUOTABLE = 'None of the comments naming it can be quoted here.'
/** A video counted because its own words name the product. */
export const NAMED_IN_VIDEO_ONLY = 'Named in the video itself, with no comment naming it.'
/** An own post's line (the basis, said where it applies). */
export const OWN_POST_NOTE = 'The comments on your posts count here. What the post itself says never does.'
/** A quiet month's facts. */
export const QUIET_FACT = 'Nothing to read in a quiet month.'
/** Opened: the comments naming it that are counted and not printed, said
 *  once under the list (the root's words for the gate: "quoted here"). */
export const namedNotQuoted = (n: number): string => `The other ${n === 1 ? 'one is' : `${fmtInt(n)} are`} counted, not quoted here.`

/**
 * "Show all 14 comments" where every comment naming it may print; else "Show
 * 9 of 14 comments", what the list it opens draws of the count the card
 * states, the first `PRODUCT_VIDEO_COMMENTS_MAX` where more may print. Never
 * "all" of a number smaller than the card's own (Market's `showCommentsOf`).
 * Pure.
 */
export function showNamedOf(v: Pick<NamedVideo, 'quotable' | 'named'>): { shown: number; of: number | null } {
  const shown = Math.min(v.quotable, PRODUCT_VIDEO_COMMENTS_MAX)
  return { shown, of: shown < v.named ? v.named : null }
}

/**
 * Under an opened list, once: where the cap cut it, how many of the ones that
 * may print it draws ("The first 50 of the 120 that can be quoted are shown;
 * 8 more are counted, not quoted here."); else the counted ones it does not
 * print (`namedNotQuoted`); null where it draws every comment counted. Pure.
 */
export function openedNamedNote(v: Pick<NamedVideo, 'quotable' | 'named'>): string | null {
  const unquoted = Math.max(0, v.named - v.quotable)
  if (v.quotable > PRODUCT_VIDEO_COMMENTS_MAX) {
    return `The first ${fmtInt(PRODUCT_VIDEO_COMMENTS_MAX)} of the ${fmtInt(v.quotable)} that can be quoted are shown${unquoted > 0 ? `; ${fmtInt(unquoted)} more ${unquoted === 1 ? 'is' : 'are'} counted, not quoted here` : ''}.`
  }
  return unquoted > 0 ? namedNotQuoted(unquoted) : null
}

// ---- The figures row ---------------------------------------------------------------

const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>

/** The figures row (the board's three cells, a fourth where comments name
 *  it): the month (`monthTerm`), the videos naming it of the market's, of its
 *  category's, and how many comments name it. A quiet month says "No video";
 *  a page that reads no month, only the month where it has one. Pure. */
export function productStats(data: ProductsLevelData): StatItem[] {
  const base = data.base
  const p = data.product
  const reads = base.state === 'ready' || base.state === 'unread'
  const cells: StatItem[] = reads ? [{ key: 'month', term: monthTerm(base.monthLabel), value: base.monthWords }] : []
  if (!p || base.state !== 'ready') return cells
  if (!p.videos) {
    cells.push({ key: 'named', term: 'Named in', value: p.videos === 0 ? 'No video' : 'Not read yet' })
    return cells
  }
  cells.push({ key: 'named', term: 'Named in', value: <>{p.market != null ? lv(p.videos, p.market) : <span data-copy="figure">{fmtInt(p.videos)}</span>} {p.videos === 1 && p.market == null ? 'video' : 'videos'}</> })
  if (p.categoryVideos != null) cells.push({ key: 'category', term: 'Of the category', value: <>{lv(p.videos, p.categoryVideos)} about {p.groupName.toLowerCase()}</> })
  if (p.comments) cells.push({ key: 'comments', term: 'Comments naming it', value: <span data-copy="figure">{fmtInt(p.comments)}</span> })
  return cells
}

// ---- The lead ------------------------------------------------------------------------

function Lead({ page }: { page: ProductPage }) {
  return (
    <div data-product-lead="" className="flex flex-col gap-3">
      <p className="m-0 max-w-[1000px] text-[22px] leading-[1.45] font-medium text-foreground max-sm:text-[19px]">{page.lead}</p>
      {page.flag ? <div><FlagChip verdict={page.flag} /></div> : null}
    </div>
  )
}

// ---- Where it was named --------------------------------------------------------------

/** One comment naming it: the commenter's words, its language line and its
 *  English where it has them, and its date (the platform is the video's). */
function Comment({ c, hideOnPhone }: { c: NamedComment; hideOnPhone: boolean }) {
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

/** The video's line under its account: "TikTok, posted 14 Oct"; where it
 *  was posted before the month, that people commented on it in the month,
 *  which is why it is counted there ("posted 29 Sep, commented on in
 *  October": a month is dated by the comment); and where its own words name
 *  it as well as comments do, "named in the video". */
function videoMeta(v: NamedVideo, monthName: string): string {
  const parts = [
    v.platform,
    v.posted ? `posted ${v.posted}` : null,
    v.postedBefore ? `commented on in ${monthName}` : null,
    v.inVideo && v.named > 0 && !v.owned ? 'named in the video' : null,
  ].filter(Boolean)
  return parts.join(', ')
}

/** One video naming the product (the board's tile): its account as the
 *  heading and "Watch the video on TikTok" beside it, its caption in up to
 *  seven lines (the most Products-Product.dc.html draws at 1440; the
 *  real-data pass, 8 Nov: a YouTube description runs to 70 lines, and a long
 *  link breaks inside the card),
 *  how many comments name it, those comments, "Show all". `onceSaid`: the
 *  page has said every video was named only in its own words. */
function VideoCard({ v, index, all, brand, onceSaid, monthName }: { v: NamedVideo; index: number; all: boolean; brand: string; onceSaid: boolean; monthName: string }) {
  const deskMore = !v.open && v.quotable > PRODUCT_VIDEO_QUOTES
  const phoneMore = !v.open && v.quotable > PRODUCT_VIDEO_QUOTES_PHONE
  const show = showNamedOf(v)
  const note = v.open ? openedNamedNote(v) : null
  const where = v.owned ? 'post' : 'video'
  const meta = videoMeta(v, monthName)
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3', !all && !v.open && index >= PRODUCT_VIDEOS_SHOWN_PHONE ? 'max-sm:hidden' : null)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="m-0 min-w-0 text-[17px] leading-[1.35] font-semibold text-foreground">{v.owned ? brand : v.account || 'Unnamed account'}</h3>
            {v.owned ? <BrandChip who="you" plain className="text-[13px] font-semibold text-you">Your post</BrandChip> : null}
          </div>
          {meta ? <p className="m-0 mt-0.5 text-[14px] leading-[1.4] text-muted-foreground">{meta}</p> : null}
        </div>
        {v.url ? <GoLink href={v.url} external>{`Watch the ${where}${v.platform ? ` on ${v.platform}` : ''}`}</GoLink> : null}
      </div>
      {v.caption ? <p data-copy="quote" data-video-caption="" className="m-0 line-clamp-7 text-[15px] leading-[1.6] text-foreground [overflow-wrap:anywhere]">{v.caption}</p> : null}
      {v.named === 0
        ? (onceSaid ? null : <p className="m-0 text-[14px] text-secondary-foreground">{NAMED_IN_VIDEO_ONLY}</p>)
        : (
          <p className="m-0 text-[14px] text-secondary-foreground">
            {v.total != null
              ? <><span data-copy="level"><b className="font-semibold tabular-nums text-foreground">{fmtInt(v.named)}</b> {v.named === 1 ? 'comment names' : 'comments name'} it, of {fmtInt(v.total)}</span> on the {where}</>
              : <><b data-copy="figure" className="font-semibold tabular-nums text-foreground">{fmtInt(v.named)}</b> {v.named === 1 ? 'comment names' : 'comments name'} it</>}
          </p>
        )}
      {v.owned ? <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">{OWN_POST_NOTE}</p> : null}
      {v.quotes.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-[18px] py-0.5 max-sm:px-3.5">
          {v.quotes.map((c, i) => <Comment key={c.key} c={c} hideOnPhone={!v.open && i >= PRODUCT_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.named > 0 ? <p className="m-0 rounded-[10px] bg-inner px-[18px] py-3 text-[14px] text-secondary-foreground">{NONE_QUOTABLE}</p> : null}
      {note ? <p className="m-0 text-[13.5px] text-muted-foreground">{note}</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className={GO}>Show fewer comments</Link></div>
      ) : deskMore || phoneMore ? (
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

/** A column's head (the board's `.h2row`): its title and its note. */
function ColHead({ id, title, note }: { id: string; title: string; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-0.5">
      <h2 id={id} className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{title}</h2>
      {note ? <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/** Every video was named only in its own words: said once, above the tiles
 *  ("All three named it in the video itself, with no comment naming it."). */
export function inVideoOnlyLine(total: number): ReactNode {
  const who = total === 1 ? 'It was' : total === 2 ? 'Both' : <>All {inWords(total)}</>
  return <>{who} named it in the video itself, with no comment naming it.</>
}

const allInVideoOnly = (ev: ProductEvidence): boolean => ev.state === 'ready' && ev.total > 0 && ev.inVideoOnly === ev.total

/** "Where it was named": the head and its note, the line said once where it
 *  holds for every video, the tiles, then what remains. The dashed box where
 *  nothing named it. */
function WhereNamed({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const ev = page.evidence
  const monthWords = d.base.monthWords
  const prevName = longMonth(prevMonth(d.base.month))
  const onceSaid = allInVideoOnly(ev)
  return (
    <section id={WHERE_NAMED_ID} aria-labelledby="named-title" className="flex min-w-0 scroll-mt-6 flex-col gap-5 max-sm:gap-4">
      <div className="flex flex-col gap-2.5">
        <ColHead id="named-title" title="Where it was named" note={ev.total > 0 ? <><span data-copy="figure">{fmtInt(ev.total)}</span> {ev.total === 1 ? 'video' : 'videos'} in {monthWords}, most comments naming it first</> : `No video in ${monthWords}`} />
        {onceSaid ? <p data-in-video-only="" className="m-0 px-0.5 text-[14.5px] leading-[1.5] text-secondary-foreground">{ev.total === 1 ? NAMED_IN_VIDEO_ONLY : inVideoOnlyLine(ev.total)}</p> : null}
      </div>
      {ev.total === 0 ? (
        <div data-named-none="" className={cn(CARD, 'gap-3.5')}>
          <EmptyBox>No video named it in {monthWords}.{page.prev ? <> {page.prev === 1 ? 'One' : <span data-copy="figure">{fmtInt(page.prev)}</span>} did in {prevName}.</> : null}</EmptyBox>
          {page.prevHref ? <GoLink href={page.prevHref} className="self-start">See {prevName}</GoLink> : null}
        </div>
      ) : ev.state === 'unread' ? (
        <div data-named-unread="" className={CARD}><p className={GAPLINE}>Its videos could not be read just now.</p></div>
      ) : (
        <>
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} all={ev.all} brand={d.base.client} onceSaid={onceSaid} monthName={longMonth(d.base.month)} />)}
          {ev.capped != null ? <p className="m-0 text-[13.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(ev.capped)}</span> of <span data-copy="figure">{fmtInt(ev.total)}</span> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-start font-semibold no-underline max-sm:hidden')}>Show the other <span data-copy="figure" className="mx-1">{fmtInt(ev.more.desktop)}</span> {ev.more.desktop === 1 ? 'video' : 'videos'}</Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(CHIP, 'self-stretch justify-center font-semibold no-underline sm:hidden')}>Show the other <span data-copy="figure" className="mx-1">{fmtInt(ev.more.phone)}</span> {ev.more.phone === 1 ? 'video' : 'videos'}</Link> : null}
          {ev.fewerHref ? <Link href={ev.fewerHref} className={cn(GO, 'self-start')}>Show fewer videos</Link> : null}
        </>
      )}
    </section>
  )
}

// ---- The facts -----------------------------------------------------------------------

/** Its place in its category, as the board's table: the product, your other
 *  products, one of yours but not which, the category in general. */
function Place({ page }: { page: ProductPage }) {
  const p = page.place
  if (!p) return <p className={QUIETLINE}>Not read for this month yet.</p>
  const rows = [
    { key: 'product', label: page.name, k: p.product, own: true },
    { key: 'others', label: `Your other ${page.groupName.toLowerCase()}`, k: p.others, own: false },
    { key: 'unclear', label: 'One of yours, not which', k: p.unclear, own: false },
    { key: 'general', label: `${page.groupName} in general`, k: p.general, own: false },
  ]
  return (
    <table className={cn(TBL, 'text-[14.5px]')}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key} data-place={r.key}>
            <th scope="row" className={cn(TD, i === 0 ? 'border-t-0' : null, 'text-left', r.own ? 'font-semibold' : 'font-normal')}>{r.label}</th>
            <td className={cn(TD, i === 0 ? 'border-t-0' : null, 'pr-0 pl-3.5 text-right tabular-nums', r.own ? 'font-semibold' : null)}><span data-copy="figure">{fmtInt(r.k)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** "The facts", one tile (the board's): each block under its own head, a
 *  hairline between. */
function Facts({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const quiet = page.videos === 0
  const c = page.crosses
  const n = c?.n ?? page.videos ?? 0
  const when = `in ${d.base.monthWords}`
  const blocks: { key: string; label: ReactNode; body: ReactNode }[] = [
    { key: 'place', label: <>Its place in {page.groupName}{page.place ? <>, {of(page.place.n)}</> : null}</>, body: <Place page={page} /> },
    { key: 'months', label: 'Month by month, share naming it', body: <MonthTable line={page.line} mode="product" rail /> },
    // A quiet month holds nothing for the four blocks drawn from its videos:
    // they are named once, and the month's line said once in the dashed box
    // (decision 4; the review of Phases 4 and 5), never four times.
    ...(quiet
      ? [{ key: 'quiet', label: 'What people did, what it’s about, who’s talking and where', body: <div data-quiet-facts=""><EmptyBox>{QUIET_FACT}</EmptyBox></div> }]
      : [
          { key: 'kinds', label: <>What people did{c ? <>, {of(n)}</> : null}</>, body: <KindsBlock crosses={c} rail /> },
          { key: 'subjects', label: <>What it’s about{c ? <>, {of(n)}</> : null}</>, body: <SubjectsBlock rows={page.subjects} crosses={c} n={n} rail /> },
          { key: 'groups', label: <>Who’s talking{page.groups.state === 'ready' ? <>, {of(page.groups.n)}</> : null}</>, body: <GroupsBlockView block={page.groups} when={when} /> },
          { key: 'where', label: <>Where{page.platforms ? <>, {of(page.platforms.n)}</> : null}</>, body: <PlatformsBlockView block={page.platforms} rail /> },
        ]),
  ]
  return (
    <section aria-labelledby="facts-title" className="flex min-w-0 flex-col gap-5">
      <ColHead id="facts-title" title="The facts" />
      <div className={cn(CARD, 'gap-6')}>
        {blocks.map((b, i) => <Block key={b.key} label={b.label} className={i > 0 ? 'border-t border-track pt-6' : undefined}>{b.body}</Block>)}
      </div>
    </section>
  )
}

/** A sibling's month in words: its videos, quiet, or not read. */
function SiblingCount({ videos, monthWords }: { videos: number | null; monthWords: string }) {
  if (videos == null) return <span className="text-muted-foreground">Not read yet</span>
  if (videos === 0) return <span className="text-muted-foreground">Quiet in {monthWords}</span>
  return <><span data-copy="figure">{fmtInt(videos)}</span> {videos === 1 ? 'video' : 'videos'} in {monthWords}</>
}

/** "Your other {category}": one table (the board's), then the whole
 *  category. */
function Siblings({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const title = `Your other ${page.groupName.toLowerCase()}`
  const categoryHref = d.crumbs?.[1]?.href ?? null
  return (
    <section aria-label={title} className={cn(CARD, 'gap-3.5')}>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h3>
      {page.siblings.length === 0 ? (
        <p className={GAPLINE}>No other product in {page.groupName}.</p>
      ) : (
        <table className={cn(TBL, 'text-[14.5px]')}>
          <tbody>
            {page.siblings.map((s, i) => (
              <tr key={s.id} data-sibling="">
                <th scope="row" className={cn(TD, i === 0 ? 'border-t-0' : null, 'text-left font-semibold')}><Link href={s.href} className={ROW}>{s.name}</Link></th>
                <td className={cn(TD, i === 0 ? 'border-t-0' : null, 'pr-0 pl-3.5 text-right')}><SiblingCount videos={s.videos} monthWords={d.base.monthWords} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {categoryHref ? <GoLink href={categoryHref} className="self-start">{page.groupName}, the whole category</GoLink> : null}
    </section>
  )
}

/** The product's body under its title block, in the board's order. */
export function ProductPageBody({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-7 min-[1180px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <WhereNamed page={page} d={d} />
        <div className="flex min-w-0 flex-col gap-5">
          <Facts page={page} d={d} />
          <Siblings page={page} d={d} />
        </div>
      </div>
      <AskCard line={`Ask about these videos and what people said about the ${page.name}, in your own words.`} ask="Ask the Agent about this" askHref={page.askHref} settings="Edit its names in Settings" settingsHref={page.settingsHref} />
    </>
  )
}
