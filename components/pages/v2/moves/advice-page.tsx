import Link from 'next/link'
import type { ReactNode } from 'react'

import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { CARD, commaCite, EmptyBox, GoLink, Label, SectionHead, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, Tag, TBL, TD, TD_NUM, TH, TickBar, toMax, translationLine, type StatItem } from '@/components/v2'
import { QUOTE, ROW } from '@/components/v2/look'
import { priorityLabel, typeLabel } from '@/components/pages/moves/words'
import { GroupRows } from '@/components/pages/v2/market/panel'
import { marketLabelsOf } from '@/lib/brands/labels'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { inlineMonth } from '@/lib/reading/month-label'
import { monthStartOf } from '@/lib/reading/month-key'
import { noGroupSaying } from '@/lib/pages/v2/market'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { GROUNDED_BASIS, RECORD_HREF, askAboutHref, sharePct, streakLabel, type MoveSlot, type RestsOnRow } from '@/lib/pages/v2/moves'
import type { AdvicePageData } from '@/lib/pages/v2/moves-levels-load'
import {
  CONVERSATIONS_TITLE, HISTORY_TITLE, LEVEL_UNREAD, NO_COMMENT, NO_CONVERSATION, NO_MOVE_ON_IT, NO_OTHER_COMMENT,
  NUMBERS_TITLE, countWords, decisionWords, hubDecisionLine, movesDatedLine, noMoveOnItInvite, restsOnNote,
  type AdviceConversation, type AdviceNumbers, type AdviceQuote,
} from '@/lib/pages/v2/moves-levels'
import type { WhoPart } from '@/lib/written/types'
import { cn } from '@/lib/utils'
import { AdviceTitle, priorityTone } from './advice'
import { Timeline } from './history-row'
import { MoveStatusChip } from './moves'

// A PIECE OF ADVICE, THE HUB (board G6-Moves-Advice; -Thin, real Össur data
// as a member sees it; -Phone; since the audit design, 7 Nov,
// Moves-Advice.dc.html). It holds many things, so it is the richest of Your
// moves' pages, in the board's order:
//   0. THE TITLE BLOCK: the title, its tags (the priority, the kind, the
//      decision, the moves dated on it), the two decisions at its right for
//      an owner or an admin, and the figures row (`adviceStats`: first
//      suggested, the videos it rests on, the updates that raised it, what it
//      would move with its level in the reading month);
//   1. THE ARGUMENT, one tile: its first sentence as the lead, then why (the
//      rest of it) beside what it rests on;
//   2. THE CONVERSATIONS BEHIND IT, one table, each opening on Market, its
//      home, its bar against the largest row (decision 5);
//   3. THE NUMBERS, one tile: the line a move on it is read on (the reading
//      month and the two before, the only monthly figure here, decision 5),
//      who raises it, who it is about, what people did and where, each of its
//      videos all time, the base said once in the section's note;
//   4. IN THEIR WORDS: a comment a tile, each from its conversation;
//   5. ITS HISTORY: the updates that raised it as dated rules, and the moves
//      made on it;
//   6. THE AGENT.
// Every component keeps its frame in every data state (the parity rule): a
// gap is said inside it, in the dashed box (decision 4).

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>
const READ = 'm-0 text-[16px] leading-[1.6] text-foreground max-sm:text-[15px]'
const H = 'm-0 text-[15px] font-semibold text-secondary-foreground'

// ---- 0. the title block -----------------------------------------------------------------

/** Its tags under the title (the board's row): the priority, the kind in
 *  words, the decision, and the moves dated on it. */
export function AdviceTags({ page }: { page: AdvicePageData }) {
  const { card } = page
  const chip = priorityLabel(card.priority)
  const type = typeLabel(card.kind)
  const moves = page.moves === 'unread' ? null : page.moves.cards.length
  const dated = moves != null ? movesDatedLine(moves) : null
  return (
    <>
      {chip ? <Tag tone={priorityTone(chip)}>{chip}</Tag> : null}
      {type ? <span className="text-[14px] text-secondary-foreground">{type}</span> : null}
      <Tag tone="mid">{decisionWords(card)}</Tag>
      {dated ? <span className="text-[14px] text-muted-foreground">{`${dated.charAt(0).toUpperCase()}${dated.slice(1)}`}</span> : null}
    </>
  )
}

