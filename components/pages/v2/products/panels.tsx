import Link from 'next/link'
import { FlagChip, InPlacePanel, MiniBars, PairedBars, PanelSection, PanelTitle, StatCell, StatRow, type PerBreakpoint } from '@/components/v2'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import {
  catalogueBreak, PANEL_ID, sharePct, UNCLEAR_ID,
  type CategoryPanel, type Compare, type Crosses, type LineBar, type ProductPanel, type ProductsQuote, type UnclearLine,
} from '@/lib/pages/v2/products'
import { quoteWords } from '@/lib/pages/brands'
import { cn } from '@/lib/utils'
import { AskButton, BTN, CAPS, EmptyLine, Fig, MiniRow, OLINK, PanelTag, VerdictBadge } from './parts'
import { TagControl } from './tag-control'

// THE OPEN PANELS (board E4-Products-Liners): a category's or a product's
// detail, in place under the shelf, the notch at its column (`InPlacePanel`).
// One idiom for both:
//   the head        the tag, the share of the market with its verdict (a
//                   category) or the first-month flag (a product), the title;
//   the stats       the split of the category's videos (named, couldn't tell
//                   which, in general: exclusive, so they add up), or the
//                   product's videos against the market and its category;
//   three columns   what it is about (subjects), what people did in those
//                   videos (kinds), its share of the market month by month;
//   the comparison  the client's products against their category, subject by
//                   subject, every cell k of n, every pair banded and none
//                   worded unless it clears (with a product's tens of videos,
//                   none does);
//   the words       the couldn't-tell-which list with its Tag controls (a
//                   category), or what people said naming it (a product).
//                   Quotes print here and nowhere above (Heinrich's v2 rule).

/** A section of subjects or kinds, k of the set's n. */
function CrossSection({ label, crosses, pick, empty }: { label: string; crosses: Crosses | null; pick: 'subjects' | 'kinds'; empty: string }) {
  const rows = crosses ? crosses[pick].slice(0, 6) : []
  return (
    <PanelSection label={crosses && crosses.n > 0 ? <>{label} · of <Fig>{fmtInt(crosses.n)}</Fig></> : label}>
      {rows.length > 0 && crosses
        ? rows.map((r) => <MiniRow key={r.id} size="md" label={r.label} k={r.k} of={crosses.n} tone={pick === 'subjects' ? 'market' : 'ink'} />)
        : <EmptyLine>{empty}</EmptyLine>}
    </PanelSection>
  )
}

/** Month by month, the reading month last and outlined (the board's "so far"
 *  bar): a category's share of the market, or a product's share of it with
 *  its k of n under each bar (a product's raw count would read as growth
 *  wherever the month's videos doubled). Where the list of products changed
 *  between two months, a footnote says the months before were read on the
 *  earlier list. */
function LineSection({ line, name, mode, monthName }: { line: readonly LineBar[]; name: string; mode: 'share' | 'product'; monthName: string }) {
  const changed = catalogueBreak(line)
  return (
    <PanelSection label={mode === 'share' ? 'Share of the market, month by month' : 'Share of the market naming it, month by month'}>
      {line.length > 0 ? (
        <>
          <MiniBars
            size="md"
            highlight={null}
            label={mode === 'share' ? `${name}: share of the market's videos each month` : `${name}: share of the market's videos naming it each month`}
            bars={line.map((b) => {
              const pct = b.n > 0 ? (100 * b.k) / b.n : 0
              return {
                label: b.label,
                value: pct,
                display: mode === 'share' ? sharePct(b.k, b.n) : b.k > 0 && pct < 0.05 ? 'under 0.1%' : fmtPct(pct, 1),
                sub: `${b.filling ? 'so far · ' : ''}${fmtInt(b.k)} of ${fmtInt(b.n)}`,
                filling: b.current,
              }
            })}
          />
          {changed ? (
            <p className="m-0 text-[12px] leading-[1.45] text-muted-foreground">
              Your product list changed before {longMonth(changed)}: the months before it were read on the earlier list.
            </p>
          ) : null}
        </>
      ) : <EmptyLine>No month read yet{monthName ? ` up to ${monthName}` : ''}.</EmptyLine>}
    </PanelSection>
  )
}

/** "Each count is videos …", and the one pair that clears its band, worded
 *  inside its verdict node, where one does. */
function CompareSection({ compare, title }: { compare: Compare; title: string }) {
  const cleared = compare.verdicts.filter((v) => v.state === 'moved')
  return (
    <PanelSection label={title}>
      <PairedBars
        rowHeader="What it’s about"
        columns={compare.columns}
        rows={compare.rows.map((r) => ({ key: r.key, label: r.label, cells: r.cells }))}
        label={title}
      />
      <p className="m-0 text-[12.5px] leading-[1.5] text-muted-foreground">
        Each count is videos, out of that column’s total.{' '}
        {cleared.length > 0
          ? cleared.map((v) => <span key={v.objectLabel} className="mr-2 inline-block">{v.objectLabel} <VerdictBadge verdict={v} /></span>)
          : 'Too few videos on any one product to call a difference from the category yet.'}
      </p>
    </PanelSection>
  )
}

