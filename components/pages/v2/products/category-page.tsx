import Link from 'next/link'
import type { ReactNode } from 'react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { translationLabel, translationNote } from '@/components/quote-block'
import { CARD, FlagChip } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { sharePct, type Compare } from '@/lib/pages/v2/products'
import type { AboutLine, CategoryPage, HubQuote, ListRow, ProductCard, ProductsLevelData } from '@/lib/pages/v2/products-levels'
import { prevMonth } from '@/lib/reading/month-key'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { subjectChangeGap } from '@/components/pages/v2/market/subject-page'
import { Label, OLINK } from '@/components/pages/v2/market/parts'
import { AskCard, Block, GAPLINE, GroupsBlockView, KindsBlock, LIST_CARD, MonthBars, of, PAGE_CARD, PlatformsBlockView, ProductTile, QuietMark, SectionHead, SubjectsBlock } from './level-parts'
import { UnclearCard } from './unclear'

// A CATEGORY'S PAGE, THE HUB (G4-Products-Category, 17 Oct): the header card
// with its headline in code's words and four figures, the products that came
// up as cards and every product as a list, the couldn't-tell-which list with
// Tag, the numbers, the products against the category, a comment naming each
// product, the Agent. The board's read card ("What people are saying / What
// it means") is not drawn: decision 1 of the G4 report, no category read is
// written (Thin, frame 3).

