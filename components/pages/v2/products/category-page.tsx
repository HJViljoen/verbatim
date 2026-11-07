import Link from 'next/link'
import type { ReactNode } from 'react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { translationNote } from '@/components/quote-block'
import { CARD, commaCite, EmptyBox, FlagChip, GoLink, translationLine, type StatItem } from '@/components/v2'
import { QUOTE, ROW, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import { sharePct, type Compare } from '@/lib/pages/v2/products'
import type { AboutLine, CategoryPage, HubQuote, ListRow, ProductCard, ProductsLevelData } from '@/lib/pages/v2/products-levels'
import { prevMonth } from '@/lib/reading/month-key'
import { monthTerm } from '@/lib/reading/month-label'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { subjectChangeGap } from '@/components/pages/v2/market/subject-page'
import { AskCard, BlockTile, GAPLINE, GroupsBlockView, inWords, KindsBlock, LIST_CARD, MonthTable, of, PlatformsBlockView, SectionHead, SubjectsBlock } from './level-parts'
import { UnclearCard } from './unclear'

// A CATEGORY'S PAGE, THE HUB (G4-Products-Category, 17 Oct; since the audit
// design, 7 Nov, drawn to Products-Category.dc.html): the title block ("A
// category of your products" and the figures row, `categoryStats`), the
// headline in code's words with three facts, the products that came up as
// cards with the couldn't-tell-which card beside them and every product as a
// list, the numbers as tiles, the products against the category, a comment
// naming each product, the Agent and Settings. The board's read card ("What
// people are saying / What it means") is not drawn: decision 1 of the G4
// report, no category read is written (Thin, frame 3).

/** "Liners’", "Bracing & Supports’", "Foot’s": a name's possessive. */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/** Words as a sentence opens them. */
const sentenceCase = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`

// ---- 0. The figures row ---------------------------------------------------------------

/** The change where none prints, with no reason (plan §0a). Where the month
 *  pair is REFUSED (a catalogue change between the two months, or a change
 *  in how they were read), the comparison never comes, so it says no "yet";
 *  where last month is simply not read, it is Market's words
 *  (`subjectChangeGap`, "No comparison with August yet."). */
export const categoryChangeGap = (prev: string, refused: boolean): string =>
  (refused ? `No comparison with ${prev}.` : subjectChangeGap(prev))

/** Against last month, in the figures row: the verdict's word and its change
 *  (a verdict node each), or why none prints. */
function Against({ page, prevName }: { page: CategoryPage; prevName: string }) {
  const verdict = page.detail.verdict
  if (verdict == null || verdict.state === 'refused') return <span data-fig-gap="">{categoryChangeGap(prevName, verdict?.state === 'refused')}</span>
  const nonAnswer = nonAnswerParts(verdict, 'pts')
  if (!nonAnswer) return <span data-copy="verdict" className="[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit] [&>span]:text-foreground"><MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip /></span>
  return (
    <>
      <span data-copy="verdict" title={nonAnswer.title}>{sentenceCase(nonAnswer.word)}</span>
      {nonAnswer.change != null ? <>, <span data-copy="verdict" className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span></> : null}
    </>
  )
}

/** The figures row (the board's four cells): the month (`monthTerm`), its
 *  videos of the market's with its share, how many of yours came up, and
 *  against last month (last month's own figures are the month table's).
 *  Pure. */
export function categoryStats(data: ProductsLevelData): StatItem[] {
  const base = data.base
  const page = data.category
  const reads = base.state === 'ready' || base.state === 'unread'
  const cells: StatItem[] = reads ? [{ key: 'month', term: monthTerm(base.monthLabel), value: base.monthWords }] : []
  if (page && base.state === 'ready') {
    const word = page.detail.name.toLowerCase()
    const s = page.detail.split
    const share = page.detail.share
    if (s && base.market != null) {
      cells.push({ key: 'videos', term: `Videos about ${word}`, value: <><span data-copy="level">{fmtInt(s.any)} of {fmtInt(base.market)}</span>{share ? <>, <span data-copy="figure">{sharePct(share.k, share.n)}</span> of your market</> : null}</> })
    }
    cells.push({ key: 'came-up', term: 'Yours that came up', value: <><span data-copy="figure">{fmtInt(page.detail.cameUp)}</span> of your <span data-copy="figure">{fmtInt(page.detail.products)}</span></> })
    const prevName = longMonth(prevMonth(base.month))
    cells.push({ key: 'against', term: `Against ${prevName}`, value: <Against page={page} prevName={prevName} /> })
    return cells
  }
  const column = data.group ? base.shelf.find((c) => c.id === data.group!.id) : null
  if (column) cells.push({ key: 'products', term: 'Your products', value: <><span data-copy="figure">{fmtInt(column.products.length)}</span> {column.products.length === 1 ? 'product' : 'products'} in {column.name}</> })
  return cells
}

// ---- 1. The headline and its facts --------------------------------------------------------

const BIG = 'text-[28px] leading-[1.2] font-bold text-foreground'

/** A fact of the headline's tile: its label, and its words. */
function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="m-0 text-[13px] leading-[1.3] font-semibold text-secondary-foreground">{term}</dt>
      <dd className="m-0 mt-1.5 text-[15px] leading-[1.5] text-secondary-foreground">{children}</dd>
    </div>
  )
}

function HubCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const word = detail.name.toLowerCase()
  const split = detail.split ?? { any: 0, named: 0, unclear: 0, unbranded: 0 }
  const any = <span data-copy="figure">{fmtInt(split.any)}</span>
  return (
    <section id="category-hub" aria-labelledby="category-head" className={cn(CARD, 'gap-[22px] sm:p-[30px]')}>
      <h2 id="category-head" className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[23px]">{page.headline}</h2>
      <dl className="m-0 grid grid-cols-1 gap-8 border-t border-track pt-5 min-[900px]:grid-cols-3">
        <Fact term="In general"><span data-copy="figure" className={BIG}>{fmtInt(split.unbranded)}</span> of the {any} are about {word} in general, none of yours named</Fact>
        <Fact term="Name one of yours"><span data-copy="figure" className={BIG}>{fmtInt(split.named)}</span> of the {any} name one of your {word}</Fact>
        <Fact term="One of yours, not which">
          <span data-copy="figure" className={BIG}>{fmtInt(split.unclear)}</span> are about one of yours, but we couldn’t tell which
          {split.unclear > 0 ? <>. <a href="#unclear" className="text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground">{d.base.canTag ? 'Tag them below' : 'See them below'}</a></> : null}
        </Fact>
      </dl>
    </section>
  )
}

// ---- 2. Your {category} ---------------------------------------------------------------------

/** What its videos are about, as a card's cell or a list's (U6). */
function AboutText({ about, monthWords }: { about: AboutLine; monthWords: string }) {
  switch (about.kind) {
    case 'top':
      // A level, never a claim that it leads (U6: the column claims "most"
      // only where no subject is pending).
      return <span>{about.label}, <span data-copy="level" className="tabular-nums">{fmtInt(about.k)} of {fmtInt(about.n)}</span></span>
    case 'tie': return <span className="text-muted-foreground">No one subject leads</span>
    case 'pending': return <span className="text-muted-foreground">What it’s about: {SUBJECT_NOT_MEASURED}</span>
    case 'none': return <span className="text-muted-foreground">No subject on its videos</span>
    case 'quiet': return <span className="text-muted-foreground">Quiet in {monthWords}</span>
    default: return <span className="text-muted-foreground">Not read yet</span>
  }
}

/** A cell of a card's `<dl>`. */
function Cell({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-[1.4] text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-1 text-[16px] leading-[1.4] font-semibold text-foreground">{children}</dd>
    </div>
  )
}

/** One product that came up (the board's card): its name, its commonest
 *  kind of comment in a sentence, then its month, last month and what its
 *  videos are about most, and its page. */
function Card({ card, d, prevName }: { card: ProductCard; d: ProductsLevelData; prevName: string }) {
  const flag = d.base.shelf.flatMap((c) => c.products).find((p) => p.id === card.id)?.flag ?? null
  const videos = (n: number) => <><span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'video' : 'videos'}</>
  return (
    <article data-product-card="" className={cn(CARD, 'gap-3')}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="m-0 text-[19px] leading-[1.3] font-semibold"><Link href={card.href} className={ROW}>{card.name}</Link></h3>
        {flag ? <FlagChip verdict={flag} /> : null}
      </div>
      <p className="m-0 text-[16px] leading-[1.5] text-foreground">
        {card.kind
          ? <>{card.kind.label} under <span data-copy="figure">{fmtInt(card.kind.k)}</span> of its <span data-copy="figure">{fmtInt(card.kind.n)}</span> {card.kind.n === 1 ? 'video' : 'videos'}.</>
          : 'What people did in its comments has not been read yet.'}
      </p>
      <dl className="m-0 grid grid-cols-3 gap-4 border-t border-track pt-3.5 max-sm:grid-cols-1">
        <Cell term={d.base.monthName}>{videos(card.videos)}</Cell>
        {card.prev != null ? <Cell term={prevName}>{videos(card.prev)}</Cell> : null}
        <Cell term="About most"><AboutText about={card.about} monthWords={d.base.monthWords} /></Cell>
      </dl>
      <div className="mt-auto pt-1"><GoLink href={card.href}>Open {card.name}</GoLink></div>
    </article>
  )
}

/** A count cell: the figure, "None" for a read zero (the board's), "not read
 *  yet" for no row. */
function Count({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[13.5px] text-muted-foreground">not read yet</span>
  if (v === 0) return <span data-quiet-mark="" className="text-muted-foreground">None</span>
  return <span data-copy="figure">{fmtInt(v)}</span>
}

/** "All 8 of your liners": every product in the shelf's order, a table from
 *  640 and a two-line list on a phone. */
function AllList({ page, d, prevName }: { page: CategoryPage; d: ProductsLevelData; prevName: string }) {
  const word = page.detail.name.toLowerCase()
  const total = page.list.length
  const withPrev = page.list.some((r) => r.prev != null)
  const aboutHead = page.subjectsPending ? 'What its videos are about' : 'What its videos are about most'
  return (
    <section aria-label={`All ${total} of your ${word}`} className={LIST_CARD}>
      <div className="min-w-0">
        <h3 className="m-0 text-[19px] leading-[1.3] font-semibold text-foreground">All <span data-copy="figure">{fmtInt(total)}</span> of your {word}</h3>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground max-sm:hidden">Most videos first, as on your shelf. Each opens as its own page.</p>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground sm:hidden">{d.base.monthWords}{withPrev ? `, then ${prevName}` : ''}</p>
      </div>
      <div className="max-sm:hidden">
        <table className={TBL}>
          <thead>
            <tr>
              <th scope="col" className={TH}>Product</th>
              <th scope="col" className={TH}>{aboutHead}</th>
              <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>{d.base.monthWords}</th>
              {withPrev ? <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>{prevName}</th> : null}
            </tr>
          </thead>
          <tbody>
            {page.list.map((r) => (
              <tr key={r.id}>
                <td className={cn(TD, 'font-semibold')}><Link href={r.href} className={ROW}>{r.name}</Link></td>
                <td className={TD}><AboutText about={r.about} monthWords={d.base.monthWords} /></td>
                <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><Count v={r.videos} /></td>
                {withPrev ? <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 text-secondary-foreground')}>{r.prev != null ? <Count v={r.prev} /> : null}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:hidden">
        {page.list.map((r) => <PhoneRow key={r.id} r={r} d={d} prevName={prevName} />)}
      </div>
    </section>
  )
}

function PhoneRow({ r, d, prevName }: { r: ListRow; d: ProductsLevelData; prevName: string }) {
  const quiet = r.videos === 0
  return (
    <div data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-[3px] border-t border-track py-3 first:border-t-0 first:pt-0">
      <Link href={r.href} className={cn(ROW, 'min-w-0 text-[15px]')}>{r.name}</Link>
      <span className="text-right text-[15px] font-semibold tabular-nums"><Count v={r.videos} /></span>
      {quiet || r.prev != null ? (
        <span className="col-span-2 text-[14px] text-muted-foreground">
          {quiet ? (d.base.soFar ? 'Quiet so far' : `Quiet in ${d.base.monthName}`) : null}
          {quiet && r.prev != null ? ', ' : null}
          {r.prev != null ? (r.prev === 0 ? `${quiet ? 'quiet' : 'Quiet'} in ${prevName}` : <><span data-copy="figure" className="text-foreground">{fmtInt(r.prev)}</span> in {prevName}</>) : null}
        </span>
      ) : null}
    </div>
  )
}

/** "Your {category}": the cards with the couldn't-tell-which card beside
 *  them, then the list. */
function ProductsSection({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const word = page.detail.name.toLowerCase()
  const prevName = longMonth(prevMonth(d.base.month))
  const came = page.detail.cameUp
  const total = page.detail.products
  const note = <><span data-copy="figure">{fmtInt(came)}</span> of your <span data-copy="figure">{fmtInt(total)}</span> came up in {d.base.monthWords}{came > 0 && total > came ? <>: {came > page.cards.length ? <>the {inWords(page.cards.length)} with the most</> : <>{came === 1 ? 'that one' : <>those {inWords(came)}</>}</>}, then all {inWords(total)}</> : null}</>
  const unclear = <UnclearCard detail={page.detail} canTag={d.base.canTag} monthWords={d.base.monthWords} monthName={d.base.monthName} />
  return (
    <>
      <div id="products" className="scroll-mt-6"><SectionHead title={`Your ${word}`} note={note} /></div>
      <section aria-label={`Your ${word} that came up in ${d.base.monthWords}`} className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {page.cards.length > 0
          ? page.cards.map((c) => <Card key={c.id} card={c} d={d} prevName={prevName} />)
          : (
            <article data-cards-none="" className={CARD}>
              <EmptyBox>None of your {word} was named in {d.base.monthWords}.</EmptyBox>
            </article>
          )}
        {unclear}
      </section>
      {total > 0 ? <AllList page={page} d={d} prevName={prevName} /> : null}
    </>
  )
}

// ---- 4. The numbers --------------------------------------------------------------------------

/** The numbers as the board's tiles: month by month and what it's about,
 *  then what people did, who's talking and where, each "of" its own base. */
function NumbersCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const c = detail.crosses
  const n = c?.n ?? detail.split?.any ?? 0
  const when = `in ${d.base.monthWords}`
  const months = <BlockTile label="Month by month, share of your market’s videos"><MonthTable line={detail.line} mode="category" /></BlockTile>
  if ((detail.split?.any ?? 0) === 0) {
    return (
      <section aria-label={`${detail.name} in numbers`} data-numbers-quiet="" className="flex flex-col gap-5">
        {months}
        <article className={CARD}><EmptyBox>Nobody in your market talked about {detail.name.toLowerCase()} {when}, so there is nothing more to count.</EmptyBox></article>
      </section>
    )
  }
  return (
    <section id="category-numbers" aria-label={`${detail.name} in numbers`} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {months}
        <BlockTile label={<>What it’s about, {of(n)}</>}><SubjectsBlock rows={page.subjects} crosses={c} n={n} /></BlockTile>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        <BlockTile label={<>What people did, {of(n)}</>}><KindsBlock crosses={c} /></BlockTile>
        <BlockTile label={page.groups.state === 'ready' ? <>Who’s talking, {of(page.groups.n)}</> : 'Who’s talking'}><GroupsBlockView block={page.groups} when={when} /></BlockTile>
        <BlockTile label={page.platforms ? <>Where, {of(page.platforms.n)}</> : 'Where'}><PlatformsBlockView block={page.platforms} /></BlockTile>
      </div>
    </section>
  )
}

// ---- 5. Your products against the category -------------------------------------------------

function CompareCell({ cell }: { cell: Compare['rows'][number]['cells'][number] }) {
  if (!cell) return <span className="text-muted-foreground">None</span>
  return <span data-copy="level" className={cn('whitespace-nowrap tabular-nums', cell.highlight ? 'font-semibold' : null)}>{fmtInt(cell.k)} of {fmtInt(cell.n)}</span>
}

/** The products against the category, subject by subject (the board's
 *  table): every cell k of n, a product's column in bold, the subjects not
 *  measured yet named under them (U6). */
function CompareCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const compare = detail.compare
  const word = detail.name.toLowerCase()
  const title = `Your ${word} against ${word} in general`
  const pending = compare?.empty === 'pending' ? [] : (detail.crosses?.pending ?? [])
  const cleared = compare?.verdicts.filter((v) => v.state === 'moved') ?? []
  const head = (
    <div>
      <h3 id="compare-title" className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h3>
      <p className="m-0 mt-1 text-[14px] text-muted-foreground">What their videos are about</p>
    </div>
  )
  if (!compare) {
    return (
      <section aria-labelledby="compare-title" className={cn(CARD, 'gap-3.5')}>
        {head}
        <p className={GAPLINE}>What these videos are about has not been read for {d.base.monthWords} yet.</p>
      </section>
    )
  }
  const pendingRow = (key: string, label: string) => ({ key, label })
  const rowsPending = compare.empty === 'pending' ? compare.rows.map((r) => pendingRow(r.key, r.label)) : pending.map((p) => pendingRow(p.id, p.label))
  const rows = compare.empty === 'pending' ? [] : compare.rows
  return (
    <section aria-labelledby="compare-title" className={cn(CARD, 'gap-3.5')}>
      {head}
      {/* From 640 the board's table; on a phone (decision 14, the app's
          own phone layout) each subject stacks, its columns a line each with
          the column's name. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className={cn(TBL, STACK, compare.columns.length > 2 ? 'sm:min-w-[560px]' : null)}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>What it’s about</th>
              {compare.columns.map((c) => <th key={c.key} scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody className={STACK}>
            {rows.map((r) => (
              <tr key={r.key} className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL, 'max-sm:font-semibold')}>{r.label}</td>
                {r.cells.map((cell, i) => (
                  <td key={i} className={cn(TD, TD_NUM, 'pr-0 pl-3.5', STACK_CELL, 'max-sm:flex max-sm:justify-between max-sm:gap-3', compare.columns[i]?.tone === 'you' ? 'font-semibold' : null)}>
                    <span className="font-normal text-secondary-foreground sm:hidden">{compare.columns[i]?.label}</span>
                    <CompareCell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {rowsPending.map((r) => (
              <tr key={r.key} data-compare-pending="" className={STACK_ROW}>
                <td className={cn(TD, STACK_CELL, 'max-sm:font-semibold')}>{r.label}</td>
                <td colSpan={compare.columns.length} className={cn(TD, 'pr-0 pl-3.5 text-right text-muted-foreground', STACK_CELL)}>{SUBJECT_NOT_MEASURED}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">
        {compare.empty === 'pending'
          ? <>What these videos are about: {SUBJECT_NOT_MEASURED}. A subject is counted here once its check has passed.</>
          : <>Each count is videos, out of that column’s total.{' '}
            {compare.empty === 'none_named'
              ? <>No video named one of your {word} in {d.base.monthWords}, so there is nothing yet to set against the category.</>
              : compare.empty === 'not_read'
                ? <>What the videos naming one of your {word} are about has not been read yet.</>
                : cleared.length > 0
                  ? cleared.map((v) => <span key={v.objectLabel} data-copy="verdict" className="mr-2 inline-block">{v.objectLabel} <MovementBadge verdict={v} unit="pts" good="neutral" bandTip /></span>)
                  : 'Too few videos on any one product to call a difference from the category yet.'}</>}
      </p>
    </section>
  )
}

// ---- 6. In their words ----------------------------------------------------------------------

/** One comment naming its product, a tile: the product (its page), the
 *  commenter's words, its language line and English, where and when. */
function QuoteTile({ q }: { q: HubQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    <article className={CARD}>
      <figure className="m-0 flex min-w-0 flex-col gap-2">
        <GoLink href={q.product.href} className="self-start text-[13.5px]"><span data-quote-from="">{q.product.name}</span></GoLink>
        <blockquote data-copy="quote" className={cn('m-0 text-foreground', QUOTE, 'text-[17px] leading-[1.5]')}>“{q.text}”</blockquote>
        {line ? <span className="text-[13px] text-muted-foreground">{line}</span> : null}
        {note.english ? <p data-copy="quote" className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{note.english}</p> : null}
        {q.cite ? <figcaption className="text-[13.5px] text-muted-foreground">{commaCite(q.cite)}</figcaption> : null}
      </figure>
    </article>
  )
}

function Quotes({ quotes }: { quotes: readonly HubQuote[] }) {
  return (
    <>
      <SectionHead title="In their words" note={<><span data-copy="figure">{quotes.length}</span> {quotes.length === 1 ? 'comment, naming its product' : 'comments, each naming its product'}</>} />
      <section aria-label="In their words" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {quotes.map((q) => <QuoteTile key={q.key} q={q} />)}
      </section>
    </>
  )
}

/** The hub's body under its title block, in the board's order. */
export function CategoryPageBody({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const word = detail.name.toLowerCase()
  return (
    <>
      <HubCard page={page} d={d} />
      <ProductsSection page={page} d={d} />
      <SectionHead title="The numbers" note={<>{possessive(detail.name)} videos in {d.base.monthWords}, every audience together, your own posts’ comments included</>} />
      <NumbersCard page={page} d={d} />
      <CompareCard page={page} d={d} />
      {page.quotes.length > 0 ? <Quotes quotes={page.quotes} /> : null}
      <AskCard line={`Ask what people say about ${word}, in your own words.`} ask={`Ask the Agent about ${word}`} askHref={detail.askHref} settings={`Edit ${detail.name} in Settings`} settingsHref={detail.settingsHref} />
    </>
  )
}
