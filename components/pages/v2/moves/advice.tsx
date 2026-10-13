import Link from 'next/link'
import { Fragment, type CSSProperties } from 'react'

import { BlockQuote } from '@/components/blocks/quote'
import {
  CARD, equalColumns, InPlacePanel, panelItemOrder, panelPlacement, PanelSection, PanelSlot, PanelTitle, SELECTED_CARD_RING, StatCell, UnitSquares,
  type PanelLayout, type PerBreakpoint,
} from '@/components/v2'
import { priorityLabel, typeLabel, whyLead } from '@/components/pages/moves/words'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import type { MoveDating } from '@/lib/pages/date-move'
import { inlineMonth } from '@/lib/reading/month-label'
import {
  ADVICE_GONE, ADVICE_NONE, ADVICE_PANEL_ID, ADVICE_REST, ADVICE_SUB, ADVICE_TITLE, ASK_ABOUT, GROUNDED_BASIS, MOVES_PATH, NO_QUOTE, RECORD_HREF, WOULD_MOVE_NOTHING,
  adviceHref, askAboutHref, decisionLine, groundedLabel, monthLabelOn, quoteCiteLine, streakLabel,
  type AdviceAim, type AdviceCard, type MovesPageData, type ReadingLabel, type RestsOnRow,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { AcceptDated, AdviceAnswers } from './advice-actions'
import { BTN, MONO, OLINK, PRIORITY_CHIP, SECTION_SUB, SECTION_TITLE, TAG_CHIP } from './parts'

// "Advice to decide on" (board E6-Moves; open, E6-Moves-Open).
//
// LEVEL 1 IS THE CARD: the priority, the type, the title, the argument's lead,
// two counts (the videos it rests on, all time; the updates in a row that
// raised it, with a dot for each of the latest updates), what it would move
// (the conversation its evidence leads with, and its level in the reading
// month), and the answers. No quote: the one comment the advice carries is in
// the open panel only. Under three pieces waiting, the advice record's card
// takes the columns left, so the row keeps the board's three across.
//
// LEVEL 2 IS THE PANEL, in place under the row it was opened from, with its
// notch at the card (`InPlacePanel`, `?advice=<lineage>`): the whole argument,
// what it rests on, every update that raised it and what was decided, its one
// comment, and Accept with the day.
//
// THE PANEL SITS UNDER ITS CARD'S ROW. The cards are one grid, three across
// from 1180px (the board's breakpoint) and one below; the panel is a child of
// the same grid spanning every column, placed by CSS order after the row that
// holds its card (wide) or directly after its card (narrow), so one element
// serves both widths and its id stays unique. The kit works the order and the
// notch out for every width (`panelPlacement`, T9): on one column the notch
// points at the card's middle.

/** The advice grid's columns: one, then three from the board's 1180. Under
 *  three cards, the record's card fills the row (`AdviceRest`), one column
 *  on a phone and the columns left from 1180, and the panel's place counts it. */
export function adviceLayout(count: number): PanelLayout {
  if (count >= ADVICE_ROW) return { base: equalColumns(1, count), w1180: equalColumns(3, count) }
  return {
    base: equalColumns(1, count + 1),
    w1180: { spans: [...Array.from({ length: count }, () => 1), ADVICE_ROW - count], of: ADVICE_ROW },
  }
}

/** The board's row of advice: three across. */
const ADVICE_ROW = 3
const REST_SPAN: Record<number, string> = { 1: '', 2: 'min-[1180px]:col-span-2', 3: 'min-[1180px]:col-span-3' }

/** The advice's title: the model's stored words, or the page's own where the
 *  stored title is blank. */
function AdviceTitle({ card }: { card: Pick<AdviceCard, 'title' | 'untitled'> }) {
  return card.untitled ? <>{card.title}</> : <span data-copy="stored" data-slot="pass_d_b_recommendation">{card.title}</span>
}

function Chips({ card, open = false }: { card: AdviceCard; open?: boolean }) {
  const chip = priorityLabel(card.priority)
  const type = typeLabel(card.kind)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip ? <span className={cn('whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-semibold leading-none', PRIORITY_CHIP[chip])}>{chip}</span> : null}
      {type ? (open ? <span className={TAG_CHIP}>{type}</span> : <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>{type}</span>) : null}
      {open ? <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>{card.status === 'new' ? 'not decided yet' : card.statusLabel.toLowerCase()}</span> : null}
    </div>
  )
}

