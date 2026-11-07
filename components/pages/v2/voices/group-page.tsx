import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { CARD, EmptyBox, GoLink, SectionHead, TickBar, toMax, type StatItem } from '@/components/v2'
import { GO, QUOTE, ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { quoteWords } from '@/lib/pages/brands'
import { prevMonth } from '@/lib/reading/month-key'
import { monthTerm } from '@/lib/reading/month-label'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import {
  conversationsOverlap, countWords, GROUP_AFRESH, GROUP_NO_SUBJECTS, GROUP_NO_SUBJECTS_SHORT, GROUP_NOT_COMPARED_TITLE, GROUP_QUOTES_UNREAD, groupNoConversationsIn, groupQuotesNone, HOW_THEY_TALK_NONE,
  marketSubjHref, type GroupPage, type GroupSubjectCard,
} from '@/lib/pages/v2/voices-levels'
import { GROUP_NO_WHO, GROUP_NOT_DESCRIBED, type GroupProducts } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { CAPS, Fig } from './parts'
import { AskBox, GAPLINE, LevelQuoteTile } from './levels'

// A GROUP'S PAGE, A HUB (G3-Voices-Group; since the audit design, 7 Nov,
// drawn to Voices-Group.dc.html). In the board's order:
//   0. THE TITLE BLOCK: "A group in your market" under the name, and the
//      figures row (`groupStats`): the month, their videos of the market's,
//      the update that described them, and "Not compared yet" against last
//      month (decision 2);
//   1. WHO THEY ARE: the stored one-liner (Pass E's) as the tile's lead, then
//      three facts: the READY subject they talk about most (U6), the
//      conversations they are in, and why there is no last month;
//   2. THE READ: what they want, what stops them, what tips them into acting;
//      who they say they are (near-repeats merged, decision 8) and how they
//      talk (their own phrasings, each checked against a comment);
//   3. WHAT THEY TALK ABOUT: its parts are Market's levels (board D3), the
//      subjects their videos sit in, each a tile with the conversations
//      inside it for them, each opening in Market; the subjects not carded
//      and those not measured yet named; then every conversation they are in
//      (`#talk`);
//   4. THE NUMBERS: the brands and your products in their videos, and where
//      they comment, a tile each, bare counts of their videos (the section's
//      note says the base once, decision 2) with bars against the largest;
//   5. IN THEIR WORDS: three of their comments, a tile each;
//   6. THE AGENT.
// A thin group keeps every frame and says its gap inside it (the parity rule,
// in the dashed box where a list has nothing, decision 4).

/** "described at the 11 Oct update". */
export const describedAt = (date: string | null): string | null => (date ? `described at the ${shortDate(date)} update` : null)

/** The figures row: the month (`monthTerm`, decision 3), their videos of the
 *  market's, the update that described them, and the comparison not drawn
 *  (decision 2). Pure. */
export function groupStats(page: GroupPage): StatItem[] {
  const n = page.month.n
  const cells: StatItem[] = [
    { key: 'month', term: monthTerm(page.month.monthLabel), value: page.month.monthWords },
    { key: 'videos', term: 'Their videos', value: n != null ? <><Fig>{fmtInt(page.videos)}</Fig> of the market’s <Fig>{fmtInt(n)}</Fig></> : <><Fig>{fmtInt(page.videos)}</Fig> videos</> },
  ]
  if (page.profileDate) cells.push({ key: 'described', term: 'Described at', value: `The ${shortDate(page.profileDate)} update` })
  cells.push({ key: 'compared', term: `Against ${longMonth(prevMonth(page.month.month))}`, value: GROUP_NOT_COMPARED_TITLE })
  return cells
}

/** A fact of the lead tile: its label, and its words. */
function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={CAPS}>{term}</dt>
      <dd className="m-0 mt-1.5 text-[16px] leading-[1.5] text-foreground">{children}</dd>
    </div>
  )
}

const BIG = 'text-[28px] font-bold leading-[1.2] text-foreground'

