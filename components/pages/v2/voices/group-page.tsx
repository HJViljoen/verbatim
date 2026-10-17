import Link from 'next/link'
import { Fragment } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { BubbleGlyph } from '@/components/shell/level-glyphs'
import { CARD, TickBar } from '@/components/v2'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import { inlineMonth } from '@/lib/reading/month-label'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import {
  conversationsOverlap, countWords, GROUP_AFRESH, GROUP_NO_SUBJECTS, GROUP_NOT_COMPARED_TITLE, groupNoConversationsIn, HOW_THEY_TALK_NONE,
  type GroupPage, type GroupSubjectCard,
} from '@/lib/pages/v2/voices-levels'
import { GROUP_NO_WHO, GROUP_NOT_DESCRIBED, type GroupProducts } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { Fig, LevelText, OLINK, Phrase } from './parts'
import {
  AskBox, Caps, EmptyBar, FL, FS, FV, FW, GAPLINE, HUB_LEAD, HubBar, HubCard, HubFig, LevelQuoteCard, LevelSection, MiniTile, PAGE_CARD, READ,
} from './levels'

// A GROUP'S PAGE, A HUB (G3-Voices-Group; its phone and thin boards). In the
// board's order:
//   1. THE HEADER CARD: who they are (the stored one-liner, Pass E's) as its
//      lead, then four figures: their videos of the market's this month (a
//      count, decision 2), "Not compared yet" (the honest verdict slot), the
//      subject they talk about most (READY only, U6), and the conversations
//      they are in;
//   2. THE READ CARD: what they want, what stops them, what tips them into
//      acting; who they say they are (near-repeats merged, decision 8) and how
//      they talk (their own phrasings, each checked against a comment);
//   3. WHAT THEY TALK ABOUT: its parts are Market's levels (board D3), the
//      subjects their videos sit in, each a card with the conversations inside
//      it for them, each opening in Market; the subjects not measured yet
//      named; then every conversation they are in;
//   4. THE NUMBERS: the brands and your products in their videos, and where
//      they comment, each of their videos;
//   5. IN THEIR WORDS: three of their comments, each from its conversation;
//   6. THE AGENT.
// A thin group keeps every frame and says its gap inside it (the parity rule).

/** The words of the month a figure sits in: "October so far", "September,
 *  the last full month". */
const monthIn = (page: GroupPage): string => inlineMonth(page.month.monthWords, page.month.monthLabel)

/** "described at the 11 Oct update". */
export const describedAt = (date: string | null): string | null => (date ? `described at the ${shortDate(date)} update` : null)

function Header({ page }: { page: GroupPage }) {
  const n = page.month.n
  const top = page.topSubject
  const convs = page.conversations.length
  const described = describedAt(page.profileDate)
  return (
    <HubCard
      id="group-hub"
      label={page.name}
      eyebrow={<>Who they are{described ? <> · <span className="max-sm:hidden">{described}</span><span className="sm:hidden">{described.replace('described at ', '')}</span></> : null}</>}
      lead={page.oneLiner ? <h2 className={HUB_LEAD}><span data-copy="subject" data-slot="pass_e_persona">{page.oneLiner}</span></h2> : null}
    >
      <HubFig>
        <div data-copy="figure" className={FV}>{fmtInt(page.videos)}</div>
        {n ? <HubBar pct={(100 * page.videos) / n} /> : null}
        <div className={FL}>{n ? <>of your market’s <Fig>{fmtInt(n)}</Fig> videos carry their comments</> : 'of your market’s videos carry their comments'}</div>
        <div className={FS}>{monthIn(page)}</div>
      </HubFig>
      <HubFig>
        {/* Decision 2: a group is never compared; the slot says so. */}
        <div className={FW}>{GROUP_NOT_COMPARED_TITLE}</div>
        <div className={FL}>against {longMonth(prevMonth(page.month.month))}</div>
        <div className={FS}>{GROUP_AFRESH}</div>
      </HubFig>
      <HubFig>
        {top ? (
          <>
            <div data-copy="figure" className={FV}>{fmtInt(top.k)}</div>
            <div className={FL}>of their <Fig>{fmtInt(page.videos)}</Fig> are about {top.label}</div>
            <div className={FS}>the subject they talk about most</div>
          </>
        ) : page.subjectsState === 'none_ready' ? (
          // Ruling U6: no subject has passed its check, so none carries a
          // figure; the place says so once.
          <>
            <div data-subject-state="none_ready" className={cn(FW, 'text-muted-foreground')}>{SUBJECT_NOT_MEASURED}</div>
            <div className={cn(FL, 'text-muted-foreground')}>what their videos are about</div>
            <div className={FS}>No subject has passed its check yet</div>
          </>
        ) : page.subjectsState === 'none' ? (
          <>
            <div className={cn(FW, 'text-muted-foreground')}>No subject yet</div>
            <div className={cn(FL, 'text-muted-foreground')}>{GROUP_NO_SUBJECTS}</div>
          </>
        ) : (
          <>
            <div className={cn(FW, 'text-muted-foreground')}>None yet</div>
            <div className={cn(FL, 'text-muted-foreground')}>of their videos is about a measured subject</div>
          </>
        )}
      </HubFig>
      <HubFig>
        <div data-copy="figure" className={FV}>{fmtInt(convs)}</div>
        <div className={FL}>{convs === 1 ? 'conversation they’re in' : 'conversations they’re in'}</div>
        {convs > 0 ? <a href="#talk" className={cn(OLINK, 'text-[12.5px]')}>See them below ↓</a> : null}
      </HubFig>
    </HubCard>
  )
}