/** The two counts: the videos behind it (all time), and the updates that
 *  raised it, with the latest updates as dots. */
function Evidence({ card }: { card: AdviceCard }) {
  const h = card.history
  const carried = h.recent.filter(Boolean).length
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {card.grounded && !card.grounded.pruned ? (
        <StatCell size="sm" value={card.grounded.videos} label={groundedLabel} />
      ) : (
        <div className="min-w-0 rounded-[10px] bg-inner px-[13px] py-3 text-[12px] leading-[1.35] text-muted-foreground">
          {card.grounded?.pruned ? 'The evidence it was written from has since been replaced.' : 'No evidence was recorded for it.'}
        </div>
      )}
      <StatCell size="sm" value={h.streak > 0 ? h.streak : h.dates.length} label={streakLabel(h)}>
        <UnitSquares
          k={carried}
          n={h.recent.length}
          shape="dot"
          className="mt-2"
          label={`raised by ${fmtInt(carried)} of the latest ${fmtInt(h.recent.length)} updates`}
        />
      </StatCell>
    </div>
  )
}

/** "Would move: Cost & access · 19 of 521 videos in September" (the board's
 *  line, the week's share read as the month's, decision 1): the conversation
 *  its evidence leads with and its level in the reading month. Nothing where
 *  the card carries no aim at all (a dump from before it). */
function WouldMove({ aim, reading }: { aim: AdviceAim | null | undefined; reading: ReadingLabel }) {
  if (aim === undefined) return null
  return (
    <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">
      Would move:{' '}
      {aim ? (
        <span className="text-foreground">
          <span data-copy="subject" data-slot="pass_b_theme">{aim.label}</span>
          {aim.level ? (
            <> · <span data-copy="level">{fmtInt(aim.level.k)} of {fmtInt(aim.level.n)}</span> videos in {inlineMonth(longMonth(aim.month), monthLabelOn(aim.month, reading))}</>
          ) : null}
        </span>
      ) : WOULD_MOVE_NOTHING}
    </p>
  )
}

