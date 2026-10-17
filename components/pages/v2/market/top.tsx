import Link from 'next/link'
import { BarChart3, CalendarRange, MessageSquareText, Sparkles, TrendingUp } from 'lucide-react'
import { CARD, CardHead, FlagChip, MiniBars, SpikeBars, type MiniBar } from '@/components/v2'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { talkKindLabel } from '@/lib/pages/overview-market/kinds'
import { flagBaseWords, topSpans, type Doing, type GroupLink, type HeroCard, type MarketConv, type MarketData, type MonthCount, type SideCard } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { About, ABOUT_NOT_COUNTED, ABOUT_NOT_READ, BIG, Fig, Label, MID, MONO_MUTED, OLINK, newVerdict } from './parts'

// MARKET'S TOP ROW (depth v2, T3; E2-Market's "what moved", re-cut to decision
// 1). This week: the anomaly check's first flag where it raised one, else the
// biggest conversation first heard this week, else the week's biggest; beside
// it the week's biggest with its three weekly counts (no word), and the rest
// of what was first heard this week. This month: the month's three biggest
// with their month bars. Over time: the market's months.
//
// No quotes and no model sentence here (Heinrich, 13 Oct): the card names
// the conversation, counts it, and opens it. Every week figure sits beside
// its month. The flag card prints the chip and never an "Unusual this week"
// eyebrow beside it (the chip is the eyebrow).

const PILL_ROW = 'grid grid-cols-12 gap-5'

/** The spans `topSpans` names, written out whole for Tailwind's scanner. */
const HERO_SPAN: Record<number, string> = { 12: 'col-span-12', 7: 'col-span-12 xl:col-span-7', 6: 'col-span-12 xl:col-span-6' }
const SIDE_SPAN: Record<number, string> = { 5: 'col-span-12 md:col-span-6 xl:col-span-5', 3: 'col-span-12 md:col-span-6 xl:col-span-3' }

/** "of 226 category videos this week" / "31 of 279 in October so far": the
 *  week's count, and its month beside it with the month's own n (decision 1). */
function WeekLines({ conv, data }: { conv: MarketConv; data: MarketData }) {
  const week = data.week
  return (
    <div className={cn(MONO_MUTED, 'leading-[1.5]')}>
      {week?.category != null ? <span data-copy="level" className="block">of {fmtInt(week.category)} category videos this week</span> : null}
      <MonthLine k={conv.month} data={data} />
    </div>
  )
}

/** A count in the month the week is stated against, with that month's n:
 *  "31 of 279 in October so far". Nothing where either is unread. */
function MonthLine({ k, data, className = 'block' }: { k: number | null; data: MarketData; className?: string }) {
  if (k == null || data.month.category == null) return null
  return <span data-copy="level" className={className}>{fmtInt(k)} of {fmtInt(data.month.category)} {data.week?.inMonth ?? `in ${data.month.text}`}</span>
}

/** The three weekly windows as bars, oldest first: counts only. */
function weekBars(conv: MarketConv, data: MarketData): { label: string; count: number | null }[] {
  const labels = data.week?.weekLabels ?? []
  return conv.weeks.map((count, i) => ({ label: labels[i] ?? '', count }))
}

/** The months as bars: the category's videos each month, so far in the last. */
function monthBars(months: readonly MonthCount[]): MiniBar[] {
  return months.map((m) => ({
    label: m.label,
    value: m.k ?? 0,
    ...(m.n != null && m.k != null ? { sub: `${fmtInt(m.k)} of ${fmtInt(m.n)}` } : {}),
    filling: m.filling,
  }))
}

/** Where no group's conversations include this one (Pass E's `registryIds`):
 *  the slot keeps its place and says so (the parity pass, 13 Oct). */
export const NO_GROUP = 'Not linked to a group'