/** The figures row (the board's `.strip`): first suggested, the videos it
 *  rests on and the conversations they sit in, the updates that raised it,
 *  and what it would move with its level in the reading month (the
 *  category's base, said here once, so the conversations' table may print
 *  bare counts). Pure. */
export function adviceStats(page: AdvicePageData): StatItem[] {
  const { card } = page
  const convs = page.conversations === 'unread' ? null : page.conversations.rows.length
  const target = page.conversations === 'unread' ? null : page.conversations.rows.find((c) => c.target) ?? null
  const targetHref = target?.href ?? (page.line && page.line !== 'unread' ? page.line.href : null)
  const reading = monthStartOf(page.month)
  const h = card.history
  const aim = card.aim
  const label = aim ? <span data-copy="subject" data-slot="pass_b_theme">{aim.label}</span> : null
  return [
    { key: 'first', term: 'First suggested', value: card.firstMade ? shortDate(card.firstMade) : 'Not recorded' },
    {
      key: 'rests',
      term: `Rests on, ${GROUNDED_BASIS}`,
      value: card.grounded && !card.grounded.pruned
        ? <>{fig(card.grounded.videos)} {card.grounded.videos === 1 ? 'video' : 'videos'}{convs != null && convs > 0 ? <>, in {fig(convs)} {convs === 1 ? 'conversation' : 'conversations'}</> : null}</>
        : card.grounded?.pruned ? 'Since replaced' : 'Not recorded',
    },
    { key: 'raised', term: 'Raised by', value: <>{fig(h.streak > 0 ? h.streak : h.dates.length)} {streakLabel(h)}</> },
    {
      key: 'would',
      term: 'Would move',
      value: aim ? (
        <>
          {targetHref ? <Link href={targetHref} className="text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground">{label}</Link> : label}
          <span className="mt-0.5 block text-[14px] font-normal text-secondary-foreground">
            {aim.level
              ? <><span data-copy="level">{fmtInt(aim.level.k)} of {fmtInt(aim.level.n)}</span> category videos in {inlineMonth(longMonth(reading), page.monthLabel)}</>
              : <>No reading in {longMonth(reading)} yet</>}
          </span>
        </>
      ) : page.line === 'unread' ? `Could not be read just now` : 'No conversation read month by month yet',
    },
  ]
}

// ---- 1. the argument --------------------------------------------------------------------

function RestsOnRows({ rows }: { rows: readonly RestsOnRow[] }) {
  if (rows.length === 0) return <EmptyBox>The conclusions it was written from have since been replaced by later updates.</EmptyBox>
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const title = <span data-copy="stored" data-slot={r.kind === 'market' ? 'pass_d_a_insight' : 'pass_c_finding'} className="min-w-0">{r.title}</span>
        const side = r.kind === 'rival'
          ? <span className="whitespace-nowrap text-secondary-foreground">About a rival, in Voices</span>
          : r.videos != null ? <span className="whitespace-nowrap text-secondary-foreground">{fig(r.videos)} {r.videos === 1 ? 'video' : 'videos'}, {GROUNDED_BASIS}</span> : null
        const cls = cn('flex justify-between gap-4 py-2 text-[16px] leading-[1.5] text-foreground max-sm:flex-col max-sm:gap-0.5', i > 0 ? 'border-t border-track' : null)
        return r.kind === 'rival'
          ? <Link key={r.id} href="/dashboard/voices" className={cn(cls, 'no-underline hover:[&>span:first-child]:underline')}>{title}{side}</Link>
          : <div key={r.id} className={cls}>{title}{side}</div>
      })}
    </div>
  )
}

