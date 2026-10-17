import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Users } from 'lucide-react'
import { CARD, CardHead, SlopePair, TickBar } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import {
  GROUP_NOT_COMPARED, MIX_WHY, mixNotRead, mixTitle, slopeLabel, type VoicesData, type VoicesGroupCard, type VoicesGroups,
} from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { CAPS, EmptyLine, FailedSubjectsFoot, Fig, LevelText, MiniRow, NotMeasuredRows, OLINK, PendingSubjectsLine, PlatformStrip, RowChevron } from './parts'

// THE GROUPS (board E3-Voices, "Who's in your market", the group cards and
// "How the mix changed"; since 17 Oct G3-Voices: each row and each card opens
// the group's own page, the row ending in the leave-the-page chevron, and
// nothing opens in place). Decision 2
// holds: each group is this month's videos as a count of the market's, with
// no share of the market and no change since last month. A video can hold
// more than one group, so the counts are drawn as separate bars, never one
// stacked bar with an "Other" remainder. THE BOARD'S SHAPE HOLDS AROUND IT
// (the parity pass, 13 Oct): a card's verdict slot says the change is not
// compared yet, and the mix card keeps the grid's sixth place, this month's
// column drawn and last month's left empty, with one line saying why.

/** "Who's in your market": every group's videos this month, a bar each. */
export function WhoCard({ groups, videos, monthWords, failed }: { groups: VoicesGroups; videos: number | null; monthWords: string; failed?: readonly { id: string; label: string }[] }) {
  const n = videos ?? 0
  return (
    // `id="cast"`: an old Conversation link (`/dashboard/voice#cast`, the cast
    // of who is talking) lands here with its fragment (lib/nav.ts).
    <section id="cast" aria-labelledby="voices-who" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={Users}
        id="voices-who"
        title="Who’s in your market"
        sub={
          groups.state === 'ready' && n > 0
            ? <>The groups of people commenting, and how many of the market’s <Fig>{fmtInt(n)}</Fig> videos in {monthWords} each one comments on. A video can hold more than one group, so the counts overlap.</>
            : 'The groups of people commenting in your market.'
        }
      />
      {groups.state !== 'ready' ? <EmptyLine>{groups.empty}</EmptyLine> : n === 0 ? (
        <EmptyLine>No market video in {monthWords} yet.</EmptyLine>
      ) : (
        <div role="list" className="flex flex-col gap-2.5">
          {groups.cards.map((c) => (
            // Below 1024, where the sidebar leaves the card too narrow for the
            // name beside the bar, the bar takes its own line under the name
            // and the count, full width and compact (the fresh check, 13 Oct:
            // the board's phone draws its band there), and a long name wraps
            // rather than being cut (T9); from 1024 it sits between them.
            <div key={c.key} role="listitem" className="grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1.5 text-[13.5px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto_16px] lg:gap-y-0">
              <Link href={c.href} className="min-w-0 font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]">
                <span data-copy="subject" data-slot="pass_e_persona">{c.name}</span>
              </Link>
              <TickBar pct={(100 * c.videos) / n} size="lg" tone="market" label={`${c.name}: ${fmtInt(c.videos)} of ${fmtInt(n)} videos`} className="order-last col-span-3 max-lg:h-2 lg:order-none lg:col-span-1" />
              <LevelText k={c.videos} n={n} unit="videos" className="text-right text-[12.5px] text-secondary-foreground" />
              <RowChevron href={c.href} />
            </div>
          ))}
        </div>
      )}
      {/* Why a subject being re-described shows no figure, ONCE on the page
          (14 Oct, the lead's ruling): each card only names it among those
          not measured yet. */}
      <FailedSubjectsFoot failed={failed} />
    </section>
  )
}