/** The groups, by name, each opening in Voices; or `NO_GROUP`. */
function Groups({ groups }: { groups: readonly GroupLink[] }) {
  if (groups.length === 0) return <span className="text-muted-foreground">{NO_GROUP}</span>
  return (
    <>
      {groups.slice(0, 2).map((g, i) => (
        <span key={g.key}>
          {i > 0 ? ', ' : null}
          <Link href={g.href} className="text-foreground underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
        </span>
      ))}
    </>
  )
}

/** Who's saying it (the groups, by name) and what they're doing (the top
 *  kind that is not the conversation's own, of the month's videos). Both
 *  columns in every state, as the board draws them: with no other kind read,
 *  the conversation's own kind alone, which is what its videos are by
 *  definition, so it carries no figure. */
function Context({ groups, doing, kind, noun, monthText }: { groups: readonly GroupLink[]; doing: Doing | null; kind: string | null; noun: string | null; monthText: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 border-t border-track pt-3 text-[13px] leading-[1.5]">
      <div>
        <span className="text-muted-foreground">Who’s saying it</span><br />
        <Groups groups={groups} />
      </div>
      <div>
        <span className="text-muted-foreground">What they’re doing</span><br />
        {doing
          // On a phone the two columns stand as the board's do, so the
          // figure line may wrap inside its own (T9: nothing past the card).
          ? <>{doing.label} <span className={cn(MONO_MUTED, 'whitespace-nowrap max-sm:whitespace-normal')}>· <span data-copy="level">{fmtInt(doing.k)} of {fmtInt(doing.n)}</span> {monthText}</span></>
          : kind ? talkKindLabel(kind, noun) : <span className="text-muted-foreground">Not read yet</span>}
      </div>
    </div>
  )
}

/** Who's saying it, on a card beside the hero: the groups by name. */
function GroupsLine({ groups, words = 'Who’s asking' }: { groups: readonly GroupLink[]; words?: string }) {
  return (
    <div className="border-t border-track pt-3 text-[13px] leading-[1.5]">
      <span className="text-muted-foreground">{words}</span><br />
      <Groups groups={groups} />
    </div>
  )
}

/** The card's foot: who the period's videos are about, and its link (a
 *  page, 17 Oct: nothing opens in place). */
function Foot({ conv, href, data, open = 'Open the conversation' }: {
  conv: MarketConv | null; href: string | null; data: MarketData; open?: string
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
      {conv && conv.who.length > 0 && data.brands === 'counted' ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>About</span>
          <About parts={conv.who} brand={data.brand} noun={data.noun} />
        </div>
      ) : conv && data.brands !== 'counted' ? (
        <div className="text-[12.5px] text-muted-foreground">About · {data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</div>
      ) : <span />}
      {href ? <Link href={href} className={OLINK}>{open} →</Link> : null}
    </div>
  )
}