/** Who they are: the one-liner leads; then the subject they talk about most,
 *  the conversations they are in, and why there is no last month. */
function Header({ page }: { page: GroupPage }) {
  const top = page.topSubject
  const convs = page.conversations.length
  const topHref = top ? (page.cards.find((c) => c.id === top.id)?.href ?? marketSubjHref(top.id, page.month.month)) : null
  return (
    <section id="group-hub" aria-label={page.name} className={cn(CARD, 'gap-[22px] sm:p-[30px]')}>
      {page.oneLiner ? (
        <h2 className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[23px]">
          <span data-copy="subject" data-slot="pass_e_persona">{page.oneLiner}</span>
        </h2>
      ) : <h2 className="sr-only">Who they are</h2>}
      <dl className={cn('m-0 grid grid-cols-1 gap-8 min-[900px]:grid-cols-3', page.oneLiner ? 'border-t border-track pt-5' : null)}>
        <Fact term="The subject they talk about most">
          {top ? (
            <><Fig className={BIG}>{fmtInt(top.k)}</Fig> of their <Fig>{fmtInt(page.videos)}</Fig> are about <GoLink href={topHref!} className="text-[16px]">{top.label}</GoLink></>
          ) : page.subjectsState === 'none_ready' ? (
            // Ruling U6: no subject has passed its check, so none carries a
            // figure; the place says so once.
            <span data-subject-state="none_ready" className="text-secondary-foreground">{SUBJECT_NOT_MEASURED}. No subject has passed its check yet.</span>
          ) : page.subjectsState === 'none' ? (
            <span className="text-secondary-foreground">{GROUP_NO_SUBJECTS}</span>
          ) : (
            <span className="text-secondary-foreground">None of their videos is about a measured subject yet.</span>
          )}
        </Fact>
        <Fact term="Conversations they’re in">
          <Fig className={BIG}>{fmtInt(convs)}</Fig> {convs === 1 ? 'conversation' : 'conversations'}{convs > 0 ? <>, <a href="#talk" className={cn(GO, 'text-[16px]')}>listed below</a></> : null}
        </Fact>
        <Fact term={`Why there is no ${longMonth(prevMonth(page.month.month))}`}>
          <span className="text-[15px] text-secondary-foreground">{GROUP_AFRESH}.</span>
        </Fact>
      </dl>
    </section>
  )
}

const READ_BODY = 'm-0 text-[16px] leading-[1.65] text-foreground'

function Prose({ text }: { text: string }) {
  return text ? <p className={READ_BODY}><span data-copy="subject" data-slot="pass_e_persona">{text}</span></p> : <p className={GAPLINE}>{GROUP_NOT_DESCRIBED}</p>
}

/** A row of a list: its name, a bar against the list's largest and its count. */
const BAR_ROW = 'grid grid-cols-[minmax(0,1fr)_96px_34px] items-center gap-x-3.5 gap-y-3 text-[15px]'

