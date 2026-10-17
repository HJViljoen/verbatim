import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

import { BrandChip } from '@/components/colour-roles'
import { ProportionBar } from '@/components/proportion-bar'
import { translationLabel, translationNote } from '@/components/quote-block'
import { BubbleGlyph } from '@/components/shell/level-glyphs'
import { CARD, PanelSection, TickBarRow } from '@/components/v2'
import { priorityLabel, typeLabel } from '@/components/pages/moves/words'
import { SectionHead } from '@/components/pages/v2/market/analysis'
import { ASK, GroupRows } from '@/components/pages/v2/market/panel'
import { About } from '@/components/pages/v2/market/parts'
import { marketLabelsOf } from '@/lib/brands/labels'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { inlineMonth } from '@/lib/reading/month-label'
import { monthStartOf } from '@/lib/reading/month-key'
import { noGroupSaying } from '@/lib/pages/v2/market'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { GROUNDED_BASIS, RECORD_HREF, askAboutHref, sharePct, type RestsOnRow } from '@/lib/pages/v2/moves'
import type { AdvicePageData } from '@/lib/pages/v2/moves-levels-load'
import {
  ADVICE_CONV_CARDS, CONVERSATIONS_TITLE, HISTORY_TITLE, LEVEL_UNREAD, NO_COMMENT, NO_CONVERSATION, NO_MOVE_ON_IT, NO_OTHER_COMMENT, NO_THIRD_CONVERSATION,
  NUMBERS_TITLE, countWords, decisionWord, decisionWords, hubDecisionLine, movesDatedLine, noMoveOnItInvite, restsOnNote, streakWords,
  type AdviceConversation, type AdviceNumbers, type AdviceQuote, type WouldMoveLine,
} from '@/lib/pages/v2/moves-levels'
import type { WhoPart } from '@/lib/written/types'
import { cn } from '@/lib/utils'
import { AdviceTitle } from './advice'
import { Timeline } from './history-row'
import { MovesKindTile } from './level-tiles'
import { MoveStatusChip } from './moves'
import { MONO, OLINK, PRIORITY_CHIP, TAG_CHIP } from './parts'

// A PIECE OF ADVICE, THE HUB (board G6-Moves-Advice; -Thin, real Össur data
// as a member sees it; -Phone). It holds many things, so it is the richest
// of Your moves' pages, in the board's order:
//   1. THE HEADER CARD: the chips, the argument's first sentence at 32px, and
//      four figures inside the card (the videos it rests on, the updates in a
//      row with their dots, what it would move, the decision);
//   2. THE ARGUMENT: why (the rest of it) beside what it rests on;
//   3. THE CONVERSATIONS BEHIND IT: the three biggest as cards, then the rest
//      as a list, each opening on Market, its home;
//   4. THE NUMBERS: the line a move on it is read on (the reading month and
//      the two before, the only monthly figure here, decision 5), who raises
//      it, who it is about, what people did and where, each "of its N
//      videos", all time;
//   5. IN THEIR WORDS: three comments, each from its conversation;
//   6. ITS HISTORY: the nine-dot row and the moves made on it;
//   7. THE AGENT.
// Every component keeps its frame in every data state (the parity rule): a
// gap is said inside it, in one calm line.

/** The boards' `.pcard`. */
const PAGE_CARD = cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')
const READ = 'm-0 text-[15.5px] leading-[1.62] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground max-sm:text-[14.5px]'
const FV = 'font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[26px]'
const FW = 'text-[22px] leading-[34px] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[17px] max-sm:leading-[26px]'
const FL = 'text-[13.5px] leading-[1.4] text-foreground max-sm:text-[12.5px]'
const FS = 'text-[12.5px] leading-[1.4] text-muted-foreground max-sm:text-[12px]'

/** One of the strip's figures: four in a row from 1180, two to a row under it. */
function Fig({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      data-fig=""
      className={cn(
        'flex min-w-0 flex-col gap-1.5 border-border px-[22px] pt-5 pb-[22px] max-sm:px-4 max-sm:pt-[15px] max-sm:pb-4',
        'min-[1180px]:border-l min-[1180px]:first:border-l-0 min-[1180px]:first:pl-[34px] max-[1179px]:odd:pl-[34px] max-[1179px]:even:border-l max-[1179px]:[&:nth-child(n+3)]:border-t max-sm:odd:pl-[18px]',
        wide ? null : null,
      )}
    >
      {children}
    </div>
  )
}

