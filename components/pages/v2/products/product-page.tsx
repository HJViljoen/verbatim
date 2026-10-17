import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { PlayGlyph } from '@/components/shell/level-glyphs'
import { CARD, FlagChip } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { WHERE_NAMED_ID } from '@/lib/pages/v2/products-address'
import {
  PRODUCT_VIDEO_QUOTES, PRODUCT_VIDEO_QUOTES_PHONE, PRODUCT_VIDEOS_SHOWN_PHONE,
  type NamedComment, type NamedVideo, type ProductPage, type ProductsLevelData,
} from '@/lib/pages/v2/products-levels'
import { prevMonth } from '@/lib/reading/month-key'
import { cn } from '@/lib/utils'
import { Label, OLINK } from '@/components/pages/v2/market/parts'
import { AskCard, GroupsBlockView, KindsBlock, MonthBars, of, PlatformsBlockView, QUIETLINE, SectionHead, SubjectsBlock } from './level-parts'

// A PRODUCT'S PAGE, THE EVIDENCE (G4-Products-Product, 17 Oct). Lighter than
// its category's and led by where it was named, so the two never look alike:
// the one line in code's words with a hairline under it, then "Where it was
// named", one card per video naming it this month (the most comments naming
// it first), each with up to three of those comments (two on a phone), the
// video's own words marked where they name it, an own post marked with the
// line that its comments count and its own words never do; the facts beside
// it, small (its place in its category, month by month, what people did,
// what it's about, who's talking, where); its siblings; the Agent.
//
// "Show all" and "Show the other N videos" are addresses (`?video=`,
// `?videos=all`), so they work without client code.

const FACT = 'flex min-w-0 flex-col gap-[9px] border-t border-border py-4 first-of-type:border-t-0 first-of-type:pt-2'
/** Why a counted comment may not print: the root's words for the gate. */
export const NONE_QUOTABLE = 'None of the comments naming it can be quoted here.'
/** A video counted because its own words name the product. */
export const NAMED_IN_VIDEO_ONLY = 'Named in the video itself, with no comment naming it.'
/** An own post's line (the basis, said where it applies). */
export const OWN_POST_NOTE = 'The comments on your posts count here. What the post itself says never does.'
/** A quiet month's facts. */
export const QUIET_FACT = 'Nothing to read in a quiet month.'

function Lead({ page }: { page: ProductPage }) {
  return (
    <div data-product-lead="" className="-mt-0.5 flex flex-col gap-3 border-b border-border pb-[22px] max-sm:gap-2.5 max-sm:pb-4">
      <p className="m-0 max-w-[820px] text-[21px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[18px]">{page.lead}</p>
      {page.flag ? <div><FlagChip verdict={page.flag} /></div> : null}
    </div>
  )
}