function AdviceCardView({ card, open, canDecide, reading }: { card: AdviceCard; open: boolean; canDecide: boolean; reading: ReadingLabel }) {
  const lead = whyLead(card.why)
  return (
    <article id={`advice-${card.lineageId}`} className={cn(CARD, 'flex-1 scroll-mt-6', open ? SELECTED_CARD_RING : null)}>
      <Chips card={card} />
      <h3 className={cn('m-0 text-[18px] font-semibold leading-[1.35]', card.untitled ? 'text-muted-foreground' : 'text-foreground')}><AdviceTitle card={card} /></h3>
      {/* The lead, four lines at most (the board's card): the whole
          argument is one click down, in the panel. */}
      {lead ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 line-clamp-4 text-[14px] leading-[1.55] text-secondary-foreground">{lead}</p> : null}
      <Evidence card={card} />
      <WouldMove aim={card.aim} reading={reading} />
      <div className="mt-auto flex flex-wrap items-center gap-2" data-print-hide>
        {canDecide ? <AdviceAnswers lineageId={card.lineageId} recommendationId={card.recommendationId} title={card.title} /> : null}
        {open ? (
          <Link href={MOVES_PATH} scroll={false} className={cn(OLINK, 'ml-auto')} aria-expanded="true" aria-controls={ADVICE_PANEL_ID}>Close ↑</Link>
        ) : (
          <Link href={adviceHref(card.lineageId)} scroll={false} className={cn(OLINK, 'ml-auto')}>Why →</Link>
        )}
      </div>
    </article>
  )
}

/** "286 videos, all time" or, for a rival's finding, where it lives. */
function RestsOnFigure({ row }: { row: RestsOnRow }) {
  if (row.kind === 'rival') return <span className={cn(MONO, 'whitespace-nowrap text-[12.5px] text-muted-foreground')}>about a rival · Voices</span>
  if (row.videos == null) return null
  return (
    <span className={cn(MONO, 'whitespace-nowrap text-[12.5px] text-muted-foreground')}>
      <span data-copy="figure">{fmtInt(row.videos)}</span> {row.videos === 1 ? 'video' : 'videos'}, {GROUNDED_BASIS}
    </span>
  )
}

function RestsOn({ rows }: { rows: RestsOnRow[] }) {
  if (rows.length === 0) return <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">The conclusions it was written from have since been replaced by later updates.</p>
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span data-copy="stored" data-slot={r.kind === 'market' ? 'pass_d_a_insight' : 'pass_c_finding'} className="min-w-0">{r.title}</span>
            <RestsOnFigure row={r} />
          </>
        )
        const cls = cn('grid grid-cols-1 gap-x-3.5 gap-y-0.5 py-3 text-[14px] leading-[1.45] text-foreground no-underline sm:grid-cols-[minmax(0,1fr)_auto]', i > 0 ? 'border-t border-track' : null)
        return r.anchor
          ? <a key={r.id} href={`#${r.anchor}`} className={cn(cls, 'hover:underline underline-offset-2')}>{inner}</a>
          : r.kind === 'rival'
            ? <Link key={r.id} href="/dashboard/voices" className={cn(cls, 'hover:underline underline-offset-2')}>{inner}</Link>
            : <div key={r.id} className={cls}>{inner}</div>
      })}
    </div>
  )
}

/** Every update that raised it, as dots on one line with their dates under
 *  them (the board's row); past twelve the row wraps, twelve to a line.
 *  Raised by fewer updates than the card's dots count, the row is the card's
 *  own nine latest updates: a dot and its date where one raised it, a pale
 *  dot where one did not, so a piece raised once keeps the board's row. */
function Timeline({ history }: { history: AdviceCard['history'] }) {
  const { dates, recent } = history
  if (dates.length === 0 && recent.length === 0) return null
  // The latest updates' slots, each raised one dated in order: the carried
  // slots are the last of `dates`.
  const slots: { date: string | null; on: boolean }[] = dates.length >= recent.length
    ? dates.map((d) => ({ date: d, on: true }))
    : (() => {
        const carried = recent.filter(Boolean).length
        let at = dates.length - carried
        return recent.map((on) => ({ on, date: on ? dates[at++] ?? null : null }))
      })()
  // Twelve to a row from 640px, five on a phone (where nine dates would
  // print over each other); a phone's row of nine slots keeps them all.
  const columns = Math.min(slots.length, 12)
  const narrow = dates.length >= recent.length ? Math.min(slots.length, 5) : slots.length
  return (
    <ol
      className="relative m-0 grid list-none gap-y-3 p-0 [grid-template-columns:repeat(var(--cn),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--cw),minmax(0,1fr))]"
      style={{ '--cn': narrow, '--cw': columns } as CSSProperties}
      aria-label="The updates that raised it"
    >
      {columns > 1 ? <span aria-hidden className={cn('absolute top-[4px] h-px bg-border', narrow === columns ? null : 'hidden sm:block')} style={{ left: `calc(50% / ${columns})`, right: `calc(50% / ${columns})` }} /> : null}
      {slots.map((s, i) => (
        <li key={`${s.date ?? 'none'}-${i}`} className="relative flex min-w-0 flex-col items-center gap-1.5" aria-hidden={s.on ? undefined : true}>
          <span aria-hidden className={cn('size-2.5 rounded-full', s.on ? 'bg-foreground' : 'bg-track')} />
          {s.date ? <span className={cn(MONO, 'whitespace-nowrap text-[10px] text-muted-foreground')}>{shortDate(s.date)}</span> : null}
        </li>
      ))}
    </ol>
  )
}