/** The anomaly check's flag, as the hero. */
function FlagHero({ hero, data, span }: { hero: Extract<HeroCard, { kind: 'flag' }>; data: MarketData; span: string }) {
  const { card } = hero
  const f = card.flag
  const weekPct = f.week.n > 0 ? (100 * f.week.k) / f.week.n : 0
  const basePct = f.baseline.n > 0 ? (100 * f.baseline.k) / f.baseline.n : 0
  const bars: MiniBar[] = [
    { label: card.baselineText, value: basePct, display: fmtPct(basePct), sub: `${fmtInt(f.baseline.k)} of ${fmtInt(f.baseline.n)}` },
    { label: 'This week', value: weekPct, display: fmtPct(weekPct), sub: `${fmtInt(f.week.k)} of ${fmtInt(f.week.n)}` },
  ]
  const title = card.conv?.label ?? f.label
  return (
    <article id="top-0" className={cn(CARD, span, 'scroll-mt-6')}>
      <CardHead icon={TrendingUp} size="lg" flag={<FlagChip verdict={card.verdict} />} title={f.objectKind === 'theme' ? <span data-copy="subject" data-slot="pass_b_theme">{title}</span> : title} />
      <div className="flex flex-wrap items-baseline gap-3.5">
        <div data-copy="figure" className={BIG}>{fmtInt(f.week.k)}</div>
        <div className={cn(MONO_MUTED, 'leading-[1.5]')}>
          <span data-copy="level" className="block">of {fmtInt(f.week.n)} videos this week, {flagBaseWords(f.denominator)}</span>
          <span data-copy="level" className="block">{fmtInt(f.baseline.k)} of {fmtInt(f.baseline.n)} in {card.baselineText}, the same base</span>
          {card.month ? <span data-copy="level" className="block">{fmtInt(card.month.k)} of {fmtInt(card.month.n)} category videos {data.week?.inMonth ?? `in ${data.month.text}`}</span> : null}
        </div>
      </div>
      {/* Drawn for its column: the half-card drawing, and a phone's. */}
      <MiniBars bars={bars} size="lg" className="max-w-[560px] max-sm:hidden" label={`Share of every audience's videos about ${title}, the months before against this week`} />
      <MiniBars bars={bars} size="md" className="sm:hidden" label={`Share of every audience's videos about ${title}, the months before against this week`} />
      {/* Who and what are a conversation's: a flag on a kind or a subject
          names neither, so its card draws them only for a theme. */}
      {card.conv ? <Context groups={hero.groups} doing={hero.doing} kind={card.conv.kind} noun={data.noun} monthText={data.week?.inMonth ?? `in ${data.month.text}`} /> : null}
      <Foot conv={card.conv} href={card.href} data={data} open={f.objectKind === 'subject' ? 'Open the subject' : 'Open the conversation'} />
    </article>
  )
}

/** The week's biggest new conversation, or its biggest, or the month's
 *  biggest, as the hero. */
function ConvHero({ hero, data, span }: { hero: Extract<HeroCard, { kind: 'new' | 'biggest' }>; data: MarketData; span: string }) {
  const { conv } = hero
  const week = data.period === 'week'
  const eyebrow = week
    ? hero.kind === 'new' ? <span data-copy="verdict">New this week</span> : 'Most talked about this week'
    : `Most talked about in ${data.month.text}`
  const figure = week ? conv.week : conv.month
  return (
    <article id="top-0" className={cn(CARD, span, 'scroll-mt-6')}>
      <CardHead icon={hero.kind === 'new' ? Sparkles : MessageSquareText} size="lg" eyebrow={eyebrow} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
      <div className="flex flex-wrap items-baseline gap-3.5">
        <Fig n={figure} className={BIG} />
        {week
          ? <WeekLines conv={conv} data={data} />
          : <div className={cn(MONO_MUTED, 'leading-[1.5]')}>{data.month.category != null ? <span data-copy="level" className="block">of {fmtInt(data.month.category)} category videos {data.month.soFar ? `in ${longMonth(data.month.month)} so far` : `in ${longMonth(data.month.month)}`}</span> : null}</div>}
      </div>
      {week
        ? <>
          {/* Every week's count labelled, as the side card and the
              Dashboard's tile label theirs (Phase 4 fix round). */}
          <SpikeBars weeks={weekBars(conv, data)} counts="all" ghost className="max-w-[560px] max-sm:hidden" label={`Category videos a week about ${conv.label}`} />
          <SpikeBars weeks={weekBars(conv, data)} counts="all" size="md" ghost className="sm:hidden" label={`Category videos a week about ${conv.label}`} />
        </>
        : conv.months.length > 1 ? <MiniBars bars={monthBars(conv.months)} size="md" className="max-w-[420px]" label={`Category videos a month about ${conv.label}`} /> : null}
      <Context groups={hero.groups} doing={hero.doing} kind={conv.kind} noun={data.noun} monthText={week ? data.week?.inMonth ?? '' : `in ${data.month.text}`} />
      <Foot conv={conv} href={hero.href} data={data} />
    </article>
  )
}