function Prose({ text }: { text: string }) {
  return text ? <p className={READ}><span data-copy="subject" data-slot="pass_e_persona">{text}</span></p> : <p className={GAPLINE}>{GROUP_NOT_DESCRIBED}</p>
}

function ReadCard({ page }: { page: GroupPage }) {
  const maxWho = Math.max(1, ...page.who.map((w) => w.count))
  return (
    <article aria-label={`What ${page.name} want, what stops them, what tips them`} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-9 max-sm:gap-[18px] min-[1180px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3"><Caps>What they want</Caps><Prose text={page.wants} /></div>
        <div className="flex min-w-0 flex-col gap-3"><Caps>What stops them</Caps><Prose text={page.stops} /></div>
        <div className="flex min-w-0 flex-col gap-3"><Caps>What tips them into acting</Caps><Prose text={page.triggers} /></div>
      </div>
      <div className="grid grid-cols-1 gap-11 border-t border-track pt-6 max-sm:gap-[18px] max-sm:pt-[18px] min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <Caps>Who they say they are</Caps>
          {page.who.length > 0 ? (
            <>
              {page.who.map((w) => (
                <div key={w.label} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_30px] items-center gap-2.5 text-[13.5px]">
                  <span className="min-w-0"><span data-copy="stored" data-slot="pass_a_audience_insight">{w.label}</span></span>
                  <TickBar pct={(100 * w.count) / maxWho} size="md" label={`${w.label}: ${w.count}`} />
                  <Fig className="text-right text-[12.5px]">{fmtInt(w.count)}</Fig>
                </div>
              ))}
              <span className="text-[12px] text-muted-foreground">How often each came up in what they said</span>
            </>
          ) : (
            // The board's thin state: one quiet line and the rows' empty tracks.
            <>
              <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{GROUP_NO_WHO}</p>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_30px] items-center gap-2.5">
                  <EmptyBar className="w-3/5" /><EmptyBar /><span />
                </div>
              ))}
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <Caps>How they talk</Caps>
          {page.phrases.length > 0 ? (
            <>
              <div>{page.phrases.map((p) => <Phrase key={p.text} text={p.text} english={p.english} />)}</div>
              <span className="text-[12px] text-muted-foreground">Their own phrasings, each checked against a comment</span>
            </>
          ) : <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{HOW_THEY_TALK_NONE}</p>}
        </div>
      </div>
    </article>
  )
}

/** One subject their videos sit in (the boards' `.gsub`): its name, their
 *  videos in it (READY only), the conversations inside it for them (each a
 *  conversation's own count, never the subject's), its level on the market,
 *  and Market's page for it. */