/** One to twelve in words, as the boards write a count in a sentence ("those
 *  three, then all eight"); a digit past that. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const inWords = (n: number): ReactNode => (n >= 0 && n < WORDS.length ? WORDS[n] : <span data-copy="figure">{fmtInt(n)}</span>)

/** "Liners’", "Bracing & Supports’", "Foot’s": a name's possessive. */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/** Words as a sentence opens them. */
const sentenceCase = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`

// ---- 1. The header card ------------------------------------------------------------------

const FV = 'font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[26px]'
const FW = 'text-[22px] leading-[34px] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[17px] max-sm:leading-[26px]'
const FL = 'text-[13.5px] leading-[1.4] text-foreground max-sm:text-[12.5px]'
const FS = 'text-[12.5px] leading-[1.4] text-muted-foreground max-sm:text-[12px]'
const EYEBROW = 'm-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-orange-text'

/** One of the strip's figures (F3's `.fig`): four in a row from 1180, two to
 *  a row under it, a hairline between. */
function Fig({ children }: { children: ReactNode }) {
  return (
    <div data-fig="" className="flex min-w-0 flex-col gap-1.5 border-border px-[22px] pt-5 pb-[22px] max-sm:px-4 max-sm:pt-[15px] max-sm:pb-4 min-[1180px]:border-l min-[1180px]:first:border-l-0 min-[1180px]:first:pl-[34px] max-[1179px]:odd:pl-[34px] max-[1179px]:even:border-l max-[1179px]:[&:nth-child(n+3)]:border-t max-sm:odd:pl-[18px]">
      {children}
    </div>
  )
}

function HubCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const base = d.base
  const word = detail.name.toLowerCase()
  const split = detail.split ?? { any: 0, named: 0, unclear: 0, unbranded: 0 }
  const share = detail.share
  const verdict = detail.verdict
  const prevName = longMonth(prevMonth(base.month))
  const drawn = verdict != null && verdict.state !== 'refused'
  const nonAnswer = nonAnswerParts(verdict, 'pts')
  const prev = verdict?.baseline ?? null
  const pct = share && share.n > 0 ? Math.min(100, (100 * share.k) / share.n) : 0
  return (
    <article id="category-hub" aria-labelledby="category-head" className={cn(CARD, 'gap-[22px] overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:gap-4 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0')}>
      <div className="flex flex-col gap-2.5">
        <p className={EYEBROW}>{detail.name} · {base.monthWords}</p>
        <h2 id="category-head" className="m-0 max-w-[900px] text-[32px] leading-[1.24] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[23px] max-sm:leading-[1.28]">{page.headline}</h2>
      </div>
      <div role="group" aria-label={`${detail.name} in figures`} className="-mx-[34px] mt-1.5 grid grid-cols-2 border-t border-track bg-inner max-sm:-mx-[18px] max-sm:mt-1 min-[1180px]:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
        <Fig>
          {share ? (
            <>
              <div data-copy="figure" className={FV}>{sharePct(share.k, share.n)}</div>
              <div aria-hidden className="relative mt-1 mb-0.5 h-2.5 max-w-[240px] rounded-[5px] bg-border">
                <div className="absolute inset-y-0 left-0 rounded-[5px] bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <div className={FL}>of your market’s videos</div>
              <div className={FS}><span data-copy="level">{fmtInt(share.k)} of {fmtInt(share.n)}</span> in {base.monthWords}</div>
            </>
          ) : <p className={cn(FL, 'm-0 text-muted-foreground')}>No share of your market read for {base.monthWords}.</p>}
        </Fig>
        <Fig>
          {drawn ? (
            <>
              {nonAnswer ? (
                <div data-copy="verdict" title={nonAnswer.title} className={FW}>{sentenceCase(nonAnswer.word)}</div>
              ) : (
                <div data-copy="verdict" className={cn(FW, '[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit] [&>span]:text-foreground')}>
                  <MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip />
                </div>
              )}
              <div className={FL}>
                {nonAnswer?.change != null ? <><span data-copy="verdict" className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span> </> : null}
                against {prevName}{prev && prev.n > 0 ? <>, <span data-copy="figure">{sharePct(prev.k, prev.n)}</span></> : null}
              </div>
              {prev && prev.n > 0 ? <div className={FS}><span data-copy="level">{fmtInt(prev.k)} of {fmtInt(prev.n)}</span> in {prevName}</div> : null}
            </>
          ) : <p data-fig-gap="" className={cn(FL, 'm-0 text-muted-foreground')}>{subjectChangeGap(prevName)}</p>}
        </Fig>
        <Fig>
          <div data-copy="figure" className={FV}>{fmtInt(split.named)}</div>
          <div className={FL}>of the <span data-copy="figure">{fmtInt(split.any)}</span> name one of your {word}</div>
          <div className={FS}><span data-copy="figure">{fmtInt(split.unbranded)}</span> are about {word} in general, none of yours named</div>
        </Fig>
        <Fig>
          <div data-copy="figure" className={FV}>{fmtInt(split.unclear)}</div>
          <div className={FL}>are about one of yours, but we couldn’t tell which</div>
          {split.unclear > 0 ? <a href="#unclear" className={cn(OLINK, 'text-[12.5px]')}>{base.canTag ? 'Tag them below ↓' : 'See them below ↓'}</a> : null}
        </Fig>
      </div>
    </article>
  )
}

// ---- 2. Your {category} ---------------------------------------------------------------------

/** What its videos are about, as a card's foot or a list's cell (U6). */
function AboutText({ about, monthWords, muted = false }: { about: AboutLine; monthWords: string; muted?: boolean }) {
  switch (about.kind) {
    case 'top':
      // A level, never a claim that it leads (U6: the column claims "most"
      // only where no subject is pending).
      return <span className={muted ? 'text-muted-foreground' : undefined}>{about.label}, <span data-copy="level" className="font-mono">{fmtInt(about.k)} of {fmtInt(about.n)}</span></span>
    case 'tie': return <span className="text-muted-foreground">No one subject leads</span>
    case 'pending': return <span className="text-muted-foreground">What it’s about · {SUBJECT_NOT_MEASURED}</span>
    case 'none': return <span className="text-muted-foreground">No subject on its videos</span>
    case 'quiet': return <span className="text-[12.5px] text-muted-foreground">Quiet in {monthWords}</span>
    default: return <span className="text-muted-foreground">Not read yet</span>
  }
}

/** One square a video (the board's 14px `.unit`), its commonest kind in the
 *  client's gold; past eighteen, one bar. */
function Units({ k, n, label }: { k: number; n: number; label: string }) {
  if (n <= 0) return null
  if (n > 18) {
    return (
      <div role="img" aria-label={label} className="relative h-3.5 w-[96px] shrink-0 overflow-hidden rounded-[3px] bg-track">
        <i className="absolute inset-y-0 left-0 bg-you" style={{ width: `${Math.min(100, (100 * k) / n)}%` }} />
      </div>
    )
  }
  return (
    <div role="img" aria-label={label} data-units={`${k}/${n}`} className="grid shrink-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(6, n)}, 14px)` }}>
      {Array.from({ length: n }, (_, i) => <span key={i} className={cn('size-3.5 rounded-[3px]', i < k ? 'bg-you' : 'bg-track')} />)}
    </div>
  )
}