function ReadCard({ page }: { page: GroupPage }) {
  const who = toMax(page.who.map((w) => w.count))
  const phrases = page.phrases.map((p) => ({ key: p.text, words: quoteWords({ text: p.text, english: p.english ?? null }), en: Boolean(p.english) })).filter((p) => p.words)
  return (
    <article aria-label={`What ${page.name} want, what stops them, what tips them`} className={cn(CARD, 'gap-[26px] sm:p-[30px]')}>
      <div className="grid grid-cols-1 gap-8 max-sm:gap-[18px] min-[900px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2.5"><h3 className={CAPS}>What they want</h3><Prose text={page.wants} /></div>
        <div className="flex min-w-0 flex-col gap-2.5"><h3 className={CAPS}>What stops them</h3><Prose text={page.stops} /></div>
        <div className="flex min-w-0 flex-col gap-2.5"><h3 className={CAPS}>What tips them into acting</h3><Prose text={page.triggers} /></div>
      </div>
      <div className="grid grid-cols-1 gap-8 border-t border-track pt-[22px] max-sm:gap-[18px] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h3 className={CAPS}>Who they say they are</h3>
          {page.who.length > 0 ? (
            <>
              <div className={BAR_ROW}>
                {page.who.map((w) => (
                  <Fragment key={w.label}>
                    <span className="min-w-0"><span data-copy="stored" data-slot="pass_a_audience_insight">{w.label}</span></span>
                    <TickBar pct={who(w.count)} size="md" label={`${w.label}: ${w.count}`} />
                    <Fig className="text-right">{fmtInt(w.count)}</Fig>
                  </Fragment>
                ))}
              </div>
              <span className="text-[13.5px] text-muted-foreground">How often each came up in what they said.</span>
            </>
          ) : <p className="m-0 text-[15px] leading-[1.5] text-secondary-foreground">{GROUP_NO_WHO}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <h3 className={CAPS}>How they talk</h3>
          {phrases.length > 0 ? (
            <>
              <ul className="m-0 flex list-none flex-wrap gap-x-7 gap-y-2.5 p-0">
                {phrases.map((p) => <li key={p.key} data-copy="quote" lang={p.en ? 'en' : undefined} className={cn(QUOTE, 'text-[18px] text-foreground')}>“{p.words}”</li>)}
              </ul>
              <span className="text-[13.5px] text-muted-foreground">Their own phrasings, each checked against a comment.</span>
            </>
          ) : <p className="m-0 text-[15px] leading-[1.5] text-secondary-foreground">{HOW_THEY_TALK_NONE}</p>}
        </div>
      </div>
    </article>
  )
}

/** One subject their videos sit in: its name (Market's page), their videos in
 *  it (READY only), the conversations inside it for them (each a
 *  conversation's own count, never the subject's), its videos in the market,
 *  and Market's page for it. */
function SubjectCard({ card, page }: { card: GroupSubjectCard; page: GroupPage }) {
  const ready = card.state === 'ready' && card.k != null
  return (
    <article data-subject-card={card.state} className={cn(CARD, 'gap-3.5')}>
      <h3 className="m-0 text-[19px] leading-[1.3] font-semibold text-foreground">
        <Link href={card.href} className={ROW}>{card.name}</Link>
      </h3>
      {ready ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2">
          <Fig className="text-[32px] font-bold leading-none text-foreground">{fmtInt(card.k!)}</Fig>
          <span className="text-[15px] text-secondary-foreground">of their <Fig>{fmtInt(page.videos)}</Fig> videos</span>
        </p>
      ) : <p className="m-0 text-[15px] leading-[1.5] text-muted-foreground">{SUBJECT_NOT_MEASURED}</p>}
      {card.inside.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-track pt-3">
          <h4 className={CAPS}>Inside it, for them</h4>
          {card.inside.map((c) => (
            <div key={c.id} className="flex justify-between gap-3 text-[15px]">
              <Link href={c.href} className={cn(ROW, 'font-normal')}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
              <Fig className="shrink-0 font-semibold">{fmtInt(c.k)}</Fig>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-track pt-3">
        <span className="text-[14px] text-muted-foreground">
          {ready && card.market ? <><Fig>{fmtInt(card.market.k)}</Fig> videos in the market</> : card.state === 'failed' ? 'Being re-described' : card.state !== 'ready' ? 'Its check is still open' : null}
        </span>
        <GoLink href={card.href}>Open {card.name} in Market</GoLink>
      </div>
    </article>
  )
}

/** Under the cards (the board's `<dl>`): the subjects not measured yet, every
 *  one named; why a failed one shows no figure, once on the page; the ready
 *  subjects not carded (their counts) and those on none of their videos
 *  (named); and a subject not carded that holds some of their
 *  conversations. */
function Pending({ page }: { page: GroupPage }) {
  const nm = page.notMeasured
  const failed = nm.filter((s) => s.state === 'failed')
  if (nm.length === 0 && page.holdsMore.length === 0 && page.alsoIn.length === 0 && page.inNone.length === 0) return null
  const link = (href: string, label: string) => <Link href={href} className={cn(GO, 'text-[15px]')}>{label}</Link>
  return (
    <div data-group-pending="" className="-mt-0.5 mx-0.5 flex flex-col gap-2">
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-[15px] leading-[1.5] sm:grid-cols-[auto_minmax(0,1fr)]">
        {nm.length > 0 ? (
          <>
            {/* Every one NAMED, never folded into a count, even where none
                has passed (14 Oct, lib/pages/not-measured.ts: a tracked
                subject is never hidden). */}
            <dt className="text-muted-foreground">{SUBJECT_NOT_MEASURED}</dt>
            <dd className="m-0">
              {nm.map((s) => s.label).join(', ')}. {nm.length === 1 ? 'It shows how many of their videos it holds once its check passes.' : 'Each shows how many of their videos it holds once its check passes.'}
              {failed.map((f) => (
                <span key={f.id} data-subject-failed="" className="mt-1 block text-[14px] text-muted-foreground"><span className="font-medium text-foreground">{f.label}.</span> {FAILED_EXPLAINED}</span>
              ))}
            </dd>
          </>
        ) : null}
        {page.alsoIn.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Also in their videos</dt>
            <dd className="m-0">{page.alsoIn.map((s, i) => <Fragment key={s.id}>{i > 0 ? ', ' : null}{link(s.href, s.label)} <Fig>{fmtInt(s.k)}</Fig></Fragment>)}</dd>
          </>
        ) : null}
        {page.inNone.length > 0 ? (
          <>
            <dt className="text-muted-foreground">In none of their videos</dt>
            <dd className="m-0">{page.inNone.map((s, i) => <Fragment key={s.id}>{i > 0 ? ', ' : null}{link(s.href, s.label)}</Fragment>)}</dd>
          </>
        ) : null}
      </dl>
      {page.holdsMore.map((h) => (
        <p key={h.id} className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{h.label} holds {countWords(h.convs)} more of their conversations, in the list below</p>
      ))}
    </div>
  )
}

/** Every conversation they are in (the board's table; a two-line list on a
 *  phone), most of their videos first, each opening its page in Market.
 *  `id="talk"`: the lead tile's "listed below" lands here. */
function Conversations({ page }: { page: GroupPage }) {
  const total = page.conversations.length
  const when = page.month.monthWords
  return (
    <section id="talk" aria-label={`Every conversation ${page.name} are in`} className={cn(CARD, 'scroll-mt-6 gap-3.5')}>
      <div className="min-w-0">
        <h3 className="m-0 text-[19px] leading-[1.3] font-semibold text-foreground">
          {total === 1 ? 'The conversation they’re in' : <>All <Fig>{fmtInt(total)}</Fig> conversations they’re in</>}
        </h3>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground">
          <span className="max-sm:hidden">Most of their videos first. Each opens as its page in Market.</span>
          <span className="sm:hidden">Their videos, then all the videos in it, {when}</span>
        </p>
      </div>
      {total === 0 ? <EmptyBox>{groupNoConversationsIn(when)}</EmptyBox> : (
        <>
          <div className="max-sm:hidden">
            <table className={TBL}>
              <thead>
                <tr>
                  <th scope="col" className={cn(TH, 'w-[58%]')}>Conversation</th>
                  <th scope="col" className={TH}>Subject</th>
                  <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Their videos</th>
                  <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>All videos in it, {when}</th>
                </tr>
              </thead>
              <tbody>
                {page.conversations.map((c) => (
                  <tr key={c.id}>
                    <td className={TD}>
                      <Link href={c.href} className={ROW}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                      {c.description ? <span data-copy="subject" data-slot="pass_b_theme" className="mt-[3px] block text-[14px] leading-[1.5] font-normal text-muted-foreground">{c.description}</span> : null}
                    </td>
                    <td className={TD}>{c.subject?.name ?? <span className="text-muted-foreground">Not assigned</span>}</td>
                    <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><Fig>{fmtInt(c.k)}</Fig></td>
                    <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 text-secondary-foreground')}>{c.all != null ? <Fig>{fmtInt(c.all)}</Fig> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:hidden">
            {page.conversations.map((c) => (
              <div key={c.id} data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-[3px] border-t border-track py-3 first:border-t-0 first:pt-0">
                <Link href={c.href} className={cn(ROW, 'min-w-0 text-[15px]')}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                <Fig className="text-right text-[15px] font-semibold">{fmtInt(c.k)}</Fig>
                <span className="col-span-2 text-[14px] text-muted-foreground">
                  {c.subject?.name ?? 'Not assigned'}
                  {c.all != null ? <>, <Fig>{fmtInt(c.all)}</Fig> in {when}</> : null}
                </span>
              </div>
            ))}
          </div>
          <p data-conv-note="" className="m-0 text-[13.5px] text-muted-foreground">
            A video can sit in more than one conversation{conversationsOverlap(page) ? <>, so these add up to more than their <Fig>{fmtInt(page.videos)}</Fig> videos</> : null}.
          </p>
        </>
      )}
    </section>
  )
}

/** A numbers tile: its head and its rows or its one line. */
function NumbersTile({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <article className={cn(CARD, 'gap-3.5')}>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h3>
      {children}
    </article>
  )
}

const NOTE = 'm-0 text-[13.5px] leading-[1.45] text-muted-foreground'

/** "Your products in their videos": your products named in their videos this
 *  month, each opening in Your products; where none is read, one line. */
function ProductsTile({ products }: { products: GroupProducts }) {
  const listed = products.rows.length > 0 || products.unclear > 0
  const bar = toMax([...products.rows.map((p) => p.k), products.unclear])
  return (
    <NumbersTile title="Your products in their videos">
      {listed ? (
        <>
          <div className={BAR_ROW}>
            {products.rows.map((p) => (
              <Fragment key={p.id}>
                <span className="min-w-0"><Link href={p.href} className={cn(ROW, 'font-normal')}>{p.name}</Link></span>
                <TickBar pct={bar(p.k)} size="md" label={`${p.name}: ${fmtInt(p.k)} of their videos`} />
                <Fig className="text-right">{fmtInt(p.k)}</Fig>
              </Fragment>
            ))}
            {products.unclear > 0 ? (
              <>
                <span className="min-w-0">Couldn’t tell which product</span>
                <TickBar pct={bar(products.unclear)} size="md" label={`Couldn’t tell which product: ${fmtInt(products.unclear)} of their videos`} />
                <Fig className="text-right">{fmtInt(products.unclear)}</Fig>
              </>
            ) : null}
          </div>
          {products.rows.length > 0 ? <p className={NOTE}>Each opens in Your products.</p> : null}
        </>
      ) : <EmptyBox>{products.line}</EmptyBox>}
    </NumbersTile>
  )
}

function Numbers({ page }: { page: GroupPage }) {
  const b = page.brands
  const counted = b.state === 'ready'
  const brandBar = toMax(b.rows.map((r) => r.k ?? 0))
  const where = toMax(page.platforms.map((p) => p.k))
  return (
    <section aria-label={`${page.name} in numbers`} className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
      <NumbersTile title="Brands named in their videos">
        {/* A thin or unread state's one sentence, in the dashed box
            (decision 4); the brands keep their names under it. */}
        {b.line && !counted ? <EmptyBox>{b.line}</EmptyBox> : null}
        {b.rows.length > 0 ? (
          <div className={BAR_ROW}>
            {b.rows.map((r) => (
              <Fragment key={r.key}>
                <span className="min-w-0">
                  <Link href={r.href} className={cn(ROW, 'font-normal')}>{r.label}</Link>
                  {r.you ? <> <BrandChip who="you" plain className="ml-1 text-[13px] font-semibold text-you">You</BrandChip></> : null}
                </span>
                {/* A name with no count keeps its name and no bar (decision
                    4): the line above says why. */}
                {r.k != null ? <TickBar pct={brandBar(r.k)} size="md" label={`${r.label}: ${fmtInt(r.k)} of their videos`} /> : <span />}
                {r.k != null ? <Fig className="text-right">{fmtInt(r.k)}</Fig> : <span />}
              </Fragment>
            ))}
          </div>
        ) : null}
        {counted && b.line ? <EmptyBox>{b.line}</EmptyBox> : null}
        {counted && b.rows.length > 0 ? <p className={NOTE}>Each opens its page in Voices.</p> : null}
      </NumbersTile>
      <ProductsTile products={page.products} />
      <NumbersTile title="Where they comment">
        {page.platforms.length > 0 && page.videos > 0 ? (
          <div className={BAR_ROW}>
            {page.platforms.map((p) => (
              <Fragment key={p.platform}>
                <span className="min-w-0">{p.label}</span>
                <TickBar pct={where(p.k)} size="md" label={`${p.label}: ${fmtInt(p.k)} of ${fmtInt(page.videos)}`} />
                <Fig className="text-right">{fmtInt(p.k)}</Fig>
              </Fragment>
            ))}
          </div>
        ) : <EmptyBox>None of their comments in {page.month.monthWords}.</EmptyBox>}
      </NumbersTile>
    </section>
  )
}

/** "In their words": three of their comments, a tile each, each from its
 *  conversation. With none to print the section keeps its frame and says why
 *  in the dashed box (the parity rule; the thin board draws it). */
function Quotes({ page }: { page: GroupPage }) {
  const labelled = page.quotes.length > 0 && page.quotes.every((q) => q.from)
  return (
    <>
      <SectionHead
        title="In their words"
        note={page.quotes.length > 0 ? <><Fig>{fmtInt(page.quotes.length)}</Fig> of their comments in {page.month.monthWords}{labelled ? ', each from its conversation' : null}</> : null}
      />
      {page.quotes.length > 0 ? (
        <section aria-label="In their words" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {page.quotes.map((q) => <LevelQuoteTile key={q.ref} q={q} />)}
        </section>
      ) : (
        <section aria-label="In their words" className={CARD}>
          <EmptyBox><span data-quotes-gap={page.quotesUnread ? 'unread' : 'none'}>{page.quotesUnread ? GROUP_QUOTES_UNREAD : groupQuotesNone(page.month.monthWords, page.videos)}</span></EmptyBox>
        </section>
      )}
    </>
  )
}

/** The page's body under its title block, in the board's order. */
export function GroupPageBody({ page }: { page: GroupPage }) {
  return (
    <>
      <Header page={page} />
      <ReadCard page={page} />
      <SectionHead
        title="What they talk about"
        note={page.subjectsState === 'none_ready'
          ? 'No subject has passed its check yet, so none is counted for them. Each opens in Market.'
          : page.subjectsState === 'none'
            // No subject is tracked at all: none has a check to pass.
            ? <>{GROUP_NO_SUBJECTS_SHORT}. Every conversation they’re in opens in Market.</>
            : <>Their <Fig>{fmtInt(page.videos)}</Fig> videos in your subjects<span className="max-sm:hidden">, then every conversation they’re in</span>. Each opens in Market.</>}
      />
      {page.cards.length > 0 ? (
        <section aria-label="The subjects their videos sit in" className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          {page.cards.map((c) => <SubjectCard key={c.id} card={c} page={page} />)}
        </section>
      ) : (
        <section aria-label="The subjects their videos sit in" data-group-subjects-none="" className={CARD}>
          <EmptyBox>{page.subjectsState === 'none' ? GROUP_NO_SUBJECTS : 'None of their videos sits in a subject you track yet.'}</EmptyBox>
        </section>
      )}
      <Pending page={page} />
      <Conversations page={page} />
      <SectionHead title="The numbers" note={<>Their <Fig>{fmtInt(page.videos)}</Fig> videos, {page.month.monthWords}</>} />
      <Numbers page={page} />
      <Quotes page={page} />
      <AskBox text={<>Ask what <span data-copy="subject" data-slot="pass_e_persona">{page.name}</span> say, in your own words.</>} href={page.askHref} button="Ask the Agent about this group" />
    </>
  )
}