/** The argument, a paragraph for every two sentences, as the board sets it. */
export function whyParagraphs(why: string | null): string[] {
  const text = (why ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return []
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/)
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '))
  return out
}

/** Why an opened piece is not under a card: one of the more waiting, or from
 *  the advice record (decided, or not raised by the latest update). */
export const OPEN_MORE_WAITING = 'One of the pieces of advice waiting past the three above.'
export const OPEN_FROM_RECORD = 'From the advice record: the latest update did not raise it, or it has been decided.'

function AdvicePanel({ card, notchAt, canDecide, dating, note }: {
  card: AdviceCard
  notchAt: number | PerBreakpoint
  canDecide: boolean
  dating: MoveDating | null
  /** Said under the title where the piece has no card above. */
  note: string | null
}) {
  const paragraphs = whyParagraphs(card.why)
  const h = card.history
  return (
    <InPlacePanel
      id={ADVICE_PANEL_ID}
      notchAt={notchAt}
      openKey={card.lineageId}
      closeHref={MOVES_PATH}
      labelledBy="advice-panel-title"
      closeLabel="Close this advice"
      head={(
        <>
          <Chips card={card} open />
          <PanelTitle id="advice-panel-title" className="text-[24px] leading-[1.25]">
            <AdviceTitle card={card} />
          </PanelTitle>
          {note ? <p className="m-0 mt-1.5 text-[13px] text-muted-foreground">{note}</p> : null}
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-10 min-[1180px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <PanelSection label="Why">
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => (
                <p key={i} data-copy="stored" data-slot="pass_d_b_recommendation" className={cn('m-0 text-[15px] leading-[1.62]', i === paragraphs.length - 1 && paragraphs.length > 1 ? 'text-secondary-foreground' : 'text-foreground')}>{p}</p>
              ))
            : <p className="m-0 text-[15px] leading-[1.62] text-muted-foreground">This piece of advice carries no argument we can print.</p>}
        </PanelSection>
        <div className="flex min-w-0 flex-col gap-[26px]">
          <PanelSection label="What it rests on">
            <RestsOn rows={card.restsOn} />
          </PanelSection>
          <PanelSection label={<>How long we have been saying it · <span data-copy="figure">{fmtInt(h.dates.length)}</span> {h.dates.length === 1 ? 'update' : 'updates'}</>}>
            <Timeline history={h} />
            <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">{decisionLine(card)}</p>
          </PanelSection>
        </div>
      </div>

      {/* The board's row of three comments; the advice carries one, in the
          row's first place. Without one the row keeps its place and says so
          once, quietly. */}
      <PanelSection label="In their words">
        {card.quote ? (
          <div className="grid grid-cols-1 gap-3.5 min-[1180px]:grid-cols-3">
            {/* The board's `.qpanel`: the comment on the inner ground. */}
            <div className="min-w-0 rounded-[10px] bg-inner px-[15px] py-[13px]">
              <BlockQuote quote={card.quote} ground="inner" cite={quoteCiteLine(card.quoteCite) ?? undefined} />
            </div>
          </div>
        ) : (
          <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{NO_QUOTE}</p>
        )}
      </PanelSection>

      <div className="flex flex-wrap items-center gap-3 border-t border-track pt-5" data-print-hide>
        {canDecide && card.status === 'new' ? (
          <AcceptDated
            lineageId={card.lineageId}
            recommendationId={card.recommendationId}
            title={card.title}
            dating={dating?.datable ? { today: dating.today, earliest: dating.earliest } : null}
          />
        ) : null}
        <Link href={askAboutHref(card.title)} className={BTN}>{ASK_ABOUT}</Link>
      </div>
    </InPlacePanel>
  )
}

/**
 * THE BOARD'S ROW WHERE FEWER THAN THREE PIECES WAIT: the advice card's own
 * frame and parts (its kind line, its title, its lead, its two cells, its
 * link at the foot), holding the advice record: every piece so far, and how
 * many you have decided on. It takes the columns the row has left.
 */
function AdviceRest({ data, span }: { data: MovesPageData; span: number }) {
  const { total, acted } = data.advice
  const none = data.advice.cards.length === 0
  return (
    <article data-advice-rest="" className={cn(CARD, 'flex-1')}>
      <div className="flex min-h-5 flex-wrap items-center gap-2">
        <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>{ADVICE_REST.kind}</span>
      </div>
      <h3 className="m-0 text-[18px] font-semibold leading-[1.35] text-foreground">{none ? ADVICE_NONE : ADVICE_REST.title}</h3>
      <p className="m-0 text-[14px] leading-[1.55] text-secondary-foreground">{ADVICE_REST.lead}</p>
      {total > 0 ? (
        <div className={cn('grid grid-cols-2 gap-2.5', span > 1 ? 'min-[1180px]:max-w-[calc(50%-10px)]' : null)}>
          <StatCell size="sm" value={total} label={total === 1 ? 'piece of advice so far' : 'pieces of advice so far'} />
          <StatCell size="sm" value={acted} of={total} label="decided on">
            <UnitSquares k={Math.round((9 * acted) / total)} n={9} shape="dot" className="mt-2" label={`decided on ${fmtInt(acted)} of ${fmtInt(total)}`} />
          </StatCell>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2" data-print-hide>
        <Link href={RECORD_HREF} scroll={false} className={cn(OLINK, 'ml-auto')}>The advice record →</Link>
      </div>
    </article>
  )
}

export function AdviceSection({ data }: { data: MovesPageData }) {
  const { cards, open, gone } = data.advice
  const reading: ReadingLabel = { month: data.month, label: data.monthLabel ?? null }
  const index = open?.index ?? null
  const place = index != null ? panelPlacement(index, adviceLayout(cards.length)) : null
  const rest = Math.max(0, ADVICE_ROW - cards.length)
  return (
    <section aria-labelledby="advice-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="advice-title" className={SECTION_TITLE}>{ADVICE_TITLE}</h2>
        <p className={SECTION_SUB}>{ADVICE_SUB}</p>
      </div>
      {!data.canDecide && cards.length > 0 ? <p className={cn(SECTION_SUB, '-mt-2 px-0.5')}>{MOVES_WRITE_REFUSED}</p> : null}
      {gone ? <p className={cn(SECTION_SUB, 'px-0.5')}>{ADVICE_GONE}</p> : null}
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        {cards.map((c, i) => (
          <Fragment key={c.lineageId}>
            <div className="flex min-w-0 flex-col" style={panelItemOrder(i)}>
              <AdviceCardView card={c} open={open?.card.lineageId === c.lineageId} canDecide={data.canDecide} reading={reading} />
            </div>
            {open && place && i === index ? (
              <PanelSlot placement={place}>
                <AdvicePanel card={open.card} notchAt={place.notch} canDecide={data.canDecide} dating={data.dating} note={null} />
              </PanelSlot>
            ) : null}
          </Fragment>
        ))}
        {rest > 0 ? (
          <div className={cn('flex min-w-0 flex-col', REST_SPAN[rest])} style={panelItemOrder(cards.length)}>
            <AdviceRest data={data} span={rest} />
          </div>
        ) : null}
      </div>
      {data.advice.more > 0 ? (
        <p className="m-0 flex justify-end px-0.5">
          <Link href={RECORD_HREF} scroll={false} className={OLINK}>
            <span data-copy="figure">{fmtInt(data.advice.more)}</span> more waiting →
          </Link>
        </p>
      ) : null}
      {open && index == null ? (
        <AdvicePanel card={open.card} notchAt={0.08} canDecide={data.canDecide} dating={data.dating} note={open.waiting ? OPEN_MORE_WAITING : OPEN_FROM_RECORD} />
      ) : null}
    </section>
  )
}