/** One couldn't-tell-which line: the words (or the video), where and when,
 *  Watch the video, and Tag where the reader may. */
function UnclearRow({ line, options, category }: { line: UnclearLine; options: CategoryPanel['unclear']['options']; category: string }) {
  const words = line.quote ? quoteWords({ text: line.quote.text, english: line.quote.english }) : null
  return (
    <div role="listitem" className="grid grid-cols-1 items-center gap-3 border-t border-track py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <div className="min-w-0">
        {words
          ? <p data-copy="quote" lang={line.quote?.english ? 'en' : undefined} className="m-0 font-serif text-[14.5px] italic leading-[1.5] text-foreground">“{words}”</p>
          : <p className="m-0 text-[14px] leading-[1.5] text-foreground">The video itself names one of your products here.</p>}
        {line.cite ? <span className="text-[12px] text-muted-foreground">{line.cite}</span> : null}
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
        {line.watchHref ? <a href={line.watchHref} target="_blank" rel="noreferrer noopener" className={BTN}>Watch the video</a> : null}
        {options.length > 0
          ? <TagControl videoId={line.videoId} commentId={line.commentId} options={options.map((o) => ({ value: o.value, label: o.label }))} label={words ?? `a video about ${category}`} />
          : null}
      </div>
    </div>
  )
}

function UnclearSection({ panel, canTag }: { panel: CategoryPanel; canTag: boolean }) {
  const u = panel.unclear
  const category = panel.name.toLowerCase()
  if (u.videos === 0) return null
  return (
    <section id={UNCLEAR_ID} aria-label="About one of yours, but we couldn’t tell which" className="flex scroll-mt-6 flex-col gap-1">
      <p className={cn(CAPS, 'mb-1.5')}>About one of your products, but we couldn’t tell which · <Fig>{fmtInt(u.videos)}</Fig> {u.videos === 1 ? 'video' : 'videos'}</p>
      {u.lines.length > 0 ? (
        <div role="list">{u.lines.map((l) => <UnclearRow key={l.key} line={l} options={u.options} category={category} />)}</div>
      ) : <EmptyLine>None of their comments can be quoted here.</EmptyLine>}
      {u.withheld > 0 ? (
        <p className="m-0 pt-1 text-[12.5px] text-muted-foreground">
          <Fig>{fmtInt(u.withheld)}</Fig> more {u.withheld === 1 ? 'comment' : 'comments'} we do not quote here.
        </p>
      ) : null}
      {!canTag ? <p className="m-0 pt-1 text-[12.5px] text-muted-foreground">{PRODUCT_TAG_COPY.role}</p> : null}
      {u.allHref ? <Link href={u.allHref} scroll={false} className={cn(OLINK, 'pt-2')}>See all <Fig>{fmtInt(u.lines.length + u.more)}</Fig> →</Link> : null}
    </section>
  )
}

function Foot({ askHref, ask, settingsHref, settings }: { askHref: string; ask: string; settingsHref: string; settings: string }) {
  return (
    <div className="flex flex-col gap-3">
      <AskButton href={askHref}>{ask}</AskButton>
      <Link href={settingsHref} className={OLINK}>{settings} →</Link>
    </div>
  )
}

export function CategoryPanelView({ panel, monthName, canTag, notchAt }: { panel: CategoryPanel; monthName: string; canTag: boolean; notchAt?: number | PerBreakpoint }) {
  const word = panel.name.toLowerCase()
  return (
    <InPlacePanel
      id={PANEL_ID.group}
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.id}
      closeHref={panel.closeHref}
      labelledBy="category-title"
      closeLabel={`Close ${word}`}
      head={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PanelTag>Category</PanelTag>
            {panel.share ? <span className="text-[12.5px] text-muted-foreground"><Fig>{sharePct(panel.share.k, panel.share.n)}</Fig> of the market <VerdictBadge verdict={panel.verdict} /></span> : null}
          </div>
          <PanelTitle id="category-title">{panel.name}</PanelTitle>
          <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground">
            <Fig>{fmtInt(panel.products)}</Fig> of your products · <Fig>{fmtInt(panel.cameUp)}</Fig> came up in {monthName}
          </p>
        </>
      }
    >
      {panel.split && panel.share ? (
        <StatRow>
          <StatCell value={panel.split.any} of={panel.share.n} label={<>videos talk about {word}</>} />
          <StatCell value={panel.split.named} label="name one of your products" />
          <StatCell value={panel.split.unclear} label="are about one of yours, but we couldn’t tell which" />
          <StatCell value={panel.split.unbranded} label={<>are about {word} in general, none of yours named</>} />
        </StatRow>
      ) : null}

      <div className="grid grid-cols-1 gap-7 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] min-[1180px]:gap-9">
        <CrossSection label="What it’s about" crosses={panel.crosses} pick="subjects" empty="No subject read for these videos yet." />
        <CrossSection label="What people did" crosses={panel.crosses} pick="kinds" empty="Not read for these videos yet." />
        <LineSection line={panel.line} name={panel.name} mode="share" monthName={monthName} />
      </div>

      {panel.compare ? <CompareSection compare={panel.compare} title={`Your products against ${word} in general`} /> : null}

      <UnclearSection panel={panel} canTag={canTag} />

      <Foot askHref={panel.askHref} ask={`Ask the Agent about ${word}`} settingsHref={panel.settingsHref} settings={`Edit ${panel.name} in Settings`} />
    </InPlacePanel>
  )
}