/** The argument, one tile: its first sentence as the lead (the hub's
 *  heading), then why (the rest) beside what it rests on. */
function ArgumentCard({ page }: { page: AdvicePageData }) {
  const { card } = page
  const lead = page.argument.lead
  const note = restsOnNote(card.restsOn)
  return (
    <article aria-labelledby={lead ? 'hub-head' : undefined} aria-label={lead ? undefined : card.title} data-advice-hub="" className={cn(CARD, 'gap-[22px] sm:p-[30px]')}>
      {lead
        ? <h2 id="hub-head" data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 max-w-[1040px] text-[24px] leading-[1.4] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[20px]">{lead}</h2>
        : <EmptyBox>This piece of advice carries no argument we can print.</EmptyBox>}
      <div className="grid grid-cols-1 gap-9 border-t border-track pt-[22px] max-sm:gap-6 min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={H}>Why</h3>
          {page.argument.rest.length > 0
            ? page.argument.rest.map((p, i) => <p key={i} data-copy="stored" data-slot="pass_d_b_recommendation" className={cn(READ, i === page.argument.rest.length - 1 && page.argument.rest.length > 1 ? 'text-secondary-foreground' : null)}>{p}</p>)
            : <p className="m-0 text-[15px] text-muted-foreground">{lead ? 'The argument is the line above.' : 'Nothing more is written for it.'}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={H}>What it rests on</h3>
          <RestsOnRows rows={card.restsOn} />
          {note ? <p className="m-0 text-[13px] text-muted-foreground">{note}</p> : null}
        </div>
      </div>
    </article>
  )
}

// ---- 2. the conversations behind it -----------------------------------------------------

/** Every conversation its videos sit in, one table (the board's): the
 *  conversation (its page's link, the one it would move as a tag, Pass B's
 *  line), its share of the advice's videos as a bar against the largest
 *  (decision 5) and a bare count, and its videos in the reading month, bare
 *  where the figures row states the base (the would-move's), else "k of n". */
function ConversationsTable({ rows, videos, monthText, base }: { rows: readonly AdviceConversation[]; videos: number; monthText: string; base: number | null }) {
  const bar = toMax(rows.map((c) => c.videos))
  return (
    // On a phone each conversation stacks (decision 14): its name, tag and
    // line, then its share of the advice's videos, then its month, each
    // figure saying what it is of where the hidden head said it.
    <div className="min-w-0 overflow-x-auto">
      <table className={cn(TBL, STACK, 'sm:min-w-[680px]')}>
        <thead className={STACK_HEAD}>
          <tr>
            <th scope="col" className={TH}>Conversation</th>
            <th scope="col" className={cn(TH, 'w-[220px]')}>Of its {fig(videos)} videos</th>
            <th scope="col" className={cn(TH, 'w-[210px] pr-0 text-right')}>Category videos in {monthText}</th>
          </tr>
        </thead>
        <tbody className={STACK}>
          {rows.map((c) => (
            <tr key={c.id} data-advice-conv="" className={STACK_ROW}>
              <td className={cn(TD, STACK_CELL)}>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={c.href} className={ROW}><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></Link>
                  {c.target ? <Tag tone="mid">The one it would move</Tag> : null}
                </span>
                {c.description ? <p data-copy="subject" data-slot="pass_b_theme" className="m-0 mt-1.5 text-[14.5px] leading-[1.5] text-secondary-foreground">{c.description}</p> : null}
              </td>
              <td className={cn(TD, STACK_CELL)}>
                <span className="mt-1 block text-[13px] text-muted-foreground sm:hidden">Of its {fig(videos)} videos</span>
                <div className="grid grid-cols-[minmax(0,1fr)_34px] items-center gap-2.5 pt-1.5">
                  <TickBar pct={bar(c.videos)} size="md" label={`${fmtInt(c.videos)} of its ${fmtInt(videos)} videos`} />
                  <span className="text-right font-semibold">{fig(c.videos)}</span>
                </div>
              </td>
              <td className={cn(TD, TD_NUM, 'pr-0 pt-[18px]', STACK_CELL, 'max-sm:text-[14px]')}>
                <span className="text-secondary-foreground sm:hidden">Category videos in {monthText}: </span>
                {c.level
                  ? (c.level.n === base ? fig(c.level.k) : <span data-copy="level">{fmtInt(c.level.k)} of {fmtInt(c.level.n)}</span>)
                  : <span className="text-muted-foreground">No reading</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConversationsSection({ page }: { page: AdvicePageData }) {
  // The reading month, labelled where it is not the current one (decision
  // 3): "in September, the last full month", in the one helper's words.
  const monthText = inlineMonth(longMonth(monthStartOf(page.month)), page.monthLabel)
  if (page.conversations === 'unread') {
    return (
      <>
        <div id="inside" className="scroll-mt-6"><SectionHead title={CONVERSATIONS_TITLE} /></div>
        <section aria-label={CONVERSATIONS_TITLE} className={CARD}><EmptyBox>The conversations behind it {LEVEL_UNREAD}.</EmptyBox></section>
      </>
    )
  }
  const { rows, videos } = page.conversations
  const note = rows.length > 0
    ? <>Its {fig(videos)} videos sit in {fig(rows.length)} {rows.length === 1 ? 'conversation' : 'conversations'}{rows.length > 1 ? ', biggest first' : null}. Each opens in Market.</>
    : null
  const base = page.card.aim?.level?.n ?? null
  return (
    <>
      <div id="inside" className="scroll-mt-6"><SectionHead title={CONVERSATIONS_TITLE} note={note} /></div>
      <section aria-label={CONVERSATIONS_TITLE} className={cn(CARD, 'gap-3.5')}>
        {rows.length === 0 ? <EmptyBox>{NO_CONVERSATION}</EmptyBox> : (
          <>
            <ConversationsTable rows={rows} videos={videos} monthText={monthText} base={base} />
            {rows.length > 1 ? <p className="m-0 text-[13px] text-muted-foreground">A video can sit in more than one conversation, so these add up to more than its {fig(videos)} videos.</p> : null}
          </>
        )}
      </section>
    </>
  )
}

// ---- 3. the numbers ---------------------------------------------------------------------

/** What an empty month on the line says, in a word or two. */
const SLOT_WORDS: Record<NonNullable<MoveSlot['why']>, string> = {
  cut: 'Left off',
  unknown: 'Left off',
  unread: 'No reading',
  pending: 'Not read yet',
  move: 'Not drawn',
}

/** The line a move on it would be read on, as the board's months: each
 *  month's share and its "k of n" (the base the line names, never the
 *  figures row's), an empty month in a word, the newest month under the
 *  yellow rule. */
function LineMonths({ slots }: { slots: readonly MoveSlot[] }) {
  const last = slots.length - 1
  return (
    <dl className="m-0 grid gap-4" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
      {slots.map((s, i) => (
        <div key={s.month} data-line-month="" className={cn('min-w-0', i === last ? 'border-t-2 border-brand pt-[9px]' : 'border-t border-border pt-2.5')}>
          <dt className="text-[13px] text-muted-foreground">{longMonth(s.month)}{s.point?.soFar ? ' so far' : ''}</dt>
          {s.point ? (
            <>
              <dd data-copy="figure" className="m-0 mt-1 text-[26px] font-bold leading-[1.1] tabular-nums">{sharePct(s.point.k, s.point.n)}</dd>
              <dd className="m-0 mt-1 text-[14px] text-secondary-foreground"><span data-copy="level">{fmtInt(s.point.k)} of {fmtInt(s.point.n)}</span></dd>
            </>
          ) : <dd className="m-0 mt-1.5 text-[14.5px] text-muted-foreground">{SLOT_WORDS[s.why ?? 'unknown']}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** Who a set of videos is about (the board's): one bar in the colour roles
 *  (you the gold, a rival the grey, the rest the control grey) and its key,
 *  each name with its videos. "No brand named" where none is. */
export function WhoLine({ parts, brand, noun }: { parts: readonly WhoPart[]; brand: string; noun: string | null }) {
  const total = parts.reduce((s, p) => s + p.videos, 0)
  if (total === 0 || !parts.some((p) => p.about !== 'market')) return <p className="m-0 text-[14.5px] text-muted-foreground">No brand named</p>
  const words = marketLabelsOf(noun)
  const rank = (p: WhoPart) => (p.about === 'client' ? 0 : p.about === 'market' ? 2 : 1)
  const ordered = [...parts].sort((a, b) => rank(a) - rank(b) || b.videos - a.videos)
  const fill = (p: WhoPart) => (p.about === 'client' ? 'bg-you' : p.about === 'market' ? 'bg-control' : 'bg-comp')
  const name = (p: WhoPart) => (p.about === 'client'
    ? <BrandChip who="you" plain>{brand}</BrandChip>
    : p.about === 'market' ? `${words.short.charAt(0).toUpperCase()}${words.short.slice(1)}` : <BrandChip who="rival" plain>{p.about.slice('rival:'.length)}</BrandChip>)
  return (
    <div>
      <div role="img" aria-label={ordered.map((p) => `${p.about === 'client' ? brand : p.about === 'market' ? words.short : p.about.slice('rival:'.length)} ${fmtInt(p.videos)}`).join(', ')} className="mt-1 flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
        {ordered.map((p) => (p.videos > 0 ? <div key={p.about} className={fill(p)} style={{ width: `${(100 * p.videos) / total}%` }} /> : null))}
      </div>
      <dl className="m-0 mt-2.5 flex flex-wrap gap-x-[22px] gap-y-1.5 text-[14.5px]">
        {ordered.map((p) => (
          <div key={p.about} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('inline-block size-2.5 rounded-[2px]', fill(p))} />
            <dt>{name(p)}</dt>
            <dd className="m-0 font-semibold">{fig(p.videos)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** A list's rows: a name, a bar against the list's largest (decision 5), a
 *  bare count of the base the section names once. The move page's facts
 *  draw with it too. */
export function BarRows({ rows, bar = 90 }: { rows: readonly { key: string; name: ReactNode; k: number }[]; bar?: 90 | 110 }) {
  const at = toMax(rows.map((r) => r.k))
  return (
    <div className={cn('grid items-center gap-3 text-[14.5px]', bar === 110 ? 'grid-cols-[minmax(0,1fr)_110px_30px]' : 'grid-cols-[minmax(0,1fr)_90px_30px]')}>
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="min-w-0">{r.name}</span>
          <TickBar pct={at(r.k)} size="md" label={`${fmtInt(r.k)} videos`} />
          <span className="text-right">{fig(r.k)}</span>
        </div>
      ))}
    </div>
  )
}

/** Who it is about, what people did and where, three columns (the board's),
 *  each of the videos its section's note names. Used by the advice's page
 *  (all time) and a move's (since its day). */
export function NumberBlocks({ numbers, brand, noun, when }: {
  numbers: Pick<AdviceNumbers, 'n' | 'who' | 'brands' | 'doing' | 'where'>
  brand: string
  noun: string | null
  when: string
}) {
  return (
    <div className="grid grid-cols-1 gap-10 border-t border-track pt-6 max-sm:gap-6 min-[1180px]:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-3">
        <Label as="h3">Who it’s about</Label>
        {numbers.brands !== 'counted'
          ? <p className="m-0 text-[14.5px] text-muted-foreground">{numbers.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
          : numbers.who ? <WhoLine parts={numbers.who.parts} brand={brand} noun={noun} /> : <p className="m-0 text-[14.5px] text-muted-foreground">No video read for who it is about.</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Label as="h3">What people did</Label>
        {numbers.doing.length > 0
          ? <BarRows rows={numbers.doing.map((r) => ({ key: r.kind, name: r.label, k: r.k }))} />
          : <p className="m-0 text-[14.5px] text-muted-foreground">Not read {when} yet.</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Label as="h3">Where</Label>
        {numbers.where
          ? <BarRows bar={110} rows={numbers.where.rows.map((r) => ({ key: r.platform, name: r.label, k: r.videos }))} />
          : <p className="m-0 text-[14.5px] text-muted-foreground">No video counted by platform yet.</p>}
      </div>
    </div>
  )
}

function NumbersCard({ page, noun }: { page: AdvicePageData; noun: string | null }) {
  const numbers = page.numbers
  return (
    <section aria-label="This advice in numbers" className={cn(CARD, 'gap-7')}>
      <div className="grid grid-cols-1 gap-10 max-sm:gap-6 min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Label as="h3">{page.line && page.line !== 'unread' ? <><span data-copy="subject" data-slot="pass_b_theme">{page.line.label}</span>, share of category videos</> : 'The line a move on it is read on'}</Label>
          {page.line === 'unread'
            ? <EmptyBox>Its line {LEVEL_UNREAD}.</EmptyBox>
            : page.line
              ? (
                <>
                  <LineMonths slots={page.line.slots} />
                  <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">{page.line.note}</p>
                </>
              )
              : <EmptyBox>Its evidence leads to no conversation read month by month yet, so a move on it has no line to be read on.</EmptyBox>}
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <Label as="h3">Who raises it</Label>
          {numbers === 'unread'
            ? <p className="m-0 text-[14.5px] text-muted-foreground">Not read just now.</p>
            : numbers.groups && numbers.groups.length > 0
              ? <GroupRows groups={numbers.groups.slice(0, 4)} n={numbers.n} />
              : <p className="m-0 text-[14.5px] text-muted-foreground">{numbers.groups ? noGroupSaying('all time') : 'Not linked to a group.'}</p>}
        </div>
      </div>
      {numbers === 'unread'
        ? <EmptyBox>Its numbers {LEVEL_UNREAD}.</EmptyBox>
        : <NumberBlocks numbers={numbers} brand={page.brand} noun={noun} when="all time" />}
    </section>
  )
}

// ---- 4. in their words ------------------------------------------------------------------

/** One comment, a tile of its own (the board's): its conversation's link,
 *  the commenter's words in the serif, its English, where and when in
 *  commas, and who the video is about in its colour role's words. */
export function QuotePanel({ q, brand }: { q: AdviceQuote; brand: string }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLine(note)
  return (
    <figure data-advice-quote="" className={cn(CARD, 'm-0 gap-3')}>
      {q.conv ? (
        <GoLink href={q.conv.href} className="self-start text-[13.5px]"><span data-copy="subject" data-slot="pass_b_theme">{q.conv.label}</span></GoLink>
      ) : null}
      <blockquote className="m-0"><p data-copy="quote" lang={q.lang ?? undefined} className={cn('m-0 text-[19px] leading-[1.5] text-foreground max-sm:text-[17px]', QUOTE)}>“{q.text}”</p></blockquote>
      {label ? <p className="m-0 text-[13px] text-muted-foreground">{label}</p> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[15.5px] leading-[1.5] text-foreground">{note.english}</p> : null}
      <figcaption className="text-[13.5px] text-muted-foreground">
        {commaCite(q.cite)}
        {q.about === 'client' ? <>, <BrandChip who="you" plain className="font-semibold text-you">{brand}</BrandChip></> : q.about && q.about !== 'market' ? <>, <BrandChip who="rival" plain className="font-semibold text-foreground">{q.about.slice('rival:'.length)}</BrandChip></> : null}
      </figcaption>
    </figure>
  )
}

function QuotesSection({ page }: { page: AdvicePageData }) {
  const quotes = page.quotes === 'unread' ? [] : page.quotes
  const labelled = quotes.length > 1 && quotes.every((q) => q.conv)
  return (
    <>
      <SectionHead
        title="In their words"
        note={quotes.length > 0 ? <>{fig(quotes.length)} {quotes.length === 1 ? 'comment' : 'comments'}{labelled ? ', each from its conversation' : null}</> : null}
      />
      <section aria-label="In their words" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {page.quotes === 'unread'
          ? <div className={cn(CARD, 'lg:col-span-3')}><EmptyBox>Its comments {LEVEL_UNREAD}.</EmptyBox></div>
          : (
            <>
              {quotes.map((q, i) => <QuotePanel key={i} q={q} brand={page.brand} />)}
              {quotes.length < 3 ? <div data-quotes-gap="" className="flex [&>[data-empty-box]]:flex-1 [&>[data-empty-box]]:justify-center"><EmptyBox>{quotes.length === 0 ? NO_COMMENT : NO_OTHER_COMMENT}</EmptyBox></div> : null}
            </>
          )}
      </section>
    </>
  )
}

// ---- 5. its history ---------------------------------------------------------------------

function HistoryCard({ page }: { page: AdvicePageData }) {
  const { card } = page
  const h = card.history
  const cards = page.moves === 'unread' ? null : page.moves.cards
  const invite = page.canDecide && card.status === 'new' && page.moves !== 'unread' && page.moves.recorded
  return (
    <section aria-label={HISTORY_TITLE} className={cn(CARD, 'grid grid-cols-1 gap-10 max-sm:gap-6 min-[900px]:grid-cols-2')}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <Label as="h3">How long we have been saying it, {fig(h.dates.length)} {h.dates.length === 1 ? 'update' : 'updates'}</Label>
        <Timeline history={h} />
        <p className="m-0 text-[15px] text-secondary-foreground">{hubDecisionLine(card)}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">
        <Label as="h3">Moves made on it</Label>
        {cards == null ? <EmptyBox>Its moves {LEVEL_UNREAD}.</EmptyBox>
          : cards.length === 0 ? (
            <div data-moves-on-it="none"><EmptyBox>{NO_MOVE_ON_IT}{invite ? <> {noMoveOnItInvite(card.aim?.label ?? null)}</> : null}</EmptyBox></div>
          ) : (
            <div className="flex flex-col">
              {cards.map((m, i) => (
                <div key={m.id} data-move-on-it="" className={cn('flex items-start justify-between gap-3 py-2.5', i > 0 ? 'border-t border-track' : null)}>
                  <span className="min-w-0">
                    <Link href={m.href} className={cn(ROW, 'text-[15px]')}><span data-copy="quote">{m.title}</span></Link>
                    <span className="block text-[14px] text-muted-foreground">Dated {shortDate(m.day)}</span>
                  </span>
                  <MoveStatusChip status={m.status} />
                </div>
              ))}
            </div>
          )}
      </div>
    </section>
  )
}

/** The page's body under its title block, in the board's order. */
export function AdvicePageBody({ page }: { page: AdvicePageData }) {
  const n = page.numbers === 'unread' ? null : page.numbers.n
  return (
    <>
      <ArgumentCard page={page} />
      <ConversationsSection page={page} />
      <SectionHead title={NUMBERS_TITLE} note={n != null ? <>Its {fig(n)} videos, {GROUNDED_BASIS}, and the line a move on it is read on</> : null} />
      <NumbersCard page={page} noun={page.noun} />
      <QuotesSection page={page} />
      <SectionHead title={HISTORY_TITLE} action={<GoLink href={RECORD_HREF}>The advice record, all {fig(page.record.total)}</GoLink>} />
      <HistoryCard page={page} />
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-5 max-sm:gap-3')}>
        <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55] text-secondary-foreground">Ask what is behind this advice, and what it would change, in your own words.</p>
        <GoLink href={askAboutHref(page.card.title)}>Ask the Agent about this</GoLink>
      </section>
    </>
  )
}

export { AdviceTitle, countWords }