/** The new card with nothing first heard this week (the parity pass, 13 Oct):
 *  it keeps its place and says so as its title ("Nothing else new" where a
 *  conversation off the cards was, so it never contradicts a New chip), then
 *  keeps the board's weight with one conversation not already on the row:
 *  the newest an earlier week first heard where nothing at all is new, else
 *  the week's next biggest (the lead's ruling). With neither, its one line. */
function NothingNew({ side, data, index, span }: { side: SideCard; data: MarketData; index: number; span: string }) {
  const e = side.earlier ?? null
  const a = e ? null : side.also ?? null
  const pick = e ?? a
  return (
    <article id={`top-${index}`} data-top-card="new-none" className={cn(CARD, span, 'scroll-mt-6')}>
      <CardHead icon={Sparkles} eyebrow={<span data-copy="verdict">New this week</span>} title={<span data-copy="verdict">{side.anyNew ? NOTHING_ELSE_NEW : NOTHING_NEW}</span>} />
      {pick ? (
        <>
          <div className="flex flex-col gap-2.5 border-t border-track pt-3">
            <Label>{e ? 'Newest' : ALSO_TALKED}</Label>
            <Link href={pick.href} className="text-[15px] font-semibold leading-[1.35] text-foreground no-underline underline-offset-[3px] hover:underline">
              <span data-copy="subject" data-slot="pass_b_theme">{pick.conv.label}</span>
            </Link>
            <div className="flex flex-wrap items-baseline gap-2"><Fig n={pick.conv.week} className={MID} /><WeekLines conv={pick.conv} data={data} /></div>
            {e ? <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">First heard the week of {e.week}</p> : null}
          </div>
          {a?.groups ? <GroupsLine groups={a.groups} /> : null}
          <div className="mt-auto"><Link href={pick.href} className={OLINK}>Open →</Link></div>
        </>
      ) : null}
    </article>
  )
}

/** The new card's stand-in's label: the week's next biggest conversation. */
export const ALSO_TALKED = 'Also talked about'

/** Another card with nothing for it this week: the week's second-biggest,
 *  where no other conversation reached the floor. */
function NoOther({ index, span }: { index: number; span: string }) {
  return (
    <article id={`top-${index}`} data-top-card="biggest-none" className={cn(CARD, span, 'scroll-mt-6')}>
      <CardHead icon={BarChart3} eyebrow="Three weeks" title="No other conversation this week" />
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">Nothing else reached three of the category’s videos.</p>
    </article>
  )
}

/** The new card's title where nothing was first heard this week. */
export const NOTHING_NEW = 'Nothing new this week'
export const NOTHING_ELSE_NEW = 'Nothing else new this week'

/** A card beside the hero. */
function Side({ side, data, index, span }: { side: SideCard; data: MarketData; index: number; span: string }) {
  const conv = side.convs[0]
  const href = side.hrefs[0]
  if (!conv) {
    return side.kind === 'new_list'
      ? <NothingNew side={side} data={data} index={index} span={span} />
      : <NoOther index={index} span={span} />
  }
  if (side.kind === 'new_list') {
    const rest = side.convs.slice(1)
    return (
      <article id={`top-${index}`} className={cn(CARD, span, 'scroll-mt-6')}>
        <CardHead icon={Sparkles} eyebrow={<span data-copy="verdict">New this week</span>} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
        <div className="flex flex-wrap items-baseline gap-2"><Fig n={conv.week} className={MID} /><WeekLines conv={conv} data={data} /></div>
        {rest.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-track pt-3 text-[13px] leading-[1.5]">
            <Label>Also new this week</Label>
            {rest.map((c, i) => (
              // The counts wrap under the name where the two do not fit one
              // line (a narrow card, a phone) rather than run past the card (T9).
              <Link key={c.id} href={side.hrefs[i + 1]} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-foreground no-underline hover:underline underline-offset-[3px]">
                <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  <Fig n={c.week} className="text-[12.5px] text-secondary-foreground" /> this week
                  {c.month != null && data.month.category != null ? <> · <MonthLine k={c.month} data={data} className="" /></> : null}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
        <GroupsLine groups={side.groups} />
        <div className="mt-auto"><Link href={href} className={OLINK}>Open →</Link></div>
      </article>
    )
  }
  const week = side.kind === 'biggest'
  return (
    <article id={`top-${index}`} className={cn(CARD, span, 'scroll-mt-6')}>
      <CardHead icon={week ? BarChart3 : CalendarRange} eyebrow={week ? 'Three weeks' : 'Month by month'} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
      <div className="flex flex-wrap items-baseline gap-2">
        <Fig n={week ? conv.week : conv.month} className={MID} />
        {week
          ? <WeekLines conv={conv} data={data} />
          : data.month.category != null ? <span data-copy="level" className={MONO_MUTED}>of {fmtInt(data.month.category)} category videos</span> : null}
      </div>
      {week
        ? <SpikeBars weeks={weekBars(conv, data)} counts="all" size="md" ghost className="max-w-[300px]" label={`Category videos a week about ${conv.label}`} />
        : conv.months.length > 1 ? <MiniBars bars={monthBars(conv.months).map(({ sub: _sub, ...b }) => b)} className="max-w-[300px]" label={`Category videos a month about ${conv.label}`} /> : null}
      <GroupsLine groups={side.groups} />
      {conv.who.length > 0 && data.brands === 'counted' ? <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"><span>About</span><About parts={conv.who} brand={data.brand} noun={data.noun} /></div> : null}
      <div className="mt-auto"><Link href={href} className={OLINK}>Open →</Link></div>
    </article>
  )
}

/** Over time: the market's videos, month by month. */
function MonthsCard({ months, data }: { months: readonly MonthCount[]; data: MarketData }) {
  return (
    <article className={cn(CARD, 'col-span-12')}>
      <CardHead icon={CalendarRange} title="Your market, month by month" sub={<>The market’s videos each month, by the month people commented. {data.month.soFar ? <>{longMonth(data.month.month)} is still filling.</> : null}</>} />
      <MiniBars bars={months.map((m) => ({ label: m.label, value: m.k ?? 0, filling: m.filling }))} size="lg" className="max-w-[760px]" label="The market's videos each month" />
    </article>
  )
}

/** The top row (the month's three biggest, or over time the market's
 *  months), or nothing where the period has nothing to lead with. Each card
 *  opens its conversation's page (17 Oct). */
export function TopRowView({ data }: { data: MarketData }) {
  const { top } = data
  if (top.months) {
    return <section id="top-row" aria-label="The market over time" className={cn(PILL_ROW, 'scroll-mt-6')}><MonthsCard months={top.months} data={data} /></section>
  }
  if (!top.hero && top.sides.length === 0) return null
  // The board's 6 · 3 · 3; with one card beside the hero, 7 · 5; alone, the row.
  const spans = topSpans(top.sides.length)
  const heroSpan = HERO_SPAN[spans[0]] ?? 'col-span-12 xl:col-span-6'
  const sideSpan = SIDE_SPAN[spans[1] ?? 3] ?? 'col-span-12 md:col-span-6 xl:col-span-3'
  return (
    <section id="top-row" aria-label={data.period === 'week' ? 'What stood out this week' : `The biggest conversations in ${data.month.text}`} className={cn(PILL_ROW, 'scroll-mt-6')}>
      {top.hero?.kind === 'flag'
        ? <FlagHero hero={top.hero} data={data} span={heroSpan} />
        : top.hero ? <ConvHero hero={top.hero} data={data} span={heroSpan} /> : null}
      {top.sides.map((s, i) => <Side key={i} side={s} data={data} index={i + 1} span={sideSpan} />)}
    </section>
  )
}

/** For a test: the chip a new conversation earns, as the row draws it. */
export const newChipVerdict = newVerdict
