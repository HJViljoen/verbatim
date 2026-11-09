import Link from 'next/link'
import type { ReactNode } from 'react'

import { CARD, GoLink, Tag } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { priorityLabel, typeLabel, whyLead } from '@/components/pages/moves/words'
import { fmtInt, longMonth } from '@/lib/format'
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import { inlineMonth } from '@/lib/reading/month-label'
import {
  ADVICE_NONE, ADVICE_REST, ADVICE_SUB, ADVICE_TITLE, GROUNDED_BASIS, READ_FAILED, RECORD_HREF, WOULD_MOVE_NOTHING,
  adviceHref, monthLabelOn, streakLabel,
  type AdviceAim, type AdviceCard, type AdviceHistory, type MovesPageData, type ReadingLabel,
} from '@/lib/pages/v2/moves'
import { adviceHeading } from '@/lib/pages/v2/advice-words'
import { streakWords } from '@/lib/pages/v2/moves-levels'
import { cn } from '@/lib/utils'
import { AdviceAnswers } from './advice-actions'

// "Advice to decide on" (board G6-Moves; E6-Moves before it; since the audit
// design, 7 Nov, Moves.dc.html).
//
// LEVEL 1 IS THE CARD: the priority as a tag and the kind in words, the
// title, the argument's lead, then its facts as one list (the videos it
// rests on, all time; the updates that raised it; what it would move, the
// conversation its evidence leads with, a link to it on Market, and its
// level in the reading month), and the answers. No quote. Under three pieces
// waiting, the advice record's card takes the columns left, so the row keeps
// the board's three across.
//
// EACH OPENS AS ITS OWN PAGE (levels as pages, 17 Oct): the title and "Open
// the advice" go to the advice's page (`/dashboard/moves/advice/<lineage>`),
// the hub; nothing opens in place.

/** The board's row of advice: three across. */
const ADVICE_ROW = 3
const REST_SPAN: Record<number, string> = { 1: '', 2: 'min-[1180px]:col-span-2', 3: 'min-[1180px]:col-span-3' }

/** The section's note: G6's, saying each piece opens as its own page. */
export const ADVICE_SUB_PAGES = `${ADVICE_SUB} Each opens as its own page.`

/** A priority as the boards' tag: high on the caution pair, the others on
 *  the track (never the orange). */
export const priorityTone = (label: string): 'hi' | 'mid' => (label === 'High priority' ? 'hi' : 'mid')

/** The advice's title: the model's stored words, or the page's own where the
 *  stored title is blank. */
export function AdviceTitle({ card }: { card: Pick<AdviceCard, 'title' | 'untitled'> }) {
  return card.untitled ? <>{card.title}</> : <span data-copy="stored" data-slot="pass_d_b_recommendation">{card.title}</span>
}

/** The updates that raised it, in words true for each streak: "9 updates in
 *  a row, since 27 Jul", "1 update, first raised 12 Oct", and where the
 *  latest update did not raise it, "2 updates, not raised by the latest
 *  update" (`streakWords`' words). After "Raised in" or "Raised by". */
export function RaisedWords({ history: h }: { history: AdviceHistory }) {
  if (h.streak > 0 && h.since) return <><span data-copy="figure">{fmtInt(h.streak)}</span> {streakLabel(h)}</>
  const n = h.streak > 0 ? h.streak : h.dates.length
  return (
    <>
      <span data-copy="figure">{fmtInt(n)}</span> {n === 1 ? 'update' : 'updates'}
      {h.streak > 1 ? ' in a row' : null}
      {h.streak === 0 ? <>, {streakWords(h).sub}</> : null}
    </>
  )
}

/** The priority's tag, then the kind in plain words. */
function Kind({ card }: { card: AdviceCard }) {
  const chip = priorityLabel(card.priority)
  const type = typeLabel(card.kind)
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {chip ? <Tag tone={priorityTone(chip)}>{chip}</Tag> : null}
      {type ? <span className="text-[13.5px] text-muted-foreground">{type}</span> : null}
    </div>
  )
}

/** "Cost and access frustration, 19 of 521 category videos in September, the
 *  last full month": the conversation its evidence leads with (its page on
 *  Market where the card carries it) and its level in the reading month. Its
 *  base is the category's, which the figures row (the market's) does not
 *  state, so it keeps its "of N" (decision 2). Null where the card carries
 *  no aim at all (a dump from before it). */
export function WouldMove({ aim, reading, failed }: { aim: AdviceAim | null | undefined; reading: ReadingLabel; failed: boolean }) {
  // A failed read leaves the field absent and says so.
  if (aim === undefined && !failed) return null
  if (aim === undefined) return <span className="text-muted-foreground">{READ_FAILED}</span>
  if (!aim) return <span className="text-muted-foreground">{WOULD_MOVE_NOTHING}</span>
  const label = <span data-copy="subject" data-slot="pass_b_theme">{aim.label}</span>
  return (
    <>
      {aim.href ? <Link href={aim.href} className="text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground">{label}</Link> : label}
      {aim.level ? <>, <span data-copy="level">{fmtInt(aim.level.k)} of {fmtInt(aim.level.n)}</span> category videos in {inlineMonth(longMonth(aim.month), monthLabelOn(aim.month, reading))}</> : null}
    </>
  )
}

