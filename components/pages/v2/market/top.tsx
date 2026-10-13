import Link from 'next/link'
import { BarChart3, CalendarRange, MessageSquareText, Sparkles, TrendingUp } from 'lucide-react'
import { CARD, CardHead, FlagChip, MiniBars, SELECTED_CARD_RING, SpikeBars, type MiniBar } from '@/components/v2'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import type { Doing, GroupLink, HeroCard, MarketConv, MarketData, MonthCount, SideCard } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { About, BIG, Fig, Label, MID, MONO_MUTED, OLINK, newVerdict } from './parts'

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

/** "of 226 category videos this week" / "31 in October so far". */
function WeekLines({ conv, data }: { conv: MarketConv; data: MarketData }) {
  const week = data.week
  return (
    <div className={cn(MONO_MUTED, 'leading-[1.5]')}>
      {week?.category != null ? <span data-copy="level" className="block">of {fmtInt(week.category)} category videos this week</span> : null}
      {conv.month != null ? <span className="block"><Fig n={conv.month} /> {week?.inMonth ?? `in ${data.month.text}`}</span> : null}
    </div>
  )
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

/** Who's saying it (the groups, by name) and what they're doing (the top
 *  kind, of the month's videos). */
function Context({ groups, doing, monthText }: { groups: readonly GroupLink[]; doing: Doing | null; monthText: string }) {
  if (groups.length === 0 && !doing) return null
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-track pt-3 text-[13px] leading-[1.5] sm:grid-cols-2">
      {groups.length > 0 ? (
        <div>
          <span className="text-muted-foreground">Who’s saying it</span><br />
          {groups.slice(0, 2).map((g, i) => (
            <span key={g.key}>
              {i > 0 ? ', ' : null}
              <Link href={g.href} className="text-foreground underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
            </span>
          ))}
        </div>
      ) : <div />}
      {doing ? (
        <div>
          <span className="text-muted-foreground">What they’re doing</span><br />
          {doing.label} <span className={cn(MONO_MUTED, 'whitespace-nowrap')}>· <span data-copy="level">{fmtInt(doing.k)} of {fmtInt(doing.n)}</span> {monthText}</span>
        </div>
      ) : null}
    </div>
  )
}

/** Who's saying it, on a card beside the hero: the groups by name. */
function GroupsLine({ groups, words = 'Who’s asking' }: { groups: readonly GroupLink[]; words?: string }) {
  if (groups.length === 0) return null
  return (
    <div className="border-t border-track pt-3 text-[13px] leading-[1.5]">
      <span className="text-muted-foreground">{words}</span><br />
      {groups.slice(0, 2).map((g, i) => (
        <span key={g.key}>
          {i > 0 ? ', ' : null}
          <Link href={g.href} className="text-foreground underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
        </span>
      ))}
    </div>
  )
}

/** The card's foot: who the period's videos are about, and its link. */
function Foot({ conv, href, selected, closeHref, data, open = 'Open the conversation' }: {
  conv: MarketConv | null; href: string | null; selected: boolean; closeHref: string | null; data: MarketData; open?: string
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
      {conv && conv.who.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>About</span>
          <About parts={conv.who} brand={data.brand} noun={data.noun} />
        </div>
      ) : <span />}
      {selected && closeHref
        ? <Link href={closeHref} scroll={false} className={OLINK}>Close ↑</Link>
        : href ? <Link href={href} scroll={false} className={OLINK}>{open} →</Link> : null}
    </div>
  )
}

