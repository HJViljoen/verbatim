import Link from 'next/link'
import type { CSSProperties } from 'react'

import { BlockQuote } from '@/components/blocks/quote'
import { CARD, InPlacePanel, PanelSection, PanelTitle, SELECTED_CARD_RING, StatCell, UnitSquares } from '@/components/v2'
import { priorityLabel, typeLabel, whyLead } from '@/components/pages/moves/words'
import { fmtInt, shortDate } from '@/lib/format'
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import type { MoveDating } from '@/lib/pages/date-move'
import {
  ADVICE_GONE, ADVICE_NONE, ADVICE_PANEL_ID, ADVICE_SUB, ADVICE_TITLE, ASK_ABOUT, GROUNDED_BASIS, MOVES_PATH, RECORD_HREF,
  adviceHref, askAboutHref, decisionLine, groundedLabel, streakLabel,
  type AdviceCard, type MovesPageData, type RestsOnRow,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { AcceptDated, AdviceAnswers } from './advice-actions'
import { BTN, MONO, OLINK, PRIORITY_CHIP, SECTION_SUB, SECTION_TITLE, TAG_CHIP } from './parts'

// "Advice to decide on" (board E6-Moves; open, E6-Moves-Open).
//
// LEVEL 1 IS THE CARD: the priority, the type, the title, the argument's lead,
// two counts (the videos it rests on, all time; the updates in a row that
// raised it, with a dot for each of the latest updates), and the answers. No
// quote: the one comment the advice carries is in the open panel only.
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
// serves both widths and its id stays unique.

const COLUMNS = 3

/** The panel's place in the grid, at both widths, and where its notch points. */
export function panelPlacement(index: number, count: number): { narrow: number; wide: number; notchAt: number } {
  const rowEnd = Math.min(count - 1, Math.floor(index / COLUMNS) * COLUMNS + COLUMNS - 1)
  return { narrow: 2 * index + 1, wide: 2 * rowEnd + 1, notchAt: ((index % COLUMNS) + 0.5) / COLUMNS }
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

function AdviceCardView({ card, open, canDecide }: { card: AdviceCard; open: boolean; canDecide: boolean }) {
  const lead = whyLead(card.why)
  return (
    <article id={`advice-${card.lineageId}`} className={cn(CARD, 'scroll-mt-6', open ? SELECTED_CARD_RING : null)}>
      <Chips card={card} />
      <h3 data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[18px] font-semibold leading-[1.35] text-foreground">{card.title}</h3>
      {lead ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[14px] leading-[1.55] text-secondary-foreground">{lead}</p> : null}
      <Evidence card={card} />
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
        const cls = cn('grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 py-3 text-[14px] leading-[1.45] text-foreground no-underline', i > 0 ? 'border-t border-track' : null)
        return r.anchor
          ? <a key={r.id} href={`#${r.anchor}`} className={cn(cls, 'hover:underline underline-offset-2')}>{inner}</a>
          : r.kind === 'rival'
            ? <Link key={r.id} href="/dashboard/voices" className={cn(cls, 'hover:underline underline-offset-2')}>{inner}</Link>
            : <div key={r.id} className={cls}>{inner}</div>
      })}
    </div>
  )
}

/** Every update that raised it, as dots on a line with their dates. */
function Timeline({ dates }: { dates: string[] }) {
  if (dates.length === 0) return null
  return (
    <ol className="relative m-0 flex list-none flex-wrap items-start gap-x-3 gap-y-3 p-0" aria-label="The updates that raised it">
      {dates.map((d, i) => (
        <li key={`${d}-${i}`} className="relative flex min-w-[44px] flex-col items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-foreground" />
          <span className={cn(MONO, 'whitespace-nowrap text-[10.5px] text-muted-foreground')}>{shortDate(d)}</span>
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

function AdvicePanel({ card, notchAt, canDecide, dating, fromRecord }: {
  card: AdviceCard
  notchAt: number
  canDecide: boolean
  dating: MoveDating | null
  fromRecord: boolean
}) {
  const paragraphs = whyParagraphs(card.why)
  const h = card.history
  return (
    <InPlacePanel
      id={ADVICE_PANEL_ID}
      notchAt={notchAt}
      closeHref={MOVES_PATH}
      labelledBy="advice-panel-title"
      closeLabel="Close this advice"
      head={(
        <>
          <Chips card={card} open />
          <PanelTitle id="advice-panel-title" className="text-[24px] leading-[1.25]">
            <span data-copy="stored" data-slot="pass_d_b_recommendation">{card.title}</span>
          </PanelTitle>
          {fromRecord ? <p className="m-0 mt-1.5 text-[13px] text-muted-foreground">From the advice record: the latest update did not raise it, or it has been decided.</p> : null}
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
            <Timeline dates={h.dates} />
            <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">{decisionLine(card)}</p>
          </PanelSection>
        </div>
      </div>

      {card.quote ? (
        <PanelSection label="In their words">
          <div className="max-w-[640px]">
            <BlockQuote quote={card.quote} ground="inner" />
          </div>
        </PanelSection>
      ) : null}

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

export function AdviceSection({ data }: { data: MovesPageData }) {
  const { cards, open, gone } = data.advice
  const index = open?.index ?? null
  const place = index != null ? panelPlacement(index, cards.length) : null
  return (
    <section aria-labelledby="advice-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="advice-title" className={SECTION_TITLE}>{ADVICE_TITLE}</h2>
        <p className={SECTION_SUB}>{ADVICE_SUB}</p>
      </div>
      {!data.canDecide && cards.length > 0 ? <p className={cn(SECTION_SUB, '-mt-2 px-0.5')}>{MOVES_WRITE_REFUSED}</p> : null}
      {gone ? <p className={cn(SECTION_SUB, 'px-0.5')}>{ADVICE_GONE}</p> : null}
      {cards.length === 0 ? (
        <div className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3')}>
          <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">{ADVICE_NONE}</p>
          <Link href={RECORD_HREF} className={OLINK}>The advice record →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          {cards.map((c, i) => (
            <div key={c.lineageId} className="flex min-w-0 flex-col [order:var(--o)]" style={{ '--o': 2 * i } as CSSProperties}>
              <AdviceCardView card={c} open={open?.card.lineageId === c.lineageId} canDecide={data.canDecide} />
            </div>
          ))}
          {open && place ? (
            <div
              className="min-w-0 [order:var(--o)] min-[1180px]:col-span-3 min-[1180px]:[order:var(--ow)]"
              style={{ '--o': place.narrow, '--ow': place.wide } as CSSProperties}
            >
              <AdvicePanel card={open.card} notchAt={place.notchAt} canDecide={data.canDecide} dating={data.dating} fromRecord={false} />
            </div>
          ) : null}
        </div>
      )}
      {open && index == null ? (
        <AdvicePanel card={open.card} notchAt={0.08} canDecide={data.canDecide} dating={data.dating} fromRecord />
      ) : null}
    </section>
  )
}