/** The nine dots: an update that raised it dark, one that did not pale. */
function Dots({ recent }: { recent: readonly boolean[] }) {
  return (
    <span aria-hidden className="flex flex-wrap gap-1">
      {recent.map((on, i) => <i key={i} className={cn('inline-block size-2 rounded-full', on ? 'bg-foreground' : 'bg-track')} />)}
    </span>
  )
}

// ---- 1. the header card ---------------------------------------------------------------

function HubCard({ page }: { page: AdvicePageData }) {
  const { card } = page
  const chip = priorityLabel(card.priority)
  const type = typeLabel(card.kind)
  const lead = page.argument.lead
  const h = card.history
  const s = streakWords(h)
  const convs = page.conversations === 'unread' ? null : page.conversations.rows.length
  const target = page.conversations === 'unread' ? null : page.conversations.rows.find((c) => c.target) ?? null
  const targetHref = target?.href ?? (page.line && page.line !== 'unread' ? page.line.href : null)
  const moves = page.moves === 'unread' ? null : page.moves.cards.length
  const reading = monthStartOf(page.month)
  return (
    <article aria-labelledby={lead ? 'hub-head' : undefined} aria-label={lead ? undefined : card.title} data-advice-hub="" className={cn(CARD, 'gap-[22px] overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:gap-4 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chip ? <span className={cn('whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-semibold leading-none', PRIORITY_CHIP[chip])}>{chip}</span> : null}
          {type ? <span className={TAG_CHIP}>{type}</span> : null}
          <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>{card.status === 'new' ? 'not decided yet' : decisionWord(card).toLowerCase()}</span>
        </div>
        {lead
          ? <h2 id="hub-head" data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 max-w-[900px] text-[32px] leading-[1.24] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[23px] max-sm:leading-[1.28]">{lead}</h2>
          : <p className="m-0 text-[17px] leading-[1.5] text-muted-foreground">This piece of advice carries no argument we can print.</p>}
      </div>
      <div role="group" aria-label="This advice in figures" className="-mx-[34px] mt-1.5 grid grid-cols-2 border-t border-track bg-inner max-sm:-mx-[18px] max-sm:mt-1 min-[1180px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.05fr)]">
        <Fig>
          {card.grounded && !card.grounded.pruned ? (
            <>
              <div data-copy="figure" className={FV}>{fmtInt(card.grounded.videos)}</div>
              <div className={FL}>videos it rests on</div>
              <div className={FS}>{GROUNDED_BASIS}{convs != null && convs > 0 ? <>, in <span data-copy="figure">{fmtInt(convs)}</span> {convs === 1 ? 'conversation' : 'conversations'}</> : null}</div>
            </>
          ) : <p className={cn(FL, 'm-0 text-muted-foreground')}>{card.grounded?.pruned ? 'The evidence it was written from has since been replaced.' : 'No evidence was recorded for it.'}</p>}
        </Fig>
        <Fig>
          <div data-copy="figure" className={FV}>{fmtInt(s.value)}</div>
          <Dots recent={h.recent} />
          <div className={FL}>{s.label}</div>
          {s.sub ? <div className={FS}>{s.sub}</div> : null}
        </Fig>
        <Fig>
          <div className={FS}>Would move</div>
          {card.aim ? (
            <>
              <div className="text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[15px]">
                {targetHref
                  ? <Link href={targetHref} className="text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{card.aim.label}</span></Link>
                  : <span data-copy="subject" data-slot="pass_b_theme">{card.aim.label}</span>}
              </div>
              {card.aim.level
                ? <div className={FL}><span data-copy="level">{fmtInt(card.aim.level.k)} of {fmtInt(card.aim.level.n)}</span> market videos in {longMonth(reading)}</div>
                : <div className={FL}>No reading in {longMonth(reading)} yet</div>}
              {page.monthLabel ? <div className={FS}>{inlineMonth(longMonth(reading), page.monthLabel)}</div> : null}
            </>
          ) : <div className="text-[15px] font-medium text-muted-foreground">{page.line === 'unread' ? `What it would move ${LEVEL_UNREAD}` : 'No conversation read month by month yet'}</div>}
        </Fig>
        <Fig>
          <div className={FW}>{decisionWords(card)}</div>
          <div className={FL}>{card.status === 'new' ? `first suggested ${shortDate(card.firstMade)}` : card.decidedAt ? `since ${shortDate(card.decidedAt)}` : `first suggested ${shortDate(card.firstMade)}`}</div>
          {moves != null ? <div className={FS}>{movesDatedLine(moves)}</div> : null}
        </Fig>
      </div>
    </article>
  )
}

// ---- 2. the argument ------------------------------------------------------------------

function RestsOnRows({ rows }: { rows: readonly RestsOnRow[] }) {
  if (rows.length === 0) return <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">The conclusions it was written from have since been replaced by later updates.</p>
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span data-copy="stored" data-slot={r.kind === 'market' ? 'pass_d_a_insight' : 'pass_c_finding'} className="min-w-0">{r.title}</span>
            <span className={cn(MONO, 'whitespace-nowrap text-[12.5px] text-muted-foreground')}>
              {r.kind === 'rival' ? 'about a rival · Voices' : r.videos != null ? <><span data-copy="figure">{fmtInt(r.videos)}</span> {r.videos === 1 ? 'video' : 'videos'}, {GROUNDED_BASIS}</> : null}
            </span>
          </>
        )
        const cls = cn('grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 py-3 text-[14.5px] leading-[1.45] text-foreground no-underline max-sm:grid-cols-[minmax(0,1fr)] max-sm:gap-0.5', i > 0 ? 'border-t border-track' : 'pt-0.5')
        return r.kind === 'rival'
          ? <Link key={r.id} href="/dashboard/voices" className={cn(cls, 'hover:underline underline-offset-2')}>{inner}</Link>
          : <div key={r.id} className={cls}>{inner}</div>
      })}
    </div>
  )
}