/** The anomaly check's flag, as the hero. */
function FlagHero({ hero, data, selected }: { hero: Extract<HeroCard, { kind: 'flag' }>; data: MarketData; selected: boolean }) {
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
    <article id="top-0" className={cn(CARD, 'col-span-12 xl:col-span-6 scroll-mt-6', selected ? SELECTED_CARD_RING : null)}>
      <CardHead icon={TrendingUp} size="lg" flag={<FlagChip verdict={card.verdict} />} title={f.objectKind === 'theme' ? <span data-copy="subject" data-slot="pass_b_theme">{title}</span> : title} />
      <div className="flex flex-wrap items-baseline gap-3.5">
        <div data-copy="figure" className={BIG}>{fmtInt(f.week.k)}</div>
        <div className={cn(MONO_MUTED, 'leading-[1.5]')}>
          <span data-copy="level" className="block">of {fmtInt(f.week.n)} videos this week</span>
          <span data-copy="level" className="block">{fmtInt(f.baseline.k)} of {fmtInt(f.baseline.n)} in {card.baselineText}</span>
          {card.month ? <span className="block"><Fig n={card.month.k} /> {data.week?.inMonth ?? `in ${data.month.text}`}</span> : null}
        </div>
      </div>
      <MiniBars bars={bars} size="lg" label={`Share of the videos about ${title}, the months before against this week`} />
      <Context groups={hero.groups} doing={hero.doing} monthText={data.week?.inMonth ?? `in ${data.month.text}`} />
      <Foot conv={card.conv} href={card.href} selected={selected} closeHref={data.panel?.closeHref ?? null} data={data} open={f.objectKind === 'subject' ? 'Open the subject' : 'Open the conversation'} />
    </article>
  )
}

/** The week's biggest new conversation, or its biggest, or the month's
 *  biggest, as the hero. */
function ConvHero({ hero, data, selected }: { hero: Extract<HeroCard, { kind: 'new' | 'biggest' }>; data: MarketData; selected: boolean }) {
  const { conv } = hero
  const week = data.period === 'week'
  const eyebrow = week
    ? hero.kind === 'new' ? <span data-copy="verdict">New this week</span> : 'Biggest this week'
    : `Biggest in ${data.month.text}`
  const figure = week ? conv.week : conv.month
  return (
    <article id="top-0" className={cn(CARD, 'col-span-12 xl:col-span-6 scroll-mt-6', selected ? SELECTED_CARD_RING : null)}>
      <CardHead icon={hero.kind === 'new' ? Sparkles : MessageSquareText} size="lg" eyebrow={eyebrow} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
      <div className="flex flex-wrap items-baseline gap-3.5">
        <Fig n={figure} className={BIG} />
        {week
          ? <WeekLines conv={conv} data={data} />
          : <div className={cn(MONO_MUTED, 'leading-[1.5]')}>{data.month.category != null ? <span data-copy="level" className="block">of {fmtInt(data.month.category)} category videos {data.month.soFar ? `in ${longMonth(data.month.month)} so far` : `in ${longMonth(data.month.month)}`}</span> : null}</div>}
      </div>
      {week
        ? <SpikeBars weeks={weekBars(conv, data)} label={`Category videos a week about ${conv.label}`} />
        : conv.months.length > 1 ? <MiniBars bars={monthBars(conv.months)} size="md" label={`Category videos a month about ${conv.label}`} /> : null}
      <Context groups={hero.groups} doing={hero.doing} monthText={week ? data.week?.inMonth ?? '' : `in ${data.month.text}`} />
      <Foot conv={conv} href={hero.href} selected={selected} closeHref={data.panel?.closeHref ?? null} data={data} />
    </article>
  )
}