function QuoteCard({ quote }: { quote: ProductsQuote }) {
  const words = quoteWords({ text: quote.text, english: quote.english })
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      <blockquote data-copy="quote" lang={quote.english ? 'en' : undefined} className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground">“{words}”</blockquote>
      {quote.cite ? <figcaption className="text-[12px] text-muted-foreground">{quote.cite}</figcaption> : null}
    </figure>
  )
}

export function ProductPanelView({ panel, monthName, notchAt }: { panel: ProductPanel; monthName: string; notchAt?: number | PerBreakpoint }) {
  const top = panel.crosses?.subjects[0]
  // NOT READ IS NOT QUIET: a product with no row in a read month was not in
  // the list when the month was last read (null); quiet is a read zero.
  const unread = panel.videos == null
  const quiet = panel.videos === 0
  return (
    <InPlacePanel
      id={PANEL_ID.product}
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.id}
      closeHref={panel.closeHref}
      labelledBy="product-title"
      closeLabel={`Close ${panel.name}`}
      head={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PanelTag>Product</PanelTag>
            <FlagChip verdict={panel.flag} />
            <span className="font-mono text-[12px] text-muted-foreground">{panel.groupName}</span>
          </div>
          <PanelTitle id="product-title">{panel.name}</PanelTitle>
          <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground">
            {unread
              ? <>Not read yet for {monthName}: it was not in your list when {monthName} was last read.</>
              : quiet
                ? <>Nobody in your market named it in {monthName}.</>
                : <><Fig>{fmtInt(panel.videos ?? 0)}</Fig> {panel.videos === 1 ? 'video' : 'videos'} in {monthName}</>}
          </p>
        </>
      }
    >
      {!quiet && !unread ? (
        <StatRow>
          {panel.market ? <StatCell value={panel.videos ?? 0} of={panel.market} label="videos in your market name it" /> : null}
          {panel.categoryVideos ? <StatCell value={panel.videos ?? 0} of={panel.categoryVideos} label={<>videos about {panel.groupName.toLowerCase()} name it</>} /> : null}
          {panel.comments ? <StatCell value={panel.comments} label={panel.comments === 1 ? 'comment names it' : 'comments name it'} /> : null}
          {top && panel.crosses ? <StatCell value={top.k} of={panel.crosses.n} label={<>are about {top.label}</>} /> : null}
        </StatRow>
      ) : null}

      <div className="grid grid-cols-1 gap-7 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] min-[1180px]:gap-9">
        <CrossSection label="What it’s about" crosses={panel.crosses} pick="subjects" empty={unread ? 'Not read yet.' : quiet ? 'Nothing to read in a quiet month.' : 'No subject read for these videos yet.'} />
        <CrossSection label="What people did" crosses={panel.crosses} pick="kinds" empty={unread ? 'Not read yet.' : quiet ? 'Nothing to read in a quiet month.' : 'Not read for these videos yet.'} />
        <LineSection line={panel.line} name={panel.name} mode="product" monthName={monthName} />
      </div>

      {panel.compare ? <CompareSection compare={panel.compare} title={`${panel.name} against ${panel.groupName.toLowerCase()} in general`} /> : null}

      {panel.quotes.length > 0 ? (
        <PanelSection label={<>In their words · <Fig>{fmtInt(panel.quotes.length)}</Fig> {panel.quotes.length === 1 ? 'comment' : 'comments'} naming it in {monthName}</>}>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {panel.quotes.map((q) => <QuoteCard key={q.key} quote={q} />)}
          </div>
        </PanelSection>
      ) : null}

      <Foot askHref={panel.askHref} ask={`Ask the Agent about ${panel.name}`} settingsHref={panel.settingsHref} settings={`Edit the names of ${panel.name} in Settings`} />
    </InPlacePanel>
  )
}