/** One group (the board's `.pcard`). */
export function GroupCard({ card, n, monthWords, style }: { card: VoicesGroupCard; n: number | null; monthWords: string; style?: CSSProperties }) {
  // No ready subject on their videos, and some not measured yet (open or
  // being re-described): the box cannot say "no subject", only that they are
  // not measured, by name (ruling U6; 14 Oct).
  const notMeasured = card.videos > 0 && card.subjects.length === 0 && ((card.subjectsPending ?? 0) > 0 || (card.subjectsNotMeasured?.length ?? 0) > 0)
  return (
    <article
      data-group={card.key}
      style={style}
      className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5')}
    >
      <div>
        <h3 className="m-0 text-[16.5px] font-semibold leading-[1.3] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.name}</span></h3>
        {card.oneLiner ? <p className="m-0 mt-[3px] text-[13.5px] leading-[1.45] text-muted-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.oneLiner}</span></p> : null}
      </div>
      {n ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span data-copy="level" className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtInt(card.videos)}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground">of {fmtInt(n)} videos</span>
          </span>
          {/* The board's verdict slot ("no clear change"): decision 2 reads no
              change for a group yet, and the slot says so. */}
          <span className="ml-auto whitespace-nowrap text-[12.5px] font-medium text-muted-foreground">{GROUP_NOT_COMPARED}</span>
        </div>
      ) : (
        <p className="m-0 text-[13.5px] text-muted-foreground">No video of the market’s in {monthWords} carries their comments.</p>
      )}
      {/* RULING U6: the ready subjects alone carry a count (the reader's
          `measuredSubjects`); the rest are said once, never counted. With
          none ready the box keeps its frame and its height: one quiet line
          and its rows' empty tracks. */}
      <div className="flex flex-col gap-2 rounded-[10px] bg-inner px-3.5 py-3">
        <p className={cn(CAPS, 'mb-0.5')}>What they talk about{card.videos > 0 && !notMeasured ? <> · of their <Fig>{fmtInt(card.videos)}</Fig></> : null}</p>
        {card.subjects.length > 0 ? (
          <>
            {card.subjects.map((s) => <MiniRow key={s.id} label={s.label} k={s.k} of={card.videos} />)}
            <PendingSubjectsLine subjects={card.subjectsNotMeasured} count={card.subjectsPending ?? 0} />
          </>
        ) : notMeasured ? (
          <NotMeasuredRows subjects={card.subjectsNotMeasured} />
        ) : <p className="m-0 text-[12.5px] leading-[1.4] text-muted-foreground">{card.videos > 0 ? 'No subject read in their videos yet.' : `None of their comments in ${monthWords}.`}</p>}
      </div>
      {card.wants || card.stops ? (
        <div className="flex flex-col gap-1.5 text-[13.5px] leading-[1.45] text-foreground">
          {/* Three lines each, so a card keeps the board's height when Pass E
              writes a paragraph (the lead's ruling, 13 Oct); the panel prints
              both in full. */}
          {card.wants ? <div className="line-clamp-3"><b className="font-semibold">Wants:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.wants}</span></div> : null}
          {card.stops ? <div className="line-clamp-3"><b className="font-semibold">Stops them:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.stops}</span></div> : null}
        </div>
      ) : null}
      <div>
        <p className={cn(CAPS, 'mb-1.5')}>Where</p>
        {card.platforms.length > 0
          ? <PlatformStrip platforms={card.platforms} label={`Where ${card.name} comment`} />
          : <span aria-hidden className="block h-1.5 rounded-full bg-track" />}
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <Link href={card.href} className={OLINK} aria-label={`Open ${card.name}`}>Open →</Link>
      </div>
    </article>
  )
}

/** A month's short name on the chart's axis: "Sep". */
const shortMonth = (month: string): string => longMonth(month).slice(0, 3)

/**
 * The board's sixth card ("How the mix changed" on E3-Voices): each group's
 * videos on the kit's slope chart. Decision 2 reads no group's month before
 * this one (each update describes the groups afresh), so the card is named
 * for what it shows, "The mix in September" (the fresh check, 13 Oct: the
 * board's words claimed a comparison), the chart draws this month's column
 * and leaves last month's axis empty and dashed, and the subtitle and one
 * line say why. Nothing is drawn between the two: a line needs both ends.
 */
export function MixCard({ cards, n, month, monthWords, style }: { cards: readonly VoicesGroupCard[]; n: number | null; month: string; monthWords: string; style?: CSSProperties }) {
  const before = prevMonth(month)
  return (
    <article data-mix="" aria-labelledby="voices-mix" style={style} className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5')}>
      <div>
        <h3 id="voices-mix" className="m-0 text-[16.5px] font-semibold leading-[1.3] text-foreground">{mixTitle(monthWords)}</h3>
        <p className="m-0 mt-[3px] text-[13.5px] leading-[1.45] text-muted-foreground">{mixNotRead(longMonth(before))}</p>
      </div>
      <SlopePair
        fromLabel={shortMonth(before)}
        toLabel={shortMonth(month)}
        rows={cards.map((c) => ({ key: c.key, label: slopeLabel(c.name), fullLabel: c.name, slot: 'pass_e_persona' as const, from: null, to: c.videos }))}
        format={fmtInt}
        label={`Each group’s videos of the market’s${n ? ` ${fmtInt(n)}` : ''}`}
        // Last month's axis is the chart's empty slot: drawn dashed, as a
        // column with no reading in it (the first <line> is that axis).
        className="mx-auto max-w-[340px] [&>line:first-of-type]:[stroke-dasharray:3_4]"
      />
      <p className="m-0 text-[13.5px] leading-[1.5] text-secondary-foreground">{MIX_WHY}</p>
    </article>
  )
}

/** The cards three to a row (two from 768, one on a phone), the mix card in
 *  the grid's last place (the board's sixth). Each card opens its page. */
export function GroupGrid({ data }: { data: Pick<VoicesData, 'groups' | 'videos' | 'monthWords' | 'month'> }) {
  const cards = data.groups.cards
  return (
    <section aria-label="The groups" className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => <GroupCard key={c.key} card={c} n={data.videos} monthWords={data.monthWords} />)}
      <MixCard cards={cards} n={data.videos} month={data.month} monthWords={data.monthWords} />
    </section>
  )
}