function SubjectCard({ card, page }: { card: GroupSubjectCard; page: GroupPage }) {
  const ready = card.state === 'ready' && card.k != null
  return (
    <article data-subject-card={card.state} className={cn(CARD, 'gap-3 px-[22px] pt-5 pb-[18px] max-sm:px-[18px] max-sm:py-4')}>
      <div className="flex items-center justify-between gap-2.5">
        <MiniTile kind="subject" />
        <span className="text-[12px] font-semibold text-muted-foreground">Subject</span>
      </div>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">
        <Link href={card.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">{card.name}</Link>
      </h3>
      {ready ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span data-copy="figure" className="font-mono text-[26px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[22px]">{fmtInt(card.k!)}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground">of their <Fig>{fmtInt(page.videos)}</Fig> videos</span>
          </span>
          <TickBar pct={page.videos > 0 ? (100 * card.k!) / page.videos : 0} size="md" tone="market" label={`${card.name}: ${fmtInt(card.k!)} of their ${fmtInt(page.videos)} videos`} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-medium leading-[26px] text-muted-foreground">{SUBJECT_NOT_MEASURED}</span>
          <EmptyBar />
        </div>
      )}
      {card.inside.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <Caps className="mb-1">Inside it, for them</Caps>
          {card.inside.map((c) => (
            <Link key={c.id} href={c.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-[5px] text-[14px] text-foreground no-underline hover:bg-inner">
              <span className="inline-flex min-w-0 items-center gap-1.5"><BubbleGlyph className="size-3.5 shrink-0 text-muted-foreground" /><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></span>
              <Fig className="shrink-0 text-[13px] text-secondary-foreground">{fmtInt(c.k)}</Fig>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
        <span className="text-[12.5px] text-muted-foreground">
          {ready && card.market ? <><span data-copy="level">{fmtInt(card.market.k)} of {fmtInt(card.market.n)}</span> in the market</> : card.state === 'failed' ? 'Being re-described' : card.state !== 'ready' ? 'Its check is still open' : null}
        </span>
        <Link href={card.href} className={OLINK}>Open in Market →</Link>
      </div>
    </article>
  )
}

/** The line under the cards (the boards' `.pend`): the subjects not measured
 *  yet, named; why a failed one shows no figure, once on the page; a subject
 *  not carded that holds some of their conversations; and, at the right, the
 *  ready subjects not carded (their counts), and those on none of their
 *  videos (named). */
function Pending({ page }: { page: GroupPage }) {
  const all = page.subjectsState === 'none_ready'
  const nm = page.notMeasured
  const failed = nm.filter((s) => s.state === 'failed')
  const showLeft = nm.length > 0 || page.holdsMore.length > 0
  const showRight = page.alsoIn.length > 0 || page.inNone.length > 0
  if (!showLeft && !showRight) return null
  return (
    <div data-group-pending="" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-[12px] bg-card px-[18px] py-3 text-[13.5px] text-secondary-foreground ring-1 ring-border max-sm:px-3.5">
      {showLeft ? (
        <div className="flex min-w-0 flex-col gap-1">
          {nm.length > 0 ? (
            <p className="m-0 leading-[1.5]">
              <b className="font-semibold text-foreground">{SUBJECT_NOT_MEASURED}:</b>{' '}
              {all
                ? <>all <Fig>{fmtInt(nm.length)}</Fig> of your subjects. Each shows how many of their videos it holds once its check passes.</>
                : <>{nm.map((s) => s.label).join(', ')}. {nm.length === 1 ? 'It shows how many of their videos it holds once its check passes.' : 'Each shows how many of their videos it holds once its check passes.'}</>}
            </p>
          ) : null}
          {failed.map((f) => (
            <p key={f.id} data-subject-failed="" className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground"><span className="font-medium text-foreground">{f.label}.</span> {FAILED_EXPLAINED}</p>
          ))}
          {page.holdsMore.map((h) => (
            <p key={h.id} className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">{h.label} holds {countWords(h.convs)} more of their conversations, in the list below</p>
          ))}
        </div>
      ) : null}
      {showRight ? (
        <div className="flex min-w-0 flex-col gap-1 text-[12.5px] text-muted-foreground">
          {page.alsoIn.length > 0 ? (
            <span>Also in their videos: {page.alsoIn.map((s, i) => <Fragment key={s.id}>{i > 0 ? ' · ' : null}<Link href={s.href} className="text-inherit no-underline hover:underline">{s.label}</Link> <Fig>{fmtInt(s.k)}</Fig></Fragment>)}</span>
          ) : null}
          {page.inNone.length > 0 ? <span>In none of their videos: {page.inNone.map((s, i) => <Fragment key={s.id}>{i > 0 ? ', ' : null}<Link href={s.href} className="text-inherit no-underline hover:underline">{s.label}</Link></Fragment>)}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

const TH = 'whitespace-nowrap border-b border-border pb-2.5 pr-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const TD = 'border-b border-track py-[11px] pr-3 align-middle'

/** Every conversation they are in (the boards' table; a two-line list on a
 *  phone), most of their videos first, each opening its page in Market. */
function Conversations({ page }: { page: GroupPage }) {
  const total = page.conversations.length
  const when = page.month.monthWords
  return (
    <section aria-label={`Every conversation ${page.name} are in`} className={cn(CARD, 'gap-3.5 px-[26px] pt-[22px] pb-5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">
          {total === 1 ? 'The conversation they’re in' : <>All <Fig>{fmtInt(total)}</Fig> conversations they’re in</>}
        </h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">
          <span className="max-sm:hidden">Most of their videos first. Each opens as its page in Market.</span>
          <span className="sm:hidden">Their videos, then all the videos in it, {when}</span>
        </p>
      </div>
      {total === 0 ? <p className={GAPLINE}>{groupNoConversationsIn(when)}</p> : (
        <>
          <div className="max-sm:hidden">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Conversation</th>
                  <th scope="col" className={TH}>Subject</th>
                  <th scope="col" className={cn(TH, 'text-right')}>Their videos</th>
                  <th scope="col" className={cn(TH, 'pr-0 text-right')}>All videos in it, {when}</th>
                </tr>
              </thead>
              <tbody>
                {page.conversations.map((c) => (
                  <tr key={c.id} className="[&:last-child>td]:border-b-0">
                    <td className={TD}>
                      <Link href={c.href} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                      {c.description ? <span data-copy="subject" data-slot="pass_b_theme" className="mt-0.5 block text-[12.5px] font-normal text-muted-foreground">{c.description}</span> : null}
                    </td>
                    <td className={cn(TD, 'text-[13.5px] text-secondary-foreground')}>{c.subject?.name ?? null}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right font-mono tabular-nums')}><LevelText k={c.k} n={page.videos} /></td>
                    <td className={cn(TD, 'pr-0 text-right font-mono tabular-nums')}>{c.all != null ? <Fig>{fmtInt(c.all)}</Fig> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:hidden">
            {page.conversations.map((c) => (
              <div key={c.id} data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
                <Link href={c.href} className="min-w-0 text-[14px] font-medium text-foreground no-underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                <LevelText k={c.k} n={page.videos} className="text-right text-[13px]" />
                <span className="col-span-2 text-[12.5px] text-muted-foreground">
                  {c.subject ? <>{c.subject.name}{c.all != null ? ' · ' : null}</> : null}
                  {c.all != null ? <><Fig>{fmtInt(c.all)}</Fig> in {when}</> : null}
                </span>
              </div>
            ))}
          </div>
          <p data-conv-note="" className="m-0 text-[12.5px] text-muted-foreground">
            A video can sit in more than one conversation{conversationsOverlap(page) ? <>, so these add up to more than their <Fig>{fmtInt(page.videos)}</Fig> videos</> : null}.
          </p>
        </>
      )}
    </section>
  )
}

/** "Products in their videos": your products named in their videos this
 *  month, each opening in Your products; where none is read, one line. */
function ProductsColumn({ products, videos }: { products: GroupProducts; videos: number }) {
  const listed = products.rows.length > 0 || products.unclear > 0
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Caps>Products in their videos{listed && videos > 0 ? <> · of their <Fig>{fmtInt(videos)}</Fig></> : null}</Caps>
      {listed ? (
        <>
          {products.rows.map((p) => (
            <Link key={p.id} href={p.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
              <span className="min-w-0">{p.name}</span>
              <LevelText k={p.k} n={videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
            </Link>
          ))}
          {products.unclear > 0 ? (
            <div className="-mx-2 flex items-center justify-between gap-3 px-2 py-1.5 text-[14px] text-foreground">
              <span className="min-w-0">Couldn’t tell which product</span>
              <LevelText k={products.unclear} n={videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
            </div>
          ) : null}
          {products.rows.length > 0 ? <span className="text-[12px] text-muted-foreground">Each opens in Your products</span> : null}
        </>
      ) : <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{products.line}</p>}
    </div>
  )
}

function Numbers({ page }: { page: GroupPage }) {
  const b = page.brands
  const counted = b.state === 'ready'
  return (
    <section aria-label={`${page.name} in numbers`} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] max-sm:gap-y-[18px] min-[1180px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Caps>Brands named in their videos{counted && page.videos > 0 ? <> · of their <Fig>{fmtInt(page.videos)}</Fig></> : null}</Caps>
          {b.line && !counted ? <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{b.line}</p> : null}
          {b.rows.map((r) => (
            <Link key={r.key} href={r.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
              <span className="flex min-w-0 items-center gap-2">{r.label}{r.you ? <BrandChip who="you" className="text-[12px]">You</BrandChip> : null}</span>
              {r.k != null ? <LevelText k={r.k} n={page.videos} className="shrink-0 text-[13px] text-secondary-foreground" /> : <EmptyBar className="w-16" />}
            </Link>
          ))}
          {counted && b.line ? <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{b.line}</p> : null}
          {counted && b.rows.length > 0 ? <span className="text-[12px] text-muted-foreground">Each opens its page in Voices</span> : null}
        </div>
        <ProductsColumn products={page.products} videos={page.videos} />
        <div className="flex min-w-0 flex-col gap-2">
          <Caps>Where they comment{page.videos > 0 ? <> · of their <Fig>{fmtInt(page.videos)}</Fig></> : null}</Caps>
          {page.platforms.length > 0 && page.videos > 0
            ? page.platforms.map((p) => (
              <div key={p.platform} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_34px] items-center gap-2.5 text-[13.5px]">
                <span className="min-w-0 text-foreground">{p.label}</span>
                <TickBar pct={(100 * p.k) / page.videos} size="md" tone="ink" label={`${p.label}: ${fmtInt(p.k)} of ${fmtInt(page.videos)}`} />
                <Fig className="text-right text-[12.5px]">{fmtInt(p.k)}</Fig>
              </div>
            ))
            : <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">None of their comments in {page.month.monthWords}.</p>}
        </div>
      </div>
    </section>
  )
}

function Quotes({ page }: { page: GroupPage }) {
  const labelled = page.quotes.length > 0 && page.quotes.every((q) => q.from)
  return (
    <section aria-label="In their words" className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <Caps>In their words · <Fig>{fmtInt(page.quotes.length)}</Fig> of their comments in {page.month.monthWords}{labelled ? ', each from its conversation' : null}</Caps>
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          {page.quotes.map((q) => <LevelQuoteCard key={q.ref} q={q} />)}
        </div>
      </div>
    </section>
  )
}

/** The page's body under its title block, in the board's order. */
export function GroupPageBody({ page }: { page: GroupPage }) {
  const thin = page.subjectsState !== 'ready'
  return (
    <>
      <Header page={page} />
      <ReadCard page={page} />
      <LevelSection
        id="talk"
        title="What they talk about"
        note={thin
          ? <>No subject has passed its check yet, so none is counted for them · each opens in Market</>
          : <>Their <Fig>{fmtInt(page.videos)}</Fig> videos in your subjects<span className="max-sm:hidden">, then every conversation they’re in</span> · each opens in Market</>}
      />
      {page.cards.length > 0 ? (
        <section aria-label="The subjects their videos sit in" className="grid grid-cols-1 gap-5 max-sm:gap-3 min-[1180px]:grid-cols-3">
          {page.cards.map((c) => <SubjectCard key={c.id} card={c} page={page} />)}
        </section>
      ) : (
        <section aria-label="The subjects their videos sit in" data-group-subjects-none="" className={cn(CARD, 'gap-2')}>
          <p className={GAPLINE}>{page.subjectsState === 'none' ? GROUP_NO_SUBJECTS : 'None of their videos sits in a subject you track yet.'}</p>
        </section>
      )}
      <Pending page={page} />
      <Conversations page={page} />
      <LevelSection title="The numbers" note={<>Their <Fig>{fmtInt(page.videos)}</Fig> videos, {page.month.monthWords}</>} />
      <Numbers page={page} />
      {page.quotes.length > 0 ? <Quotes page={page} /> : null}
      <AskBox text={<>Ask what <span data-copy="subject" data-slot="pass_e_persona">{page.name}</span> say, in your own words.</>} href={page.askHref} button="Ask the Agent about this group" />
    </>
  )
}