/** A card beside the hero. */
function Side({ side, data, index, span, selectedId }: { side: SideCard; data: MarketData; index: number; span: string; selectedId: string | null }) {
  const conv = side.convs[0]
  const selected = selectedId != null && side.convs.some((c) => c.id === selectedId)
  const href = side.hrefs[0]
  if (side.kind === 'new_list') {
    const rest = side.convs.slice(1)
    return (
      <article id={`top-${index}`} className={cn(CARD, span, 'scroll-mt-6', selected ? SELECTED_CARD_RING : null)}>
        <CardHead icon={Sparkles} eyebrow={<span data-copy="verdict">New this week</span>} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
        <div className="flex flex-wrap items-baseline gap-2"><Fig n={conv.week} className={MID} /><WeekLines conv={conv} data={data} /></div>
        {rest.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-track pt-3 text-[13px] leading-[1.5]">
            <Label>Also new this week</Label>
            {rest.map((c, i) => (
              <Link key={c.id} href={side.hrefs[i + 1]} scroll={false} className="flex items-baseline justify-between gap-3 text-foreground no-underline hover:underline underline-offset-[3px]">
                <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
                <Fig n={c.week} className="font-mono text-[12.5px] text-secondary-foreground" />
              </Link>
            ))}
          </div>
        ) : null}
        <GroupsLine groups={side.groups} />
        <div className="mt-auto">{selected && data.panel ? <Link href={data.panel.closeHref} scroll={false} className={OLINK}>Close ↑</Link> : <Link href={href} scroll={false} className={OLINK}>Open →</Link>}</div>
      </article>
    )
  }
  const week = side.kind === 'biggest'
  return (
    <article id={`top-${index}`} className={cn(CARD, span, 'scroll-mt-6', selected ? SELECTED_CARD_RING : null)}>
      <CardHead icon={week ? BarChart3 : CalendarRange} eyebrow={week ? 'Three weeks' : 'Month by month'} title={<span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>} />
      <div className="flex flex-wrap items-baseline gap-2">
        <Fig n={week ? conv.week : conv.month} className={MID} />
        {week
          ? <WeekLines conv={conv} data={data} />
          : data.month.category != null ? <span data-copy="level" className={MONO_MUTED}>of {fmtInt(data.month.category)} category videos</span> : null}
      </div>
      {week
        ? <MiniBars bars={weekBars(conv, data).map((w) => ({ label: w.label, value: w.count ?? 0 }))} label={`Category videos a week about ${conv.label}`} />
        : conv.months.length > 1 ? <MiniBars bars={monthBars(conv.months)} label={`Category videos a month about ${conv.label}`} /> : null}
      <GroupsLine groups={side.groups} />
      {conv.who.length > 0 ? <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"><span>About</span><About parts={conv.who} brand={data.brand} noun={data.noun} /></div> : null}
      <div className="mt-auto">{selected && data.panel ? <Link href={data.panel.closeHref} scroll={false} className={OLINK}>Close ↑</Link> : <Link href={href} scroll={false} className={OLINK}>Open →</Link>}</div>
    </article>
  )
}

/** Over time: the market's videos, month by month. */
function MonthsCard({ months, data }: { months: readonly MonthCount[]; data: MarketData }) {
  return (
    <article className={cn(CARD, 'col-span-12')}>
      <CardHead icon={CalendarRange} title="Your market, month by month" sub={<>The market’s videos each month, by the month people commented. {data.month.soFar ? <>{longMonth(data.month.month)} is still filling.</> : null}</>} />
      <MiniBars bars={months.map((m) => ({ label: m.label, value: m.k ?? 0, filling: m.filling }))} size="lg" label="The market's videos each month" />
    </article>
  )
}

/** The top row, or nothing where the period has nothing to lead with. */
export function TopRowView({ data }: { data: MarketData }) {
  const { top } = data
  const openId = data.panel?.at === 'top' ? data.panel.id : null
  if (top.months) return <section id="top-row" aria-label="The market over time" className={cn(PILL_ROW, 'scroll-mt-6')}><MonthsCard months={top.months} data={data} /></section>
  if (!top.hero && top.sides.length === 0) return null
  const heroId = top.hero ? (top.hero.kind === 'flag' ? top.hero.card.conv?.id ?? null : top.hero.conv.id) : null
  const sideSpan = top.sides.length === 1 ? 'col-span-12 xl:col-span-6' : 'col-span-12 md:col-span-6 xl:col-span-3'
  return (
    <section id="top-row" aria-label={data.period === 'week' ? 'What stood out this week' : `The biggest conversations in ${data.month.text}`} className={cn(PILL_ROW, 'scroll-mt-6')}>
      {top.hero?.kind === 'flag'
        ? <FlagHero hero={top.hero} data={data} selected={openId != null && openId === heroId} />
        : top.hero ? <ConvHero hero={top.hero} data={data} selected={openId != null && openId === heroId} /> : null}
      {top.sides.map((s, i) => <Side key={i} side={s} data={data} index={i + 1} span={sideSpan} selectedId={openId} />)}
    </section>
  )
}

/** For a test: the chip a new conversation earns, as the row draws it. */
export const newChipVerdict = newVerdict