function Card({ card, d, prevName }: { card: ProductCard; d: ProductsLevelData; prevName: string }) {
  const flag = d.base.shelf.flatMap((c) => c.products).find((p) => p.id === card.id)?.flag ?? null
  return (
    <article data-product-card="" className={cn(CARD, 'gap-3 px-6 pt-[22px] pb-5 max-sm:gap-2.5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="flex min-h-[26px] items-center justify-between gap-2.5">
        <ProductTile />
        {flag ? <FlagChip verdict={flag} /> : null}
      </div>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em]"><Link href={card.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">{card.name}</Link></h3>
      <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">
        {card.kind
          ? <>{card.kind.label} under <span data-copy="figure">{fmtInt(card.kind.k)}</span> of its <span data-copy="figure">{fmtInt(card.kind.n)}</span> {card.kind.n === 1 ? 'video' : 'videos'}.</>
          : 'What people did in its comments has not been read yet.'}
      </p>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-track pt-3">
        <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
          <b data-copy="figure" className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(card.videos)}</b> {card.videos === 1 ? 'video' : 'videos'} in {d.base.monthWords}
          {card.prev != null ? <><br /><span data-copy="figure" className="font-mono text-foreground">{fmtInt(card.prev)}</span> in {prevName}</> : null}
        </p>
        {card.kind ? <Units k={card.kind.k} n={card.kind.n} label={card.kind.n === 1 ? `The one video naming ${card.name} has ${card.kind.label.toLowerCase()}` : `${fmtInt(card.kind.k)} of the ${fmtInt(card.kind.n)} videos naming ${card.name} have ${card.kind.label.toLowerCase()}`} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
        <AboutText about={card.about} monthWords={d.base.monthWords} muted />
        <Link href={card.href} className={OLINK}>Open →</Link>
      </div>
    </article>
  )
}

const TH = 'whitespace-nowrap border-b border-border pb-2.5 pr-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const TD = 'border-b border-track py-[11px] pr-3 align-middle'

/** A count cell: the figure, a quiet rule for a read zero, "not read" for no
 *  row. */
function Count({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[12.5px] text-muted-foreground">not read yet</span>
  if (v === 0) return <QuietMark />
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
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">All <span data-copy="figure">{fmtInt(total)}</span> of your {word}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground max-sm:hidden">Most videos first, as on your shelf. Each opens as its own page.</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground sm:hidden">{d.base.monthWords}{withPrev ? `, then ${prevName}` : ''}</p>
      </div>
      <div className="max-sm:hidden">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>Product</th>
              <th scope="col" className={TH}>{aboutHead}</th>
              <th scope="col" className={cn(TH, 'text-right')}>{d.base.monthWords}</th>
              {withPrev ? <th scope="col" className={cn(TH, 'text-right')}>{prevName}</th> : null}
            </tr>
          </thead>
          <tbody>
            {page.list.map((r) => (
              <tr key={r.id} className="[&:last-child>td]:border-b-0">
                <td className={TD}><Link href={r.href} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline">{r.name}</Link></td>
                <td className={cn(TD, 'text-[13.5px]')}><AboutText about={r.about} monthWords={d.base.monthWords} /></td>
                <td className={cn(TD, 'text-right font-mono tabular-nums')}><Count v={r.videos} /></td>
                {withPrev ? <td className={cn(TD, 'text-right font-mono tabular-nums')}>{r.prev != null ? <Count v={r.prev} /> : null}</td> : null}
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
    <div data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
      <Link href={r.href} className="min-w-0 text-[14px] font-medium text-foreground no-underline">{r.name}</Link>
      <span className="text-right font-mono text-[13.5px] tabular-nums"><Count v={r.videos} /></span>
      {quiet || r.prev != null ? (
        <span className="col-span-2 text-[12.5px] text-muted-foreground">
          {quiet ? (d.base.soFar ? 'Quiet so far' : `Quiet in ${d.base.monthName}`) : null}
          {quiet && r.prev != null ? ' · ' : null}
          {r.prev != null ? (r.prev === 0 ? `quiet in ${prevName}` : <><span data-copy="figure" className="font-mono text-foreground">{fmtInt(r.prev)}</span> in {prevName}</>) : null}
        </span>
      ) : null}
    </div>
  )
}

/** "Your {category}": the cards, then the list. */
function ProductsSection({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const word = page.detail.name.toLowerCase()
  const prevName = longMonth(prevMonth(d.base.month))
  const came = page.detail.cameUp
  const total = page.detail.products
  const note = <><span data-copy="figure">{fmtInt(came)}</span> of your <span data-copy="figure">{fmtInt(total)}</span> came up in {d.base.monthWords}{came > 0 && total > came ? <> · {came > page.cards.length ? <>the {inWords(page.cards.length)} with the most</> : <>{came === 1 ? 'that one' : <>those {inWords(came)}</>}</>}, then all {inWords(total)}</> : null}</>
  return (
    <>
      <div id="products" className="scroll-mt-6"><SectionHead title={`Your ${word}`} note={note} /></div>
      {page.cards.length > 0 ? (
        <section aria-label={`Your ${word} that came up in ${d.base.monthWords}`} className="grid grid-cols-1 gap-5 max-sm:gap-3 min-[1180px]:grid-cols-3">
          {page.cards.map((c) => <Card key={c.id} card={c} d={d} prevName={prevName} />)}
        </section>
      ) : (
        <section aria-label={`Your ${word} that came up`} data-cards-none="" className={cn(CARD, 'gap-2')}>
          <p className={GAPLINE}>None of your {word} was named in {d.base.monthWords}.</p>
        </section>
      )}
      {total > 0 ? <AllList page={page} d={d} prevName={prevName} /> : null}
    </>
  )
}

// ---- 4. The numbers --------------------------------------------------------------------------

function NumbersCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const c = detail.crosses
  const n = c?.n ?? detail.split?.any ?? 0
  const when = `in ${d.base.monthWords}`
  if ((detail.split?.any ?? 0) === 0) {
    return (
      <section aria-label={`${detail.name} in numbers`} data-numbers-quiet="" className={PAGE_CARD}>
        <Block label="Month by month · share of your market’s videos"><MonthBars line={detail.line} name={detail.name} mode="category" size="lg" /></Block>
        <p className={GAPLINE}>Nobody in your market talked about {detail.name.toLowerCase()} {when}, so there is nothing more to count.</p>
      </section>
    )
  }
  return (
    <section id="category-numbers" aria-label={`${detail.name} in numbers`} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Block label="Month by month · share of your market’s videos">
          <div className="max-sm:hidden"><MonthBars line={detail.line} name={detail.name} mode="category" size="lg" /></div>
          <div className="sm:hidden"><MonthBars line={detail.line} name={detail.name} mode="category" size="md" /></div>
        </Block>
        <Block label={<>What it’s about · {of(n)}</>} className="max-[1179px]:mt-6 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <SubjectsBlock rows={page.subjects} crosses={c} n={n} />
        </Block>
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:border-t-0 max-sm:pt-0 min-[1180px]:grid-cols-3">
        <Block label={<>What people did · {of(n)}</>} className="max-sm:border-t max-sm:border-track max-sm:pt-[18px]"><KindsBlock crosses={c} /></Block>
        <Block label={page.groups.state === 'ready' ? <>Who’s talking · {of(page.groups.n)}</> : 'Who’s talking'} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]"><GroupsBlockView block={page.groups} when={when} /></Block>
        <Block label={page.platforms ? <>Where · {of(page.platforms.n)}</> : 'Where'} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]"><PlatformsBlockView block={page.platforms} /></Block>
      </div>
    </section>
  )
}

// ---- 5. Your products against the category -------------------------------------------------

function CompareCell({ cell, you }: { cell: Compare['rows'][number]['cells'][number]; you: boolean }) {
  if (!cell) return <span className="text-[12.5px] text-muted-foreground">none</span>
  const pct = cell.n > 0 ? Math.min(100, (100 * cell.k) / cell.n) : 0
  return (
    <div className="flex flex-col gap-[5px]">
      <span data-copy="level" className={cn('whitespace-nowrap font-mono text-[12.5px] tabular-nums', cell.highlight ? 'font-semibold' : null)}>{fmtInt(cell.k)} of {fmtInt(cell.n)}</span>
      <div aria-hidden className="relative h-1.5 max-w-[120px] rounded-[3px] bg-track"><i className={cn('absolute inset-y-0 left-0 rounded-[3px]', you ? 'bg-you' : 'bg-brand')} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

/** The products against the category, subject by subject: every cell k of
 *  n, the subjects not measured yet named under them (U6). */
function CompareCard({ page, d }: { page: CategoryPage; d: ProductsLevelData }) {
  const { detail } = page
  const compare = detail.compare
  const word = detail.name.toLowerCase()
  const title = `Your ${word} against ${word} in general · what their videos are about`
  const pending = compare?.empty === 'pending' ? [] : (detail.crosses?.pending ?? [])
  const cleared = compare?.verdicts.filter((v) => v.state === 'moved') ?? []
  if (!compare) {
    return (
      <section aria-label={title} className={PAGE_CARD}>
        <Block label={title}><p className={GAPLINE}>What these videos are about has not been read for {d.base.monthWords} yet.</p></Block>
      </section>
    )
  }
  const pendingRow = (key: string, label: string) => ({ key, label })
  const rowsPending = compare.empty === 'pending' ? compare.rows.map((r) => pendingRow(r.key, r.label)) : pending.map((p) => pendingRow(p.id, p.label))
  const rows = compare.empty === 'pending' ? [] : compare.rows
  return (
    <section aria-labelledby="compare-title" className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <Label><span id="compare-title">{title}</span></Label>
        <div className="max-sm:hidden">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border pr-2.5 pb-2.5 text-left align-bottom text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground">What it’s about</th>
                {compare.columns.map((c) => <th key={c.key} scope="col" className="border-b border-border pr-2.5 pb-2.5 text-left align-bottom text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="[&>td]:border-b [&>td]:border-track">
                  <td className="py-2.5 pr-2.5 align-middle font-medium">{r.label}</td>
                  {r.cells.map((cell, i) => <td key={i} className="py-2.5 pr-2.5 align-middle"><CompareCell cell={cell} you={compare.columns[i]?.tone === 'you'} /></td>)}
                </tr>
              ))}
              {rowsPending.map((r) => (
                <tr key={r.key} data-compare-pending="" className="[&>td]:border-b [&>td]:border-track">
                  <td className="py-2.5 pr-2.5 align-middle font-medium">{r.label}</td>
                  <td colSpan={compare.columns.length} className="py-2.5 pr-2.5 align-middle text-[13px] text-muted-foreground">{SUBJECT_NOT_MEASURED}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 sm:hidden">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-col gap-2 border-t border-track pt-3 first:border-t-0 first:pt-0">
              <span className="text-[14px] font-semibold">{r.label}</span>
              {r.cells.map((cell, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                  <span className="min-w-0 text-secondary-foreground">{compare.columns[i]?.label}</span>
                  <CompareCell cell={cell} you={compare.columns[i]?.tone === 'you'} />
                </div>
              ))}
            </div>
          ))}
          {rowsPending.length > 0 ? <p className="m-0 border-t border-track pt-3 text-[13px] text-muted-foreground">{rowsPending.map((r) => r.label).join(', ')}: {SUBJECT_NOT_MEASURED}</p> : null}
        </div>
        <p className="m-0 text-[12.5px] leading-[1.5] text-muted-foreground">
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
      </div>
    </section>
  )
}

// ---- 6. In their words ----------------------------------------------------------------------

function QuotePanel({ q }: { q: HubQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      <Link href={q.product.href} data-quote-from="" className="mb-0.5 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-secondary-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">
        <ProductTile className="size-4 rounded-[4px] bg-transparent text-muted-foreground [&>svg]:size-3" />
        {q.product.name}
      </Link>
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground max-sm:text-[15px]">“{q.text}”</blockquote>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {q.cite ? <figcaption className="text-[12px] text-muted-foreground">{q.cite}</figcaption> : null}
    </figure>
  )
}

function QuotesCard({ quotes }: { quotes: readonly HubQuote[] }) {
  return (
    <section aria-label="In their words" className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <Label>In their words · <span data-copy="figure">{quotes.length}</span> {quotes.length === 1 ? 'comment, naming its product' : 'comments, each naming its product'}</Label>
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          {quotes.map((q) => <QuotePanel key={q.key} q={q} />)}
        </div>
      </div>
    </section>
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
      <UnclearCard detail={detail} canTag={d.base.canTag} monthWords={d.base.monthWords} monthName={d.base.monthName} />
      <SectionHead title="The numbers" note={<>{possessive(detail.name)} videos in {d.base.monthWords}, every audience together, your own posts’ comments included</>} />
      <NumbersCard page={page} d={d} />
      <CompareCard page={page} d={d} />
      {page.quotes.length > 0 ? <QuotesCard quotes={page.quotes} /> : null}
      <AskCard line={`Ask what people say about ${word}, in your own words.`} ask={`Ask the Agent about ${word}`} askHref={detail.askHref} settings={`Edit ${detail.name} in Settings`} settingsHref={detail.settingsHref} />
    </>
  )
}