function ArgumentCard({ page }: { page: AdvicePageData }) {
  const note = restsOnNote(page.card.restsOn)
  return (
    <article aria-label="The argument" className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <PanelSection label="Why" className="gap-3.5">
          {page.argument.rest.length > 0
            ? page.argument.rest.map((p, i) => <p key={i} data-copy="stored" data-slot="pass_d_b_recommendation" className={cn(READ, i === page.argument.rest.length - 1 && page.argument.rest.length > 1 ? 'text-secondary-foreground' : null)}>{p}</p>)
            : <p className={GAPLINE}>{page.argument.lead ? 'The argument is the line above.' : 'This piece of advice carries no argument we can print.'}</p>}
        </PanelSection>
        <PanelSection label="What it rests on" className="gap-3.5 max-[1179px]:border-t max-[1179px]:border-track max-[1179px]:pt-6 max-sm:mt-[18px] max-sm:pt-[18px]">
          <RestsOnRows rows={page.card.restsOn} />
          {note ? <p className="m-0 text-[12.5px] text-muted-foreground">{note}</p> : null}
        </PanelSection>
      </div>
    </article>
  )
}

// ---- 3. the conversations behind it ---------------------------------------------------

function ConvCard({ c, base, monthText }: { c: AdviceConversation; base: number; monthText: string }) {
  return (
    <article data-advice-conv="" className={cn(CARD, 'gap-3 px-6 pt-[22px] pb-5 max-sm:gap-2.5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="flex min-h-[26px] items-center justify-between gap-2.5">
        <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-track text-secondary-foreground"><BubbleGlyph className="size-3.5" /></span>
      </div>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">
        <Link href={c.href} className="text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
      </h3>
      {c.description ? <p data-copy="subject" data-slot="pass_b_theme" className="m-0 text-[14px] leading-[1.5] text-secondary-foreground max-sm:text-[13.5px]">{c.description}</p> : null}
      <div className="mt-auto border-t border-track pt-3">
        <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
          <b data-copy="figure" className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(c.videos)}</b> of its <span data-copy="figure">{fmtInt(base)}</span> videos
          <br />
          {c.level ? <><span data-copy="level"><span className="font-mono tabular-nums text-foreground">{fmtInt(c.level.k)}</span> of {fmtInt(c.level.n)}</span> market videos in {monthText}</> : <>No reading in {monthText} yet</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12.5px] text-muted-foreground">{c.target ? 'The one it would move' : null}</span>
        <Link href={c.href} className={OLINK}>Open in Market →</Link>
      </div>
    </article>
  )
}

const TH = 'whitespace-nowrap border-b border-border pb-2.5 pr-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const TD = 'border-b border-track py-[11px] pr-3 align-middle'

function ConvList({ rows, base, monthText }: { rows: readonly AdviceConversation[]; base: number; monthText: string }) {
  const over = rows.length > 0
  return (
    <section aria-label="The other conversations behind this advice" className={cn(CARD, 'gap-3.5 px-[26px] pt-[22px] pb-5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground"><span data-copy="figure">{fmtInt(rows.length)}</span> more {rows.length === 1 ? 'conversation' : 'conversations'}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">Fewest of its videos. Each opens in Market, on its own page.</p>
      </div>
      <div className="max-sm:hidden">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              <th scope="col" className={cn(TH, 'text-right')}>Of its <span data-copy="figure">{fmtInt(base)}</span> videos</th>
              <th scope="col" className={cn(TH, 'text-right')}>Market videos in {monthText}</th>
              <th scope="col" aria-label="Open" className={TH} />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="[&:last-child>td]:border-b-0">
                <td className={TD}>
                  <Link href={c.href} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                  {c.description ? <span data-copy="subject" data-slot="pass_b_theme" className="mt-0.5 block text-[12.5px] font-normal text-muted-foreground">{c.description}</span> : null}
                </td>
                <td className={cn(TD, 'text-right font-mono tabular-nums')}><span data-copy="figure">{fmtInt(c.videos)}</span></td>
                <td className={cn(TD, 'text-right font-mono tabular-nums')}>{c.level ? <span data-copy="level">{fmtInt(c.level.k)} of {fmtInt(c.level.n)}</span> : null}</td>
                <td className={cn(TD, 'text-right')}><Link href={c.href} className={cn(OLINK, 'text-[13px] whitespace-nowrap')}>Open in Market →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:hidden">
        {rows.map((c) => (
          <div key={c.id} data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
            <Link href={c.href} className="min-w-0 text-[14px] font-medium text-foreground no-underline"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
            <span data-copy="figure" className="text-right font-mono text-[13.5px] tabular-nums">{fmtInt(c.videos)}</span>
            {c.level ? <span className="col-span-2 text-[12.5px] text-muted-foreground"><span data-copy="level"><span className="font-mono text-foreground">{fmtInt(c.level.k)}</span> of {fmtInt(c.level.n)}</span> market videos in {monthText}</span> : null}
          </div>
        ))}
      </div>
      {over ? <p className="m-0 text-[12.5px] text-muted-foreground">A video can sit in more than one conversation, so these add up to more than its <span data-copy="figure">{fmtInt(base)}</span> videos.</p> : null}
    </section>
  )
}

function ConversationsSection({ page }: { page: AdvicePageData }) {
  const monthText = longMonth(monthStartOf(page.month))
  if (page.conversations === 'unread') {
    return (
      <>
        <div id="inside" className="scroll-mt-6"><SectionHead title={CONVERSATIONS_TITLE} /></div>
        <section aria-label={CONVERSATIONS_TITLE} className={cn(CARD, 'gap-2')}><p className={GAPLINE}>The conversations behind it {LEVEL_UNREAD}.</p></section>
      </>
    )
  }
  const { rows, videos } = page.conversations
  const cards = rows.slice(0, ADVICE_CONV_CARDS)
  const rest = rows.slice(ADVICE_CONV_CARDS)
  const note = rows.length > 0
    ? <>Its <span data-copy="figure">{fmtInt(videos)}</span> videos sit in <span data-copy="figure">{fmtInt(rows.length)}</span> {rows.length === 1 ? 'conversation' : 'conversations'}{rest.length > 0 ? ' · the three biggest, then the rest' : ' Market reads'} · each opens in Market</>
    : null
  return (
    <>
      <div id="inside" className="scroll-mt-6"><SectionHead title={CONVERSATIONS_TITLE} note={note} /></div>
      <section aria-label={CONVERSATIONS_TITLE} className="grid grid-cols-1 gap-5 max-sm:gap-3 min-[1180px]:grid-cols-3">
        {cards.map((c) => <ConvCard key={c.id} c={c} base={videos} monthText={monthText} />)}
        {/* The board's three places always: a place no conversation fills
            keeps its frame and says why, once. */}
        {cards.length < ADVICE_CONV_CARDS ? (
          <article data-advice-conv-slot="" className="flex min-w-0 flex-col justify-center gap-3 rounded-[14px] px-6 py-[22px] ring-1 ring-border max-sm:px-[18px] max-sm:py-4">
            <span aria-hidden className="flex size-[26px] items-center justify-center rounded-[7px] text-muted-foreground ring-1 ring-border"><BubbleGlyph className="size-3.5" /></span>
            <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{cards.length === 0 ? NO_CONVERSATION : cards.length === 2 ? NO_THIRD_CONVERSATION : 'No other conversation holds its videos. The rest sit in no conversation Market reads month by month.'}</p>
          </article>
        ) : null}
      </section>
      {rest.length > 0 ? <ConvList rows={rest} base={videos} monthText={monthText} /> : null}
    </>
  )
}

// ---- 4. the numbers -------------------------------------------------------------------

/** The line a move on it is read on: the reading month and the two before as
 *  bars, a month left off or with no reading an empty dashed slot. */
function LineBars({ line }: { line: WouldMoveLine }) {
  const W = 440
  const BASE = 104
  const TOP = 22
  const slot = W / line.slots.length
  const bw = slot * 0.56
  const shares = line.slots.map((s) => (s.point && s.point.n > 0 ? s.point.k / s.point.n : null))
  const max = Math.max(0.0001, ...shares.map((x) => x ?? 0)) * 1.15
  const words = line.slots.map((s) => `${longMonth(s.month)} ${s.point ? `${sharePct(s.point.k, s.point.n)} (${fmtInt(s.point.k)} of ${fmtInt(s.point.n)})` : 'no reading'}`).join(', ')
  return (
    <svg viewBox={`0 0 ${W} ${BASE + 40}`} role="img" aria-label={`${line.label}, share of market videos: ${words}.`} className="block h-auto w-full max-w-[520px] overflow-visible">
      <line x1={0} y1={BASE} x2={W} y2={BASE} className="stroke-border" />
      {line.slots.map((s, i) => {
        const x = i * slot + (slot - bw) / 2
        const cx = i * slot + slot / 2
        const last = i === line.slots.length - 1
        const share = shares[i]
        const h = share == null ? (BASE - TOP) * 0.4 : Math.max(2, (share / max) * (BASE - TOP))
        return (
          <g key={s.month}>
            {share == null ? (
              <rect x={x} y={BASE - h} width={bw} height={h} rx={2} fill="none" className="stroke-border" strokeDasharray="4 3" />
            ) : s.point?.soFar ? (
              <rect x={x} y={BASE - h} width={bw} height={h} rx={2} fillOpacity={0.35} strokeWidth={1.5} className="fill-brand stroke-foreground" data-filling="" />
            ) : (
              <rect x={x} y={BASE - h} width={bw} height={h} rx={2} className="fill-brand" />
            )}
            {s.point ? <text data-copy="figure" x={cx} y={BASE - h - 7} textAnchor="middle" className="fill-foreground font-mono text-[11.5px] font-medium">{sharePct(s.point.k, s.point.n)}</text> : null}
            <text x={cx} y={BASE + 16} textAnchor="middle" className={cn('font-mono text-[10.5px]', last ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>{longMonth(s.month)}{s.point?.soFar ? ' so far' : ''}</text>
            {s.point
              ? <text data-copy="level" x={cx} y={BASE + 30} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{fmtInt(s.point.k)} of {fmtInt(s.point.n)}</text>
              : <text x={cx} y={BASE + 30} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{s.why === 'cut' ? 'left off' : 'no reading'}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** Who a set of videos is about: the bar where a brand is in it, then the
 *  running line (Market's `WhoLine`, with the brand and the noun given). */
export function WhoLine({ parts, brand, noun }: { parts: readonly WhoPart[]; brand: string; noun: string | null }) {
  const total = parts.reduce((s, p) => s + p.videos, 0)
  const words = marketLabelsOf(noun)
  const segments = parts.map((p) => ({
    label: p.about === 'client' ? brand : p.about === 'market' ? words.short : p.about.slice('rival:'.length),
    count: p.videos,
    pct: total > 0 ? Math.round((100 * p.videos) / total) : 0,
    color: p.about === 'client' ? 'bg-you' : p.about === 'market' ? 'bg-track' : 'bg-comp',
  }))
  return (
    <>
      {parts.some((p) => p.about !== 'market') ? <ProportionBar of="videos" segments={segments} /> : null}
      <About parts={parts} brand={brand} noun={noun} />
    </>
  )
}

/** Who raises it, who it is about, what people did and where, each "of" the
 *  base its label names. Used by the advice's page (all time) and a move's
 *  (since its day). */
export function NumberBlocks({ numbers, brand, noun, of, when }: {
  numbers: Pick<AdviceNumbers, 'n' | 'who' | 'brands' | 'doing' | 'where'>
  brand: string
  noun: string | null
  /** "of its 63 videos", "of 112". */
  of: ReactNode
  when: string
}) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:border-t-0 max-sm:pt-0 min-[1180px]:grid-cols-3">
      <PanelSection label={<>Who it’s about · {of}</>} className="max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
        {numbers.brands !== 'counted'
          ? <p className="m-0 text-[13.5px] text-muted-foreground">{numbers.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
          : numbers.who ? <WhoLine parts={numbers.who.parts} brand={brand} noun={noun} /> : <p className="m-0 text-[13.5px] text-muted-foreground">No video read for who it is about.</p>}
      </PanelSection>
      <PanelSection label={<>What people did · {of}</>} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
        {numbers.doing.length > 0
          ? numbers.doing.map((r) => <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} />)
          : <p className="m-0 text-[13.5px] text-muted-foreground">Not read {when} yet.</p>}
      </PanelSection>
      <PanelSection label={<>Where · {of}</>} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
        {numbers.where
          ? numbers.where.rows.map((r) => <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(numbers.where!.n)}`} />)
          : <p className="m-0 text-[13.5px] text-muted-foreground">No video counted by platform yet.</p>}
      </PanelSection>
    </div>
  )
}

function NumbersCard({ page, noun }: { page: AdvicePageData; noun: string | null }) {
  const numbers = page.numbers
  const n = numbers === 'unread' ? null : numbers.n
  const of = n != null ? <>of its <span data-copy="figure">{fmtInt(n)}</span> videos</> : 'of its videos'
  return (
    <section aria-label="This advice in numbers" className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PanelSection label={page.line && page.line !== 'unread' ? <><span data-copy="subject" data-slot="pass_b_theme">{page.line.label}</span> · share of market videos</> : 'The line a move on it is read on'}>
          {page.line === 'unread'
            ? <p className={GAPLINE}>Its line {LEVEL_UNREAD}.</p>
            : page.line
              ? (
                <>
                  <LineBars line={page.line} />
                  <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">{page.line.note}</p>
                </>
              )
              : <p className={GAPLINE}>Its evidence leads to no conversation read month by month yet, so a move on it has no line to be read on.</p>}
        </PanelSection>
        <PanelSection label={<>Who raises it · {of}</>} className="max-[1179px]:mt-6 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          {numbers === 'unread'
            ? <p className="m-0 text-[13.5px] text-muted-foreground">Not read just now.</p>
            : numbers.groups && numbers.groups.length > 0
              ? <GroupRows groups={numbers.groups.slice(0, 4)} n={numbers.n} />
              : <p className="m-0 text-[13.5px] text-muted-foreground">{numbers.groups ? noGroupSaying('all time') : 'Not linked to a group.'}</p>}
        </PanelSection>
      </div>
      {numbers === 'unread'
        ? <p className={GAPLINE}>Its numbers {LEVEL_UNREAD}.</p>
        : <NumberBlocks numbers={numbers} brand={page.brand} noun={noun} of={of} when="all time" />}
    </section>
  )
}

// ---- 5. in their words ----------------------------------------------------------------

export function QuotePanel({ q, brand }: { q: AdviceQuote; brand: string }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  return (
    <figure data-advice-quote="" className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      {q.conv ? (
        <Link href={q.conv.href} data-quote-from="" className="mb-0.5 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-secondary-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">
          <BubbleGlyph className="size-3 text-muted-foreground" />
          <span data-copy="subject" data-slot="pass_b_theme">{q.conv.label}</span>
        </Link>
      ) : null}
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground max-sm:text-[15px]">“{q.text}”</blockquote>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      <figcaption className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
        <span>{q.cite}</span>
        {q.about === 'client' ? <BrandChip who="you">{brand}</BrandChip> : q.about && q.about !== 'market' ? <BrandChip who="rival">{q.about.slice('rival:'.length)}</BrandChip> : null}
      </figcaption>
    </figure>
  )
}

function QuotesCard({ page }: { page: AdvicePageData }) {
  const quotes = page.quotes === 'unread' ? [] : page.quotes
  const labelled = quotes.length > 1 && quotes.every((q) => q.conv)
  return (
    <section aria-label="In their words" className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          In their words{quotes.length > 0 ? <> · <span data-copy="figure">{fmtInt(quotes.length)}</span> {quotes.length === 1 ? 'comment' : 'comments'}{labelled ? ', each from its conversation' : null}</> : null}
        </p>
        {page.quotes === 'unread' ? <p className={GAPLINE}>Its comments {LEVEL_UNREAD}.</p> : (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {quotes.map((q, i) => <QuotePanel key={i} q={q} brand={page.brand} />)}
            {quotes.length < 3 ? <p data-quotes-gap="" className="m-0 flex items-center px-[15px] py-[13px] text-[13.5px] leading-[1.5] text-muted-foreground">{quotes.length === 0 ? NO_COMMENT : NO_OTHER_COMMENT}</p> : null}
          </div>
        )}
      </div>
    </section>
  )
}

// ---- 6. its history -------------------------------------------------------------------

function HistoryCard({ page }: { page: AdvicePageData }) {
  const { card } = page
  const h = card.history
  const cards = page.moves === 'unread' ? null : page.moves.cards
  const invite = page.canDecide && card.status === 'new' && page.moves !== 'unread' && page.moves.recorded
  return (
    <section aria-label={HISTORY_TITLE} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-5 min-[1180px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PanelSection label={<>How long we have been saying it · <span data-copy="figure">{fmtInt(h.dates.length)}</span> {h.dates.length === 1 ? 'update' : 'updates'}</>}>
          <Timeline history={h} />
          <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">{hubDecisionLine(card)}</p>
        </PanelSection>
        <PanelSection label="Moves made on it">
          {cards == null ? <p className="m-0 rounded-[10px] bg-inner px-[17px] py-[15px] text-[14px] leading-[1.55] text-secondary-foreground">Its moves {LEVEL_UNREAD}.</p>
            : cards.length === 0 ? (
              <p data-moves-on-it="none" className="m-0 rounded-[10px] bg-inner px-[17px] py-[15px] text-[14px] leading-[1.55] text-secondary-foreground">
                {NO_MOVE_ON_IT}{invite ? <> {noMoveOnItInvite(card.aim?.label ?? null)}</> : null}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {cards.map((m) => (
                  <Link key={m.id} href={m.href} data-move-on-it="" className="flex items-center gap-3 rounded-[10px] bg-inner px-3.5 py-3 text-foreground no-underline hover:bg-track">
                    <MovesKindTile level="move" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold leading-[1.35]"><span data-copy="quote">{m.title}</span></span>
                      <span className="block text-[12.5px] text-muted-foreground">Dated {shortDate(m.day)}</span>
                    </span>
                    <MoveStatusChip status={m.status} className="bg-card" />
                  </Link>
                ))}
              </div>
            )}
        </PanelSection>
      </div>
    </section>
  )
}

/** The page's body under its title block, in the board's order. */
export function AdvicePageBody({ page }: { page: AdvicePageData }) {
  const n = page.numbers === 'unread' ? null : page.numbers.n
  const ask = askAboutHref(page.card.title)
  return (
    <>
      <HubCard page={page} />
      <ArgumentCard page={page} />
      <ConversationsSection page={page} />
      <SectionHead title={NUMBERS_TITLE} note={n != null ? <>Its <span data-copy="figure">{fmtInt(n)}</span> videos, all time, and the line a move on it is read on</> : null} />
      <NumbersCard page={page} noun={page.noun} />
      <QuotesCard page={page} />
      <SectionHead title={HISTORY_TITLE} note={<Link href={RECORD_HREF} className={OLINK}>The advice record, all <span data-copy="figure">{fmtInt(page.record.total)}</span> →</Link>} />
      <HistoryCard page={page} />
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">Ask what is behind this advice, and what it would change, in your own words.</p>
        <Link href={ask} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </section>
      <Link href={ask} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
    </>
  )
}

/** The title block's meta line, as its phone lines: the type, the day it was
 *  first suggested, the videos it rests on (all time). */
export function adviceMeta(page: AdvicePageData): ReactNode[][] {
  const { card } = page
  const type = typeLabel(card.kind)
  return [
    type ? [type] : [],
    card.firstMade ? [`first suggested ${shortDate(card.firstMade)}`] : [],
    card.grounded && !card.grounded.pruned ? [<><span data-copy="figure">{fmtInt(card.grounded.videos)}</span> videos it rests on, {GROUNDED_BASIS}</>] : [],
  ]
}

export { AdviceTitle, countWords }