/** One fact of a card: its term over its words. */
function Fact({ term, wide = false, children }: { term: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', wide ? 'col-span-2' : null)}>
      <dt className="text-[13px] text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  )
}

function AdviceCardView({ card, canDecide, reading, aimFailed }: { card: AdviceCard; canDecide: boolean; reading: ReadingLabel; aimFailed: boolean }) {
  // A title cut from its own argument heads the card as that first sentence,
  // whole, and the lead starts after it: the same words never twice.
  const said = adviceHeading(card.title, card.why)
  const lead = whyLead(said.body)
  const href = adviceHref(card.lineageId)
  const h = card.history
  const would = card.aim !== undefined || aimFailed
  return (
    <article id={`advice-${card.lineageId}`} className={cn(CARD, 'flex-1 scroll-mt-6 gap-3')}>
      <Kind card={card} />
      <h3 className={cn('m-0 text-[19px] font-semibold leading-[1.35]', card.untitled ? 'text-muted-foreground' : 'text-foreground')}>
        <Link href={href} className={ROW}><AdviceTitle card={{ ...card, title: said.title }} /></Link>
      </h3>
      {/* The lead, five lines at most (the board's card): the whole
          argument is on the advice's page. */}
      {lead ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 line-clamp-5 text-[15px] leading-[1.6] text-secondary-foreground">{lead}</p> : null}
      <div className="flex-1" />
      <dl className="m-0 grid grid-cols-2 gap-3.5 border-t border-track pt-3.5 text-[14.5px] leading-[1.45]">
        <Fact term="Rests on">
          {card.grounded && !card.grounded.pruned
            ? <>{fig(card.grounded.videos)} {card.grounded.videos === 1 ? 'video' : 'videos'}, {GROUNDED_BASIS}</>
            : <span className="text-muted-foreground">{card.grounded?.pruned ? 'The evidence it was written from has since been replaced.' : 'No evidence was recorded for it.'}</span>}
        </Fact>
        <Fact term="Raised in"><RaisedWords history={h} /></Fact>
        {would ? <Fact term="Would move" wide><WouldMove aim={card.aim} reading={reading} failed={aimFailed} /></Fact> : null}
      </dl>
      <div className="mt-1 flex flex-wrap items-center gap-2.5" data-print-hide>
        {canDecide ? <AdviceAnswers lineageId={card.lineageId} recommendationId={card.recommendationId} title={card.title} /> : null}
        <span className="flex-1" />
        <GoLink href={href}>Open the advice</GoLink>
      </div>
    </article>
  )
}

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>

/**
 * THE BOARD'S ROW WHERE FEWER THAN THREE PIECES WAIT: the advice card's own
 * frame and parts (its kind line, its title, its lead, its facts, its link at
 * the foot), holding the advice record: every piece so far, and how many you
 * have decided on. It takes the columns the row has left, and opens the
 * record's page.
 */
function AdviceRest({ data, span }: { data: MovesPageData; span: number }) {
  const { total, acted } = data.advice
  const none = data.advice.cards.length === 0
  return (
    <article data-advice-rest="" className={cn(CARD, 'flex-1 gap-3')}>
      <span className="text-[13.5px] text-muted-foreground">{ADVICE_REST.kind}</span>
      <h3 className="m-0 text-[19px] font-semibold leading-[1.35] text-foreground">{none ? ADVICE_NONE : ADVICE_REST.title}</h3>
      <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{ADVICE_REST.lead}</p>
      <div className="flex-1" />
      {total > 0 ? (
        <dl className={cn('m-0 grid grid-cols-2 gap-3.5 border-t border-track pt-3.5 text-[14.5px] leading-[1.45]', span > 1 ? 'min-[1180px]:max-w-[calc(50%-10px)]' : null)}>
          <Fact term="So far">{fig(total)} {total === 1 ? 'piece of advice' : 'pieces of advice'}</Fact>
          <Fact term="Decided on"><span data-copy="level">{fmtInt(acted)} of {fmtInt(total)}</span></Fact>
        </dl>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2.5" data-print-hide>
        <span className="flex-1" />
        <GoLink href={RECORD_HREF}>Open the advice record</GoLink>
      </div>
    </article>
  )
}

export function AdviceSection({ data }: { data: MovesPageData }) {
  const { cards } = data.advice
  const reading: ReadingLabel = { month: data.month, label: data.monthLabel ?? null }
  const rest = Math.max(0, ADVICE_ROW - cards.length)
  return (
    <section aria-labelledby="advice-title" className="flex min-w-0 flex-col">
      {/* The first head under the figures row sits close to it (the board's
          8px), so it is drawn here rather than by the kit's section head. */}
      <div className="mx-0.5 mt-1 mb-[18px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="advice-title" className="m-0 text-[21px] font-semibold leading-[1.3]">{ADVICE_TITLE}</h2>
        <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{ADVICE_SUB_PAGES}</p>
      </div>
      {!data.canDecide && cards.length > 0 ? <p className="m-0 mx-0.5 -mt-2.5 mb-4 text-[14px] text-secondary-foreground">{MOVES_WRITE_REFUSED}</p> : null}
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        {cards.map((c) => (
          <div key={c.lineageId} className="flex min-w-0 flex-col">
            <AdviceCardView card={c} canDecide={data.canDecide} reading={reading} aimFailed={data.failed?.aims === true} />
          </div>
        ))}
        {rest > 0 ? (
          <div className={cn('flex min-w-0 flex-col', REST_SPAN[rest])}>
            <AdviceRest data={data} span={rest} />
          </div>
        ) : null}
      </div>
      {data.advice.more > 0 ? (
        <p className="m-0 mt-4 flex justify-end px-0.5">
          <GoLink href={RECORD_HREF}>See the {fig(data.advice.more)} more waiting</GoLink>
        </p>
      ) : null}
    </section>
  )
}
