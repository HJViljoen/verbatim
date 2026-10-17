import Link from 'next/link'

import { CARD, StatCell, UnitSquares } from '@/components/v2'
import { priorityLabel, typeLabel, whyLead } from '@/components/pages/moves/words'
import { fmtInt, longMonth } from '@/lib/format'
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import { inlineMonth } from '@/lib/reading/month-label'
import {
  ADVICE_NONE, ADVICE_REST, ADVICE_SUB, ADVICE_TITLE, READ_FAILED, RECORD_HREF, WOULD_MOVE_NOTHING,
  adviceHref, groundedLabel, monthLabelOn, streakLabel,
  type AdviceAim, type AdviceCard, type MovesPageData, type ReadingLabel,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { AdviceAnswers } from './advice-actions'
import { MovesKindTile } from './level-tiles'
import { MONO, OLINK, PRIORITY_CHIP, SECTION_SUB, SECTION_TITLE } from './parts'

// "Advice to decide on" (board G6-Moves; E6-Moves before it).
//
// LEVEL 1 IS THE CARD: the signpost tile (the advice's level, G6), the
// priority, the type, the title, the argument's lead, two counts (the videos
// it rests on, all time; the updates in a row that raised it, with a dot for
// each of the latest updates), what it would move (the conversation its
// evidence leads with, and its level in the reading month), and the answers.
// No quote. Under three pieces waiting, the advice record's card takes the
// columns left, so the row keeps the board's three across.
//
// EACH OPENS AS ITS OWN PAGE (levels as pages, 17 Oct): the title and Open go
// to the advice's page (`/dashboard/moves/advice/<lineage>`), the hub; nothing
// opens in place any more.

/** The board's row of advice: three across. */
const ADVICE_ROW = 3
const REST_SPAN: Record<number, string> = { 1: '', 2: 'min-[1180px]:col-span-2', 3: 'min-[1180px]:col-span-3' }

/** The section's note: G6's, saying each piece opens as its own page. */
export const ADVICE_SUB_PAGES = `${ADVICE_SUB} Each opens as its own page.`

/** The advice's title: the model's stored words, or the page's own where the
 *  stored title is blank. */
export function AdviceTitle({ card }: { card: Pick<AdviceCard, 'title' | 'untitled'> }) {
  return card.untitled ? <>{card.title}</> : <span data-copy="stored" data-slot="pass_d_b_recommendation">{card.title}</span>
}

function Chips({ card }: { card: AdviceCard }) {
  const chip = priorityLabel(card.priority)
  const type = typeLabel(card.kind)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MovesKindTile level="advice" />
      {chip ? <span className={cn('whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-semibold leading-none', PRIORITY_CHIP[chip])}>{chip}</span> : null}
      {type ? <span className={cn(MONO, 'text-[12px] text-muted-foreground')}>{type}</span> : null}
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
export function WouldMove({ aim, reading, failed }: { aim: AdviceAim | null | undefined; reading: ReadingLabel; failed: boolean }) {
  // A failed read leaves the field absent and says so in one line.
  if (aim === undefined && !failed) return null
  return (
    <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">
      Would move:{' '}
      {aim === undefined ? READ_FAILED : aim ? (
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

function AdviceCardView({ card, canDecide, reading, aimFailed }: { card: AdviceCard; canDecide: boolean; reading: ReadingLabel; aimFailed: boolean }) {
  const lead = whyLead(card.why)
  const href = adviceHref(card.lineageId)
  return (
    <article id={`advice-${card.lineageId}`} className={cn(CARD, 'flex-1 scroll-mt-6')}>
      <Chips card={card} />
      <h3 className={cn('m-0 text-[18px] font-semibold leading-[1.35]', card.untitled ? 'text-muted-foreground' : 'text-foreground')}>
        <Link href={href} className="text-inherit no-underline underline-offset-[3px] hover:underline"><AdviceTitle card={card} /></Link>
      </h3>
      {/* The lead, four lines at most (the board's card): the whole
          argument is on the advice's page. */}
      {lead ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 line-clamp-4 text-[14px] leading-[1.55] text-secondary-foreground">{lead}</p> : null}
      <Evidence card={card} />
      <WouldMove aim={card.aim} reading={reading} failed={aimFailed} />
      <div className="mt-auto flex flex-wrap items-center gap-2" data-print-hide>
        {canDecide ? <AdviceAnswers lineageId={card.lineageId} recommendationId={card.recommendationId} title={card.title} /> : null}
        <Link href={href} className={cn(OLINK, 'ml-auto')}>Open →</Link>
      </div>
    </article>
  )
}

/**
 * THE BOARD'S ROW WHERE FEWER THAN THREE PIECES WAIT: the advice card's own
 * frame and parts (its kind line, its title, its lead, its two cells, its
 * link at the foot), holding the advice record: every piece so far, and how
 * many you have decided on. It takes the columns the row has left, and opens
 * the record's page.
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
        <Link href={RECORD_HREF} className={cn(OLINK, 'ml-auto')}>The advice record →</Link>
      </div>
    </article>
  )
}

export function AdviceSection({ data }: { data: MovesPageData }) {
  const { cards } = data.advice
  const reading: ReadingLabel = { month: data.month, label: data.monthLabel ?? null }
  const rest = Math.max(0, ADVICE_ROW - cards.length)
  return (
    <section aria-labelledby="advice-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="advice-title" className={SECTION_TITLE}>{ADVICE_TITLE}</h2>
        <p className={SECTION_SUB}>{ADVICE_SUB_PAGES}</p>
      </div>
      {!data.canDecide && cards.length > 0 ? <p className={cn(SECTION_SUB, '-mt-2 px-0.5')}>{MOVES_WRITE_REFUSED}</p> : null}
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
        <p className="m-0 flex justify-end px-0.5">
          <Link href={RECORD_HREF} className={OLINK}>
            <span data-copy="figure">{fmtInt(data.advice.more)}</span> more waiting →
          </Link>
        </p>
      ) : null}
    </section>
  )
}
