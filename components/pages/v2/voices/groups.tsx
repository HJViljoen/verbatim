import Link from 'next/link'
import type { CSSProperties } from 'react'
import { CARD, EmptyBox, GoLink, SectionHead, TickBar, toMax } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import { MIX_WHY, mixNotRead, mixTitle, type VoicesData, type VoicesGroupCard, type VoicesGroups } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { CAPS, EmptyLine, FailedSubjectsFoot, Fig, MiniRow, NotMeasuredRows, PendingSubjectsLine } from './parts'

// THE GROUPS (the audit design, 7 Nov: Voices.dc.html's "Who's in your
// market", "Each group in {month}" and the mix card; since 17 Oct each row and
// each card opens the group's own page, and nothing opens in place).
// Decision 2 holds: each group is this month's videos as a count, with no
// share of the market and no change since last month. The figures row under
// the title says the market's videos once, so the counts here are bare
// (the audit design's decision 2), and each list's bars are drawn against its
// largest row (decision 5). A video can hold more than one group, so the
// counts are drawn as separate bars, never one stacked bar with an "Other"
// remainder. The section head says once that no group is compared with last
// month, and the mix card keeps the grid's last place, its chart's place the
// dashed box saying why (decision 4).

/** "Who's in your market": every group's videos this month, a bar each. */
export function WhoCard({ groups, videos, monthWords, failed }: { groups: VoicesGroups; videos: number | null; monthWords: string; failed?: readonly { id: string; label: string }[] }) {
  const n = videos ?? 0
  const bar = toMax(groups.cards.map((c) => c.videos))
  const top = Math.max(0, ...groups.cards.map((c) => c.videos))
  const lead = groups.cards.findIndex((c) => c.videos === top && top > 0)
  return (
    // `id="cast"`: an old Conversation link (`/dashboard/voice#cast`, the cast
    // of who is talking) lands here with its fragment (lib/nav.ts).
    <section id="cast" aria-labelledby="voices-who" className={cn(CARD, 'scroll-mt-6 gap-[18px]')}>
      <div>
        <h2 id="voices-who" className="m-0 text-[21px] font-semibold leading-[1.3] text-foreground">Who’s in your market</h2>
        <p className="m-0 mt-1.5 max-w-[860px] text-[15px] leading-[1.55] text-secondary-foreground">
          {groups.state === 'ready' && n > 0
            ? <>The groups of people commenting, and how many of the market’s videos in {monthWords} each one comments on. A video can hold more than one group, so the counts overlap.</>
            : 'The groups of people commenting in your market.'}
        </p>
      </div>
      {groups.state !== 'ready' ? <EmptyBox>{groups.empty}</EmptyBox> : n === 0 ? (
        <EmptyBox>No market video in {monthWords} yet.</EmptyBox>
      ) : (
        <div role="list" className="flex flex-col gap-3">
          {groups.cards.map((c, i) => (
            // From 1024 the board's three columns (the name, the bar, the
            // count); under it, where the sidebar leaves the card too narrow,
            // the bar takes its own line under the name and the count (T9).
            <div key={c.key} role="listitem" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 text-[15.5px] leading-[1.4] lg:grid-cols-[200px_minmax(0,2fr)_96px] lg:gap-y-0">
              <Link href={c.href} className={cn(ROW, 'min-w-0', i === lead ? null : 'font-normal')}>
                <span data-copy="subject" data-slot="pass_e_persona">{c.name}</span>
              </Link>
              <TickBar pct={bar(c.videos)} size="md" tone="market" label={`${c.name}: ${fmtInt(c.videos)} videos`} className="order-last col-span-2 lg:order-none lg:col-span-1" />
              <span className={cn('text-right whitespace-nowrap', i === lead ? 'font-semibold' : null)}><Fig>{fmtInt(c.videos)}</Fig> {c.videos === 1 ? 'video' : 'videos'}</span>
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

/** A block of a group card, under a hairline (the board's ruled parts). */
const PART = 'flex flex-col gap-2.5 border-t border-track pt-3.5'

/** One group (the board's group tile). */
export function GroupCard({ card, n, monthWords, style }: { card: VoicesGroupCard; n: number | null; monthWords: string; style?: CSSProperties }) {
  // A ready subject is read on their videos, at a count or at none of them
  // (`subjectsNone`): the box then lists the counted ones and names the rest.
  // Every ready one at 0 is still a reading, never "No subject read" (5 Nov).
  const ready = card.subjects.length > 0 || (card.subjectsNone?.length ?? 0) > 0
  // No ready subject at all, and some not measured yet (open or being
  // re-described): the box cannot say "no subject", only that they are not
  // measured, by name (ruling U6; 14 Oct).
  const notMeasured = card.videos > 0 && !ready && ((card.subjectsPending ?? 0) > 0 || (card.subjectsNotMeasured?.length ?? 0) > 0)
  const max = Math.max(0, ...card.subjects.map((s) => s.k))
  return (
    <article data-group={card.key} style={style} className={CARD}>
      <div>
        <h3 className="m-0 text-[19px] font-semibold leading-[1.3] text-foreground">
          <Link href={card.href} className={ROW}><span data-copy="subject" data-slot="pass_e_persona">{card.name}</span></Link>
        </h3>
        {card.oneLiner ? <p className="m-0 mt-2 text-[15px] leading-[1.55] text-secondary-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.oneLiner}</span></p> : null}
      </div>
      {n ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2">
          <Fig className="text-[32px] font-bold leading-none text-foreground">{fmtInt(card.videos)}</Fig>
          <span className="text-[15px] text-secondary-foreground">{card.videos === 1 ? 'video' : 'videos'} in {monthWords}</span>
        </p>
      ) : (
        <p className="m-0 text-[15px] leading-[1.5] text-muted-foreground">No video of the market’s in {monthWords} carries their comments.</p>
      )}
      {/* RULING U6: the ready subjects alone carry a count (the reader's
          `measuredSubjects`); the rest are said once, never counted. With
          none ready the box keeps its frame: its one line in the dashed box. */}
      <div className={PART}>
        <h4 className={CAPS}>What they talk about{card.videos > 0 && !notMeasured ? <>, of their <Fig>{fmtInt(card.videos)}</Fig> videos</> : null}</h4>
        {card.videos > 0 && ready ? (
          <>
            {card.subjects.map((s) => <MiniRow key={s.id} label={s.label} k={s.k} of={card.videos} max={max} />)}
            {card.subjects.length < 3 && (card.subjectsNone?.length ?? 0) > 0 ? (
              <p data-subjects-none="" className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">In none of their videos: {card.subjectsNone!.join(', ')}</p>
            ) : null}
            <PendingSubjectsLine subjects={card.subjectsNotMeasured} count={card.subjectsPending ?? 0} />
          </>
        ) : notMeasured ? (
          <NotMeasuredRows subjects={card.subjectsNotMeasured} />
        ) : <EmptyLine>{card.videos > 0 ? 'No subject read in their videos yet.' : `None of their comments in ${monthWords}.`}</EmptyLine>}
      </div>
      {card.wants || card.stops ? (
        <dl className={cn(PART, 'm-0 text-[15px] leading-[1.5] text-foreground')}>
          {card.wants ? <div><dt className={CAPS}>Wants</dt><dd className="m-0 mt-[3px]"><span data-copy="subject" data-slot="pass_e_persona">{card.wants}</span></dd></div> : null}
          {card.stops ? <div><dt className={CAPS}>Stops them</dt><dd className="m-0 mt-[3px]"><span data-copy="subject" data-slot="pass_e_persona">{card.stops}</span></dd></div> : null}
        </dl>
      ) : null}
      <div className={cn(PART, 'gap-2')}>
        <h4 className={CAPS}>Where they comment</h4>
        {card.platforms.length > 0 ? (
          <dl className="m-0 grid grid-cols-4 gap-2.5">
            {card.platforms.map((p) => (
              <div key={p.platform} className="min-w-0">
                <dt className="text-[13px] leading-[1.4] text-muted-foreground">{p.label}</dt>
                <dd className="m-0 mt-0.5 text-[16px] font-semibold leading-[1.4] text-foreground"><Fig>{fmtInt(p.k)}</Fig></dd>
              </div>
            ))}
          </dl>
        ) : <EmptyLine>None in {monthWords}.</EmptyLine>}
      </div>
      <div className="mt-auto">
        <GoLink href={card.href}>Open {card.name}</GoLink>
      </div>
    </article>
  )
}

/**
 * The grid's last card (the board's "The mix in {month}"): each update
 * describes the groups afresh, so no group has a month before this one to
 * set beside it (decision 2), and the card says so in the dashed box in its
 * chart's place (decision 4), named for what it is, "The mix in September"
 * (the fresh check, 13 Oct: never a word that claims a comparison).
 */
export function MixCard({ month, monthWords, style }: { cards?: readonly VoicesGroupCard[]; n?: number | null; month: string; monthWords: string; style?: CSSProperties }) {
  const before = prevMonth(month)
  return (
    <article data-mix="" aria-labelledby="voices-mix" style={style} className={CARD}>
      <h3 id="voices-mix" className="m-0 text-[19px] font-semibold leading-[1.3] text-foreground">{mixTitle(monthWords)}</h3>
      <EmptyBox title={mixNotRead(longMonth(before))}>{MIX_WHY}</EmptyBox>
    </article>
  )
}

/** "Each group in {month}", said once not compared with last month, then the
 *  cards three to a row (two from 768, one on a phone), the mix card in the
 *  grid's last place. Each card opens its page. */
export function GroupGrid({ data }: { data: Pick<VoicesData, 'groups' | 'videos' | 'monthWords' | 'month'> }) {
  const cards = data.groups.cards
  return (
    <>
      <SectionHead title={`Each group in ${data.monthWords}`} note={`Not compared with ${longMonth(prevMonth(data.month))} yet`} />
      <section aria-label="The groups" className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => <GroupCard key={c.key} card={c} n={data.videos} monthWords={data.monthWords} />)}
        <MixCard month={data.month} monthWords={data.monthWords} />
      </section>
    </>
  )
}