function Comment({ c, hideOnPhone }: { c: NamedComment; hideOnPhone: boolean }) {
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

/** "Named in the video" (G4's `.named`). */
function NamedChip({ className }: { className?: string }) {
  return <span data-named-in-video="" className={cn('inline-flex items-center whitespace-nowrap rounded-[6px] bg-inner px-2 py-[3px] text-[12px] leading-[1.3] text-foreground ring-1 ring-border ring-inset', className)}>Named in the video</span>
}

const LINKISH = 'text-[13.5px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline'

/** One video naming the product (G4's `.vcard`). */
function VideoCard({ v, index, all, brand }: { v: NamedVideo; index: number; all: boolean; brand: string }) {
  const deskMore = !v.open && v.quotable > PRODUCT_VIDEO_QUOTES
  const phoneMore = !v.open && v.quotable > PRODUCT_VIDEO_QUOTES_PHONE
  const where = v.owned ? 'post' : 'video'
  return (
    <article id={`video-${v.id}`} data-video-card="" className={cn(CARD, 'scroll-mt-6 gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', !all && !v.open && index >= PRODUCT_VIDEOS_SHOWN_PHONE ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-foreground"><PlayGlyph className="size-[15px]" /></span>
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] leading-[1.3] font-semibold text-foreground">{v.owned ? brand : v.account || 'Unnamed account'}</span>
          <span className="block text-[12.5px] leading-[1.35] text-muted-foreground">{[v.platform, v.posted ? `posted ${v.posted}` : null].filter(Boolean).join(' · ')}</span>
        </div>
        {v.owned ? <BrandChip who="you" className="ml-auto px-2 py-[3px] text-[12px]">Your post</BrandChip> : v.inVideo ? <NamedChip className="ml-auto max-sm:hidden" /> : null}
      </div>
      {v.caption ? <p data-copy="quote" className="m-0 truncate text-[14.5px] leading-[1.5] text-secondary-foreground">{v.caption}</p> : null}
      {v.inVideo && !v.owned ? <div className="sm:hidden"><NamedChip /></div> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {v.named === 0
          ? <span>{NAMED_IN_VIDEO_ONLY}</span>
          : v.total != null
            ? <span><span data-copy="level"><b className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.named)}</b> {v.named === 1 ? 'comment names' : 'comments name'} it, of {fmtInt(v.total)}</span> on the {where}</span>
            : <span><b data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(v.named)}</b> {v.named === 1 ? 'comment names' : 'comments name'} it</span>}
        {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">Watch the video ↗</a> : null}
      </div>
      {v.owned ? <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">{OWN_POST_NOTE}</p> : null}
      {v.quotes.length > 0 ? (
        <div data-video-comments="" className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
          {v.quotes.map((c, i) => <Comment key={c.key} c={c} hideOnPhone={!v.open && i >= PRODUCT_VIDEO_QUOTES_PHONE} />)}
        </div>
      ) : v.named > 0 ? <p className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[13.5px] text-muted-foreground">{NONE_QUOTABLE}</p> : null}
      {v.open && v.quotable > v.quotes.length ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(v.quotes.length)}</span> of the <span data-copy="figure">{fmtInt(v.quotable)}</span> that can be quoted are shown.</p> : null}
      {v.open ? (
        <div><Link href={v.href} scroll={false} className={LINKISH}>Show fewer comments</Link></div>
      ) : deskMore || phoneMore ? (
        <div className={cn(!deskMore ? 'sm:hidden' : null, !phoneMore ? 'max-sm:hidden' : null)}>
          <Link href={v.href} scroll={false} className={LINKISH}>Show all <span data-copy="figure">{fmtInt(v.quotable)}</span> comments</Link>
        </div>
      ) : null}
    </article>
  )
}

const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** "Where it was named": the head and its note, the cards, then what
 *  remains. A frame and one line where nothing named it. */
function WhereNamed({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const ev = page.evidence
  const monthWords = d.base.monthWords
  const prevName = longMonth(prevMonth(d.base.month))
  return (
    <section id={WHERE_NAMED_ID} aria-labelledby="named-title" className="flex min-w-0 scroll-mt-6 flex-col gap-4 max-sm:gap-3.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        <h2 id="named-title" className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">Where it was named</h2>
        <span className="text-[13px] leading-[1.4] text-muted-foreground">
          {ev.total > 0 ? <><span data-copy="figure">{fmtInt(ev.total)}</span> {ev.total === 1 ? 'video' : 'videos'} in {monthWords}, most comments naming it first</> : `No video in ${monthWords}`}
        </span>
      </div>
      {ev.total === 0 ? (
        <div data-named-none="" className={cn(CARD, 'gap-2.5')}>
          <p className="m-0 flex items-center gap-2.5 text-[14.5px] leading-[1.5] text-secondary-foreground">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-[6px] ring-1 ring-border text-muted-foreground"><PlayGlyph className="size-3" /></span>
            <span>No video named it in {monthWords}.{page.prev ? <> {page.prev === 1 ? 'One' : <span data-copy="figure">{fmtInt(page.prev)}</span>} did in {prevName}.</> : null}</span>
          </p>
          {page.prevHref ? <Link href={page.prevHref} className={OLINK}>See {prevName} →</Link> : null}
        </div>
      ) : ev.state === 'unread' ? (
        <div data-named-unread="" className={cn(CARD, 'gap-2')}><p className="m-0 text-[15px] text-muted-foreground">Its videos could not be read just now.</p></div>
      ) : (
        <>
          {ev.videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} all={ev.all} brand={d.base.client} />)}
          {ev.capped != null ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(ev.capped)}</span> of <span data-copy="figure">{fmtInt(ev.total)}</span> are listed.</p> : null}
          {ev.more && ev.more.desktop > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-start max-sm:hidden')}><span>Show the other <span data-copy="figure">{fmtInt(ev.more.desktop)}</span> {ev.more.desktop === 1 ? 'video' : 'videos'}</span></Link> : null}
          {ev.more && ev.more.phone > 0 ? <Link href={ev.more.href} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show the other <span data-copy="figure">{fmtInt(ev.more.phone)}</span> {ev.more.phone === 1 ? 'video' : 'videos'}</span></Link> : null}
          {ev.fewerHref ? <Link href={ev.fewerHref} className={cn(LINKISH, 'self-start')}>Show fewer videos</Link> : null}
        </>
      )}
    </section>
  )
}

/** Its place in its category: one bar of four parts, the key under it. */
function Place({ page }: { page: ProductPage }) {
  const p = page.place
  const word = page.groupName.toLowerCase()
  if (!p) return <p className={QUIETLINE}>Not read for this month yet.</p>
  const parts = [
    { key: 'product', label: page.name, k: p.product, swatch: 'bg-you' },
    { key: 'others', label: `Your other ${word}`, k: p.others, swatch: 'bg-you/55' },
    { key: 'unclear', label: 'One of yours, not which', k: p.unclear, swatch: 'bg-you/20' },
    { key: 'general', label: `${page.groupName} in general`, k: p.general, swatch: 'bg-border' },
  ]
  return (
    <>
      <div role="img" aria-label={`Of the ${fmtInt(p.n)} videos about ${word}: ${fmtInt(p.product)} name ${page.name}, ${fmtInt(p.others)} name another of your ${word}, ${fmtInt(p.unclear)} are about one of yours but not which, ${fmtInt(p.general)} are about ${word} in general.`} className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-track">
        {p.n > 0 ? parts.filter((x) => x.k > 0).map((x) => <i key={x.key} className={cn('block h-full', x.swatch)} style={{ width: `${(100 * x.k) / p.n}%` }} />) : null}
      </div>
      {parts.map((x) => (
        <div key={x.key} className="grid grid-cols-[12px_minmax(0,1fr)_30px] items-center gap-2 text-[13px]">
          <span aria-hidden className={cn('size-2.5 rounded-[2px]', x.swatch)} />
          <span className="min-w-0">{x.label}</span>
          <span data-copy="figure" className="text-right font-mono text-[12px] tabular-nums">{fmtInt(x.k)}</span>
        </div>
      ))}
    </>
  )
}

/** "The facts", small, on the page (G4's `.rail3`; a card on a phone). */
function Facts({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const quiet = page.videos === 0
  const c = page.crosses
  const n = c?.n ?? page.videos ?? 0
  const word = page.groupName.toLowerCase()
  const when = `in ${d.base.monthWords}`
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col sm:-mx-2 sm:px-2 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-[18px] max-sm:pt-4 max-sm:pb-1.5 max-sm:shadow-card">
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      <div className={FACT}>
        <Label>Its place in {word}{page.place ? <> · {of(page.place.n)}</> : null}</Label>
        <Place page={page} />
      </div>
      <div className={FACT}>
        <Label>Month by month · share naming it</Label>
        <div className="max-w-[260px]"><MonthBars line={page.line} name={page.name} mode="product" size="sm" /></div>
      </div>
      <div className={FACT}>
        <Label>What people did{!quiet && c ? <> · {of(n)}</> : null}</Label>
        {quiet ? <p className={QUIETLINE}>{QUIET_FACT}</p> : <KindsBlock crosses={c} rail />}
      </div>
      <div className={FACT}>
        <Label>What it’s about{!quiet && c ? <> · {of(n)}</> : null}</Label>
        {quiet ? <p className={QUIETLINE}>{QUIET_FACT}</p> : <SubjectsBlock rows={page.subjects} crosses={c} n={n} rail />}
      </div>
      <div className={FACT}>
        <Label>Who’s talking{!quiet && page.groups.state === 'ready' ? <> · {of(page.groups.n)}</> : null}</Label>
        {quiet ? <p className={QUIETLINE}>{QUIET_FACT}</p> : <GroupsBlockView block={page.groups} when={when} />}
      </div>
      <div className={FACT}>
        <Label>Where{!quiet && page.platforms ? <> · {of(page.platforms.n)}</> : null}</Label>
        {quiet ? <p className={QUIETLINE}>{QUIET_FACT}</p> : <PlatformsBlockView block={page.platforms} rail />}
      </div>
    </aside>
  )
}

/** A sibling's month in words: its videos, quiet, or not read. */
function SiblingCount({ videos, monthWords, phone = false }: { videos: number | null; monthWords: string; phone?: boolean }) {
  if (videos == null) return <>Not read yet</>
  if (videos === 0) return <>{phone ? 'Quiet so far' : `Quiet in ${monthWords}`}</>
  return phone ? <span data-copy="figure" className="font-mono text-[13.5px] text-foreground">{fmtInt(videos)}</span> : <><span data-copy="figure" className="font-mono text-foreground">{fmtInt(videos)}</span> {videos === 1 ? 'video' : 'videos'} in {monthWords}</>
}

/** "Your other {category}": small cards from 640, a list on a phone, then
 *  the whole category. */
function Siblings({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  const word = page.groupName.toLowerCase()
  const title = `Your other ${word}`
  const categoryHref = d.crumbs?.[1]?.href ?? null
  const whole = categoryHref ? <Link href={categoryHref} className={OLINK}>{page.groupName}, the whole category →</Link> : null
  const quietWord = d.base.soFar ? 'Quiet so far' : `Quiet in ${d.base.monthName}`
  return (
    <>
      <div className="max-sm:hidden"><SectionHead title={title} note={whole} /></div>
      {page.siblings.length === 0 ? (
        <div className={cn(CARD, 'gap-2')}>
          <h2 className="m-0 text-[17px] font-semibold sm:hidden">{title}</h2>
          <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">No other product in {page.groupName}.</p>
          <div className="sm:hidden">{whole}</div>
        </div>
      ) : (
        <>
          <nav aria-label={title} className="grid grid-cols-2 gap-3 max-sm:hidden min-[1180px]:grid-cols-4">
            {page.siblings.map((s) => (
              <Link key={s.id} href={s.href} data-sibling="" className="flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-4 pt-3.5 pb-[13px] no-underline shadow-card transition-shadow hover:shadow-panel">
                <span className="text-[14px] leading-[1.35] font-semibold text-foreground">{s.name}</span>
                <span className="text-[12.5px] text-muted-foreground"><SiblingCount videos={s.videos} monthWords={d.base.monthWords} /></span>
              </Link>
            ))}
          </nav>
          <section aria-label={title} className={cn(CARD, 'gap-3 sm:hidden')}>
            <div>
              <h2 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">Videos naming each in {d.base.monthWords}</p>
            </div>
            <div className="flex flex-col">
              {page.siblings.map((s) => (
                <div key={s.id} data-phone-sibling="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-track py-[11px] first:border-t-0 first:pt-0">
                  <Link href={s.href} className="min-w-0 text-[14px] font-medium text-foreground no-underline">{s.name}</Link>
                  <span className="text-right text-[12.5px] text-muted-foreground">{s.videos === 0 ? quietWord : <SiblingCount videos={s.videos} monthWords={d.base.monthWords} phone />}</span>
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

/** The product's body under its title block, in the board's order. */
export function ProductPageBody({ page, d }: { page: ProductPage; d: ProductsLevelData }) {
  return (
    <>
      <Lead page={page} />
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <WhereNamed page={page} d={d} />
        <Facts page={page} d={d} />
      </div>
      <Siblings page={page} d={d} />
      <AskCard line={`Ask about these videos and what people said about the ${page.name}, in your own words.`} ask="Ask the Agent about this" askHref={page.askHref} settings="Edit its names in Settings" settingsHref={page.settingsHref} />
    </>
  )
}
